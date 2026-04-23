import { serve } from '@hono/node-server';
import { createStarterApp } from './app.js';
import { database, stripe } from './app-context.js';
import { createSearchProvider, createSearchService } from '@tillkit/integration-search';
import type { SearchConfig } from '@tillkit/integration-search';
import { createStripeSubscriptionProvider } from '@tillkit/integration-stripe';

// Optional Meilisearch configuration from environment
let search: ReturnType<typeof createSearchService> | undefined = undefined;

// Optional subscription billing
let subscriptionProvider: ReturnType<typeof createStripeSubscriptionProvider> | undefined = undefined;
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) {
  subscriptionProvider = createStripeSubscriptionProvider({
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  console.log('Stripe subscription billing enabled');
}

if (process.env.MEILISEARCH_HOST && process.env.MEILISEARCH_API_KEY) {
  const searchConfig: SearchConfig = {
    provider: 'meilisearch' as const,
    host: process.env.MEILISEARCH_HOST,
    apiKey: process.env.MEILISEARCH_API_KEY,
    indexName: process.env.MEILISEARCH_INDEX || 'products',
  };
  try {
    const provider = createSearchProvider(searchConfig);
    search = createSearchService(provider);
    console.log(`Meilisearch init: ${process.env.MEILISEARCH_HOST}`);
  } catch (err) {
    console.error('Meilisearch init failed:', err);
  }
} else {
  console.log('Using database search fallback (no Meilisearch configured)');
}

const app = createStarterApp({ database, stripe, search, subscriptionProvider });

serve({
  fetch: app.fetch,
  port: 3000,
});

console.log('TillKit starter running at http://localhost:3000');