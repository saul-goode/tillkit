import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createAdminRoutes } from '../routes/admin.js';
import { createWebhookRoutes, createOrderFromStripeSession } from '../routes/webhooks.js';
import { createSubscriptionRoutes } from '../routes/subscriptions.js';
import type { DatabaseAdapter, Order } from '@tillkit/core';
import type { StripeIntegration } from '@tillkit/integration-stripe';

// Mock database adapter
function createMockDatabase(): DatabaseAdapter {
  const orders: Order[] = [];
  const carts: Record<string, any> = {};
  const webhookEvents = new Map<string, any>();
  let orderCounter = 1;
  
  return {
    products: (() => {
      const items: any[] = [];
      let counter = 1;
      return {
        list: async (options: any = {}) => {
          const limit = options?.limit || 20;
          const offset = options?.offset || 0;
          return {
            items: items.slice(offset, offset + limit),
            total: items.length,
            page: Math.floor(offset / limit) + 1,
            perPage: limit,
            hasMore: offset + limit < items.length,
          };
        },
        get: async (id: string) => items.find((p: any) => p.id === id) || null,
        getBySlug: async (slug: string) => items.find((p: any) => p.slug === slug) || null,
        create: async (data: any) => {
          const product = { id: 'prod_' + String(counter++).padStart(3, '0'), ...data, createdAt: new Date(), updatedAt: new Date() };
          items.push(product);
          return product;
        },
        update: async (id: string, data: any) => {
          const idx = items.findIndex((item: any) => item.id === id);
          if (idx >= 0) {
            items[idx] = { ...items[idx], ...data, updatedAt: new Date() };
            return items[idx];
          }
          throw new Error('Product not found');
        },
        delete: async (id: string) => {
          const idx = items.findIndex((item: any) => item.id === id);
          if (idx >= 0) items.splice(idx, 1);
        },
        search: async () => [],
      };
    })(),
    cart: {
      get: async (sessionId) => carts[sessionId] || null,
      create: async (sessionId) => {
        const cart = { 
          id: crypto.randomUUID(), 
          sessionId, 
          items: [], 
          subtotal: 0, 
          totalTax: 0, 
          totalShipping: 0, 
          totalDiscount: 0, 
          total: 0, 
          currency: 'USD', 
          createdAt: new Date(), 
          updatedAt: new Date() 
        };
        carts[sessionId] = cart;
        return cart;
      },
      update: async () => ({ id: '1', sessionId: 'test', items: [], subtotal: 0, totalTax: 0, totalShipping: 0, totalDiscount: 0, total: 0, currency: 'USD', createdAt: new Date(), updatedAt: new Date() }),
      addItem: async (sessionId, item) => {
        if (!carts[sessionId]) {
          carts[sessionId] = { 
            id: crypto.randomUUID(), 
            sessionId, 
            items: [], 
            subtotal: 0, 
            totalTax: 0, 
            totalShipping: 0, 
            totalDiscount: 0, 
            total: 0, 
            currency: 'USD', 
            createdAt: new Date(), 
            updatedAt: new Date() 
          };
        }
        const cart = carts[sessionId];
        cart.items.push(item);
        cart.subtotal = cart.items.reduce((sum: number, i: any) => sum + i.price * i.quantity, 0);
        cart.total = cart.subtotal;
        return cart;
      },
      updateItem: async () => ({ id: '1', sessionId: 'test', items: [], subtotal: 0, totalTax: 0, totalShipping: 0, totalDiscount: 0, total: 0, currency: 'USD', createdAt: new Date(), updatedAt: new Date() }),
      removeItem: async () => ({ id: '1', sessionId: 'test', items: [], subtotal: 0, totalTax: 0, totalShipping: 0, totalDiscount: 0, total: 0, currency: 'USD', createdAt: new Date(), updatedAt: new Date() }),
      clear: async (sessionId) => { delete carts[sessionId]; },
    },
    orders: {
      list: async (options = {}) => ({
        items: orders,
        total: orders.length,
        page: 1,
        perPage: options.limit || 20,
        hasMore: false,
      }),
      get: async (id) => orders.find(o => o.id === id) || null,
      getByNumber: async () => null,
      getByGatewayRef: async (gateway, ref) =>
        orders.find(o => o.gateway === gateway && o.gatewayRef === ref) || null,
      create: async (data) => {
        const order: Order = {
          id: crypto.randomUUID(),
          orderNumber: `TK-${String(orderCounter++).padStart(4, '0')}`,
          ...data as any,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        orders.push(order);
        return order;
      },
      update: async (id, data) => {
        const idx = orders.findIndex(o => o.id === id);
        if (idx >= 0) {
          orders[idx] = { ...orders[idx], ...data as any, updatedAt: new Date() };
          return orders[idx];
        }
        throw new Error('Order not found');
      },
      addTransaction: async (orderId, tx) => {
        const order = orders.find(o => o.id === orderId);
        if (order) {
        order.transactions = [...(order.transactions || []), { 
          id: crypto.randomUUID(), 
          ...tx, 
          processedAt: new Date() 
        }];
          return order;
        }
        throw new Error('Order not found');
      },
      updateStatus: async (id, status) => {
        const idx = orders.findIndex(o => o.id === id);
        if (idx >= 0) {
          orders[idx].status = status;
          orders[idx].updatedAt = new Date();
          return orders[idx];
        }
        throw new Error('Order not found');
      },
    },
    webhookEvents: {
      claim: async ({ gateway, eventId, eventType }) => {
        const k = `${gateway}:${eventId}`;
        if (webhookEvents.has(k)) return { claimed: false, existing: webhookEvents.get(k) };
        webhookEvents.set(k, {
          id: k,
          gateway,
          eventId,
          eventType,
          outcome: 'processed',
          processedAt: new Date(),
        });
        return { claimed: true };
      },
      complete: async (gateway, eventId, result) => {
        const row = webhookEvents.get(`${gateway}:${eventId}`);
        if (row) Object.assign(row, result);
      },
      release: async (gateway, eventId) => {
        webhookEvents.delete(`${gateway}:${eventId}`);
      },
      get: async (gateway, eventId) => webhookEvents.get(`${gateway}:${eventId}`) ?? null,
    },
    customers: {
      get: async () => null,
      getByEmail: async () => null,
      create: async () => ({ id: '1', email: '', addresses: [], createdAt: new Date(), updatedAt: new Date() }),
      update: async () => ({ id: '1', email: '', addresses: [], createdAt: new Date(), updatedAt: new Date() }),
      addAddress: async () => ({ id: '1', email: '', addresses: [], createdAt: new Date(), updatedAt: new Date() }),
    },
  };
}

// Mock Stripe integration
function createMockStripe(): StripeIntegration {
  return {
    stripe: {} as any,
    createCheckoutSession: async () => ({ id: 'cs_test', url: 'https://stripe.com/checkout' }),
    getSession: async () => ({
      id: 'cs_test',
      payment_status: 'paid',
      amount_total: 1999,
      currency: 'usd',
      customer_email: 'test@example.com',
      customer: 'cus_test',
      payment_intent: 'pi_test',
      shipping_details: {
        name: 'Test User',
        address: {
          line1: '123 Test St',
          city: 'Test City',
          state: 'TC',
          postal_code: '12345',
          country: 'US',
        },
      },
    }) as any,
    handleWebhook: () => ({ type: 'checkout.session.completed', data: { object: {} } } as any),
    processWebhookEvent: async () => ({
      type: 'payment_success' as const,
      data: { sessionId: 'cs_test', amount: 1999, currency: 'usd' },
    }),
    createRefund: async () => ({ id: 're_test' } as any),
    createTransactionFromSession: () => ({
      kind: 'sale' as const,
      status: 'success' as const,
      amount: 1999,
      currency: 'USD',
      gateway: 'stripe',
    }),
  };
}

describe('Admin Routes', () => {
  let database: DatabaseAdapter;
  let app: Hono;
  
  beforeEach(() => {
    database = createMockDatabase();
    const adminRoutes = createAdminRoutes({ database, basePath: '/admin' });
    app = new Hono().route('/admin', adminRoutes);
  });
  
  it('should render admin dashboard', async () => {
    const res = await app.request('/admin');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Dashboard');
    expect(html).toContain("Today's Revenue");
  });
  
  it('should list orders', async () => {
    // Create an order first
    await database.orders.create({
      email: 'test@example.com',
      status: 'pending',
      items: [],
      subtotal: 1000,
      total: 1000,
      currency: 'USD',
      shippingAddress: {
        address1: '123 Test St',
        city: 'Test City',
        postalCode: '12345',
        country: 'US',
      },
    });
    
    const res = await app.request('/admin/orders');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Orders');
    expect(html).toContain('test@example.com');
  });
  
  it('should filter orders by status', async () => {
    await database.orders.create({
      email: 'paid@example.com',
      status: 'paid',
      items: [],
      subtotal: 1000,
      total: 1000,
      currency: 'USD',
      shippingAddress: { address1: '', city: '', postalCode: '', country: '' },
    });
    
    await database.orders.create({
      email: 'pending@example.com',
      status: 'pending',
      items: [],
      subtotal: 500,
      total: 500,
      currency: 'USD',
      shippingAddress: { address1: '', city: '', postalCode: '', country: '' },
    });
    
    const res = await app.request('/admin/orders?status=paid');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('paid');
  });
  
  it('should view single order', async () => {
    const order = await database.orders.create({
      email: 'single@example.com',
      status: 'paid',
      items: [],
      subtotal: 1000,
      total: 1000,
      currency: 'USD',
      shippingAddress: { address1: '', city: '', postalCode: '', country: '' },
    });
    
    const res = await app.request(`/admin/orders/${order.id}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(order.orderNumber);
    expect(html).toContain('single@example.com');
  });
  
  it('should update order status', async () => {
    const order = await database.orders.create({
      email: 'update@example.com',
      status: 'pending',
      items: [],
      subtotal: 1000,
      total: 1000,
      currency: 'USD',
      shippingAddress: { address1: '', city: '', postalCode: '', country: '' },
    });
    
    const res = await app.request(`/admin/orders/${order.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'status=fulfilled',
    });
    
    expect(res.status).toBe(302); // Redirect
    
    // Verify order was updated
    const updated = await database.orders.get(order.id);
    expect(updated?.status).toBe('fulfilled');
  });
  
  it('should return 404 for non-existent order', async () => {
    const res = await app.request('/admin/orders/non-existent');
    expect(res.status).toBe(404);
  });


  it('should list products', async () => {
    await database.products.create({
      name: 'Test Widget',
      slug: 'test-widget',
      price: 1999,
      status: 'active',
      description: 'A test product',
    });

    const res = await app.request('/admin/products');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Products');
    expect(html).toContain('Test Widget');
    expect(html).toContain('test-widget');
  });

  it('should render product create form', async () => {
    const res = await app.request('/admin/products/new');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Create Product');
    expect(html).toContain('Name');
    expect(html).toContain('Slug');
    expect(html).toContain('Price');
  });

  it('should create a product from the admin form', async () => {
    const res = await app.request('/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'name=New+Widget&slug=new-widget&price=2999&status=active&description=New+desc',
    });

    expect(res.status).toBe(302);

    const list = await database.products.list({ limit: 10 });
    expect(list.items).toHaveLength(1);
    expect(list.items[0].name).toBe('New Widget');
  });

  it('should render product edit form', async () => {
    const product = await database.products.create({
      name: 'Editable Widget',
      slug: 'editable-widget',
      price: 999,
      status: 'draft',
      description: 'Editable',
    });

    const res = await app.request(`/admin/products/${product.id}/edit`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Edit Product');
    expect(html).toContain('Editable Widget');
  });

  it('should update a product from the admin form', async () => {
    const product = await database.products.create({
      name: 'Old Name',
      slug: 'old-name',
      price: 999,
      status: 'draft',
      description: 'Old desc',
    });

    const res = await app.request(`/admin/products/${product.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'name=Updated+Name&slug=updated-name&price=1499&status=active&description=Updated+desc',
    });

    expect(res.status).toBe(302);

    const updated = await database.products.get(product.id);
    expect(updated?.name).toBe('Updated Name');
    expect(updated?.price).toBe(1499);
  });

  it('should delete a product via HTMX', async () => {
    const product = await database.products.create({
      name: 'Deletable Widget',
      slug: 'deletable-widget',
      price: 599,
      status: 'active',
      description: 'To be deleted',
    });

    const res = await app.request(`/admin/products/${product.id}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('HX-Redirect')).toBe('/admin/products');

    const gone = await database.products.get(product.id);
    expect(gone).toBeNull();
  });
});

describe('Webhook Routes', () => {
  let stripe: StripeIntegration;
  let database: DatabaseAdapter;
  let app: Hono;
  
  beforeEach(() => {
    stripe = createMockStripe();
    database = createMockDatabase();
    const webhookRoutes = createWebhookRoutes({
      database,
      stripe,
      webhookSecret: 'test_secret',
    });
    app = new Hono().route('/webhooks', webhookRoutes);
  });
  
  it('should handle Stripe webhook', async () => {
    const res = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'test_sig' },
      body: 'test_payload',
    });
    
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('received', true);
  });
  
  it('should reject invalid webhook signature', async () => {
    // Override mock to throw error
    stripe.handleWebhook = () => {
      throw new Error('Invalid signature');
    };
    
    const res = await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'invalid' },
      body: 'test_payload',
    });
    
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });
  
  it('should call custom handler on payment success', async () => {
    let paymentReceived = false;
    
    const webhookRoutes = createWebhookRoutes({
      database,
      stripe,
      webhookSecret: 'test_secret',
      onPaymentSuccess: async (data) => {
        paymentReceived = true;
        expect(data.sessionId).toBe('cs_test');
      },
    });
    
    app = new Hono().route('/webhooks', webhookRoutes);
    
    await app.request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'test_sig' },
      body: 'test_payload',
    });
    
    expect(paymentReceived).toBe(true);
  });
});

