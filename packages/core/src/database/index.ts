// Database adapter interface - all database adapters implement this
import type { 
  Product, 
  Cart, 
  Order, 
  Customer,
} from '../types/index.js';
import type { StoreFeatures } from '../config.js';

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
    create(data: OrderInput): Promise<Order>;
    update(id: string, data: Partial<OrderInput>): Promise<Order>;
    addTransaction(orderId: string, transaction: TransactionInput): Promise<Order>;
    updateStatus(id: string, status: Order['status']): Promise<Order>;
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