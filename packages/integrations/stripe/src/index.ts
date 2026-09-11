import Stripe from 'stripe';
import type { Cart, Transaction } from '@tillkit/core';

export interface StripeConfig {
  provider: 'stripe';
  secretKey: string;
  publishableKey: string;
  webhookSecret?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export type StripeEvent = Stripe.Event;

export function stripeIntegration(config: StripeConfig) {
  const stripe = new Stripe(config.secretKey, {
    apiVersion: '2023-10-16',
  });
  
  return {
    stripe, // Expose for advanced use
    
    // Create a checkout session for cart
    async createCheckoutSession(
      cart: Cart,
      options?: {
        customerEmail?: string;
        metadata?: Record<string, string>;
      }
    ): Promise<CheckoutSession> {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        billing_address_collection: 'required',
        shipping_address_collection: {
          allowed_countries: ['US', 'CA', 'GB', 'AU'], // Configurable
        },
        line_items: cart.items.map((item) => ({
          price_data: {
            currency: cart.currency.toLowerCase(),
            product_data: {
              name: item.name,
              images: item.image ? [item.image.url] : undefined,
            },
            unit_amount: item.price,
          },
          quantity: item.quantity,
        })),
        mode: 'payment',
        success_url: config.successUrl,
        cancel_url: config.cancelUrl,
        customer_email: options?.customerEmail,
        metadata: {
          cartId: cart.id,
          ...options?.metadata,
        },
      });
      
      if (!session.url) {
        throw new Error('Failed to create checkout session');
      }
      
      return {
        id: session.id,
        url: session.url,
      };
    },
    
    // Retrieve session details
    async getSession(sessionId: string): Promise<Stripe.Checkout.Session> {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent', 'shipping_cost', 'shipping_details'],
      });
      return session;
    },
    
    // Verify and parse webhook
    handleWebhook(payload: string | Buffer, signature: string): Stripe.Event {
      if (!config.webhookSecret) {
        throw new Error('Webhook secret not configured');
      }
      try {
        const event = stripe.webhooks.constructEvent(
          payload,
          signature,
          config.webhookSecret
        );
        return event;
      } catch (err: any) {
        throw new Error(`Webhook verification failed: ${err.message}`);
      }
    },
    
    // Handle common webhook events
    async processWebhookEvent(event: Stripe.Event): Promise<{
      type: 'payment_success' | 'payment_failure' | 'refund' | 'other';
      data: unknown;
    }> {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          return {
            type: 'payment_success',
            data: {
              sessionId: session.id,
              paymentIntentId: session.payment_intent,
              amount: session.amount_total,
              currency: session.currency,
              customerEmail: session.customer_email,
              customerId: session.customer,
              metadata: session.metadata,
              shipping: session.shipping_details,
            },
          };
        }
        
        case 'checkout.session.async_payment_failed':
        case 'payment_intent.payment_failed': {
          return {
            type: 'payment_failure',
            data: event.data.object,
          };
        }
        
        case 'charge.refunded': {
          const refund = event.data.object as Stripe.Charge;
          return {
            type: 'refund',
            data: {
              chargeId: refund.id,
              amount: refund.amount_refunded,
              currency: refund.currency,
            },
          };
        }
        
        default:
          return {
            type: 'other',
            data: event,
          };
      }
    },
    
    // Create refund
    async createRefund(
      paymentIntentId: string,
      amount?: number,
      reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
    ): Promise<Stripe.Refund> {
      const params: Stripe.RefundCreateParams = {
        payment_intent: paymentIntentId,
        reason,
      };
      
      if (amount) {
        params.amount = amount;
      }
      
      return stripe.refunds.create(params);
    },
    
    // Create transaction record from Stripe data
    createTransactionFromSession(session: Stripe.Checkout.Session): Omit<Transaction, 'id'> {
      const paymentIntent = session.payment_intent as Stripe.PaymentIntent;
      
      return {
        kind: 'sale',
        status: 'success',
        amount: session.amount_total || 0,
        currency: session.currency?.toUpperCase() || 'USD',
        gateway: 'stripe',
        metadata: {
          sessionId: session.id,
          paymentIntentId: paymentIntent?.id,
          customerId: session.customer,
        },
      };
    },
  };
}

export type StripeIntegration = ReturnType<typeof stripeIntegration>;

// ===== ADVANCED STRIPE FEATURES =====

// Create or retrieve a customer for saved payment methods
export async function createOrGetCustomer(
  stripe: Stripe,
  email: string,
  name?: string
): Promise<string> {
  // Search for existing customer by email
  const existing = await stripe.customers.search({
    query: `email:'${email}'`,
  });
  
  if (existing.data.length > 0) {
    return existing.data[0].id;
  }
  
  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name,
  });
  
  return customer.id;
}

// Create SetupIntent for saving payment methods
export async function createSetupIntent(
  stripe: Stripe,
  customerId: string
): Promise<{ clientSecret: string; setupIntentId: string }> {
  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
  });
  
  if (!setupIntent.client_secret) {
    throw new Error('Failed to create setup intent');
  }
  
  return {
    clientSecret: setupIntent.client_secret,
    setupIntentId: setupIntent.id,
  };
}

