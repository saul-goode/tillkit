import { Hono } from 'hono';
import type { DatabaseAdapter, StoreFeatures } from '@tillkit/core';
import { createProductRoutes } from './routes/products.js';
import { createAdminRoutes } from './routes/admin.js';

// Create fully-configured TillKit Hono app
export function createHonoApp(config: {
  database: DatabaseAdapter;
  features?: StoreFeatures;
  sessionSecret?: string;
  enableAdmin?: boolean;
  adminPath?: string;
}) {
  const app = new Hono();

  const features = config.features || {
    variants: true,
    collections: false,
    inventoryTracking: true,
    subscriptions: false,
    multiCurrency: false,
  };

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
  }));

  // Product routes
  app.route('/api/products', createProductRoutes(config.database));

  // Admin routes (optional)
  if (config.enableAdmin !== false) {
    const adminPath = config.adminPath || '/admin';
    app.route(adminPath, createAdminRoutes({
      database: config.database,
      basePath: adminPath,
      features,
    }));
  }

  return app;
}

// Export route factories
export { createProductRoutes, createAdminRoutes };
export { createWebhookRoutes, createOrderFromStripeSession } from './routes/webhooks.js';
export { createAuthRoutes, requireAuth, createSessionMiddleware } from './routes/auth.js';

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
