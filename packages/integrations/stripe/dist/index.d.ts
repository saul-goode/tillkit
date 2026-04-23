import Stripe from 'stripe';
import { SubscriptionProvider, Cart, Transaction } from '@tillkit/core';

interface StripeSubscriptionConfig {
    secretKey: string;
    webhookSecret?: string;
}
declare function createStripeSubscriptionProvider(config: StripeSubscriptionConfig): SubscriptionProvider;

interface StripeConfig {
    provider: 'stripe';
    secretKey: string;
    publishableKey: string;
    webhookSecret?: string;
    successUrl: string;
    cancelUrl: string;
}
interface CheckoutSession {
    id: string;
    url: string;
}
type StripeEvent = Stripe.Event;
declare function stripeIntegration(config: StripeConfig): {
    stripe: Stripe;
    createCheckoutSession(cart: Cart, options?: {
        customerEmail?: string;
        metadata?: Record<string, string>;
    }): Promise<CheckoutSession>;
    getSession(sessionId: string): Promise<Stripe.Checkout.Session>;
    handleWebhook(payload: string | Buffer, signature: string): Stripe.Event;
    processWebhookEvent(event: Stripe.Event): Promise<{
        type: "payment_success" | "payment_failure" | "refund" | "other";
        data: unknown;
    }>;
    createRefund(paymentIntentId: string, amount?: number, reason?: "duplicate" | "fraudulent" | "requested_by_customer"): Promise<Stripe.Refund>;
    createTransactionFromSession(session: Stripe.Checkout.Session): Omit<Transaction, "id">;
};
type StripeIntegration = ReturnType<typeof stripeIntegration>;
declare function createOrGetCustomer(stripe: Stripe, email: string, name?: string): Promise<string>;
declare function createSetupIntent(stripe: Stripe, customerId: string): Promise<{
    clientSecret: string;
    setupIntentId: string;
}>;
declare function listPaymentMethods(stripe: Stripe, customerId: string): Promise<Array<{
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
}>>;
declare function detachPaymentMethod(stripe: Stripe, paymentMethodId: string): Promise<void>;
interface SubscriptionConfig {
    stripe: Stripe;
}
interface SubscriptionProduct {
    id: string;
    name: string;
    description?: string;
    prices: Array<{
        id: string;
        amount: number;
        currency: string;
        interval: 'month' | 'year' | 'week' | 'day';
        intervalCount: number;
    }>;
}
declare function subscriptionIntegration(config: SubscriptionConfig): {
    createProduct(name: string, description: string, prices: Array<{
        amount: number;
        currency: string;
        interval: "month" | "year";
        intervalCount?: number;
    }>): Promise<SubscriptionProduct>;
    createSubscription(customerId: string, priceId: string, options?: {
        trialDays?: number;
        defaultPaymentMethod?: string;
        metadata?: Record<string, string>;
    }): Promise<{
        id: string;
        status: string;
        currentPeriodEnd: Date;
        clientSecret?: string;
    }>;
    cancelSubscription(subscriptionId: string, options?: {
        immediately?: boolean;
    }): Promise<{
        id: string;
        status: string;
        canceledAt?: Date;
    }>;
    updateSubscription(subscriptionId: string, newPriceId: string, prorationDate?: Date): Promise<{
        id: string;
        status: string;
        invoiceId?: string;
    }>;
    getSubscription(subscriptionId: string): Promise<{
        id: string;
        status: string;
        currentPeriodStart: Date;
        currentPeriodEnd: Date;
        cancelAtPeriodEnd: boolean;
        canceledAt?: Date;
        plan: {
            name: string;
            amount: number;
            interval: string;
        };
    }>;
};
type SubscriptionIntegration = ReturnType<typeof subscriptionIntegration>;

export { type CheckoutSession, type StripeConfig, type StripeEvent, type StripeIntegration, type SubscriptionConfig, type SubscriptionIntegration, type SubscriptionProduct, createOrGetCustomer, createSetupIntent, createStripeSubscriptionProvider, detachPaymentMethod, listPaymentMethods, stripeIntegration, subscriptionIntegration };
