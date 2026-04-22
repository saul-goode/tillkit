import { Hono } from 'hono';
import { createWebhookRoutes } from '@tillkit/server';
import { database, stripe } from '../app-context.js';

export const webhooksRouter = new Hono();

if (stripe && process.env.STRIPE_WEBHOOK_SECRET) {
  webhooksRouter.route(
    '/',
    createWebhookRoutes({
      database,
      stripe,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    }),
  );
}
