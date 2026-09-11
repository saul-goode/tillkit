import { Hono } from 'hono';
import type { DatabaseAdapter } from '@tillkit/core';
import { isDuplicateGatewayRefError } from '@tillkit/core';
import type { StripeIntegration } from '@tillkit/integration-stripe';
import { decrementInventoryForOrder } from '../inventory.js';
import type { InventoryWebhookConfig } from '../inventory.js';

export interface WebhookConfig {
  database: DatabaseAdapter;
  stripe: StripeIntegration;
  webhookSecret: string;
  inventoryWebhook?: InventoryWebhookConfig;
  onPaymentSuccess?: (data: {
    orderId?: string;
    sessionId: string;
    paymentIntentId: string;
    amount: number;
    currency: string;
    customerEmail: string | null;
    customerId: string | null;
    shipping: any;
    metadata: Record<string, string> | null;
  }) => Promise<void> | void;
  onPaymentFailure?: (data: {
    sessionId?: string;
    error: any;
  }) => Promise<void> | void;
  onRefund?: (data: {
    chargeId: string;
    amount: number;
    currency: string;
  }) => Promise<void> | void;
}

export function createWebhookRoutes(config: WebhookConfig) {
  const router = new Hono();
  
  // Stripe webhook endpoint
  router.post('/stripe', async (c) => {
    const payload = await c.req.text();
    const signature = c.req.header('stripe-signature') || '';

    // Verification is a terminal gate: a failure here is never retryable, and
    // nothing — not even a ledger claim — happens before it passes.
    let event: any;
    try {
      event = config.stripe.handleWebhook(payload, signature);
    } catch (err: any) {
      console.error('Stripe webhook rejected:', err.message);
      return c.json({ error: 'Invalid signature' }, 400);
    }

    // Claim the event. Exactly one process wins; everyone else acknowledges
    // without running side effects, so redelivery is a no-op.
    const { claimed } = await config.database.webhookEvents.claim({
      gateway: 'stripe',
      eventId: event.id,
      eventType: event.type,
    });
    if (!claimed) {
      return c.json({ received: true, deduplicated: true });
    }

    try {
      const result = await config.stripe.processWebhookEvent(event);
      let orderId: string | undefined;
      let outcome: 'processed' | 'ignored' = 'processed';

      switch (result.type) {
        case 'payment_success': {
          const data = result.data as {
            sessionId: string;
            paymentIntentId: string;
            amount: number;
            currency: string;
            customerEmail: string | null;
            customerId: string | null;
            shipping: any;
            metadata: Record<string, string> | null;
          };

          console.log('Payment success:', {
            sessionId: data.sessionId,
            amount: data.amount,
            currency: data.currency,
          });

          if (config.onPaymentSuccess) {
            await config.onPaymentSuccess(data);
          } else {
            // Default: create the order. Without this, a shopper who closes the
            // tab after paying leaves a paid-but-orderless store, because the
            // success page was the only thing that created orders.
            orderId =
              (await createOrderFromStripeSession({
                database: config.database,
                stripe: config.stripe,
                sessionId: data.sessionId,
                cartId: data.metadata?.cartId,
                getSessionIdFn: () => data.metadata?.cartId ?? '',
                inventoryWebhook: config.inventoryWebhook,
              })) ?? undefined;
          }

          break;
        }

        case 'payment_failure': {
          const data = result.data as any;
          console.error('Payment failed:', data);

          if (config.onPaymentFailure) {
            await config.onPaymentFailure({
              sessionId: data.id,
              error: data.last_payment_error,
            });
          }

          break;
        }

        case 'refund': {
          const data = result.data as {
            chargeId: string;
            amount: number;
            currency: string;
          };

          console.log('Refund processed:', data);

          if (config.onRefund) {
            await config.onRefund(data);
          }

          break;
        }

        default: {
          console.log('Unhandled webhook event:', event.type);
          outcome = 'ignored';
        }
      }

      await config.database.webhookEvents.complete('stripe', event.id, { outcome, orderId });
      return c.json({ received: true });
    } catch (err: any) {
      // The event was verified but processing failed. Drop the claim so the
      // gateway's redelivery can retry it — otherwise this payment's side
      // effects are lost permanently — and answer with a retryable status
      // rather than a false terminal ack.
      await config.database.webhookEvents.release('stripe', event.id);
      console.error('Stripe webhook processing failed:', err.message);
      return c.json({ error: 'Webhook processing failed' }, 500);
    }
  });

  return router;
}

