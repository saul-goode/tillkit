export * from './config.js';
export type { SetupResult } from './database/index.js';
export type { StoreFeatures } from './config.js';
export * from './types/index.js';
export * from './commerce/index.js';
export * from './database/index.js';
export * from './inventory/index.js';
export type {
  Subscription,
  SubscriptionPlan,
  SubscriptionProvider,
  SubscriptionEvent,
  SubscriptionCheckoutSession,
  SubscriptionMetadata,
  CreateSubscriptionOptions,
} from './subscriptions/index.js';
export { DiscountEngine, DiscountPresets, createDiscountEngine, type Discount as PromoDiscount, type AppliedDiscount, type DiscountResult, type DiscountType, type DiscountTarget } from './discounts/index.js';

// Re-export DatabaseAdapter explicitly for external packages
export type { DatabaseAdapter } from './database/index.js';
export {
  DUPLICATE_GATEWAY_REF,
  DuplicateGatewayRefError,
  isDuplicateGatewayRefError,
} from './database/index.js';
