import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseAdapter } from '@tillkit/core';
import { isDuplicateGatewayRefError } from '@tillkit/core';

/**
 * The shared DatabaseAdapter contract suite.
 *
 * Every shipped adapter must pass these identical assertions (constitution II).
 * Run against a REAL backend — a mocked adapter proves nothing here, because
 * the guarantees under test are enforced by database unique indexes, not by
 * application code.
 *
 * `reset` must return the backend to a clean, provisioned state.
 */
export interface ContractHarness {
  adapter: DatabaseAdapter;
  reset: () => Promise<void>;
}

let orderSeq = 0;
let cartSeq = 0;
function orderInput(overrides: Record<string, unknown> = {}) {
  orderSeq++;
  return {
    email: `buyer${orderSeq}@example.com`,
    status: 'paid' as const,
    paymentStatus: 'paid' as const,
    items: [],
    subtotal: 1999,
    total: 1999,
    currency: 'USD',
    ...overrides,
  };
}

export function runContractTests(name: string, setup: () => Promise<ContractHarness>) {
  describe(`DatabaseAdapter contract: ${name}`, () => {
    let db: DatabaseAdapter;

    beforeEach(async () => {
      const harness = await setup();
      await harness.reset();
      db = harness.adapter;
    });

    // ---- Case 1: getByGatewayRef hit/miss -------------------------------

    it('getByGatewayRef returns the order on match', async () => {
      const created = await db.orders.create(
        orderInput({ gateway: 'stripe', gatewayRef: 'cs_match' }),
      );
      const found = await db.orders.getByGatewayRef('stripe', 'cs_match');
      expect(found?.id).toBe(created.id);
    });

    it('getByGatewayRef returns null on miss, and does not throw', async () => {
      await expect(db.orders.getByGatewayRef('stripe', 'cs_absent')).resolves.toBeNull();
    });

    // ---- Case 2: duplicate (gateway, gatewayRef) ------------------------

    it('orders.create rejects a duplicate (gateway, gatewayRef) as DUPLICATE_GATEWAY_REF', async () => {
      await db.orders.create(orderInput({ gateway: 'stripe', gatewayRef: 'cs_dup' }));

      const err = await db.orders
        .create(orderInput({ gateway: 'stripe', gatewayRef: 'cs_dup' }))
        .then(() => null)
        .catch((e) => e);

      expect(err).not.toBeNull();
      expect(isDuplicateGatewayRefError(err)).toBe(true);
    });

    // ---- Case 3: manual orders never conflict ---------------------------

    it('multiple manual orders (no gateway) coexist', async () => {
      // The partial index exists precisely so this works: PocketBase stores ''
      // rather than NULL, so a plain composite index would reject the second.
      const a = await db.orders.create(orderInput());
      const b = await db.orders.create(orderInput());
      const c = await db.orders.create(orderInput());
      expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    });

    // ---- Case 7: same ref, different gateway ----------------------------

    it('the same reference under two gateways does not collide', async () => {
      const s = await db.orders.create(orderInput({ gateway: 'stripe', gatewayRef: 'ref_shared' }));
      const p = await db.orders.create(orderInput({ gateway: 'paypal', gatewayRef: 'ref_shared' }));
      expect(s.id).not.toBe(p.id);
    });

    // ---- Case 4: claim once ---------------------------------------------

    it('claim succeeds once and reports claimed:false thereafter', async () => {
      const first = await db.webhookEvents.claim({
        gateway: 'stripe',
        eventId: 'evt_1',
        eventType: 'checkout.session.completed',
      });
      expect(first.claimed).toBe(true);

      const second = await db.webhookEvents.claim({
        gateway: 'stripe',
        eventId: 'evt_1',
        eventType: 'checkout.session.completed',
      });
      expect(second.claimed).toBe(false);
      expect(second.existing?.eventId).toBe('evt_1');
    });

    it('claim namespaces event ids per gateway', async () => {
      const a = await db.webhookEvents.claim({ gateway: 'stripe', eventId: 'evt_x', eventType: 't' });
      const b = await db.webhookEvents.claim({ gateway: 'paypal', eventId: 'evt_x', eventType: 't' });
      expect(a.claimed).toBe(true);
      expect(b.claimed).toBe(true);
    });

    // ---- Case 5: CONCURRENCY (the load-bearing test) ---------------------

    it('exactly one of 10 concurrent claims wins', async () => {
      // This is the test that fails against a read-then-write implementation.
      // The success page and the webhook genuinely race in production.
      const attempts = Array.from({ length: 10 }, () =>
        db.webhookEvents.claim({ gateway: 'stripe', eventId: 'evt_race', eventType: 't' }),
      );
      const results = await Promise.all(attempts);
      const winners = results.filter((r) => r.claimed);
      expect(winners).toHaveLength(1);
    });

    it('exactly one of 10 concurrent order creations for one payment wins', async () => {
      const attempts = Array.from({ length: 10 }, () =>
        db.orders
          .create(orderInput({ gateway: 'stripe', gatewayRef: 'cs_race' }))
          .then(() => 'created' as const)
          .catch((e) => (isDuplicateGatewayRefError(e) ? ('duplicate' as const) : Promise.reject(e))),
      );
      const results = await Promise.all(attempts);
      expect(results.filter((r) => r === 'created')).toHaveLength(1);
      expect(results.filter((r) => r === 'duplicate')).toHaveLength(9);
    });

    // ---- Case 6: release re-enables claiming ----------------------------

    it('release makes an event claimable again', async () => {
      await db.webhookEvents.claim({ gateway: 'stripe', eventId: 'evt_rel', eventType: 't' });
      await db.webhookEvents.release('stripe', 'evt_rel');

      const again = await db.webhookEvents.claim({
        gateway: 'stripe',
        eventId: 'evt_rel',
        eventType: 't',
      });
      // Without this, a handler that fails after claiming could never retry:
      // the gateway redelivers, the claim blocks it, the payment's side
      // effects are lost forever.
      expect(again.claimed).toBe(true);
    });

    it('complete records the outcome and linked order', async () => {
      await db.webhookEvents.claim({ gateway: 'stripe', eventId: 'evt_done', eventType: 't' });
      const order = await db.orders.create(orderInput({ gateway: 'stripe', gatewayRef: 'cs_done' }));
      await db.webhookEvents.complete('stripe', 'evt_done', {
        outcome: 'processed',
        orderId: order.id,
      });

      const stored = await db.webhookEvents.get('stripe', 'evt_done');
      expect(stored?.outcome).toBe('processed');
      expect(stored?.orderId).toBe(order.id);
    });

    it('get returns null for an unknown event', async () => {
      await expect(db.webhookEvents.get('stripe', 'evt_nope')).resolves.toBeNull();
    });

    // ---- Case 8: setup() reports only what it created ---------------------

    it('setup() is idempotent and reports nothing created on a provisioned store', async () => {
      const result = await db.setup({
        variants: true,
        collections: false,
        inventoryTracking: true,
        subscriptions: false,
        multiCurrency: false,
      });
      // Everything already exists (reset() provisions), so setup must not claim
      // to have created anything. An adapter that cannot execute DDL must never
      // report created: true.
      expect(result.created).toBe(false);
      expect(result.createdCollections).toEqual([]);
    });

    // ---- Order numbers are actually unique -------------------------------

    it('orderNumber is unique across orders', async () => {
      // Regression: PocketBase field-level `unique: true` is a no-op, so this
      // was unenforced. The index in setup() is what makes it real.
      const orders = await Promise.all(
        Array.from({ length: 5 }, () => db.orders.create(orderInput())),
      );
      const numbers = orders.map((o) => o.orderNumber);
      expect(new Set(numbers).size).toBe(numbers.length);
    });

    // ---- Cart round-trip --------------------------------------------------
    //
    // Regression: the PocketBase adapter wrote items to a `cart_items`
    // collection that `setup()` never provisioned and `cart.get()` never read.
    // Every mutation 404'd, and the storefront cart was silently always empty.
    // These cases assert the round-trip that no test previously covered.

    async function seedCart() {
      const sessionId = `sess-${cartSeq++}`;
      await db.cart.create(sessionId);
      return sessionId;
    }

    it('addItem then get round-trips the item', async () => {
      const sessionId = await seedCart();
      await db.cart.addItem(sessionId, {
        productId: 'p1',
        name: 'Shirt',
        sku: 'SH-1',
        price: 1999,
        quantity: 2,
      });

      const cart = await db.cart.get(sessionId);
      expect(cart?.items).toHaveLength(1);
      expect(cart?.items[0]).toMatchObject({ productId: 'p1', price: 1999, quantity: 2 });
      expect(cart?.items[0].id).toBeTruthy(); // items must be addressable by id
    });

    it('derives lineTotal and subtotal from unit price × quantity', async () => {
      const sessionId = await seedCart();
      await db.cart.addItem(sessionId, {
        productId: 'p1',
        name: 'Shirt',
        sku: 'SH-1',
        price: 1999,
        quantity: 3,
      });

      const cart = await db.cart.get(sessionId);
      expect(cart?.items[0].lineTotal).toBe(5997);
      expect(cart?.subtotal).toBe(5997);
    });

    it('updateItem recomputes lineTotal from the stored unit price', async () => {
      // Regression: Supabase hardcoded `line_total = quantity * 100`.
      const sessionId = await seedCart();
      const added = await db.cart.addItem(sessionId, {
        productId: 'p1',
        name: 'Shirt',
        sku: 'SH-1',
        price: 1999,
        quantity: 1,
      });
      const itemId = added.items[0].id;

      const cart = await db.cart.updateItem(sessionId, itemId, 4);
      expect(cart.items[0].lineTotal).toBe(7996);
    });

    it('updateItem with quantity <= 0 removes the item', async () => {
      const sessionId = await seedCart();
      const added = await db.cart.addItem(sessionId, {
        productId: 'p1',
        name: 'Shirt',
        sku: 'SH-1',
        price: 1999,
        quantity: 1,
      });

      const cart = await db.cart.updateItem(sessionId, added.items[0].id, 0);
      expect(cart.items).toHaveLength(0);
    });

    it('adding the same product twice bumps quantity instead of duplicating the line', async () => {
      const sessionId = await seedCart();
      const item = { productId: 'p1', name: 'Shirt', sku: 'SH-1', price: 1999, quantity: 1 };
      await db.cart.addItem(sessionId, item);
      const cart = await db.cart.addItem(sessionId, item);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(2);
    });

    it('removeItem drops only the named item', async () => {
      const sessionId = await seedCart();
      await db.cart.addItem(sessionId, {
        productId: 'p1',
        name: 'Shirt',
        sku: 'SH-1',
        price: 1999,
        quantity: 1,
      });
      const two = await db.cart.addItem(sessionId, {
        productId: 'p2',
        name: 'Mug',
        sku: 'MG-1',
        price: 900,
        quantity: 1,
      });

      const target = two.items.find((i) => i.productId === 'p1')!;
      const cart = await db.cart.removeItem(sessionId, target.id);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].productId).toBe('p2');
      expect(cart.subtotal).toBe(900);
    });

    it('clear empties the cart', async () => {
      const sessionId = await seedCart();
      await db.cart.addItem(sessionId, {
        productId: 'p1',
        name: 'Shirt',
        sku: 'SH-1',
        price: 1999,
        quantity: 1,
      });

      await db.cart.clear(sessionId);
      const cart = await db.cart.get(sessionId);
      expect(cart?.items).toEqual([]);
    });
  });
}
