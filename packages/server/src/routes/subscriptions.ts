import { Hono } from 'hono';
import type { DatabaseAdapter, SubscriptionProvider } from '@tillkit/core';

export interface SubscriptionRouteConfig {
  database: DatabaseAdapter;
  subscriptionProvider: SubscriptionProvider;
}

export function createSubscriptionRoutes(config: SubscriptionRouteConfig) {
  const { subscriptionProvider: subs } = config;
  const app = new Hono();

  // Create subscription (checkout)
  app.post('/', async (c) => {
    const body = await c.req.json();
    try {
      const result = await subs.createSubscription({
        customerId: body.customerId,
        planId: body.planId,
        trialDays: body.trialDays,
        paymentMethodId: body.paymentMethodId,
        metadata: body.metadata,
      });
      return c.json(result);
    } catch (err: any) {
      console.error('Subscription create error:', err);
      return c.json({ error: err.message }, 400);
    }
  });

  // Get subscription
  app.get('/:id', async (c) => {
    const id = c.req.param('id');
    // Try provider first, then database if provider fails
    try {
      const sub = await subs.getSubscription(id);
      return c.json(sub);
    } catch (err: any) {
      return c.json({ error: err.message }, 404);
    }
  });

  // Cancel subscription
  app.post('/:id/cancel', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    try {
      const result = await subs.cancelSubscription(id, body.immediately);
      return c.json(result);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  // Update subscription (change plan)
  app.post('/:id/update', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    if (!body.planId) return c.json({ error: 'planId required' }, 400);
    try {
      const result = await subs.updateSubscription(id, body.planId);
      return c.json(result);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  return app;
}
