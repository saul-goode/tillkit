import { Hono } from 'hono';
import type { DatabaseAdapter } from '@tillkit/core';
import { isDuplicateGatewayRefError } from '@tillkit/core';
import type { PayPalIntegration } from '@tillkit/integration-paypal';
import {
  PayPalWebhookNotConfiguredError,
  PayPalWebhookVerificationError,
} from '@tillkit/integration-paypal';

export interface PayPalWebhookConfig {
  database: DatabaseAdapter;
  paypal: PayPalIntegration;
  webhookId?: string;
  onPaymentSuccess?: (data: {
    orderId?: string;
    captureId: string;
    amount: number;
    currency: string;
    payerEmail: string | null;
    payerId: string | null;
    metadata: Record<string, string> | null;
  }) => Promise<void> | void;
  onPaymentFailure?: (data: {
    error: any;
  }) => Promise<void> | void;
}

export function createPayPalWebhookRoutes(config: PayPalWebhookConfig) {
  const router = new Hono();

  router.post('/paypal', async (c) => {
    const payload = await c.req.text();

    // Verification is a hard gate: an event that fails it never reaches
    // processing, and its failure is terminal (no retry will help).
    let event: unknown;
    try {
      event = await config.paypal.handleWebhook(payload, c.req.raw.headers);
    } catch (err) {
      if (err instanceof PayPalWebhookNotConfiguredError) {
        console.error(
          'PayPal webhook rejected: PAYPAL_WEBHOOK_ID is not configured. ' +
            'Events cannot be verified and will not be processed.',
        );
        return c.json({ error: 'Webhook verification not configured' }, 400);
      }
      if (err instanceof PayPalWebhookVerificationError) {
        console.error('PayPal webhook rejected:', err.message);
        return c.json({ error: 'Invalid webhook signature' }, 400);
      }
      throw err;
    }

    const eventId = (event as { id?: string }).id;
    const eventType = (event as { event_type?: string }).event_type ?? 'unknown';

    // Without an id there is nothing to deduplicate on, and claiming under a
    // placeholder would swallow every subsequent id-less event forever. A
    // verified PayPal event always carries one, so this is unreachable in
    // practice — but it must fail loudly rather than silently, and no retry
    // will add the missing field.
    if (!eventId) {
      console.error('PayPal webhook rejected: verified event carries no id.');
      return c.json({ error: 'Webhook event has no id' }, 400);
    }

    // Claim the delivery. Exactly one process runs side effects; redelivery
    // is acknowledged without repeating them.
    const { claimed } = await config.database.webhookEvents.claim({
      gateway: 'paypal',
      eventId,
      eventType,
    });
    if (!claimed) {
      return c.json({ received: true, deduplicated: true });
    }

    try {
      const result = await config.paypal.processWebhookEvent(event);
      let outcome: 'processed' | 'ignored' = 'processed';

      switch (result.type) {
        case 'payment_success': {
          const data = result.data as any;

          if (config.onPaymentSuccess) {
            await config.onPaymentSuccess({
              orderId: data.orderId,
              captureId: data.captureId,
              amount: data.amount,
              currency: data.currency,
              payerEmail: data.payerEmail ?? null,
              payerId: data.payerId ?? null,
              metadata: data.metadata ?? null,
            });
          }

          console.log('PayPal payment captured:', {
            captureId: data.captureId,
            amount: data.amount,
          });
          break;
        }

        case 'payment_failure': {
          if (config.onPaymentFailure) {
            await config.onPaymentFailure({ error: result.data });
          }
          break;
        }

        case 'refund':
        case 'dispute': {
          // Recognized, but there is nowhere to route it yet. Spec 020 gives
          // refunds a handler; until then, record it and move on.
          console.log(`PayPal ${result.type} event received:`, eventId);
          break;
        }

        default: {
          console.log('Unhandled PayPal webhook event:', eventType);
          outcome = 'ignored';
        }
      }

      await config.database.webhookEvents.complete('paypal', eventId, { outcome });
      return c.json({ received: true });
    } catch (err: any) {
      // The event was verified; this is a processing failure. Drop the claim so
      // PayPal's redelivery can retry, and answer with a retryable status rather
      // than a false terminal ack.
      await config.database.webhookEvents.release('paypal', eventId);
      console.error('PayPal webhook processing failed:', err.message);
      return c.json({ error: 'Webhook processing failed' }, 500);
    }
  });

  return router;
}

// Helper: create order from PayPal capture
export async function createOrderFromPayPalCapture({
  database,
  paypal,
  orderId,
  cartId,
  getSessionIdFn,
}: {
  database: DatabaseAdapter;
  paypal: PayPalIntegration;
  orderId: string;
  cartId: string;
  getSessionIdFn: () => string;
}) {
  try {
    const paypalOrder = await paypal.getOrder(orderId);

    if (paypalOrder.status !== 'COMPLETED' && paypalOrder.status !== 'APPROVED') {
      console.log('PayPal order not completed yet:', paypalOrder.status);
      return null;
    }

    const cart = await database.cart.get(cartId);
    if (!cart) {
      console.log('No cart found for session:', cartId);
      return null;
    }

    // Fast path: this PayPal order already produced a TillKit order.
    //
    // The previous check here called `getByNumber(paypalOrder.id)`. Both
    // adapters key `getByNumber` on TillKit's own `orderNumber` (`TK-…`), so it
    // could never match a PayPal id: it always fell through and created a
    // duplicate. It read as defensive code and did nothing.
    const alreadyCreated = await database.orders.getByGatewayRef('paypal', paypalOrder.id);
    if (alreadyCreated) return alreadyCreated.id;

    // Capture payment if not already captured
    let capture;
    if (paypalOrder.status === 'APPROVED') {
      capture = await paypal.capturePayment(orderId);
    } else {
      capture = { id: paypalOrder.id, status: 'COMPLETED', amount: paypalOrder.amount, currency: paypalOrder.currency };
    }

    // Insert-and-catch: the unique (gateway, gatewayRef) index arbitrates the
    // race between capture and webhook. The read above is an optimization only.
    let order;
    try {
      order = await database.orders.create({
        email: '', // PayPal webhooks provide this
        customerId: getSessionIdFn(),
        gateway: 'paypal',
        gatewayRef: paypalOrder.id,
        status: 'paid',
        paymentStatus: 'paid',
        items: cart.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          price: item.price,
          quantity: item.quantity,
          lineTotal: item.lineTotal || item.price * item.quantity,
        })),
        subtotal: cart.subtotal || cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
        total: capture.amount || cart.subtotal || cart.total || 0,
        currency: capture.currency?.toUpperCase() || 'USD',
        // shippingAddress omitted: cart has no shippingAddress
        shippingAddress: { address1: '', city: '', postalCode: '', country: '' },
        notes: '',
        metadata: { paypalOrderId: orderId },
      });
    } catch (err) {
      if (isDuplicateGatewayRefError(err)) {
        const winner = await database.orders.getByGatewayRef('paypal', paypalOrder.id);
        if (winner) return winner.id;
      }
      throw err;
    }

    const txn = paypal.createTransactionFromCapture(capture as any);
    await database.orders.addTransaction(order.id, txn);

    console.log('PayPal Order created:', order.orderNumber);
    return order.id;
  } catch (err) {
    console.error('Failed to create order from PayPal capture:', err);
    return null;
  }
}
