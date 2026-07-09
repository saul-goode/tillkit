import type { Cart, DatabaseAdapter, Inventory, Product, ProductVariant } from '@tillkit/core';

export interface CartPriceChange {
  itemId: string;
  name: string;
  oldPrice: number;
  newPrice: number;
}

export interface CartStockIssue {
  itemId: string;
  name: string;
  requested: number;
  available: number;
}

export interface CartRemovedItem {
  itemId: string;
  name: string;
}

export interface CartRevalidationResult {
  /** True only when all three arrays are empty. */
  ok: boolean;
  priceChanges: CartPriceChange[];
  stockIssues: CartStockIssue[];
  removedItems: CartRemovedItem[];
}

/** Effective price of a cart line: a variant's override, else the product's. */
function effectivePrice(product: Product, variant?: ProductVariant): number {
  return variant?.price ?? product.price;
}

/** Effective inventory: a variant tracks its own, else it shares the product's. */
function effectiveInventory(product: Product, variant?: ProductVariant): Inventory | undefined {
  return variant?.inventory ?? product.inventory;
}

/**
 * Revalidate a cart against current catalog state, immediately before a payment
 * session is created.
 *
 * Every value the cart carries — price, name, quantity — is a snapshot taken at
 * add-to-cart time and may be arbitrarily stale by the time the shopper clicks
 * pay. A price read from the cart is a price the shopper chose; a price read
 * here is a price the store chose. Only the latter may be charged.
 *
 * Blocking on a *downward* price drift looks pedantic but isn't: charging more
 * than the current shelf price invites a chargeback, and silently charging less
 * hides a pricing bug. Either way the shopper should see the new number before
 * consenting to it.
 */
export async function revalidateCart(
  db: DatabaseAdapter,
  cart: Cart,
): Promise<CartRevalidationResult> {
  const priceChanges: CartPriceChange[] = [];
  const stockIssues: CartStockIssue[] = [];
  const removedItems: CartRemovedItem[] = [];

  for (const item of cart.items) {
    const product = await db.products.get(item.productId);

    // A product that is gone, or no longer offered for sale, cannot be bought.
    if (!product || product.status !== 'active') {
      removedItems.push({ itemId: item.id, name: item.name });
      continue;
    }

    let variant: ProductVariant | undefined;
    if (item.variantId) {
      variant = product.variants?.find((v) => v.id === item.variantId);
      // The variant was deleted out from under the cart. The product still
      // exists, but this particular thing does not.
      if (!variant) {
        removedItems.push({ itemId: item.id, name: item.name });
        continue;
      }
    }

    // Past this point the line is buyable; report every way it is wrong, so one
    // trip back to the cart page surfaces all of them.
    const currentPrice = effectivePrice(product, variant);
    if (currentPrice !== item.price) {
      priceChanges.push({
        itemId: item.id,
        name: item.name,
        oldPrice: item.price,
        newPrice: currentPrice,
      });
    }

    const inventory = effectiveInventory(product, variant);
    if (inventory && !inventory.allowOutOfStock) {
      const available = inventory.available ?? inventory.quantity ?? 0;
      if (available < item.quantity) {
        stockIssues.push({
          itemId: item.id,
          name: item.name,
          requested: item.quantity,
          available,
        });
      }
    }
  }

  return {
    ok: priceChanges.length === 0 && stockIssues.length === 0 && removedItems.length === 0,
    priceChanges,
    stockIssues,
    removedItems,
  };
}