// Helper to create order from Stripe session (used in success page or webhook)
export async function createOrderFromStripeSession({
  database,
  stripe,
  sessionId,
  cartId,
  getSessionIdFn,
  inventoryWebhook,
}: {
  database: DatabaseAdapter;
  stripe: StripeIntegration;
  sessionId: string;
  cartId?: string;
  getSessionIdFn: () => string;
  inventoryWebhook?: InventoryWebhookConfig;
}): Promise<string | null> {
  try {
    // Get session details from Stripe
    const session = await stripe.getSession(sessionId);

    if (session.payment_status !== 'paid') {
      console.log('Session not paid yet:', session.id);
      return null;
    }

    // Fast path: this payment already produced an order (redelivered webhook,
    // refreshed success page). Cheaper than racing to the unique index.
    const alreadyCreated = await database.orders.getByGatewayRef('stripe', session.id);
    if (alreadyCreated) return alreadyCreated.id;

    // Get or create cart from session
    const actualCartId = cartId || getSessionIdFn();
    const cart = await database.cart.get(actualCartId);

    if (!cart || cart.items.length === 0) {
      console.log('No cart found for session:', sessionId);
      return null;
    }
    
    // Resolve the buyer's email. A paid order with a placeholder address is a
    // support ticket waiting to happen, so try every source Stripe offers and
    // shout if none produced one.
    const email =
      session.customer_email ||
      (session as { customer_details?: { email?: string | null } }).customer_details?.email ||
      null;
    if (!email) {
      console.error(
        `Stripe session ${session.id} is paid but carries no customer email. ` +
          'Creating the order with a placeholder address — this order cannot be emailed.',
      );
    }

    // Create order. Insert-and-catch, never check-then-insert: the success page
    // and the webhook race, and only the unique (gateway, gatewayRef) index can
    // arbitrate. The read above is an optimization, not the guarantee.
    let order;
    try {
      order = await database.orders.create({
        email: email || 'unknown@example.com',
        gateway: 'stripe',
        gatewayRef: session.id,
        status: 'paid',
        paymentStatus: 'paid',
        items: cart.items.map(item => ({
          productId: item.productId,
          variantId: item.variantId,
          name: item.name,
          sku: item.sku,
          price: item.price,
          quantity: item.quantity,
          total: item.price * item.quantity,
          image: item.image,
        })),
        subtotal: cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
        total: session.amount_total || 0,
        currency: (session.currency || 'USD').toUpperCase(),
        shippingAddress: session.shipping_details ? {
          firstName: session.shipping_details.name?.split(' ')[0] || '',
          lastName: session.shipping_details.name?.split(' ').slice(1).join(' ') || '',
          address1: session.shipping_details.address?.line1 || '',
          address2: session.shipping_details.address?.line2,
          city: session.shipping_details.address?.city || '',
          province: session.shipping_details.address?.state,
          postalCode: session.shipping_details.address?.postal_code || '',
          country: session.shipping_details.address?.country || '',
        } : undefined,
      });
    } catch (err) {
      if (isDuplicateGatewayRefError(err)) {
        // The other path won. Return its order; run no side effects.
        const winner = await database.orders.getByGatewayRef('stripe', session.id);
        if (winner) return winner.id;
      }
      throw err;
    }

    // Add transaction record
    await database.orders.addTransaction(order.id, {
      kind: 'sale',
      status: 'success',
      amount: session.amount_total || 0,
      currency: (session.currency || 'USD').toUpperCase(),
      gateway: 'stripe',
      metadata: {
        sessionId: session.id,
        paymentIntentId: (session.payment_intent as string) || '',
        customerId: session.customer,
      },
    });
    
    // Clear the cart
    await database.cart.clear(actualCartId);
    
    // Decrement inventory
    await decrementInventoryForOrder(database, order, inventoryWebhook);
    
    console.log('Order created:', order.orderNumber);
    return order.id;
  } catch (err) {
    console.error('Failed to create order from session:', err);
    return null;
  }
}
