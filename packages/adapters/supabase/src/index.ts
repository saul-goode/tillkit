// Supabase Database Adapter for TillKit
import { createClient } from '@supabase/supabase-js';
import type {
  DatabaseAdapter,
  StoreFeatures,
  PaymentGateway,
  ProcessedWebhookEvent,
} from '@tillkit/core';
import type { SetupResult } from '@tillkit/core';
import { DuplicateGatewayRefError } from '@tillkit/core';

// Local types
interface QueryOptions {
  limit?: number;
  offset?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
}

interface ProductInput {
  slug: string;
  name: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  images?: any[];
  variants?: any[];
  options?: any[];
  inventory?: any;
  seo?: any;
  metadata?: Record<string, unknown>;
  status: 'draft' | 'active' | 'archived';
}

interface CartItemInput {
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  image?: any;
}

interface OrderInput {
  customerId?: string;
  email: string;
  /** Gateway + its payment reference. Together they make creation idempotent. */
  gateway?: PaymentGateway;
  gatewayRef?: string;
  status?: 'pending' | 'confirmed' | 'paid' | 'fulfilled' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  paymentStatus?: 'pending' | 'authorized' | 'paid' | 'partially_refunded' | 'refunded' | 'failed';
  fulfillmentStatus?: 'unfulfilled' | 'partially_fulfilled' | 'fulfilled' | 'returned';
  items?: any[];
  subtotal?: number;
  totalTax?: number;
  totalShipping?: number;
  totalDiscount?: number;
  total?: number;
  currency?: string;
  shippingAddress?: any;
  billingAddress?: any;
  transactions?: any[];
  notes?: string;
  metadata?: Record<string, unknown>;
}

interface TransactionInput {
  kind: 'authorization' | 'capture' | 'sale' | 'refund' | 'void';
  status: 'pending' | 'success' | 'failure';
  amount: number;
  currency: string;
  gateway: string;
  parentId?: string;
  processedAt?: Date;
  metadata?: Record<string, unknown>;
}

interface CustomerInput {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  addresses?: any[];
  defaultAddressId?: string;
  metadata?: Record<string, unknown>;
}

export interface SupabaseAdapterConfig {
  url: string;
  serviceKey: string;
}

