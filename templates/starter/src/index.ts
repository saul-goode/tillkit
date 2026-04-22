import { serve } from '@hono/node-server';
import { createStarterApp } from './app.js';
import { database, stripe } from './app-context.js';

const app = createStarterApp({ database, stripe });

serve({
  fetch: app.fetch,
  port: 3000,
});

console.log('TillKit starter running at http://localhost:3000');
