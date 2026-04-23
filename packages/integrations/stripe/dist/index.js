// src/index.ts
import Stripe2 from "stripe";

// src/subscriptions.ts
import Stripe from "stripe";
function createStripeSubscriptionProvider(config) {
  const stripe = new Stripe(config.secretKey, { apiVersion: "2023-10-16" });
  return {
    async createSubscription(options) {
      const subscription = await stripe.subscriptions.create({
        customer: options.customerId,
        items: [{ price: options.planId }],
        ...options.trialDays && { trial_period_days: options.trialDays },
        ...options.paymentMethodId && { default_payment_method: options.paymentMethodId },
        ...options.metadata && { metadata: options.metadata },
        payment_behavior: "default_incomplete",
        expand: ["latest_invoice.payment_intent"]
      });
      const invoice = subscription.latest_invoice;
      const paymentIntent = invoice?.payment_intent;
      return {
        id: subscription.id,
        status: subscription.status,
        clientSecret: paymentIntent?.client_secret || void 0,
        currentPeriodEnd: new Date(subscription.current_period_end * 1e3)
      };
    },
    async cancelSubscription(subscriptionId, immediately) {
      if (immediately) {
        const deleted = await stripe.subscriptions.cancel(subscriptionId);
        return { id: deleted.id, status: deleted.status, canceledAt: /* @__PURE__ */ new Date() };
      }
      const updated = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true
      });
      return {
        id: updated.id,
        status: updated.status,
        canceledAt: updated.cancel_at ? new Date(updated.cancel_at * 1e3) : void 0
      };
    },
    async updateSubscription(subscriptionId, newPlanId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const itemId = sub.items.data[0].id;
      const updated = await stripe.subscriptions.update(subscriptionId, {
        items: [{ id: itemId, price: newPlanId }],
        proration_behavior: "create_prorations"
      });
      return { id: updated.id, status: updated.status };
    },
    async getSubscription(subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["items.data.price.product"]
      });
      const item = sub.items.data[0];
      const price = item.price;
      const product = price.product;
      const plan = {
        id: price.id,
        provider: "stripe",
        name: product.name,
        amount: price.unit_amount || 0,
        currency: price.currency.toUpperCase(),
        interval: price.recurring?.interval,
        intervalCount: price.recurring?.interval_count || 1
      };
      const customer = await stripe.customers.retrieve(sub.customer);
      return {
        id: sub.id,
        customerId: sub.customer,
        customerEmail: customer.email || "",
        status: sub.status,
        plan,
        currentPeriodStart: new Date(sub.current_period_start * 1e3),
        currentPeriodEnd: new Date(sub.current_period_end * 1e3),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        trialEnd: sub.trial_end ? new Date(sub.trial_end * 1e3) : void 0,
        metadata: sub.metadata
      };
    },
    handleWebhook(payload, signature) {
      if (!config.webhookSecret || !signature) {
        throw new Error("Stripe webhook secret not configured");
      }
      return stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);
    },
    async processWebhookEvent(event) {
      const stripeEvent = event;
      switch (stripeEvent.type) {
        case "invoice.payment_succeeded": {
          const invoice = stripeEvent.data.object;
          return {
            type: "invoice_paid",
            subscriptionId: invoice.subscription,
            customerId: typeof invoice.customer === "string" ? invoice.customer : void 0,
            data: invoice
          };
        }
        case "invoice.payment_failed": {
          const invoice = stripeEvent.data.object;
          return {
            type: "payment_failed",
            subscriptionId: invoice.subscription,
            customerId: typeof invoice.customer === "string" ? invoice.customer : void 0,
            data: invoice
          };
        }
        case "customer.subscription.created": {
          const sub = stripeEvent.data.object;
          return {
            type: "subscription_created",
            subscriptionId: sub.id,
            customerId: typeof sub.customer === "string" ? sub.customer : void 0,
            data: sub
          };
        }
        case "customer.subscription.deleted": {
          const sub = stripeEvent.data.object;
          return {
            type: "subscription_canceled",
            subscriptionId: sub.id,
            customerId: typeof sub.customer === "string" ? sub.customer : void 0,
            data: sub
          };
        }
        default:
          return {
            type: "other",
            subscriptionId: stripeEvent.data.object?.id || "",
            data: stripeEvent.data.object
          };
      }
    }
  };
}

