import PocketBase from 'pocketbase';
import type {
  Product,
  Cart,
  Order,
  Customer,
  DatabaseAdapter,
  StoreFeatures,
  PaymentGateway,
  ProcessedWebhookEvent,
} from '@tillkit/core';
import type { SetupResult } from '@tillkit/core';
import { DuplicateGatewayRefError } from '@tillkit/core';

/** PocketBase surfaces unique-index violations as a 400 ClientResponseError. */
function isPocketBaseStatus(err: unknown, status: number): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: number }).status === status;
}

/**
 * Unique indexes, shared by `setup()` (fresh stores) and `tillkit migrate`
 * (existing stores) so the two can never drift.
 *
 * PocketBase ignores field-level `unique: true` — it was removed in v0.14 and
 * the SDK silently drops the unknown key. Uniqueness only exists if it appears
 * here.
 *
 * The gatewayRef index is PARTIAL. PocketBase text fields store `''`, never
 * NULL, so a plain composite index would make the second manually-created order
 * (`gateway: ''`, `gatewayRef: ''`) collide with the first.
 */
export const PRODUCT_INDEXES = {
  slug: 'CREATE UNIQUE INDEX `idx_products_slug` ON `products` (`slug`)',
} as const;

export const ORDER_INDEXES = {
  orderNumber: 'CREATE UNIQUE INDEX `idx_orders_number` ON `orders` (`orderNumber`)',
  gatewayRef:
    "CREATE UNIQUE INDEX `idx_orders_gateway_ref` ON `orders` (`gateway`, `gatewayRef`) WHERE `gatewayRef` != ''",
} as const;

export const WEBHOOK_EVENT_INDEXES = {
  gatewayEventId:
    'CREATE UNIQUE INDEX `idx_webhook_events` ON `processed_webhook_events` (`gateway`, `eventId`)',
} as const;

/**
 * Field builders for the PocketBase v0.22 schema format.
 *
 * PocketBase validates `options` per field type and rejects the collection
 * outright when they are missing: `json` requires `maxSize`, `select` requires
 * `maxSelect` and `values`. Passing `values` at the top level (as this adapter
 * previously did) silently produces `validation_required` on save — which is
 * why `setup()` never actually worked and the docs told users to build
 * collections by hand.
 */
const JSON_MAX_SIZE = 2_000_000;

const text = (name: string, required = false) => ({ name, type: 'text', required, options: {} });
const number = (name: string, required = false) => ({ name, type: 'number', required, options: {} });
const email = (name: string, required = false) => ({ name, type: 'email', required, options: {} });
const json = (name: string, required = false) => ({
  name,
  type: 'json',
  required,
  options: { maxSize: JSON_MAX_SIZE },
});
const select = (name: string, values: string[], required = false) => ({
  name,
  type: 'select',
  required,
  options: { maxSelect: 1, values },
});

