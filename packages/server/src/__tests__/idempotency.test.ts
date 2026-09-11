import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createWebhookRoutes, createOrderFromStripeSession } from '../routes/webhooks.js';
import { DuplicateGatewayRefError } from '@tillkit/core';
import type { DatabaseAdapter, Order, ProcessedWebhookEvent } from '@tillkit/core';

/**
 * In-memory adapter with a genuinely atomic `claim` (JS is single-threaded, so
 * a Map check-and-set cannot be preempted). This exercises ROUTE logic:
 * claim -> side effects -> complete, and release-on-failure.
 *
 * It does NOT prove the database-level guarantee — that is the job of the
 * adapter contract suite, which runs against a real PocketBase.
 */
function createMemoryDatabase() {
  const orders = new Map<string, Order>();
  const byGatewayRef = new Map<string, string>();
  const events = new Map<string, ProcessedWebhookEvent>();
  const inventoryDecrements: string[] = [];
  let seq = 0;

  const key = (g: string, e: string) => `${g}:${e}`;

  const db = {
    orders: {
      async create(data: any): Promise<Order> {
        if (data.gateway && data.gatewayRef) {
          const k = key(data.gateway, data.gatewayRef);
          if (byGatewayRef.has(k)) {
            throw new DuplicateGatewayRefError(data.gateway, data.gatewayRef);
          }
          byGatewayRef.set(k, `o${seq + 1}`);
        }
        seq++;
        const order = {
          id: `o${seq}`,
          orderNumber: `TK-${String(seq).padStart(4, '0')}`,
          ...data,
          transactions: [],
        } as unknown as Order;
        orders.set(order.id, order);
        return order;
      },
      async get(id: string) {
        return orders.get(id) ?? null;
      },
      async getByGatewayRef(gateway: string, ref: string) {
        const id = byGatewayRef.get(key(gateway, ref));
        return id ? (orders.get(id) ?? null) : null;
      },
      addTransaction: vi.fn(async (orderId: string) => orders.get(orderId)!),
    },
    cart: {
      get: vi.fn(async () => ({
        id: 'cart1',
        items: [
          { id: 'i1', productId: 'p1', name: 'Shirt', sku: 'sh', price: 1999, quantity: 1 },
        ],
      })),
      clear: vi.fn(async () => {}),
    },
    products: {
      get: vi.fn(async (id: string) => ({
        id,
        name: 'Shirt',
        slug: 'shirt',
        inventory: { quantity: 10, available: 10, allowOutOfStock: false },
      })),
      update: vi.fn(async (id: string) => {
        inventoryDecrements.push(id);
        return { id } as any;
      }),
    },
    webhookEvents: {
      async claim(event: { gateway: string; eventId: string; eventType: string }) {
        const k = key(event.gateway, event.eventId);
        const existing = events.get(k);
        if (existing) return { claimed: false, existing };
        const row: ProcessedWebhookEvent = {
          id: k,
          gateway: event.gateway as any,
          eventId: event.eventId,
          eventType: event.eventType,
          outcome: 'processed',
          processedAt: new Date(0),
        };
        events.set(k, row);
        return { claimed: true };
      },
      async complete(gateway: string, eventId: string, result: any) {
        const row = events.get(key(gateway, eventId));
        if (row) Object.assign(row, result);
      },
      async release(gateway: string, eventId: string) {
        events.delete(key(gateway, eventId));
      },
      async get(gateway: string, eventId: string) {
        return events.get(key(gateway, eventId)) ?? null;
      },
    },
  } as unknown as DatabaseAdapter;

  return { db, orders, events, inventoryDecrements };
}

function stripeStub(overrides: Record<string, unknown> = {}) {
  return {
    handleWebhook: vi.fn(() => ({ id: 'evt_1', type: 'checkout.session.completed' })),
    processWebhookEvent: vi.fn(async () => ({
      type: 'payment_success',
      data: {
        sessionId: 'cs_1',
        paymentIntentId: 'pi_1',
        amount: 1999,
        currency: 'usd',
        customerEmail: 'buyer@example.com',
        customerId: 'cus_1',
        shipping: null,
        metadata: null,
      },
    })),
    getSession: vi.fn(async () => ({
      id: 'cs_1',
      payment_status: 'paid',
      amount_total: 1999,
      currency: 'usd',
      customer_email: 'buyer@example.com',
      payment_intent: 'pi_1',
      customer: 'cus_1',
      shipping_details: null,
    })),
    ...overrides,
  } as any;
}