// src/index.ts
function stripeIntegration(config) {
  const stripe = new Stripe2(config.secretKey, {
    apiVersion: "2023-10-16"
  });
  return {
    stripe,
    // Expose for advanced use
    // Create a checkout session for cart
    async createCheckoutSession(cart, options) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        billing_address_collection: "required",
        shipping_address_collection: {
          allowed_countries: ["US", "CA", "GB", "AU"]
          // Configurable
        },
        line_items: cart.items.map((item) => ({
          price_data: {
            currency: cart.currency.toLowerCase(),
            product_data: {
              name: item.name,
              images: item.image ? [item.image.url] : void 0
            },
            unit_amount: item.price
          },
          quantity: item.quantity
        })),
        mode: "payment",
        success_url: config.successUrl,
        cancel_url: config.cancelUrl,
        customer_email: options?.customerEmail,
        metadata: {
          cartId: cart.id,
          ...options?.metadata
        }
      });
      if (!session.url) {
        throw new Error("Failed to create checkout session");
      }
      return {
        id: session.id,
        url: session.url
      };
    },
    // Retrieve session details
    async getSession(sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["payment_intent", "shipping_cost", "shipping_details"]
      });
      return session;
    },
    // Verify and parse webhook
    handleWebhook(payload, signature) {
      if (!config.webhookSecret) {
        throw new Error("Webhook secret not configured");
      }
      try {
        const event = stripe.webhooks.constructEvent(
          payload,
          signature,
          config.webhookSecret
        );
        return event;
      } catch (err) {
        throw new Error(`Webhook verification failed: ${err.message}`);
      }
    },
    // Handle common webhook events
    async processWebhookEvent(event) {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          return {
            type: "payment_success",
            data: {
              sessionId: session.id,
              paymentIntentId: session.payment_intent,
              amount: session.amount_total,
              currency: session.currency,
              customerEmail: session.customer_email,
              customerId: session.customer,
              metadata: session.metadata,
              shipping: session.shipping_details
            }
          };
        }
        case "checkout.session.async_payment_failed":
        case "payment_intent.payment_failed": {
          return {
            type: "payment_failure",
            data: event.data.object
          };
        }
        case "charge.refunded": {
          const refund = event.data.object;
          return {
            type: "refund",
            data: {
              chargeId: refund.id,
              amount: refund.amount_refunded,
              currency: refund.currency
            }
          };
        }
        default:
          return {
            type: "other",
            data: event
          };
      }
    },
    // Create refund
    async createRefund(paymentIntentId, amount, reason) {
      const params = {
        payment_intent: paymentIntentId,
        reason
      };
      if (amount) {
        params.amount = amount;
      }
      return stripe.refunds.create(params);
    },
    // Create transaction record from Stripe data
    createTransactionFromSession(session) {
      const paymentIntent = session.payment_intent;
      return {
        kind: "sale",
        status: "success",
        amount: session.amount_total || 0,
        currency: session.currency?.toUpperCase() || "USD",
        gateway: "stripe",
        metadata: {
          sessionId: session.id,
          paymentIntentId: paymentIntent?.id,
          customerId: session.customer
        }
      };
    }
  };
}
async function createOrGetCustomer(stripe, email, name) {
  const existing = await stripe.customers.search({
    query: `email:'${email}'`
  });
  if (existing.data.length > 0) {
    return existing.data[0].id;
  }
  const customer = await stripe.customers.create({
    email,
    name
  });
  return customer.id;
}
async function createSetupIntent(stripe, customerId) {
  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"]
  });
  if (!setupIntent.client_secret) {
    throw new Error("Failed to create setup intent");
  }
  return {
    clientSecret: setupIntent.client_secret,
    setupIntentId: setupIntent.id
  };
}
async function listPaymentMethods(stripe, customerId) {
  const methods = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card"
  });
  const customer = await stripe.customers.retrieve(customerId);
  const defaultId = customer.invoice_settings?.default_payment_method;
  return methods.data.map((pm) => ({
    id: pm.id,
    brand: pm.card?.brand || "unknown",
    last4: pm.card?.last4 || "0000",
    expMonth: pm.card?.exp_month || 0,
    expYear: pm.card?.exp_year || 0,
    isDefault: pm.id === defaultId
  }));
}
async function detachPaymentMethod(stripe, paymentMethodId) {
  await stripe.paymentMethods.detach(paymentMethodId);
}
function subscriptionIntegration(config) {
  const { stripe } = config;
  return {
    // Create a subscription product with pricing
    async createProduct(name, description, prices) {
      const product = await stripe.products.create({
        name,
        description,
        type: "service"
      });
      const createdPrices = [];
      for (const price of prices) {
        const created = await stripe.prices.create({
          product: product.id,
          unit_amount: price.amount,
          currency: price.currency.toLowerCase(),
          recurring: {
            interval: price.interval,
            interval_count: price.intervalCount || 1
          }
        });
        createdPrices.push({
          id: created.id,
          amount: price.amount,
          currency: price.currency,
          interval: price.interval,
          intervalCount: price.intervalCount || 1
        });
      }
      return {
        id: product.id,
        name,
        description,
        prices: createdPrices
      };
    },
    // Create a subscription for a customer
    async createSubscription(customerId, priceId, options) {
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        ...options?.trialDays && { trial_period_days: options.trialDays },
        ...options?.defaultPaymentMethod && { default_payment_method: options.defaultPaymentMethod },
        ...options?.metadata && { metadata: options.metadata },
        payment_behavior: "default_incomplete",
        // For SCA compliance
        expand: ["latest_invoice.payment_intent"]
      });
      const invoice = subscription.latest_invoice;
      const paymentIntent = invoice?.payment_intent;
      return {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1e3),
        clientSecret: paymentIntent?.client_secret || void 0
      };
    },
    // Cancel a subscription
    async cancelSubscription(subscriptionId, options) {
      if (options?.immediately) {
        const deleted = await stripe.subscriptions.cancel(subscriptionId);
        return {
          id: deleted.id,
          status: deleted.status,
          canceledAt: /* @__PURE__ */ new Date()
        };
      }
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true
      });
      return {
        id: subscription.id,
        status: subscription.status,
        canceledAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1e3) : void 0
      };
    },
    // Update subscription (change plan)
    async updateSubscription(subscriptionId, newPriceId, prorationDate) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const itemId = subscription.items.data[0].id;
      const updated = await stripe.subscriptions.update(subscriptionId, {
        items: [{
          id: itemId,
          price: newPriceId
        }],
        ...prorationDate && { proration_date: Math.floor(prorationDate.getTime() / 1e3) },
        proration_behavior: "create_prorations"
      });
      return {
        id: updated.id,
        status: updated.status,
        invoiceId: updated.latest_invoice || void 0
      };
    },
    // Get subscription details
    async getSubscription(subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["items.data.price.product"]
      });
      const item = subscription.items.data[0];
      const price = item.price;
      const product = price.product;
      return {
        id: subscription.id,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1e3),
        currentPeriodEnd: new Date(subscription.current_period_end * 1e3),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1e3) : void 0,
        plan: {
          name: product.name,
          amount: price.unit_amount || 0,
          interval: `${price.recurring?.interval_count || 1} ${price.recurring?.interval}`
        }
      };
    }
  };
}
export {
  createOrGetCustomer,
  createSetupIntent,
  createStripeSubscriptionProvider,
  detachPaymentMethod,
  listPaymentMethods,
  stripeIntegration,
  subscriptionIntegration
};
