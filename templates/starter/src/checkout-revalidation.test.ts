import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

/**
 * `routes/checkout.ts` reads `database` and `stripe` as module singletons from
 * app-context rather than receiving them through the app factory, so the only
 * way to drive it from a test is to mock that module.
 *
 * What matters here is the wiring, not the revalidation rules themselves —
 * those are covered by `@tillkit/server`'s revalidation.test.ts.
 */

interface MockState {
  product: any;
  items: any[];
  flash: string | undefined;
  createCheckoutSession: any;
  removeItem: any;
  updateItem: any;
  addItem: any;
}

// `state` is annotated because its mutator closures reference it, and tsc
// cannot infer a type that is used inside its own initializer.
const state: MockState = vi.hoisted(() => ({
  product: {
    id: 'p1',
    slug: 'shirt',
    name: 'Shirt',
    price: 1999,
    status: 'active',
    images: [],
    inventory: undefined,
    variants: undefined,
  },
  items: [
    {
      id: 'i1',
      productId: 'p1',
      name: 'Shirt',
      sku: 'SH-1',
      price: 1999,
      quantity: 1,
      lineTotal: 1999,
    },
  ],
  flash: undefined,
  createCheckoutSession: vi.fn(async () => ({ url: 'https://stripe.test/session' })),
  removeItem: vi.fn(async (_s: string, id: string) => {
    state.items = state.items.filter((i: any) => i.id !== id);
    return { items: state.items };
  }),
  updateItem: vi.fn(async (_s: string, id: string, qty: number) => {
    state.items = state.items.map((i: any) => (i.id === id ? { ...i, quantity: qty } : i));
    return { items: state.items };
  }),
  addItem: vi.fn(async (_s: string, item: any) => {
    state.items = [...state.items, { ...item, id: `new-${state.items.length}` }];
    return { items: state.items };
  }),
}));

vi.mock('./app-context.js', () => ({
  database: {
    products: { get: async (id: string) => (id === 'p1' ? state.product : null) },
    cart: {
      get: async () => ({ id: 'cart1', sessionId: 'sess', items: state.items }),
      removeItem: state.removeItem,
      updateItem: state.updateItem,
      addItem: state.addItem,
    },
    orders: { get: async () => null },
  },
  stripe: { createCheckoutSession: state.createCheckoutSession },
  getSessionId: () => 'sess',
  layout: (_t: string, c: string) => c,
  setFlash: (_c: any, message: string) => {
    state.flash = message;
  },
  escapeHtml: (v: string) => v,
}));

const { checkoutRouter } = await import('./routes/checkout.js');

function app() {
  const a = new Hono();
  a.route('/checkout', checkoutRouter);
  return a;
}

function post() {
  return app().request('/checkout', { method: 'POST' });
}

describe('starter checkout revalidation', () => {
  beforeEach(() => {
    state.product = {
      id: 'p1',
      slug: 'shirt',
      name: 'Shirt',
      price: 1999,
      status: 'active',
      images: [],
      inventory: undefined,
      variants: undefined,
    };
    state.items = [
      { id: 'i1', productId: 'p1', name: 'Shirt', sku: 'SH-1', price: 1999, quantity: 1, lineTotal: 1999 },
    ];
    state.flash = undefined;
    vi.clearAllMocks();
  });

  it('creates a Stripe session when the cart is clean', async () => {
    const res = await post();

    expect(state.createCheckoutSession).toHaveBeenCalledOnce();
    expect(res.headers.get('location')).toBe('https://stripe.test/session');
  });

  it('never creates a session when the price drifted', async () => {
    state.product.price = 2499;

    const res = await post();

    // This is the whole point: no charge is authorized at the stale price.
    expect(state.createCheckoutSession).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('/cart');
    expect(state.flash).toContain('the price of Shirt changed');
  });

  it('reprices the cart to the current price before returning the shopper', async () => {
    state.product.price = 2499;

    await post();

    expect(state.items).toHaveLength(1);
    expect(state.items[0].price).toBe(2499);
  });

  it('never creates a session when stock is short, and clamps the quantity', async () => {
    state.items[0].quantity = 5;
    state.product.inventory = { quantity: 2, available: 2, allowOutOfStock: false };

    const res = await post();

    expect(state.createCheckoutSession).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('/cart');
    // Clamped, not left at 5 — otherwise the shopper is blocked forever.
    expect(state.items[0].quantity).toBe(2);
    expect(state.flash).toContain('only 2 of Shirt remain');
  });

  it('drops an item that went out of stock entirely', async () => {
    state.product.inventory = { quantity: 0, available: 0, allowOutOfStock: false };

    await post();

    expect(state.items).toHaveLength(0);
    expect(state.flash).toContain('Shirt is out of stock');
  });

  it('drops an archived product and does not charge for it', async () => {
    state.product.status = 'archived';

    const res = await post();

    expect(state.createCheckoutSession).not.toHaveBeenCalled();
    expect(state.items).toHaveLength(0);
    expect(state.flash).toContain('Shirt is no longer available');
    expect(res.headers.get('location')).toBe('/cart');
  });

  it('redirects an empty cart without calling Stripe', async () => {
    state.items = [];

    const res = await post();

    expect(state.createCheckoutSession).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('/cart');
  });
});
