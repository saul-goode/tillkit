import { Hono } from 'hono';
import { createWebhookRoutes } from '@tillkit/server';
import { database, stripe } from '../app-context.js';

export const webhooksRouter = new Hono();

if (stripe && process.env.STRIPE_WEBHOOK_SECRET) {
  // Build optional inventory webhook config from env
  const inventoryWebhookConfig = process.env.INVENTORY_WEBHOOK_URL
    ? {
        url: process.env.INVENTORY_WEBHOOK_URL,
        secret: process.env.INVENTORY_WEBHOOK_SECRET || undefined,
      }
    : undefined;

  webhooksRouter.route(
    '/',
    createWebhookRoutes({
      database,
      stripe,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      inventoryWebhook: inventoryWebhookConfig,
    }),
  );
}
