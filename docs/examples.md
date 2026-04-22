# TillKit Examples

## Project Structure Examples

### Minimal Store (Single File)
```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { pocketbaseAdapter } from '@tillkit/adapter-pocketbase';

const db = pocketbaseAdapter({ url: process.env.POCKETBASE_URL! });
const app = new Hono();

// Simple product list
app.get('/', async (c) => {
  const { items } = await db.products.list({ limit: 10 });
  return c.html(`
    <h1>My Store</h1>
    <ul>${items.map(p => `
      <li>${p.name} - $${p.price/100}</li>
    `).join('')}</ul>
  `);
});

serve({ fetch: app.fetch, port: 3000 });
```

### Custom Checkout Flow
```typescript
// Custom checkout beyond Stripe
app.post('/checkout/custom', async (c) => {
  const sessionId = getSessionId(c);
  const cart = await db.cart.get(sessionId);
  
  // Your custom payment logic
  const order = await db.orders.create({
    email: cart.email,
    items: cart.items,
    total: cart.total,
    status: 'pending_payment',
  });
  
  // Redirect to your payment page
  return c.redirect(`/pay/${order.id}`);
});
```

### Product Search API
```typescript
app.get('/api/search', async (c) => {
  const query = c.req.query('q');
  if (!query) return c.json({ items: [] });
  
  const results = await db.products.search(query);
  
  return c.json({
    items: results,
    count: results.length,
  });
});
```

### Real-time Inventory Check
```typescript
app.get('/api/products/:id/availability', async (c) => {
  const id = c.req.param('id');
  const product = await db.products.get(id);
  
  if (!product) return c.json({ error: 'Not found' }, 404);
  
  // Real check against current inventory
  const available = await checkInventory(id);
  
  return c.json({
    available,
    maxQuantity: Math.min(available, 10), // Limit to 10 per order
  });
});
```

### Custom Discount Logic
```typescript
import { calculateOrderTotal, calculateDiscount } from '@tillkit/core';

// BULK10: 10% off for 10+ items
app.post('/cart/discount', async (c) => {
  const { code } = await c.req.json();
  const sessionId = getSessionId(c);
  const cart = await db.cart.get(sessionId);
  
  let discount = 0;
  if (code === 'BULK10' && cart.items.length >= 10) {
    discount = calculateDiscount(cart.subtotal, [{
      type: 'percentage',
      value: 10,
      applyTo: 'order',
      code: 'BULK10'
    }]);
  }
  
  // Update cart with discount
  await db.cart.update(sessionId, { totalDiscount: discount });
  
  return c.json({ discount, newTotal: cart.subtotal - discount });
});
```

### Customer Portal
```typescript
// /customer/orders/:email
app.get('/customer/orders/:email', async (c) => {
  const email = c.req.param('email');
  const customer = await db.customers.getByEmail(email);
  
  if (!customer) {
    return c.html('<h1>No orders found</h1>');
  }
  
  // Get orders by customer email
  const { items: orders } = await db.orders.list({
    filters: { email: customer.email }
  });
  
  return c.html(`
    <h1>Your Orders</h1>
    ${orders.map(o => `
      <div>
        <h3>${o.orderNumber}</h3>
        <p>Total: $${o.total/100}</p>
        <p>Status: ${o.status}</p>
      </div>
    `).join('')}
  `);
});
```

### Webhook Handler for External Services
```typescript
// /webhooks/inventory - Sync inventory from external system
app.post('/webhooks/inventory', async (c) => {
  const body = await c.req.json();
  
  // Verify signature (implement your own)
  if (!verifyWebhookSignature(c.req.raw)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }
  
  // Update inventory
  await db.products.update(body.productId, {
    inventory: {
      quantity: body.quantity,
      available: body.available,
    }
  });
  
  return c.json({ updated: true });
});
```

### Multi-tenant Setup
```typescript
// Prefix routes by store
app.use('/:store/*', async (c, next) => {
  const store = c.req.param('store');
  
  // Load store config
  const config = await getStoreConfig(store);
  c.set('store', config);
  
  await next();
});

app.get('/:store/products', async (c) => {
  const config = c.get('store');
  const db = createAdapter(config.database);
  
  const { items } = await db.products.list();
  // ...
});
```

### CSV Export for Orders
```typescript
app.get('/admin/orders/export', async (c) => {
  const { items: orders } = await db.orders.list({ limit: 1000 });
  
  const csv = [
    'Order,Email,Total,Status,Date',
    ...orders.map(o => 
      `"${o.orderNumber}","${o.email}",${o.total/100},${o.status},${o.createdAt}`
    )
  ].join('\n');
  
  c.header('Content-Type', 'text/csv');
  c.header('Content-Disposition', 'attachment; filename="orders.csv"');
  return c.body(csv);
});
```

### Custom Image Handler
```typescript
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

app.get('/images/:id', async (c) => {
  const id = c.req.param('id');
  const size = c.req.query('size') || 'full';
  
  // Get presigned URL from S3/R2
  const url = await getImageUrl(id, size);
  
  // Redirect to CDN
  return c.redirect(url);
});
```

### A/B Testing
```typescript
app.get('/products', async (c) => {
  // Assign variant
  const variant = Math.random() > 0.5 ? 'A' : 'B';
  c.header('X-Variant', variant);
  
  const layout = variant === 'A' 
    ? renderGridLayout 
    : renderListLayout;
  
  // ...
});
```

### Rate Limiting
```typescript
import { rateLimiter } from 'hono-rate-limiter';

const limiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

app.use('/api/*', limiter);
```

### Caching Strategy
```typescript
import { cache } from 'hono/cache';

// Cache products for 1 hour
app.get('/products', cache({
  cacheName: 'products',
  cacheControl: 'max-age=3600',
}), async (c) => {
  // ...
});

// Cache order counts per user
app.get('/admin/stats', cache({
  cacheName: 'admin-stats',
  cacheControl: 'max-age=300',
}), async (c) => {
  // ...
});
```

### Email Notifications
```typescript
import { sendEmail } from 'your-email-provider';

// After order creation
app.post('/webhooks/stripe', async (c) => {
  const result = await handleStripeWebhook(c);
  
  if (result.type === 'payment_success') {
    const order = await db.orders.get(result.data.orderId);
    
    // Send confirmation email
    await sendEmail({
      to: order.email,
      subject: `Order ${order.orderNumber} confirmed`,
      html: renderOrderEmail(order),
    });
  }
});
```

### Subscription Plans
```typescript
// Custom subscription handling with Stripe
app.post('/subscriptions/create', async (c) => {
  const { priceId, customerEmail } = await c.req.json();
  
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.APP_URL}/account`,
  });
  
  return c.json({ url: session.url });
});
```

### Migration Script
```typescript
// scripts/migrate.js
import { pocketbaseAdapter } from '@tillkit/adapter-pocketbase';
import { supabaseAdapter } from '@tillkit/adapter-supabase';

const source = pocketbaseAdapter({ url: '...' });
const target = supabaseAdapter({ url: '...', serviceKey: '...' });

async function migrate() {
  const { items: products } = await source.products.list({ limit: 1000 });
  
  for (const product of products) {
    await target.products.create(product);
    console.log(`Migrated: ${product.name}`);
  }
}

migrate();
```