describe('createOrderFromStripeSession', () => {
  let stripe: StripeIntegration;
  let database: DatabaseAdapter;
  
  beforeEach(() => {
    stripe = createMockStripe();
    database = createMockDatabase();
  });
  
  it('should create order from Stripe session', async () => {
    // Create a cart first
    await database.cart.create('test-session');
    await database.cart.addItem('test-session', {
      productId: 'prod_1',
      name: 'Test Product',
      sku: 'TEST-001',
      price: 1999,
      quantity: 1,
    });
    
    const orderId = await createOrderFromStripeSession({
      database,
      stripe,
      sessionId: 'cs_test',
      cartId: 'test-session',
      getSessionIdFn: () => 'test-session',
    });
    
    expect(orderId).toBeTruthy();
    
    if (orderId) {
      const order = await database.orders.get(orderId);
      expect(order).toBeTruthy();
      expect(order?.email).toBe('test@example.com');
      expect(order?.status).toBe('paid');
      expect(order?.total).toBe(1999);
    }
  });
  
  it('should return null if session not paid', async () => {
    // Override mock to return unpaid session
    stripe.getSession = async () => ({
      id: 'cs_test',
      payment_status: 'unpaid',
    }) as any;
    
    const orderId = await createOrderFromStripeSession({
      database,
      stripe,
      sessionId: 'cs_test',
      getSessionIdFn: () => 'test-session',
    });
    
    expect(orderId).toBeNull();
  });
  
  it('should return null if no cart found', async () => {
    const orderId = await createOrderFromStripeSession({
      database,
      stripe,
      sessionId: 'cs_test',
      cartId: 'non-existent-session',
      getSessionIdFn: () => 'non-existent-session',
    });
    
    expect(orderId).toBeNull();
  });
});