export function supabaseAdapter(config: SupabaseAdapterConfig): DatabaseAdapter {
  const supabase = createClient(config.url, config.serviceKey);
  
  return {
    // Products
    products: {
      async list(options?: QueryOptions) {
        let query = supabase
          .from('products')
          .select('*', { count: 'exact' });
        
        if (options?.filters) {
          Object.entries(options.filters).forEach(([key, value]) => {
            query = query.eq(key, value);
          });
        }
        
        if (options?.sort) {
          query = query.order(options.sort, { 
            ascending: options.order !== 'desc' 
          });
        } else {
          query = query.order('created_at', { ascending: false });
        }
        
        const { data, error, count } = await query
          .range(options?.offset || 0, (options?.offset || 0) + (options?.limit || 50) - 1);
        
        if (error) throw error;
        
        return {
          items: (data || []).map(transformProduct),
          total: count || 0,
          page: Math.floor((options?.offset || 0) / (options?.limit || 50)) + 1,
          perPage: options?.limit || 50,
          hasMore: (data?.length || 0) === (options?.limit || 50),
        };
      },

      async get(id: string) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .single();
        
        if (error || !data) return null;
        return transformProduct(data);
      },

      async getBySlug(slug: string) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('slug', slug)
          .single();
        
        if (error || !data) return null;
        return transformProduct(data);
      },

      async create(data: ProductInput) {
        const { data: record, error } = await supabase
          .from('products')
          .insert(supabaseProductInput(data))
          .select()
          .single();
        
        if (error) throw error;
        return transformProduct(record);
      },

      async update(id: string, data: Partial<ProductInput>) {
        const { data: record, error } = await supabase
          .from('products')
          .update(supabaseProductInput(data))
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw error;
        return transformProduct(record);
      },

      async delete(id: string) {
        const { error } = await supabase
          .from('products')
          .delete()
          .eq('id', id);
        
        if (error) throw error;
      },

      async search(query: string) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .or(`name.ilike.%${query}%,description.ilike.%${query}%`);
        
        if (error) throw error;
        return (data || []).map(transformProduct);
      },
    },

    // Cart
    cart: {
      async get(sessionId: string) {
        const { data: cart, error } = await supabase
          .from('carts')
          .select('*,cart_items(*)')
          .eq('session_id', sessionId)
          .single();

        if (error || !cart) return null;

        // cart_items rows are snake_case; the contract returns CartItem.
        const items = (cart.cart_items || []).map(toCartItem);
        // Derive totals from the items rather than trusting the stored column:
        // it cannot drift out of sync with what the shopper is about to be charged.
        const subtotal = items.reduce((sum: number, i: any) => sum + i.price * i.quantity, 0);

        return {
          ...cart,
          items,
          id: cart.id,
          sessionId: cart.session_id,
          currency: cart.currency || 'USD',
          subtotal,
          totalTax: cart.total_tax || 0,
          totalShipping: cart.total_shipping || 0,
          total: subtotal,
          createdAt: new Date(cart.created_at),
          updatedAt: new Date(cart.updated_at),
        };
      },

      async create(sessionId: string) {
        const { data, error } = await supabase
          .from('carts')
          .insert({
            session_id: sessionId,
            currency: 'USD',
            subtotal: 0,
            total: 0,
          })
          .select()
          .single();
        
        if (error) throw error;
        
        return {
          ...data,
          items: [],
          id: data.id,
          sessionId: data.session_id,
          currency: data.currency || 'USD',
          subtotal: data.subtotal || 0,
          totalTax: data.total_tax || 0,
          totalShipping: data.total_shipping || 0,
          total: data.total || 0,
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at),
        };
      },

      async update(sessionId: string, updates: any) {
        const { data, error } = await supabase
          .from('carts')
          .update({
            ...updates,
            updated_at: new Date().toISOString(),
          })
          .eq('session_id', sessionId)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      },

      async addItem(sessionId: string, item: CartItemInput) {
        // Get cart
        const cart = await this.get(sessionId);
        if (!cart) throw new Error('Cart not found');

        // Adding the same product/variant again bumps the quantity rather than
        // creating a second line, matching what a shopper expects from a cart.
        const existing = (cart.items || []).find(
          (it: any) => it.productId === item.productId && it.variantId === item.variantId,
        );
        if (existing) {
          return this.updateItem(sessionId, existing.id, existing.quantity + item.quantity);
        }

        const { error } = await supabase
          .from('cart_items')
          .insert({
            cart_id: cart.id,
            product_id: item.productId,
            variant_id: item.variantId ?? null,
            name: item.name,
            sku: item.sku,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
            line_total: item.price * item.quantity,
          });

        if (error) throw error;
        return this.get(sessionId) as any;
      },

      async updateItem(sessionId: string, itemId: string, quantity: number) {
        const cart = await this.get(sessionId);
        if (!cart) throw new Error('Cart not found');

        // `<= 0`, not `=== 0`: a negative quantity must remove the line, not
        // persist a negative one that would credit the shopper at checkout.
        if (quantity <= 0) {
          return this.removeItem(sessionId, itemId);
        }

        // Read the item's real unit price so line_total reflects it (spec 001 FR-006).
        const existing = (cart.items || []).find((it: any) => it.id === itemId);
        const price = existing?.price ?? 0;

        const { error } = await supabase
          .from('cart_items')
          .update({ quantity, line_total: price * quantity })
          .eq('id', itemId);

        if (error) throw error;
        return this.get(sessionId) as any;
      },

      async removeItem(sessionId: string, itemId: string) {
        const { error } = await supabase
          .from('cart_items')
          .delete()
          .eq('id', itemId);
        
        if (error) throw error;
        return this.get(sessionId) as any;
      },

      async clear(sessionId: string) {
        const cart = await this.get(sessionId);
        if (!cart) return;
        
        await supabase
          .from('cart_items')
          .delete()
          .eq('cart_id', cart.id);
      },
    },

    // Orders
    orders: {
      async list(options?: QueryOptions) {
        let query = supabase
          .from('orders')
          .select('*, order_items(*), transactions(*)', { count: 'exact' });
        
        if (options?.filters) {
          Object.entries(options.filters).forEach(([key, value]) => {
            query = query.eq(key, value);
          });
        }
        
        const { data, error, count } = await query
          .order('created_at', { ascending: false })
          .range(options?.offset || 0, (options?.offset || 0) + (options?.limit || 50) - 1);
        
        if (error) throw error;
        
        return {
          items: (data || []).map(transformOrder),
          total: count || 0,
          page: Math.floor((options?.offset || 0) / (options?.limit || 50)) + 1,
          perPage: options?.limit || 50,
          hasMore: (data?.length || 0) === (options?.limit || 50),
        };
      },

      async get(id: string) {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*), transactions(*)')
          .eq('id', id)
          .single();
        
        if (error || !data) return null;
        return transformOrder(data);
      },

      async getByNumber(orderNumber: string) {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*), transactions(*)')
          .eq('order_number', orderNumber)
          .single();
        
        if (error || !data) return null;
        return transformOrder(data);
      },

      async getByGatewayRef(gateway: PaymentGateway, ref: string) {
        // Backed by the partial unique index, so at most one row can match.
        // `.maybeSingle()` returns data: null (no error) on a miss, so a miss
        // never throws while a real backend error still surfaces.
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*), transactions(*)')
          .eq('gateway', gateway)
          .eq('gateway_ref', ref)
          .maybeSingle();

        if (error) throw error;
        if (!data) return null;
        return transformOrder(data);
      },

      async create(data: OrderInput) {
        // Generate order number
        const date = new Date();
        const orderNumber = `TK-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        // Absent gateway/gatewayRef must be stored as SQL NULL (not '') so manual
        // orders never collide under the partial unique index on gateway_ref.
        const { data: record, error } = await supabase
          .from('orders')
          .insert({
            order_number: orderNumber,
            email: data.email,
            gateway: data.gateway ?? null,
            gateway_ref: data.gatewayRef ?? null,
            status: data.status || 'pending',
            payment_status: data.paymentStatus || 'pending',
            fulfillment_status: data.fulfillmentStatus || 'unfulfilled',
            subtotal: data.subtotal || 0,
            total_tax: data.totalTax || 0,
            total_shipping: data.totalShipping || 0,
            total_discount: data.totalDiscount || 0,
            total: data.total || 0,
            currency: data.currency || 'USD',
            shipping_address: data.shippingAddress,
            billing_address: data.billingAddress,
            notes: data.notes,
            metadata: data.metadata,
          })
          .select()
          .single();

        // supabase-js does NOT throw; it returns { data: null, error }. A unique
        // violation is error.code === '23505'. Classify as a duplicate ONLY when
        // the violated constraint is the gateway_ref index (message/details name
        // it); otherwise rethrow so unrelated constraints aren't swallowed.
        if (error) {
          const haystack = `${error.message ?? ''} ${(error as { details?: string }).details ?? ''}`;
          if (error.code === '23505' && haystack.includes('gateway_ref')) {
            throw new DuplicateGatewayRefError(data.gateway ?? '', data.gatewayRef ?? '');
          }
          throw error;
        }
        
        // Insert order items if provided
        if (data.items?.length) {
          await supabase
            .from('order_items')
            .insert(data.items.map(item => ({
              order_id: record.id,
              product_id: item.productId,
              name: item.name,
              sku: item.sku,
              price: item.price,
              quantity: item.quantity,
              image: item.image,
              line_total: item.price * item.quantity,
            })));
        }
        
        return this.get(record.id) as any;
      },

      async update(id: string, data: Partial<OrderInput>) {
        const { data: record, error } = await supabase
          .from('orders')
          .update({
            ...data,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw error;
        return transformOrder(record);
      },

      async addTransaction(orderId: string, transaction: TransactionInput) {
        const { error } = await supabase
          .from('transactions')
          .insert({
            order_id: orderId,
            kind: transaction.kind,
            status: transaction.status,
            amount: transaction.amount,
            currency: transaction.currency,
            gateway: transaction.gateway,
            parent_id: transaction.parentId,
            processed_at: transaction.processedAt?.toISOString() || new Date().toISOString(),
            metadata: transaction.metadata,
          });
        
        if (error) throw error;
        return this.get(orderId) as any;
      },

      async updateStatus(id: string, status: any) {
        const { data: record, error } = await supabase
          .from('orders')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw error;
        return transformOrder(record);
      },
    },

    // Webhook events — exactly-once ledger for gateway deliveries.
    webhookEvents: {
      async claim(event: {
        gateway: PaymentGateway;
        eventId: string;
        eventType: string;
      }) {
        // Single atomic INSERT ... ON CONFLICT DO NOTHING (ignoreDuplicates).
        // A returned row means THIS call inserted it (claimed); an empty array
        // means the row already existed (a prior claim won).
        const { data, error } = await supabase
          .from('processed_webhook_events')
          .upsert(
            {
              gateway: event.gateway,
              event_id: event.eventId,
              event_type: event.eventType,
              outcome: 'processed',
            },
            { onConflict: 'gateway,event_id', ignoreDuplicates: true }
          )
          .select();

        if (error) throw error;

        if (data && data.length === 1) {
          return { claimed: true };
        }

        // Already existed — surface the winning row so the caller can inspect it.
        const existing = await this.get(event.gateway, event.eventId);
        return { claimed: false, existing: existing ?? undefined };
      },

      async complete(
        gateway: PaymentGateway,
        eventId: string,
        result: { outcome: 'processed' | 'ignored'; orderId?: string }
      ) {
        const { error } = await supabase
          .from('processed_webhook_events')
          .update({
            outcome: result.outcome,
            order_id: result.orderId ?? null,
          })
          .eq('gateway', gateway)
          .eq('event_id', eventId);

        if (error) throw error;
      },

      async release(gateway: PaymentGateway, eventId: string) {
        const { error } = await supabase
          .from('processed_webhook_events')
          .delete()
          .eq('gateway', gateway)
          .eq('event_id', eventId);

        if (error) throw error;
      },

      async get(gateway: PaymentGateway, eventId: string) {
        const { data, error } = await supabase
          .from('processed_webhook_events')
          .select('*')
          .eq('gateway', gateway)
          .eq('event_id', eventId)
          .maybeSingle();

        if (error) throw error;
        if (!data) return null;
        return transformWebhookEvent(data);
      },
    },

    // Customers
    customers: {
      async get(id: string) {
        const { data, error } = await supabase
          .from('customers')
          .select('*, addresses(*)')
          .eq('id', id)
          .single();
        
        if (error || !data) return null;
        return transformCustomer(data);
      },

      async getByEmail(email: string) {
        const { data, error } = await supabase
          .from('customers')
          .select('*, addresses(*)')
          .eq('email', email)
          .single();
        
        if (error || !data) return null;
        return transformCustomer(data);
      },

      async create(data: CustomerInput) {
        const { data: record, error } = await supabase
          .from('customers')
          .insert({
            email: data.email,
            first_name: data.firstName,
            last_name: data.lastName,
            phone: data.phone,
            metadata: data.metadata,
          })
          .select()
          .single();
        
        if (error) throw error;
        return transformCustomer(record);
      },

      async update(id: string, data: Partial<CustomerInput>) {
        const { data: record, error } = await supabase
          .from('customers')
          .update({
            email: data.email,
            first_name: data.firstName,
            last_name: data.lastName,
            phone: data.phone,
            metadata: data.metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw error;
        return transformCustomer(record);
      },

      async addAddress(customerId: string, address: any) {
        await supabase
          .from('addresses')
          .insert({
            customer_id: customerId,
            ...address,
          });
        
        return this.get(customerId) as any;
      },
    },

    // Setup — create tables based on enabled features
    async setup(features: StoreFeatures): Promise<SetupResult> {
      const createdCollections: string[] = [];
      // This adapter cannot execute DDL over PostgREST, so it creates nothing.
      // Claiming otherwise is a lie the contract suite now catches (case 8).
      const created = false;

      const tables: { name: string; sql: string; condition?: boolean }[] = [
        {
          name: 'products',
          condition: true, // always
          sql: `
            CREATE TABLE IF NOT EXISTS products (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              slug text NOT NULL UNIQUE,
              name text NOT NULL,
              description text,
              price integer NOT NULL,
              compare_at_price integer,
              images jsonb DEFAULT '[]'::jsonb,
              inventory jsonb,
              seo jsonb,
              metadata jsonb,
              status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
              created_at timestamptz DEFAULT now(),
              updated_at timestamptz DEFAULT now()
              ${features.variants ? ', variants jsonb DEFAULT \'[]\'::jsonb, options jsonb DEFAULT \'[]\'::jsonb' : ''}
            );
          `,
        },
        {
          name: 'collections',
          condition: features.collections,
          sql: `
            CREATE TABLE IF NOT EXISTS collections (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              slug text NOT NULL UNIQUE,
              name text NOT NULL,
              description text,
              image jsonb,
              seo jsonb,
              sort_order integer NOT NULL DEFAULT 0,
              created_at timestamptz DEFAULT now(),
              updated_at timestamptz DEFAULT now()
            );
          `,
        },
        {
          name: 'carts',
          condition: true,
          sql: `
            CREATE TABLE IF NOT EXISTS carts (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              session_id text NOT NULL,
              customer_id text,
              items jsonb DEFAULT '[]'::jsonb,
              subtotal integer DEFAULT 0,
              total_tax integer DEFAULT 0,
              total_shipping integer DEFAULT 0,
              total_discount integer DEFAULT 0,
              total integer DEFAULT 0,
              currency text DEFAULT 'USD',
              created_at timestamptz DEFAULT now(),
              updated_at timestamptz DEFAULT now()
            );
          `,
        },
        {
          name: 'orders',
          condition: true,
          sql: `
            CREATE TABLE IF NOT EXISTS orders (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              order_number text NOT NULL UNIQUE,
              customer_id text,
              email text NOT NULL,
              status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','paid','fulfilled','shipped','delivered','cancelled','refunded')),
              payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','authorized','paid','partially_refunded','refunded','failed')),
              fulfillment_status text NOT NULL DEFAULT 'unfulfilled' CHECK (fulfillment_status IN ('unfulfilled','partially_fulfilled','fulfilled','returned')),
              items jsonb DEFAULT '[]'::jsonb,
              subtotal integer DEFAULT 0,
              total_tax integer DEFAULT 0,
              total_shipping integer DEFAULT 0,
              total_discount integer DEFAULT 0,
              total integer DEFAULT 0,
              currency text DEFAULT 'USD',
              shipping_address jsonb,
              billing_address jsonb,
              transactions jsonb DEFAULT '[]'::jsonb,
              notes text,
              metadata jsonb,
              created_at timestamptz DEFAULT now(),
              updated_at timestamptz DEFAULT now()
            );
          `,
        },
        {
          name: 'customers',
          condition: true,
          sql: `
            CREATE TABLE IF NOT EXISTS customers (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              email text NOT NULL UNIQUE,
              first_name text,
              last_name text,
              phone text,
              addresses jsonb DEFAULT '[]'::jsonb,
              default_address_id text,
              metadata jsonb,
              created_at timestamptz DEFAULT now(),
              updated_at timestamptz DEFAULT now()
            );
          `,
        },
      ];

      // This adapter cannot run DDL over the REST API, so it creates NOTHING.
      // We surface the SQL the operator must run themselves (psql / SQL editor /
      // migration) rather than lying with created: true (contract test case 8).
      const requiredSql: string[] = [];
      for (const table of tables) {
        if (table.condition) {
          requiredSql.push(table.sql.trim());
        }
      }

      // Payment-hardening additions (spec 018): idempotency columns/indexes and
      // the exactly-once webhook ledger. The partial index on gateway_ref lets
      // manual orders (NULL gateway_ref) coexist without ever conflicting.
      requiredSql.push(
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway text;`,
        `ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway_ref text;`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_gateway_ref ON orders (gateway, gateway_ref) WHERE gateway_ref IS NOT NULL;`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_number ON orders (order_number);`,
        `CREATE TABLE IF NOT EXISTS processed_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  outcome text NOT NULL DEFAULT 'processed' CHECK (outcome IN ('processed','ignored','failed')),
  order_id uuid,
  processed_at timestamptz DEFAULT now()
);`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events ON processed_webhook_events (gateway, event_id);`
      );

      // NOTE: core's SetupResult only declares { created, createdCollections }.
      // `requiredSql` is an honest extra field the CLI consumes; core's
      // SetupResult should gain `requiredSql` (tracked as a follow-up).
      void created;
      return {
        created: false,
        createdCollections,
        requiredSql,
      } as SetupResult & { requiredSql: string[] };
    },
  };
}

// Transform Supabase product to TillKit format
/**
 * A `cart_items` row → the contract's `CartItem`.
 *
 * `cart.get()` previously returned these rows untransformed, so callers saw
 * `product_id` / `line_total` where the contract promises `productId` /
 * `lineTotal`. Every consumer reading `item.productId` silently got `undefined`.
 */
function toCartItem(data: any) {
  return {
    id: data.id,
    productId: data.product_id,
    variantId: data.variant_id ?? undefined,
    name: data.name,
    sku: data.sku,
    price: data.price,
    quantity: data.quantity,
    lineTotal: data.line_total ?? data.price * data.quantity,
    image: data.image ?? undefined,
  };
}

function transformProduct(data: any) {
  return {
    ...data,
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description,
    price: data.price,
    compareAtPrice: data.compare_at_price,
    images: data.images || [],
    variants: data.variants || [],
    options: data.options || [],
    inventory: data.inventory,
    seo: data.seo,
    metadata: data.metadata,
    status: data.status,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

function supabaseProductInput(data: any) {
  return {
    slug: data.slug,
    name: data.name,
    description: data.description,
    price: data.price,
    compare_at_price: data.compareAtPrice,
    images: data.images,
    variants: data.variants,
    options: data.options,
    inventory: data.inventory,
    seo: data.seo,
    metadata: data.metadata,
    status: data.status,
  };
}

// Transform Supabase order to TillKit format
function transformOrder(data: any) {
  return {
    ...data,
    id: data.id,
    orderNumber: data.order_number,
    customerId: data.customer_id,
    email: data.email,
    status: data.status,
    paymentStatus: data.payment_status,
    fulfillmentStatus: data.fulfillment_status,
    gateway: data.gateway ?? undefined,
    gatewayRef: data.gateway_ref ?? undefined,
    items: (data.order_items || []).map((item: any) => ({
      id: item.id,
      orderId: item.order_id,
      productId: item.product_id,
      name: item.name,
      sku: item.sku,
      price: item.price,
      quantity: item.quantity,
      image: item.image,
      lineTotal: item.line_total,
    })),
    subtotal: data.subtotal || 0,
    totalTax: data.total_tax || 0,
    totalShipping: data.total_shipping || 0,
    totalDiscount: data.total_discount || 0,
    total: data.total || 0,
    currency: data.currency,
    shippingAddress: data.shipping_address,
    billingAddress: data.billing_address,
    transactions: (data.transactions || []).map((tx: any) => ({
      id: tx.id,
      orderId: tx.order_id,
      kind: tx.kind,
      status: tx.status,
      amount: tx.amount,
      currency: tx.currency,
      gateway: tx.gateway,
      parentId: tx.parent_id,
      processedAt: tx.processed_at ? new Date(tx.processed_at) : undefined,
      metadata: tx.metadata,
    })),
    notes: data.notes,
    metadata: data.metadata,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

// Transform Supabase processed_webhook_events row to TillKit format
function transformWebhookEvent(data: any): ProcessedWebhookEvent {
  return {
    id: data.id,
    gateway: data.gateway,
    eventId: data.event_id,
    eventType: data.event_type,
    outcome: data.outcome,
    orderId: data.order_id ?? undefined,
    processedAt: new Date(data.processed_at),
  };
}

// Transform Supabase customer to TillKit format
function transformCustomer(data: any) {
  return {
    ...data,
    id: data.id,
    email: data.email,
    firstName: data.first_name,
    lastName: data.last_name,
    phone: data.phone,
    addresses: (data.addresses || []).map((addr: any) => ({
      id: addr.id,
      customerId: addr.customer_id,
      name: addr.name,
      line1: addr.line1,
      line2: addr.line2,
      city: addr.city,
      province: addr.province,
      postalCode: addr.postal_code,
      country: addr.country,
      isDefault: addr.is_default,
    })),
    defaultAddressId: data.default_address_id,
    metadata: data.metadata,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

export type SupabaseAdapter = ReturnType<typeof supabaseAdapter>;
