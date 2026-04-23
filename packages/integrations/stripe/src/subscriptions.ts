// Stripe → Unified SubscriptionProvider adapter
import Stripe from 'stripe';
import type {
  SubscriptionProvider,
  CreateSubscriptionOptions,
  Subscription,
  SubscriptionPlan,
  SubscriptionEvent,
} from '@tillkit/core';

export interface StripeSubscriptionConfig {
  secretKey: string;
  webhookSecret?: string;
}

export function createStripeSubscriptionProvider(
  config: StripeSubscriptionConfig
): SubscriptionProvider {
  const stripe = new Stripe(config.secretKey, { apiVersion: '2023-10-16' });

  return {
    async createSubscription(options: CreateSubscriptionOptions) {
      const subscription = await stripe.subscriptions.create({
        customer: options.customerId,
        items: [{ price: options.planId }],
        ...(options.trialDays && { trial_period_days: options.trialDays }),
        ...(options.paymentMethodId && { default_payment_method: options.paymentMethodId }),
        ...(options.metadata && { metadata: options.metadata }),
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
      });

      const invoice = subscription.latest_invoice as Stripe.Invoice;
      const paymentIntent = invoice?.payment_intent as Stripe.PaymentIntent;

      return {
        id: subscription.id,
        status: subscription.status,
        clientSecret: paymentIntent?.client_secret || undefined,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      };
    },

    async cancelSubscription(subscriptionId, immediately) {
      if (immediately) {
        const deleted = await stripe.subscriptions.cancel(subscriptionId);
        return { id: deleted.id, status: deleted.status, canceledAt: new Date() };
      }
      const updated = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
      return {
        id: updated.id,
        status: updated.status,
        canceledAt: updated.cancel_at ? new Date(updated.cancel_at * 1000) : undefined,
      };
    },

    async updateSubscription(subscriptionId, newPlanId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const itemId = sub.items.data[0].id;
      const updated = await stripe.subscriptions.update(subscriptionId, {
        items: [{ id: itemId, price: newPlanId }],
        proration_behavior: 'create_prorations',
      });
      return { id: updated.id, status: updated.status };
    },

    async getSubscription(subscriptionId): Promise<Subscription> {
      const sub = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price.product'],
      });

      const item = sub.items.data[0];
      const price = item.price;
      const product = price.product as Stripe.Product;

      const plan: SubscriptionPlan = {
        id: price.id,
        provider: 'stripe',
        name: product.name,
        amount: price.unit_amount || 0,
        currency: price.currency.toUpperCase(),
        interval: price.recurring?.interval as any,
        intervalCount: price.recurring?.interval_count || 1,
      };

      const customer = await stripe.customers.retrieve(sub.customer as string);

      return {
        id: sub.id,
        customerId: sub.customer as string,
        customerEmail: (customer as Stripe.Customer).email || '',
        status: sub.status as Subscription['status'],
        plan,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : undefined,
        metadata: sub.metadata as Record<string, string>,
      };
    },

    handleWebhook(payload, signature) {
      if (!config.webhookSecret || !signature) {
        throw new Error('Stripe webhook secret not configured');
      }
      return stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);
    },

    async processWebhookEvent(event): Promise<SubscriptionEvent> {
      const stripeEvent = event as Stripe.Event;
      switch (stripeEvent.type) {
        case 'invoice.payment_succeeded': {
          const invoice = stripeEvent.data.object as Stripe.Invoice;
          return {
            type: 'invoice_paid',
            subscriptionId: invoice.subscription as string,
            customerId: typeof invoice.customer === 'string' ? invoice.customer : undefined,
            data: invoice as any,
          };
        }
        case 'invoice.payment_failed': {
          const invoice = stripeEvent.data.object as Stripe.Invoice;
          return {
            type: 'payment_failed',
            subscriptionId: invoice.subscription as string,
            customerId: typeof invoice.customer === 'string' ? invoice.customer : undefined,
            data: invoice as any,
          };
        }
        case 'customer.subscription.created': {
          const sub = stripeEvent.data.object as Stripe.Subscription;
          return {
            type: 'subscription_created',
            subscriptionId: sub.id,
            customerId: typeof sub.customer === 'string' ? sub.customer : undefined,
            data: sub as any,
          };
        }
        case 'customer.subscription.deleted': {
          const sub = stripeEvent.data.object as Stripe.Subscription;
          return {
            type: 'subscription_canceled',
            subscriptionId: sub.id,
            customerId: typeof sub.customer === 'string' ? sub.customer : undefined,
            data: sub as any,
          };
        }
        default:
          return {
            type: 'other',
            subscriptionId: (stripeEvent.data.object as any)?.id || '',
            data: stripeEvent.data.object as any,
          };
      }
    },
  };
}