// Local types matching the DatabaseAdapter interface
interface QueryOptions {
  limit?: number;
  offset?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
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
  /** Gateway + payment reference; together the idempotency key for creation. */
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

export interface PocketbaseAdapterConfig {
  url: string;
  adminEmail?: string;
  adminPassword?: string;
  adminToken?: string;
}

export function pocketbaseAdapter(config: PocketbaseAdapterConfig): DatabaseAdapter {
  const pb = new PocketBase(config.url);

  // The SDK auto-cancels an in-flight request when an identical one starts,
  // rejecting the earlier with `status: 0`. That is wrong for a server: the
  // success-page and webhook paths legitimately issue the same create
  // concurrently, and one of them would be cancelled rather than either
  // succeeding or hitting the unique index.
  pb.autoCancellation(false);

  // Auth if credentials provided
  if (config.adminToken) {
    pb.authStore.save(config.adminToken, null);
  }

  return {
    // Products
    products: {
      async list(options?: QueryOptions): Promise<PaginatedResult<Product>> {
        const page = Math.floor((options?.offset || 0) / (options?.limit || 50)) + 1;
        const result = await pb.collection('products').getList(page, options?.limit || 50, {
          sort: options?.sort ? `${options.order === 'desc' ? '-' : ''}${options.sort}` : '-created',
          filter: options?.filters ? buildFilter(options.filters) : undefined,
        });
        return {
          items: result.items as unknown as Product[],
          total: result.totalItems,
          page: result.page,
          perPage: result.perPage,
          hasMore: result.page < result.totalPages,
        };
      },

      async get(id: string): Promise<Product | null> {
        try {
          const record = await pb.collection('products').getOne(id);
          return record as unknown as Product;
        } catch {
          return null;
        }
      },

      async getBySlug(slug: string): Promise<Product | null> {
        try {
          const records = await pb.collection('products').getFullList({
            filter: `slug="${escapeFilter(slug)}"`,
            limit: 1,
          });
          return records[0] as unknown as Product;
        } catch {
          return null;
        }
      },

      async create(data: ProductInput): Promise<Product> {
        const record = await pb.collection('products').create(data);
        return record as unknown as Product;
      },

      async update(id: string, data: Partial<ProductInput>): Promise<Product> {
        const record = await pb.collection('products').update(id, data);
        return record as unknown as Product;
      },

      async delete(id: string): Promise<void> {
        await pb.collection('products').delete(id);
      },

      async search(query: string): Promise<Product[]> {
        const results = await pb.collection('products').getFullList({
          filter: `name~"${escapeFilter(query)}" || description~"${escapeFilter(query)}"`,
        });
        return results as unknown as Product[];
      },
    },

    // Cart
    cart: {
      async get(sessionId: string): Promise<Cart | null> {
        try {
          const records = await pb.collection('carts').getFullList({
            filter: `sessionId="${escapeFilter(sessionId)}"`,
            expand: 'items',
            limit: 1,
          });
          return records[0] as unknown as Cart;
        } catch {
          return null;
        }
      },

      async create(sessionId: string): Promise<Cart> {
        const record = await pb.collection('carts').create({
          sessionId,
          items: [],
          subtotal: 0,
          totalTax: 0,
          totalShipping: 0,
          total: 0,
          currency: 'USD',
        });
        return record as unknown as Cart;
      },

      async update(sessionId: string, updates: Partial<Cart>): Promise<Cart> {
        const cart = await this.get(sessionId);
        if (!cart) throw new Error('Cart not found');

        const record = await pb.collection('carts').update(cart.id, updates);
        return record as unknown as Cart;
      },

      async addItem(sessionId: string, item: CartItemInput): Promise<Cart> {
        const cart = await this.get(sessionId);
        if (!cart) throw new Error('Cart not found');

        await pb.collection('cart_items').create({
          cart: cart.id,
          ...item,
        });

        return this.get(sessionId) as Promise<Cart>;
      },

      async updateItem(sessionId: string, itemId: string, quantity: number): Promise<Cart> {
        const cart = await this.get(sessionId);
        if (!cart) throw new Error('Cart not found');

        if (quantity <= 0) {
          await pb.collection('cart_items').delete(itemId);
        } else {
          await pb.collection('cart_items').update(itemId, { quantity });
        }

        return this.get(sessionId) as Promise<Cart>;
      },

      async removeItem(sessionId: string, itemId: string): Promise<Cart> {
        const cart = await this.get(sessionId);
        if (!cart) throw new Error('Cart not found');

        await pb.collection('cart_items').delete(itemId);
        return this.get(sessionId) as Promise<Cart>;
      },

      async clear(sessionId: string): Promise<void> {
        const cart = await this.get(sessionId);
        if (!cart) return;

        // Delete all cart items
        const items = await pb.collection('cart_items').getFullList({
          filter: `cart="${cart.id}"`,
        });

        await Promise.all(items.map((item) => pb.collection('cart_items').delete(item.id)));
      },
    },

    // Orders
    orders: {
      async list(options?: QueryOptions): Promise<PaginatedResult<Order>> {
        const page = Math.floor((options?.offset || 0) / (options?.limit || 50)) + 1;
        const result = await pb.collection('orders').getList(page, options?.limit || 50, {
          sort: options?.sort ? `${options.order === 'desc' ? '-' : ''}${options.sort}` : '-created',
          expand: 'items,transactions',
        });
        return {
          items: result.items as unknown as Order[],
          total: result.totalItems,
          page: result.page,
          perPage: result.perPage,
          hasMore: result.page < result.totalPages,
        };
      },

      async get(id: string): Promise<Order | null> {
        try {
          const record = await pb.collection('orders').getOne(id, {
            expand: 'items,transactions',
          });
          return record as unknown as Order;
        } catch {
          return null;
        }
      },

      async getByNumber(orderNumber: string): Promise<Order | null> {
        try {
          const records = await pb.collection('orders').getFullList({
            filter: `orderNumber="${escapeFilter(orderNumber)}"`,
            expand: 'items,transactions',
            limit: 1,
          });
          return records[0] as unknown as Order;
        } catch {
          return null;
        }
      },

      async getByGatewayRef(gateway: PaymentGateway, ref: string): Promise<Order | null> {
        const records = await pb.collection('orders').getFullList({
          filter: `gateway="${escapeFilter(gateway)}" && gatewayRef="${escapeFilter(ref)}"`,
          expand: 'items,transactions',
          limit: 1,
        });
        return (records[0] as unknown as Order) ?? null;
      },

      async create(data: OrderInput): Promise<Order> {
        // Generate order number
        const date = new Date();
        const orderNumber = `TK-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        try {
          const record = await pb.collection('orders').create({
            ...data,
            orderNumber,
            status: data.status || 'pending',
            paymentStatus: data.paymentStatus || 'pending',
            fulfillmentStatus: data.fulfillmentStatus || 'unfulfilled',
          });
          return record as unknown as Order;
        } catch (err) {
          // A 400 here may be the unique (gateway, gatewayRef) index rejecting a
          // concurrent duplicate — or any other validation failure. Confirm by
          // re-reading before classifying, so unrelated 400s are never swallowed.
          if (isPocketBaseStatus(err, 400) && data.gateway && data.gatewayRef) {
            const existing = await this.getByGatewayRef(data.gateway, data.gatewayRef);
            if (existing) throw new DuplicateGatewayRefError(data.gateway, data.gatewayRef);
          }
          throw err;
        }
      },

      async update(id: string, data: Partial<OrderInput>): Promise<Order> {
        const record = await pb.collection('orders').update(id, data);
        return record as unknown as Order;
      },

      async addTransaction(orderId: string, transaction: TransactionInput): Promise<Order> {
        await pb.collection('transactions').create({
          ...transaction,
          order: orderId,
        });

        return this.get(orderId) as Promise<Order>;
      },

      async updateStatus(id: string, status: Order['status']): Promise<Order> {
        const record = await pb.collection('orders').update(id, { status });
        return record as unknown as Order;
      },
    },

    // Customers
    customers: {
      async get(id: string): Promise<Customer | null> {
        try {
          const record = await pb.collection('customers').getOne(id, {
            expand: 'addresses',
          });
          return record as unknown as Customer;
        } catch {
          return null;
        }
      },

      async getByEmail(email: string): Promise<Customer | null> {
        try {
          const records = await pb.collection('customers').getFullList({
            filter: `email="${escapeFilter(email)}"`,
            expand: 'addresses',
            limit: 1,
          });
          return records[0] as unknown as Customer;
        } catch {
          return null;
        }
      },

      async create(data: CustomerInput): Promise<Customer> {
        const record = await pb.collection('customers').create(data);
        return record as unknown as Customer;
      },

      async update(id: string, data: Partial<CustomerInput>): Promise<Customer> {
        const record = await pb.collection('customers').update(id, data);
        return record as unknown as Customer;
      },

      async addAddress(customerId: string, address: any): Promise<Customer> {
        await pb.collection('addresses').create({
          ...address,
          customer: customerId,
        });

        const customer = await this.get(customerId);
        if (!customer) throw new Error('Customer not found');

        return customer;
      },
    },

    // Exactly-once webhook ledger
    webhookEvents: {
      async claim(event: {
        gateway: PaymentGateway;
        eventId: string;
        eventType: string;
      }): Promise<{ claimed: boolean; existing?: ProcessedWebhookEvent }> {
        try {
          // A single constrained insert. The unique (gateway, eventId) index
          // decides the winner — not a prior read, which would race.
          await pb.collection('processed_webhook_events').create({
            gateway: event.gateway,
            eventId: event.eventId,
            eventType: event.eventType,
            outcome: 'processed',
            processedAt: new Date().toISOString(),
          });
          return { claimed: true };
        } catch (err) {
          if (!isPocketBaseStatus(err, 400)) throw err;
          // Composite unique indexes do not always populate a per-field
          // `validation_not_unique` code, so confirm by reading.
          const existing = await this.get(event.gateway, event.eventId);
          if (!existing) throw err;
          return { claimed: false, existing };
        }
      },

      async complete(
        gateway: PaymentGateway,
        eventId: string,
        result: { outcome: 'processed' | 'ignored'; orderId?: string }
      ): Promise<void> {
        const record = await findWebhookEventRecord(pb, gateway, eventId);
        if (!record) return;
        await pb.collection('processed_webhook_events').update(record.id, {
          outcome: result.outcome,
          orderId: result.orderId ?? '',
        });
      },

      async release(gateway: PaymentGateway, eventId: string): Promise<void> {
        const record = await findWebhookEventRecord(pb, gateway, eventId);
        if (!record) return;
        await pb.collection('processed_webhook_events').delete(record.id);
      },

      async get(gateway: PaymentGateway, eventId: string): Promise<ProcessedWebhookEvent | null> {
        const record = await findWebhookEventRecord(pb, gateway, eventId);
        if (!record) return null;
        return {
          id: record.id,
          gateway: record.gateway,
          eventId: record.eventId,
          eventType: record.eventType,
          outcome: record.outcome,
          orderId: record.orderId || undefined,
          processedAt: new Date(record.processedAt ?? record.created),
        };
      },
    },

    // Setup — create collections based on enabled features
    async setup(features: StoreFeatures): Promise<SetupResult> {
      const createdCollections: string[] = [];
      let created = false;

      // Helper to check if collection exists
      async function collectionExists(name: string): Promise<boolean> {
        try {
          await pb.collections.getOne(name);
          return true;
        } catch {
          return false;
        }
      }

      // Products collection — always required
      if (!await collectionExists('products')) {
        const fields: any[] = [
          // NOTE: field-level `unique: true` is silently ignored by PocketBase
          // (removed in v0.14). Uniqueness must come from the `indexes` array.
          text('slug', true),
          text('name', true),
          text('description'),
          number('price', true),
          number('compareAtPrice'),
          json('images'),
          json('inventory'),
          json('seo'),
          json('metadata'),
          select('status', ['draft', 'active', 'archived'], true),
        ];

        // Variant fields only if enabled
        if (features.variants) {
          fields.push(json('variants'));
          fields.push(json('options'));
        }

        await pb.collections.create({
          name: 'products',
          type: 'base',
          schema: fields,
          indexes: [PRODUCT_INDEXES.slug],
        });
        createdCollections.push('products');
        created = true;
      }

      // Collections/categories — only if enabled
      if (features.collections && !await collectionExists('collections')) {
        await pb.collections.create({
          name: 'collections',
          type: 'base',
          schema: [
            text('slug', true),
            text('name', true),
            text('description'),
            json('image'),
            json('seo'),
            number('sortOrder', true),
          ],
          indexes: ['CREATE UNIQUE INDEX `idx_collections_slug` ON `collections` (`slug`)'],
        });
        createdCollections.push('collections');
        created = true;
      }

      // Cart collection — always required
      if (!await collectionExists('carts')) {
        await pb.collections.create({
          name: 'carts',
          type: 'base',
          schema: [
            text('sessionId', true),
            text('customerId'),
            json('items'),
            number('subtotal'),
            number('totalTax'),
            number('totalShipping'),
            number('totalDiscount'),
            number('total'),
            text('currency'),
          ],
        });
        createdCollections.push('carts');
        created = true;
      }

      // Orders collection — always required
      if (!await collectionExists('orders')) {
        await pb.collections.create({
          name: 'orders',
          type: 'base',
          schema: [
            text('orderNumber', true),
            text('customerId'),
            text('email', true),
            select('status', ['pending', 'confirmed', 'paid', 'fulfilled', 'shipped', 'delivered', 'cancelled', 'refunded'], true),
            select('paymentStatus', ['pending', 'authorized', 'paid', 'partially_refunded', 'refunded', 'failed'], true),
            select('fulfillmentStatus', ['unfulfilled', 'partially_fulfilled', 'fulfilled', 'returned'], true),
            json('items'),
            number('subtotal'),
            number('totalTax'),
            number('totalShipping'),
            number('totalDiscount'),
            number('total'),
            text('currency'),
            json('shippingAddress'),
            json('billingAddress'),
            json('transactions'),
            text('notes'),
            json('metadata'),
            text('gateway'),
            text('gatewayRef'),
          ],
          indexes: [ORDER_INDEXES.orderNumber, ORDER_INDEXES.gatewayRef],
        });
        createdCollections.push('orders');
        created = true;
      }

      // Webhook ledger — makes redelivery a no-op
      if (!await collectionExists('processed_webhook_events')) {
        await pb.collections.create({
          name: 'processed_webhook_events',
          type: 'base',
          schema: [
            text('gateway', true),
            text('eventId', true),
            text('eventType', true),
            select('outcome', ['processed', 'ignored', 'failed'], true),
            text('orderId'),
            text('processedAt'),
          ],
          indexes: [WEBHOOK_EVENT_INDEXES.gatewayEventId],
        });
        createdCollections.push('processed_webhook_events');
        created = true;
      }

      // Customers collection — always required
      if (!await collectionExists('customers')) {
        await pb.collections.create({
          name: 'customers',
          type: 'base',
          schema: [
            email('email', true),
            text('firstName'),
            text('lastName'),
            text('phone'),
            json('addresses'),
            text('defaultAddressId'),
            json('metadata'),
          ],
        });
        createdCollections.push('customers');
        created = true;
      }

      return { created, createdCollections };
    },
  };
}

// Helper to build PocketBase filter string
/** Single ledger row for `(gateway, eventId)`, or undefined. */
async function findWebhookEventRecord(
  pb: PocketBase,
  gateway: string,
  eventId: string
): Promise<any | undefined> {
  const records = await pb.collection('processed_webhook_events').getFullList({
    filter: `gateway="${escapeFilter(gateway)}" && eventId="${escapeFilter(eventId)}"`,
    limit: 1,
  });
  return records[0];
}

function buildFilter(filters: Record<string, unknown>): string {
  return Object.entries(filters)
    .map(([key, value]) => {
      if (typeof value === 'string') {
        return `${key}="${escapeFilter(value)}"`;
      }
      return `${key}=${value}`;
    })
    .join(' && ');
}

// Escape special characters in PocketBase filters
function escapeFilter(value: string): string {
  return value.replace(/"/g, '\\"');
}

export type PocketbaseAdapter = ReturnType<typeof pocketbaseAdapter>;
