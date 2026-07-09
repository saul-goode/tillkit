import type { SubscriptionMetadata } from '../subscriptions/index.js';
// Product Types
export interface Product {
  id: string;
  slug: string;
  name: string;
  description?: string;
  price: number; // Cents (integer - no floating point money)
  compareAtPrice?: number;
  images: ProductImage[];
  variants?: ProductVariant[];
  options?: ProductOption[]; // Size, Color, etc.
  inventory?: Inventory;
  seo?: SeoMetadata;
  metadata?: Record<string, unknown>;
  status: 'draft' | 'active' | 'archived';
  subscription?: SubscriptionMetadata; // Set this on recurring products
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductImage {
  id: string;
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface ProductVariant {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  price?: number; // Override product price
  compareAtPrice?: number;
  weight?: number; // In grams
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
  };
  inventory?: Inventory;
  images?: ProductImage[];
  options: Record<string, string>; // { size: 'L', color: 'blue' }
}

export interface ProductOption {
  name: string; // 'Size', 'Color', etc.
  values: string[]; // ['S', 'M', 'L', 'XL']
}

export interface Inventory {
  quantity: number;
  reserved?: number;
  available: number;
  allowOutOfStock: boolean;
}

export interface SeoMetadata {
  title?: string;
  description?: string;
  keywords?: string[];
  image?: string;
}

// Cart Types
export interface Cart {
  id: string;
  sessionId: string;
  customerId?: string;
  items: CartItem[];
  subtotal: number;
  totalTax: number;
  totalShipping: number;
  totalDiscount: number;
  total: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartItem {
  id: string;
  productId: string;
  variantId?: string;
  name: string; // Snapshot at time of add
  sku: string;
  price: number; // Snapshot price in cents
  quantity: number;
  lineTotal: number;
  image?: ProductImage;
}

// Order Types
export type OrderStatus = 
  | 'pending' 
  | 'confirmed' 
  | 'paid' 
  | 'fulfilled' 
  | 'shipped' 
  | 'delivered' 
  | 'cancelled' 
  | 'refunded';

export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'partially_refunded'
  | 'refunded'
  | 'failed';

export type FulfillmentStatus =
  | 'unfulfilled'
  | 'partially_fulfilled'
  | 'fulfilled'
  | 'returned';

/** Payment gateways that can originate an order. */
export type PaymentGateway = 'stripe' | 'paypal';

export interface Order {
  id: string;
  orderNumber: string;
  customerId?: string;
  email: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  items: OrderItem[];
  subtotal: number;
  totalTax: number;
  totalShipping: number;
  totalDiscount: number;
  total: number;
  currency: string;
  shippingAddress: Address;
  billingAddress: Address;
  transactions: Transaction[];
  notes?: string;
  metadata?: Record<string, unknown>;
  /** Gateway that produced this order; absent for manually-created orders. */
  gateway?: PaymentGateway;
  /**
   * The gateway's identifier for the payment that created this order — Stripe
   * Checkout session id, PayPal order id. Unique per gateway, and the key that
   * makes order creation idempotent. Absent for manual orders.
   */
  gatewayRef?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Outcome of processing a webhook delivery. */
export type WebhookOutcome = 'processed' | 'ignored' | 'failed';

/**
 * Ledger entry recording that a gateway event's side effects have run.
 * Unique on (gateway, eventId) so redelivery is a no-op.
 */
export interface ProcessedWebhookEvent {
  id: string;
  gateway: PaymentGateway;
  eventId: string;
  eventType: string;
  outcome: WebhookOutcome;
  orderId?: string;
  processedAt: Date;
}

export interface OrderItem {
  id: string;
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  price: number; // Snapshot at purchase
  quantity: number;
  total: number;
  image?: ProductImage;
}

export interface Address {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  province?: string; // State/Region
  postalCode: string;
  country: string;
  phone?: string;
}

export interface Transaction {
  id: string;
  kind: 'authorization' | 'capture' | 'sale' | 'refund' | 'void';
  status: 'pending' | 'success' | 'failure';
  amount: number;
  currency: string;
  gateway: string;
  parentId?: string; // For refunds
  processedAt?: Date;
  metadata?: Record<string, unknown>;
}

// Customer Types
export interface Customer {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  addresses: Address[];
  defaultAddressId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Collection/Category
export interface Collection {
  id: string;
  slug: string;
  name: string;
  description?: string;
  image?: ProductImage;
  products?: Product[]; // Paginated
  seo?: SeoMetadata;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

// Input types (for creation/updates)
export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;
export type CartItemInput = Omit<CartItem, 'id' | 'lineTotal'>;
export type OrderInput = Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'>;
export type TransactionInput = Omit<Transaction, 'id'>;
export type CustomerInput = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>;
