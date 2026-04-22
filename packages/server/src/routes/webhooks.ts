import { Hono } from 'hono';
import type { DatabaseAdapter } from '@tillkit/core';
import type { StripeIntegration } from '@tillkit/integration-stripe';

export interface WebhookConfig {
  database: DatabaseAdapter;
  stripe: StripeIntegration;
  webhookSecret: string;
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
    
    try {
      // Verify and parse the webhook
      const event = config.stripe.handleWebhook(payload, signature);
      const result = await config.stripe.processWebhookEvent(event);
      
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
          
          // Call custom handler if provided
          if (config.onPaymentSuccess) {
            await config.onPaymentSuccess(data);
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
        }
      }
      
      return c.json({ received: true });
    } catch (err: any) {
      console.error('Webhook error:', err.message);
      return c.json({ error: 'Invalid signature' }, 400);
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
}: {
  database: DatabaseAdapter;
  stripe: StripeIntegration;
  sessionId: string;
  cartId?: string;
  getSessionIdFn: () => string;
}): Promise<string | null> {
  try {
    // Get session details from Stripe
    const session = await stripe.getSession(sessionId);
    
    if (session.payment_status !== 'paid') {
      console.log('Session not paid yet:', session.id);
      return null;
    }
    
    // Get or create cart from session
    const actualCartId = cartId || getSessionIdFn();
    const cart = await database.cart.get(actualCartId);
    
    if (!cart || cart.items.length === 0) {
      console.log('No cart found for session:', sessionId);
      return null;
    }
    
    // Create order
    const order = await database.orders.create({
      email: session.customer_email || 'unknown@example.com',
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
    
    console.log('Order created:', order.orderNumber);
    return order.id;
  } catch (err) {
    console.error('Failed to create order from session:', err);
    return null;
  }
}
