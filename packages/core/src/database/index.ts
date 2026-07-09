// Database adapter interface - all database adapters implement this
import type {
  Product,
  Cart,
  Order,
  Customer,
  PaymentGateway,
  ProcessedWebhookEvent,
} from '../types/index.js';
import type { StoreFeatures } from '../config.js';

/**
 * Error code an adapter MUST surface when an insert violates the unique
 * (gateway, gatewayRef) constraint. Callers use insert-and-catch rather than
 * check-then-insert: the success page and the webhook race in production, so a
 * read-then-write check has a TOCTOU window.
 */
export const DUPLICATE_GATEWAY_REF = 'DUPLICATE_GATEWAY_REF';

/** Thrown by `orders.create` when `(gateway, gatewayRef)` already exists. */
export class DuplicateGatewayRefError extends Error {
  readonly code = DUPLICATE_GATEWAY_REF;
  constructor(gateway: string, gatewayRef: string) {
    super(`An order already exists for ${gateway} reference ${gatewayRef}`);
    this.name = 'DuplicateGatewayRefError';
  }
}

export function isDuplicateGatewayRefError(err: unknown): err is DuplicateGatewayRefError {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === DUPLICATE_GATEWAY_REF
  );
}

/** Setup result from database adapter initialization */
export interface SetupResult {
  /** Whether this was a fresh setup or an existing store */
  created: boolean;
  /** List of collections/tables that were created */
  createdCollections: string[];
}

// Database-specific types (not exported from here to avoid conflicts)
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

// Input types (defined here to avoid conflicts with types/index.ts)
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

// Main interface - single export
export interface DatabaseAdapter {
  // Products
  products: {
    list(options?: QueryOptions): Promise<PaginatedResult<Product>>;
    get(id: string): Promise<Product | null>;
    getBySlug(slug: string): Promise<Product | null>;
    create(data: ProductInput): Promise<Product>;
    update(id: string, data: Partial<ProductInput>): Promise<Product>;
    delete(id: string): Promise<void>;
    search(query: string): Promise<Product[]>;
  };
  
  // Cart
  cart: {
    get(sessionId: string): Promise<Cart | null>;
    create(sessionId: string): Promise<Cart>;
    update(sessionId: string, updates: Partial<Cart>): Promise<Cart>;
    addItem(sessionId: string, item: CartItemInput): Promise<Cart>;
    updateItem(sessionId: string, itemId: string, quantity: number): Promise<Cart>;
    removeItem(sessionId: string, itemId: string): Promise<Cart>;
    clear(sessionId: string): Promise<void>;
  };
  
  // Orders
  orders: {
    list(options?: QueryOptions): Promise<PaginatedResult<Order>>;
    get(id: string): Promise<Order | null>;
    getByNumber(orderNumber: string): Promise<Order | null>;
    /**
     * Look up an order by the gateway's payment reference (Stripe session id,
     * PayPal order id). Returns null on miss; never throws for a miss.
     *
     * NOTE: this is NOT `getByNumber` — `orderNumber` is TillKit's own
     * human-facing identifier and has nothing to do with any gateway.
     */
    getByGatewayRef(gateway: PaymentGateway, ref: string): Promise<Order | null>;
    /** Throws `DuplicateGatewayRefError` when `(gateway, gatewayRef)` exists. */
    create(data: OrderInput): Promise<Order>;
    update(id: string, data: Partial<OrderInput>): Promise<Order>;
    addTransaction(orderId: string, transaction: TransactionInput): Promise<Order>;
    updateStatus(id: string, status: Order['status']): Promise<Order>;
  };

  /**
   * Exactly-once ledger for gateway webhook deliveries.
   *
   * `claim` MUST be a single constrained insert whose conflict is detected —
   * never a read followed by a write.
   */
  webhookEvents: {
    /**
     * Atomically claim an event for processing.
     * Returns `{ claimed: true }` to exactly one caller; every other caller for
     * the same `(gateway, eventId)` gets `{ claimed: false, existing }`.
     */
    claim(event: {
      gateway: PaymentGateway;
      eventId: string;
      eventType: string;
    }): Promise<{ claimed: boolean; existing?: ProcessedWebhookEvent }>;

    /** Record the outcome of a successfully-processed event. */
    complete(
      gateway: PaymentGateway,
      eventId: string,
      result: { outcome: 'processed' | 'ignored'; orderId?: string }
    ): Promise<void>;

    /**
     * Drop a claim so a redelivery can retry it. MUST be called when a handler
     * fails after claiming, otherwise that payment's side effects are lost
     * forever: the gateway retries, the claim blocks it, nothing ever runs.
     */
    release(gateway: PaymentGateway, eventId: string): Promise<void>;

    get(gateway: PaymentGateway, eventId: string): Promise<ProcessedWebhookEvent | null>;
  };
  
  // Customers
  customers: {
    get(id: string): Promise<Customer | null>;
    getByEmail(email: string): Promise<Customer | null>;
    create(data: CustomerInput): Promise<Customer>;
    update(id: string, data: Partial<CustomerInput>): Promise<Customer>;
    addAddress(customerId: string, address: any): Promise<Customer>;
  };

  // Setup
  setup(features: StoreFeatures): Promise<SetupResult>;
}