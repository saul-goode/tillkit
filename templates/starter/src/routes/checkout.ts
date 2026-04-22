import { Hono } from 'hono';
import { createOrderFromStripeSession } from '@tillkit/server';
import { database, stripe, getSessionId, layout } from '../app-context.js';

export const checkoutRouter = new Hono();

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
