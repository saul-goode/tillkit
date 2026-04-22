import PocketBase from 'pocketbase';
import type { Product, Cart, Order, Customer, DatabaseAdapter, StoreFeatures } from '@tillkit/core';
import type { SetupResult } from '@tillkit/core';

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

      async create(data: OrderInput): Promise<Order> {
        // Generate order number
        const date = new Date();
        const orderNumber = `TK-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        const record = await pb.collection('orders').create({
          ...data,
          orderNumber,
          status: data.status || 'pending',
          paymentStatus: data.paymentStatus || 'pending',
          fulfillmentStatus: data.fulfillmentStatus || 'unfulfilled',
        });
        return record as unknown as Order;
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
          { name: 'slug', type: 'text', required: true, unique: true },
          { name: 'name', type: 'text', required: true },
          { name: 'description', type: 'text' },
          { name: 'price', type: 'number', required: true },
          { name: 'compareAtPrice', type: 'number' },
          { name: 'images', type: 'json' },
          { name: 'inventory', type: 'json' },
          { name: 'seo', type: 'json' },
          { name: 'metadata', type: 'json' },
          { name: 'status', type: 'select', required: true, values: ['draft', 'active', 'archived'] },
        ];

        // Variant fields only if enabled
        if (features.variants) {
          fields.push({ name: 'variants', type: 'json' });
          fields.push({ name: 'options', type: 'json' });
        }

        await pb.collections.create({ name: 'products', type: 'base', schema: fields });
        createdCollections.push('products');
        created = true;
      }

      // Collections/categories — only if enabled
      if (features.collections && !await collectionExists('collections')) {
        await pb.collections.create({
          name: 'collections',
          type: 'base',
          schema: [
            { name: 'slug', type: 'text', required: true, unique: true },
            { name: 'name', type: 'text', required: true },
            { name: 'description', type: 'text' },
            { name: 'image', type: 'json' },
            { name: 'seo', type: 'json' },
            { name: 'sortOrder', type: 'number', required: true },
          ],
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
            { name: 'sessionId', type: 'text', required: true },
            { name: 'customerId', type: 'text' },
            { name: 'items', type: 'json' },
            { name: 'subtotal', type: 'number' },
            { name: 'totalTax', type: 'number' },
            { name: 'totalShipping', type: 'number' },
            { name: 'totalDiscount', type: 'number' },
            { name: 'total', type: 'number' },
            { name: 'currency', type: 'text' },
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
            { name: 'orderNumber', type: 'text', required: true, unique: true },
            { name: 'customerId', type: 'text' },
            { name: 'email', type: 'text', required: true },
            { name: 'status', type: 'select', required: true, values: ['pending', 'confirmed', 'paid', 'fulfilled', 'shipped', 'delivered', 'cancelled', 'refunded'] },
            { name: 'paymentStatus', type: 'select', required: true, values: ['pending', 'authorized', 'paid', 'partially_refunded', 'refunded', 'failed'] },
            { name: 'fulfillmentStatus', type: 'select', required: true, values: ['unfulfilled', 'partially_fulfilled', 'fulfilled', 'returned'] },
            { name: 'items', type: 'json' },
            { name: 'subtotal', type: 'number' },
            { name: 'totalTax', type: 'number' },
            { name: 'totalShipping', type: 'number' },
            { name: 'totalDiscount', type: 'number' },
            { name: 'total', type: 'number' },
            { name: 'currency', type: 'text' },
            { name: 'shippingAddress', type: 'json' },
            { name: 'billingAddress', type: 'json' },
            { name: 'transactions', type: 'json' },
            { name: 'notes', type: 'text' },
            { name: 'metadata', type: 'json' },
          ],
        });
        createdCollections.push('orders');
        created = true;
      }

      // Customers collection — always required
      if (!await collectionExists('customers')) {
        await pb.collections.create({
          name: 'customers',
          type: 'base',
          schema: [
            { name: 'email', type: 'email', required: true },
            { name: 'firstName', type: 'text' },
            { name: 'lastName', type: 'text' },
            { name: 'phone', type: 'text' },
            { name: 'addresses', type: 'json' },
            { name: 'defaultAddressId', type: 'text' },
            { name: 'metadata', type: 'json' },
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