describe('createSubscriptionRoutes', () => {
  let db: DatabaseAdapter;
  let app: Hono;

  beforeEach(() => {
    db = createMockDatabase();
    app = createSubscriptionRoutes({
      database: db,
      subscriptionProvider: {
        async createSubscription(_options) {
          return {
            id: 'sub_test_123',
            status: 'incomplete',
            clientSecret: 'secret_abc',
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          };
        },
        async cancelSubscription(id, immediately) {
          return { id, status: immediately ? 'canceled' : 'active', canceledAt: immediately ? new Date() : undefined };
        },
        async updateSubscription(id, _newPlanId) {
          return { id, status: 'active' };
        },
        async getSubscription(id) {
          return {
            id,
            customerId: 'cus_test',
            customerEmail: 'test@example.com',
            status: 'active',
            plan: {
              id: 'plan_test',
              name: 'Pro',
              amount: 999,
              currency: 'USD',
              interval: 'month' as any,
              intervalCount: 1,
            },
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            cancelAtPeriodEnd: false,
          };
        },
        handleWebhook(_payload: string | Buffer, _signature?: string) {
          return { type: 'invoice.payment_succeeded' };
        },
        async processWebhookEvent(event: any) {
          return {
            type: 'invoice_paid' as any,
            subscriptionId: 'sub_test_123',
            data: event,
          };
        },
      },
    });
  });

  it('POST / should create a subscription', async () => {
    const res = await app.request('/', {
      method: 'POST',
      body: JSON.stringify({ customerId: 'cus_1', planId: 'price_1', trialDays: 7 }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe('sub_test_123');
    expect(json.clientSecret).toBe('secret_abc');
  });

  it('GET /:id should return a subscription', async () => {
    const res = await app.request('/sub_test_123', { method: 'GET' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe('sub_test_123');
    expect(json.plan.name).toBe('Pro');
  });

  it('POST /:id/cancel should cancel a subscription', async () => {
    const res = await app.request('/sub_test_123/cancel', {
      method: 'POST',
      body: JSON.stringify({ immediately: true }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('canceled');
  });

  it('POST /:id/update should update a subscription plan', async () => {
    const res = await app.request('/sub_test_123/update', {
      method: 'POST',
      body: JSON.stringify({ planId: 'price_premium' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('active');
  });

  it('POST /webhook should receive and process webhook', async () => {
    const res = await app.request('/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_test' }),
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig_test' },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
    expect(json.type).toBe('invoice_paid');
    expect(json.subscriptionId).toBe('sub_test_123');
  });
});
