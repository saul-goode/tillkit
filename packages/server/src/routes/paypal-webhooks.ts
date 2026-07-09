import { Hono } from 'hono';
import type { DatabaseAdapter } from '@tillkit/core';
import type { PayPalIntegration } from '@tillkit/integration-paypal';

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

    try {
      const event = config.paypal.handleWebhook(payload, Object.fromEntries(c.req.raw.headers.entries()));
      const result = await config.paypal.processWebhookEvent(event);

      if (result.type === 'payment_success') {
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
      }

      if (result.type === 'payment_failure' && config.onPaymentFailure) {
        await config.onPaymentFailure({ error: result.data });
      }

      return c.json({ received: true });
    } catch (err: any) {
      console.error('PayPal webhook error:', err.message);
      return c.json({ error: 'Webhook processing failed' }, 400);
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

    // Check if order already exists
    const existing = await database.orders.getByNumber?.(paypalOrder.id);
    if (existing) return existing.id;

    // Capture payment if not already captured
    let capture;
    if (paypalOrder.status === 'APPROVED') {
      capture = await paypal.capturePayment(orderId);
    } else {
      capture = { id: paypalOrder.id, status: 'COMPLETED', amount: paypalOrder.amount, currency: paypalOrder.currency };
    }

    const order = await database.orders.create({
      email: '', // PayPal webhooks provide this
      customerId: getSessionIdFn(),
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

    const txn = paypal.createTransactionFromCapture(capture as any);
    await database.orders.addTransaction(order.id, txn);

    console.log('PayPal Order created:', order.orderNumber);
    return order.id;
  } catch (err) {
    console.error('Failed to create order from PayPal capture:', err);
    return null;
  }
}