describe('createOrderFromStripeSession — idempotency', () => {
  let ctx: ReturnType<typeof createMemoryDatabase>;
  beforeEach(() => {
    ctx = createMemoryDatabase();
  });

  it('creates exactly one order when the same session is processed twice', async () => {
    const stripe = stripeStub();
    const args = {
      database: ctx.db,
      stripe,
      sessionId: 'cs_1',
      getSessionIdFn: () => 'sess',
    };

    const first = await createOrderFromStripeSession(args);
    const second = await createOrderFromStripeSession(args);

    expect(first).toBeTruthy();
    expect(second).toBe(first); // same order id, not a new one
    expect(ctx.orders.size).toBe(1);
  });

  it('decrements inventory exactly once across repeated processing', async () => {
    const stripe = stripeStub();
    const args = { database: ctx.db, stripe, sessionId: 'cs_1', getSessionIdFn: () => 'sess' };

    await createOrderFromStripeSession(args);
    await createOrderFromStripeSession(args);

    expect(ctx.inventoryDecrements).toHaveLength(1);
  });

  it('concurrent success-page and webhook processing yield one order', async () => {
    const stripe = stripeStub();
    const args = { database: ctx.db, stripe, sessionId: 'cs_1', getSessionIdFn: () => 'sess' };

    const [a, b] = await Promise.all([
      createOrderFromStripeSession(args),
      createOrderFromStripeSession(args),
    ]);

    expect(ctx.orders.size).toBe(1);
    expect(a).toBe(b);
  });

  it('stores the gateway reference on the order', async () => {
    const stripe = stripeStub();
    const id = await createOrderFromStripeSession({
      database: ctx.db,
      stripe,
      sessionId: 'cs_1',
      getSessionIdFn: () => 'sess',
    });
    const order = ctx.orders.get(id!)!;
    expect(order.gateway).toBe('stripe');
    expect(order.gatewayRef).toBe('cs_1');
  });

  it('does not create an order for an unpaid session', async () => {
    const stripe = stripeStub({
      getSession: vi.fn(async () => ({ id: 'cs_1', payment_status: 'unpaid' })),
    });
    const id = await createOrderFromStripeSession({
      database: ctx.db,
      stripe,
      sessionId: 'cs_1',
      getSessionIdFn: () => 'sess',
    });
    expect(id).toBeNull();
    expect(ctx.orders.size).toBe(0);
  });

  it('resolves the email from the Stripe customer rather than a placeholder', async () => {
    const stripe = stripeStub({
      getSession: vi.fn(async () => ({
        id: 'cs_1',
        payment_status: 'paid',
        amount_total: 1999,
        currency: 'usd',
        customer_email: null,
        customer_details: { email: 'from-customer@example.com' },
        payment_intent: 'pi_1',
        shipping_details: null,
      })),
    });
    const id = await createOrderFromStripeSession({
      database: ctx.db,
      stripe,
      sessionId: 'cs_1',
      getSessionIdFn: () => 'sess',
    });
    expect(ctx.orders.get(id!)!.email).toBe('from-customer@example.com');
  });
});

describe('Stripe webhook route — exactly-once', () => {
  let ctx: ReturnType<typeof createMemoryDatabase>;
  beforeEach(() => {
    ctx = createMemoryDatabase();
  });

  function mount(stripe: any, overrides: Record<string, unknown> = {}) {
    const app = new Hono();
    app.route(
      '/webhooks',
      createWebhookRoutes({
        database: ctx.db,
        stripe,
        webhookSecret: 'whsec_test',
        ...overrides,
      } as any),
    );
    return app;
  }

  it('creates an order by default when no onPaymentSuccess is supplied', async () => {
    // Previously the route only logged: a shopper who closed the tab after
    // paying left a paid-but-orderless store.
    const app = mount(stripeStub());
    const res = await app.request('/webhooks/stripe', { method: 'POST', body: '{}' });

    expect(res.status).toBe(200);
    expect(ctx.orders.size).toBe(1);
  });

  it('deduplicates a redelivered event', async () => {
    const app = mount(stripeStub());
    await app.request('/webhooks/stripe', { method: 'POST', body: '{}' });
    const res = await app.request('/webhooks/stripe', { method: 'POST', body: '{}' });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, deduplicated: true });
    expect(ctx.orders.size).toBe(1);
  });

  it('records the processed event in the ledger', async () => {
    const app = mount(stripeStub());
    await app.request('/webhooks/stripe', { method: 'POST', body: '{}' });

    const stored = await ctx.db.webhookEvents.get('stripe', 'evt_1');
    expect(stored?.outcome).toBe('processed');
    expect(stored?.orderId).toBeTruthy();
  });

  it('releases the claim and returns a retryable status when a handler throws', async () => {
    const onPaymentSuccess = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    const app = mount(stripeStub(), { onPaymentSuccess });

    const res = await app.request('/webhooks/stripe', { method: 'POST', body: '{}' });

    // Retryable, not a false terminal ack.
    expect(res.status).toBeGreaterThanOrEqual(500);
    // The claim must be gone, or the redelivery could never be processed.
    expect(await ctx.db.webhookEvents.get('stripe', 'evt_1')).toBeNull();
  });

  it('a redelivery after a failed attempt succeeds', async () => {
    let attempts = 0;
    const onPaymentSuccess = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new Error('transient');
    });
    const app = mount(stripeStub(), { onPaymentSuccess });

    const first = await app.request('/webhooks/stripe', { method: 'POST', body: '{}' });
    expect(first.status).toBeGreaterThanOrEqual(500);

    const second = await app.request('/webhooks/stripe', { method: 'POST', body: '{}' });
    expect(second.status).toBe(200);
    expect(attempts).toBe(2);
  });

  it('rejects an invalid signature with a terminal 400 and claims nothing', async () => {
    const stripe = stripeStub({
      handleWebhook: vi.fn(() => {
        throw new Error('Invalid signature');
      }),
    });
    const app = mount(stripe);

    const res = await app.request('/webhooks/stripe', { method: 'POST', body: '{}' });

    expect(res.status).toBe(400);
    expect(await ctx.db.webhookEvents.get('stripe', 'evt_1')).toBeNull();
    expect(ctx.orders.size).toBe(0);
  });

  it('acknowledges an unhandled event type as ignored, without side effects', async () => {
    const stripe = stripeStub({
      processWebhookEvent: vi.fn(async () => ({ type: 'other', data: {} })),
    });
    const app = mount(stripe);

    const res = await app.request('/webhooks/stripe', { method: 'POST', body: '{}' });

    expect(res.status).toBe(200);
    expect(ctx.orders.size).toBe(0);
    expect((await ctx.db.webhookEvents.get('stripe', 'evt_1'))?.outcome).toBe('ignored');
  });
});
