import { Hono } from 'hono';
import type { DatabaseAdapter, StoreFeatures, SubscriptionProvider } from '@tillkit/core';
import { createProductRoutes } from './routes/products.js';
import { createSubscriptionRoutes } from './routes/subscriptions.js';
import { createAdminRoutes } from './routes/admin.js';
import { createSearchRoutes, type SearchConfig } from './routes/search.js';
import { createSearchService } from '@tillkit/integration-search';

export type { SearchConfig } from './routes/search.js';
export { createSearchProvider } from './routes/search.js';

export interface HonoAppConfig {
  database: DatabaseAdapter;
  subscriptionProvider?: SubscriptionProvider;
  features?: StoreFeatures;
  sessionSecret?: string;
  enableAdmin?: boolean;
  adminPath?: string;
  search?: SearchConfig;
}

export function createHonoApp(config: HonoAppConfig) {
  const app = new Hono();

  const features = config.features || {
    variants: true,
    collections: false,
    inventoryTracking: true,
    subscriptions: false,
    multiCurrency: false,
  };

  // Optional search service
  const searchService = config.search?.provider
    ? createSearchService(config.search.provider)
    : undefined;

  // Middleware for request logging
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    console.log(`${c.req.method} ${c.req.url} - ${c.res.status} - ${duration}ms`);
  });

  // Health check
  app.get('/health', (c) => c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    features,
    search: config.search?.enabled ?? !!searchService,
  }));

  // Subscription routes
  if (config.subscriptionProvider) {
    app.route("/api/subscriptions", createSubscriptionRoutes({
      database: config.database,
      subscriptionProvider: config.subscriptionProvider,
    }));
  }

  // Search API routes
  if (searchService) {
    app.route('/api/search', createSearchRoutes(config.search!));
  }

  // Product routes (with search sync if available)
  app.route('/api/products', createProductRoutes(config.database, searchService));

  // Admin routes (optional)
  if (config.enableAdmin !== false) {
    const adminPath = config.adminPath || '/admin';
    app.route(adminPath, createAdminRoutes({
      database: config.database,
      basePath: adminPath,
      features,
      searchService,
    }));
  }

  return app;
}

// Export route factories
export { createSubscriptionRoutes } from './routes/subscriptions.js';
export { createProductRoutes, createAdminRoutes };
export { createWebhookRoutes, createOrderFromStripeSession } from './routes/webhooks.js';
export { createPayPalWebhookRoutes, createOrderFromPayPalCapture } from './routes/paypal-webhooks.js';
export { createAuthRoutes, requireAuth, createSessionMiddleware } from './routes/auth.js';
export type { InventoryWebhookConfig } from './inventory.js';
export { decrementInventoryForOrder } from './inventory.js';
export { revalidateCart } from './checkout.js';
export type {
  CartRevalidationResult,
  CartPriceChange,
  CartStockIssue,
  CartRemovedItem,
} from './checkout.js';

// Export themes
export * from './themes/index.js';

// Export for external use
export { Hono };
export type { Hono as HonoApp };

// Type augmentation for Hono context
declare module 'hono' {
  interface ContextVariableMap {
    database: DatabaseAdapter;
    customerId?: string;
    customerEmail?: string;
  }
}