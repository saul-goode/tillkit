import { describe, it, expect } from 'vitest';
import { revalidateCart } from '../checkout.js';
import type { Cart, DatabaseAdapter, Product } from '@tillkit/core';

/**
 * Revalidation is the last server-side gate before a payment session is
 * created. Everything it inspects — price, stock, product status — is fetched
 * fresh from the database, never trusted from the cart snapshot, because the
 * cart snapshot is exactly what may be stale.
 */

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    slug: 'shirt',
    name: 'Shirt',
    price: 1999,
    images: [],
    status: 'active',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as Product;
}

function cartWith(items: Array<Partial<Cart['items'][number]>>): Cart {
  return {
    id: 'cart1',
    sessionId: 'sess',
    items: items.map((i, n) => ({
      id: `i${n + 1}`,
      productId: 'p1',
      name: 'Shirt',
      sku: 'SH-1',
      price: 1999,
      quantity: 1,
      lineTotal: 1999,
      ...i,
    })),
    subtotal: 0,
    totalTax: 0,
    totalShipping: 0,
    totalDiscount: 0,
    total: 0,
    currency: 'USD',
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as Cart;
}

/** A database whose `products.get` serves the given catalog. */
function dbWith(catalog: Record<string, Product | null>): DatabaseAdapter {
  return {
    products: {
      async get(id: string) {
        return catalog[id] ?? null;
      },
    },
  } as unknown as DatabaseAdapter;
}

describe('revalidateCart', () => {
  it('passes a clean cart', async () => {
    const db = dbWith({ p1: product() });
    const result = await revalidateCart(db, cartWith([{}]));

    expect(result.ok).toBe(true);
    expect(result.priceChanges).toEqual([]);
    expect(result.stockIssues).toEqual([]);
    expect(result.removedItems).toEqual([]);
  });

  it('blocks when the price drifted upward since add-to-cart', async () => {
    const db = dbWith({ p1: product({ price: 2499 }) });
    const result = await revalidateCart(db, cartWith([{ price: 1999 }]));

    expect(result.ok).toBe(false);
    expect(result.priceChanges).toEqual([
      { itemId: 'i1', name: 'Shirt', oldPrice: 1999, newPrice: 2499 },
    ]);
  });

  it('blocks when the price drifted downward', async () => {
    // A shopper charged more than the current shelf price is a chargeback;
    // charged less is lost revenue. Both are drift, both block.
    const db = dbWith({ p1: product({ price: 999 }) });
    const result = await revalidateCart(db, cartWith([{ price: 1999 }]));

    expect(result.ok).toBe(false);
    expect(result.priceChanges[0].newPrice).toBe(999);
  });

  it('blocks when requested quantity exceeds available stock', async () => {
    const db = dbWith({
      p1: product({
        inventory: { quantity: 2, available: 2, allowOutOfStock: false },
      }),
    });
    const result = await revalidateCart(db, cartWith([{ quantity: 5 }]));

    expect(result.ok).toBe(false);
    expect(result.stockIssues).toEqual([
      { itemId: 'i1', name: 'Shirt', requested: 5, available: 2 },
    ]);
  });

  it('allows overselling when the product opts into it', async () => {
    const db = dbWith({
      p1: product({ inventory: { quantity: 0, available: 0, allowOutOfStock: true } }),
    });
    const result = await revalidateCart(db, cartWith([{ quantity: 5 }]));

    expect(result.ok).toBe(true);
  });

  it('allows a product that tracks no inventory at all', async () => {
    const db = dbWith({ p1: product({ inventory: undefined }) });
    const result = await revalidateCart(db, cartWith([{ quantity: 99 }]));

    expect(result.ok).toBe(true);
  });

  it('reports a deleted product as removed', async () => {
    const db = dbWith({ p1: null });
    const result = await revalidateCart(db, cartWith([{}]));

    expect(result.ok).toBe(false);
    expect(result.removedItems).toEqual([{ itemId: 'i1', name: 'Shirt' }]);
  });

  it.each(['draft', 'archived'] as const)('reports a %s product as removed', async (status) => {
    const db = dbWith({ p1: product({ status }) });
    const result = await revalidateCart(db, cartWith([{}]));

    expect(result.ok).toBe(false);
    expect(result.removedItems).toEqual([{ itemId: 'i1', name: 'Shirt' }]);
  });

  it('does not also report a price change for a removed item', async () => {
    // A removed item has no current price to compare against; reporting both
    // would tell the shopper their deleted item got cheaper.
    const db = dbWith({ p1: product({ status: 'archived', price: 2499 }) });
    const result = await revalidateCart(db, cartWith([{ price: 1999 }]));

    expect(result.removedItems).toHaveLength(1);
    expect(result.priceChanges).toEqual([]);
    expect(result.stockIssues).toEqual([]);
  });

  it('reports every problem across a multi-item cart at once', async () => {
    // One round-trip to the cart page should surface everything wrong, not the
    // first thing wrong.
    const db = dbWith({
      p1: product({ id: 'p1', price: 2499 }),
      p2: product({
        id: 'p2',
        name: 'Mug',
        inventory: { quantity: 1, available: 1, allowOutOfStock: false },
      }),
      p3: null,
    });
    const result = await revalidateCart(
      db,
      cartWith([
        { id: 'i1', productId: 'p1', price: 1999 },
        { id: 'i2', productId: 'p2', name: 'Mug', quantity: 3 },
        { id: 'i3', productId: 'p3', name: 'Gone' },
      ]),
    );

    expect(result.ok).toBe(false);
    expect(result.priceChanges).toHaveLength(1);
    expect(result.stockIssues).toHaveLength(1);
    expect(result.removedItems).toHaveLength(1);
  });

  describe('variants', () => {
    const withVariant = (variant: Record<string, unknown>) =>
      product({
        price: 1999,
        variants: [{ id: 'v1', sku: 'SH-L', name: 'Large', options: {}, ...variant }],
      } as Partial<Product>);

    it("compares against the variant's price override, not the product's", async () => {
      const db = dbWith({ p1: withVariant({ price: 2499 }) });
      const result = await revalidateCart(db, cartWith([{ variantId: 'v1', price: 2499 }]));

      expect(result.ok).toBe(true);
    });

    it("falls back to the product price when the variant has no override", async () => {
      const db = dbWith({ p1: withVariant({}) });
      const result = await revalidateCart(db, cartWith([{ variantId: 'v1', price: 1999 }]));

      expect(result.ok).toBe(true);
    });

    it("checks the variant's own inventory", async () => {
      const db = dbWith({
        p1: withVariant({ inventory: { quantity: 1, available: 1, allowOutOfStock: false } }),
      });
      const result = await revalidateCart(db, cartWith([{ variantId: 'v1', quantity: 4 }]));

      expect(result.stockIssues[0]).toMatchObject({ requested: 4, available: 1 });
    });

    it('reports a deleted variant as removed', async () => {
      const db = dbWith({ p1: product({ variants: [] }) });
      const result = await revalidateCart(db, cartWith([{ variantId: 'v1' }]));

      expect(result.ok).toBe(false);
      expect(result.removedItems).toEqual([{ itemId: 'i1', name: 'Shirt' }]);
    });
  });

  it('passes an empty cart without touching the database', async () => {
    const db = dbWith({});
    const result = await revalidateCart(db, cartWith([]));
    expect(result.ok).toBe(true);
  });
});
