// Unified Subscription types for TillKit
// Supports Stripe, PayPal, and future providers

export interface SubscriptionPlan {
  id: string;
  provider?: string;
  name: string;
  description?: string;
  amount: number;
  currency: string;
  interval: 'month' | 'year' | 'week' | 'day';
  intervalCount: number;
}

export interface Subscription {
  id: string;
  customerId: string;
  customerEmail: string;
  status: 'incomplete' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused' | 'trialing';
  plan: SubscriptionPlan;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
  metadata?: Record<string, string>;
}

export interface CreateSubscriptionOptions {
  customerId: string;
  planId: string;
  trialDays?: number;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
}

export interface SubscriptionProvider {
  createSubscription(options: CreateSubscriptionOptions): Promise<{
    id: string;
    status: string;
    clientSecret?: string;
    approvalUrl?: string;
    currentPeriodEnd: Date;
  }>;

  cancelSubscription(subscriptionId: string, immediately?: boolean): Promise<{
    id: string;
    status: string;
    canceledAt?: Date;
  }>;

  updateSubscription(subscriptionId: string, newPlanId: string): Promise<{
    id: string;
    status: string;
  }>;

  getSubscription(subscriptionId: string): Promise<Subscription>;

  handleWebhook(payload: string | Buffer, signature?: string): any;

  processWebhookEvent(event: any): Promise<SubscriptionEvent>;
}

export interface SubscriptionEvent {
  type:
    | 'subscription_created'
    | 'subscription_activated'
    | 'subscription_renewed'
    | 'subscription_canceled'
    | 'subscription_past_due'
    | 'payment_failed'
    | 'invoice_paid'
    | 'other';
  subscriptionId: string;
  customerId?: string;
  data: Record<string, any>;
}

export interface SubscriptionCheckoutSession {
  id: string;
  provider: 'stripe' | 'paypal';
  url?: string;
  clientSecret?: string;
  approvalUrl?: string;
}

export interface SubscriptionMetadata {
  enabled: boolean;
  plans: SubscriptionPlan[];
  trialDays?: number;
  description?: string;
}