// List saved payment methods for a customer
export async function listPaymentMethods(
  stripe: Stripe,
  customerId: string
): Promise<Array<{
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}>> {
  const methods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  });
  
  // Get default payment method
  const customer = await stripe.customers.retrieve(customerId);
  const defaultId = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
  
  return methods.data.map(pm => ({
    id: pm.id,
    brand: (pm.card?.brand || 'unknown'),
    last4: pm.card?.last4 || '0000',
    expMonth: pm.card?.exp_month || 0,
    expYear: pm.card?.exp_year || 0,
    isDefault: pm.id === defaultId,
  }));
}

// Delete a saved payment method
export async function detachPaymentMethod(
  stripe: Stripe,
  paymentMethodId: string
): Promise<void> {
  await stripe.paymentMethods.detach(paymentMethodId);
}

// ===== SUBSCRIPTION SUPPORT =====

export interface SubscriptionConfig {
  stripe: Stripe;
}

export interface SubscriptionProduct {
  id: string;
  name: string;
  description?: string;
  prices: Array<{
    id: string;
    amount: number; // cents
    currency: string;
    interval: 'month' | 'year' | 'week' | 'day';
    intervalCount: number;
  }>;
}

export function subscriptionIntegration(config: SubscriptionConfig) {
  const { stripe } = config;
  
  return {
    // Create a subscription product with pricing
    async createProduct(
      name: string,
      description: string,
      prices: Array<{ amount: number; currency: string; interval: 'month' | 'year'; intervalCount?: number }>
    ): Promise<SubscriptionProduct> {
      // Create the product
      const product = await stripe.products.create({
        name,
        description,
        type: 'service',
      });
      
      // Create prices for the product
      const createdPrices = [];
      for (const price of prices) {
        const created = await stripe.prices.create({
          product: product.id,
          unit_amount: price.amount,
          currency: price.currency.toLowerCase(),
          recurring: {
            interval: price.interval,
            interval_count: price.intervalCount || 1,
          },
        });
        createdPrices.push({
          id: created.id,
          amount: price.amount,
          currency: price.currency,
          interval: price.interval,
          intervalCount: price.intervalCount || 1,
        });
      }
      
      return {
        id: product.id,
        name,
        description,
        prices: createdPrices,
      };
    },
    
    // Create a subscription for a customer
    async createSubscription(
      customerId: string,
      priceId: string,
      options?: {
        trialDays?: number;
        defaultPaymentMethod?: string;
        metadata?: Record<string, string>;
      }
    ): Promise<{
      id: string;
      status: string;
      currentPeriodEnd: Date;
      clientSecret?: string;
    }> {
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        ...(options?.trialDays && { trial_period_days: options.trialDays }),
        ...(options?.defaultPaymentMethod && { default_payment_method: options.defaultPaymentMethod }),
        ...(options?.metadata && { metadata: options.metadata }),
        payment_behavior: 'default_incomplete', // For SCA compliance
        expand: ['latest_invoice.payment_intent'],
      });
      
      // Get client secret for 3D Secure
      const invoice = subscription.latest_invoice as Stripe.Invoice;
      const paymentIntent = invoice?.payment_intent as Stripe.PaymentIntent;
      
      return {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        clientSecret: paymentIntent?.client_secret || undefined,
      };
    },
    
    // Cancel a subscription
    async cancelSubscription(
      subscriptionId: string,
      options?: { immediately?: boolean }
    ): Promise<{ id: string; status: string; canceledAt?: Date }> {
      if (options?.immediately) {
        const deleted = await stripe.subscriptions.cancel(subscriptionId);
        return {
          id: deleted.id,
          status: deleted.status,
          canceledAt: new Date(),
        };
      }
      
      // Cancel at period end
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
      
      return {
        id: subscription.id,
        status: subscription.status,
        canceledAt: subscription.cancel_at 
          ? new Date(subscription.cancel_at * 1000) 
          : undefined,
      };
    },
    
    // Update subscription (change plan)
    async updateSubscription(
      subscriptionId: string,
      newPriceId: string,
      prorationDate?: Date
    ): Promise<{ id: string; status: string; invoiceId?: string }> {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const itemId = subscription.items.data[0].id;
      
      const updated = await stripe.subscriptions.update(subscriptionId, {
        items: [{
          id: itemId,
          price: newPriceId,
        }],
        ...(prorationDate && { proration_date: Math.floor(prorationDate.getTime() / 1000) }),
        proration_behavior: 'create_prorations',
      });
      
      return {
        id: updated.id,
        status: updated.status,
        invoiceId: (updated.latest_invoice as string) || undefined,
      };
    },
    
    // Get subscription details
    async getSubscription(subscriptionId: string): Promise<{
      id: string;
      status: string;
      currentPeriodStart: Date;
      currentPeriodEnd: Date;
      cancelAtPeriodEnd: boolean;
      canceledAt?: Date;
      plan: { name: string; amount: number; interval: string };
    }> {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price.product'],
      });
      
      const item = subscription.items.data[0];
      const price = item.price;
      const product = price.product as Stripe.Product;
      
      return {
        id: subscription.id,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at 
          ? new Date(subscription.canceled_at * 1000) 
          : undefined,
        plan: {
          name: product.name,
          amount: price.unit_amount || 0,
          interval: `${price.recurring?.interval_count || 1} ${price.recurring?.interval}`,
        },
      };
    },
  };
}

export type SubscriptionIntegration = ReturnType<typeof subscriptionIntegration>;

// Unified SubscriptionProvider adapter
export { createStripeSubscriptionProvider } from './subscriptions.js';
