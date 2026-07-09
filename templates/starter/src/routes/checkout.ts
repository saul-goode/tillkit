import { Hono } from 'hono';
import { createOrderFromStripeSession, revalidateCart } from '@tillkit/server';
import type { CartRevalidationResult } from '@tillkit/server';
import { database, stripe, getSessionId, layout, setFlash, escapeHtml } from '../app-context.js';

export const checkoutRouter = new Hono();

/**
 * Bring the cart in line with what revalidation found, so the shopper is not
 * bounced off checkout again for the same reason.
 *
 * Repricing goes through remove + re-add: `updateItem` only takes a quantity,
 * and `cart.update({ items })` is not portable across adapters. The item gets a
 * new id, which is fine — the shopper is about to be handed a fresh cart page.
 */
async function reconcileCart(sessionId: string, result: CartRevalidationResult) {
  for (const removed of result.removedItems) {
    await database.cart.removeItem(sessionId, removed.itemId);
  }

  // Clamp to what is actually on the shelf. Leaving the quantity as-is would
  // block this shopper at checkout forever.
  for (const issue of result.stockIssues) {
    if (issue.available <= 0) {
      await database.cart.removeItem(sessionId, issue.itemId);
    } else {
      await database.cart.updateItem(sessionId, issue.itemId, issue.available);
    }
  }

  for (const change of result.priceChanges) {
    const cart = await database.cart.get(sessionId);
    const item = cart?.items.find((i) => i.id === change.itemId);
    if (!item) continue; // already dropped as removed or out of stock
    await database.cart.removeItem(sessionId, item.id);
    await database.cart.addItem(sessionId, {
      productId: item.productId,
      variantId: item.variantId,
      name: item.name,
      sku: item.sku,
      price: change.newPrice,
      quantity: item.quantity,
      image: item.image,
    });
  }
}

function describeChanges(result: CartRevalidationResult): string {
  const parts: string[] = [];
  for (const c of result.priceChanges) {
    parts.push(`the price of ${escapeHtml(c.name)} changed`);
  }
  for (const s of result.stockIssues) {
    parts.push(
      s.available <= 0
        ? `${escapeHtml(s.name)} is out of stock`
        : `only ${s.available} of ${escapeHtml(s.name)} remain`,
    );
  }
  for (const r of result.removedItems) {
    parts.push(`${escapeHtml(r.name)} is no longer available`);
  }
  return `Your cart was updated before checkout: ${parts.join('; ')}. Please review and try again.`;
}

checkoutRouter.post('/', async (c) => {
  if (!stripe) {
    return c.html(
      layout(
        'Error',
        `
        <h1>Checkout Unavailable</h1>
        <p>Stripe is not configured. Please set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY.</p>
        <a href="/cart">← Back to Cart</a>
      `,
      ),
      500,
    );
  }

  const sessionId = getSessionId(c);
  const cart = await database.cart.get(sessionId);

  if (!cart || cart.items.length === 0) {
    return c.redirect('/cart');
  }

  // Last gate before money moves. Cart prices and quantities are snapshots from
  // add-to-cart time; only what the catalog says right now may be charged.
  const revalidation = await revalidateCart(database, cart);
  if (!revalidation.ok) {
    await reconcileCart(sessionId, revalidation);
    setFlash(c, describeChanges(revalidation));
    return c.redirect('/cart');
  }

  const checkoutSession = await stripe.createCheckoutSession(cart);
  return c.redirect(checkoutSession.url);
});

checkoutRouter.get('/success', async (c) => {
  if (!stripe) return c.redirect('/cart');

  const stripeSessionId = c.req.query('session_id');
  if (!stripeSessionId) return c.redirect('/cart');

  const orderId = await createOrderFromStripeSession({
    database,
    stripe,
    sessionId: stripeSessionId,
    getSessionIdFn: () => getSessionId(c),
    inventoryWebhook: process.env.INVENTORY_WEBHOOK_URL ? {
      url: process.env.INVENTORY_WEBHOOK_URL,
      secret: process.env.INVENTORY_WEBHOOK_SECRET || undefined,
    } : undefined,
  });

  if (!orderId) {
    return c.html(
      layout(
        'Payment Pending',
        `
        <h1>Payment Pending</h1>
        <p>Your payment is being processed, or the order could not yet be finalized.</p>
        <a href="/">← Continue Shopping</a>
      `,
      ),
    );
  }

  const order = await database.orders.get(orderId);
  return c.html(
    layout(
      'Thank You!',
      `
      <div class="success-page">
        <h1>🎉 Thank You for Your Order!</h1>
        <p>Order number: <strong>${order?.orderNumber ?? orderId}</strong></p>
        <p>We've received your order.</p>
        <a href="/" class="button-primary">Continue Shopping</a>
      </div>
    `,
    ),
  );
});

checkoutRouter.get('/cancel', async (c) => {
  return c.html(
    layout(
      'Checkout Cancelled',
      `
      <h1>Checkout Cancelled</h1>
      <p>Your payment was cancelled. Your cart items are still saved.</p>
      <div class="actions">
        <a href="/cart" class="button-primary">Back to Cart</a>
        <a href="/products">Continue Shopping</a>
      </div>
    `,
    ),
  );
});
