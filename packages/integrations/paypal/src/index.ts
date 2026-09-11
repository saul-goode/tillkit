import type { Cart, Transaction } from '@tillkit/core';

export interface PayPalConfig {
  provider: 'paypal';
  clientId: string;
  clientSecret: string;
  webhookId?: string;
  sandbox?: boolean;
}

export interface PayPalOrder {
  id: string;
  status: string;
  approvalUrl?: string;
  amount: number;
  currency: string;
}

export interface PayPalCapture {
  id: string;
  status: string;
  amount: number;
  currency: string;
  payerEmail?: string;
  payerId?: string;
  payerName?: string;
}

/** Thrown when a webhook arrives but no webhookId is configured. Fail closed. */
export class PayPalWebhookNotConfiguredError extends Error {
  constructor() {
    super(
      'PayPal webhook received but PAYPAL_WEBHOOK_ID is not configured. ' +
        'Refusing to process an unverifiable event.',
    );
    this.name = 'PayPalWebhookNotConfiguredError';
  }
}

/** Thrown when a webhook fails provenance verification. */
export class PayPalWebhookVerificationError extends Error {
  constructor(reason: string) {
    super(`PayPal webhook verification failed: ${reason}`);
    this.name = 'PayPalWebhookVerificationError';
  }
}

/** Headers PayPal signs its webhooks with. */
const SIGNATURE_HEADERS = [
  'paypal-auth-algo',
  'paypal-cert-url',
  'paypal-transmission-id',
  'paypal-transmission-sig',
  'paypal-transmission-time',
] as const;

export type PayPalHeaders = Headers | Record<string, string | string[] | undefined>;

/** Case-insensitive header lookup across Headers objects and plain records. */
function readHeader(headers: PayPalHeaders, name: string): string | null {
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name);
  }
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== target) continue;
    if (Array.isArray(value)) return value[0] ?? null;
    return value == null ? null : String(value);
  }
  return null;
}

function getBaseURL(sandbox?: boolean): string {
  return sandbox
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

/** Web-standard base64. `Buffer` is Node-only and would break Workers/Deno. */
function basicAuth(clientId: string, clientSecret: string): string {
  return btoa(`${clientId}:${clientSecret}`);
}

export function paypalIntegration(config: PayPalConfig) {
  const baseURL = getBaseURL(config.sandbox);

  // Token cache is per-instance, never module-global: two integrations with
  // different credentials must not share a token.
  let cachedToken: { token: string; expiresAt: number } | null = null;
  let inFlight: Promise<string> | null = null;

  /** Tokens live ~9h. Refresh 60s early to avoid using one mid-expiry. */
  async function fetchToken(): Promise<string> {
    const res = await fetch(`${baseURL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth(config.clientId, config.clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return data.access_token;
  }

  async function getToken(): Promise<string> {
    if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
    // Concurrent callers share one request rather than stampeding the endpoint.
    if (!inFlight) {
      inFlight = fetchToken().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  }

  /** Authenticated fetch that retries once on 401 with a fresh token. */
  async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const send = async (token: string) =>
      fetch(url, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

    let res = await send(await getToken());
    if (res.status === 401) {
      cachedToken = null;
      res = await send(await getToken());
    }
    return res;
  }

  return {
    // Create a PayPal order from cart
    async createCheckoutSession(
      cart: Cart,
      options?: {
        customerEmail?: string;
        metadata?: Record<string, string>;
        returnUrl: string;
        cancelUrl: string;
      }
    ): Promise<PayPalOrder> {
      const purchaseUnits = [{
        amount: {
          currency_code: cart.currency.toUpperCase(),
          value: ((cart.total || cart.subtotal || 0) / 100).toFixed(2),
          breakdown: {
            item_total: {
              currency_code: cart.currency.toUpperCase(),
              value: ((cart.subtotal || 0) / 100).toFixed(2),
            },
            shipping: {
              currency_code: cart.currency.toUpperCase(),
              value: ((cart.totalShipping || 0) / 100).toFixed(2),
            },
            tax_total: {
              currency_code: cart.currency.toUpperCase(),
              value: ((cart.totalTax || 0) / 100).toFixed(2),
            },
          },
        },
        items: cart.items.map((item) => ({
          name: item.name,
          sku: item.sku || undefined,
          unit_amount: {
            currency_code: cart.currency.toUpperCase(),
            value: (item.price / 100).toFixed(2),
          },
          quantity: item.quantity,
        })),
        ...(options?.metadata ? { custom_id: JSON.stringify(options.metadata) } : {}),
      }];

      const res = await authedFetch(`${baseURL}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          'PayPal-Request-Id': `req_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: purchaseUnits,
          payer: options?.customerEmail ? { email_address: options.customerEmail } : undefined,
          application_context: {
            return_url: options?.returnUrl,
            cancel_url: options?.cancelUrl,
            shipping_preference: 'SET_PROVIDED_ADDRESS',
            brand_name: 'TillKit Store',
          },
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`PayPal order creation failed: ${res.status} ${err}`);
      }

      const orderData = (await res.json()) as any;
      const approveLink = orderData.links?.find(
        (link: any) => link.rel === 'approve' || link.rel === 'payer-action'
      );

      return {
        id: orderData.id,
        status: orderData.status,
        approvalUrl: approveLink?.href,
        amount: cart.total || cart.subtotal || 0,
        currency: cart.currency,
      };
    },

    // Capture a PayPal order
    async capturePayment(orderId: string): Promise<PayPalCapture> {
      const res = await authedFetch(`${baseURL}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: {
          'PayPal-Request-Id': `capture_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        },
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`PayPal capture failed: ${res.status} ${err}`);
      }

      const data = (await res.json()) as any;
      const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
      const payer = data.payer;

      // Convert dollar string back to cents
      const amountInCents = capture
        ? Math.round(parseFloat(capture.amount.value) * 100)
        : 0;

      return {
        id: capture?.id || data.id,
        status: data.status,
        amount: amountInCents,
        currency: capture?.amount?.currency_code || '',
        payerEmail: payer?.email_address,
        payerId: payer?.payer_id,
        payerName: payer?.name?.given_name
          ? `${payer.name.given_name} ${payer.name.surname || ''}`.trim()
          : undefined,
      };
    },

    // Get order details
    async getOrder(orderId: string): Promise<PayPalOrder> {
      const res = await authedFetch(`${baseURL}/v2/checkout/orders/${orderId}`);
      if (!res.ok) {
        throw new Error(`PayPal get order failed: ${res.status}`);
      }
      const data = (await res.json()) as any;
      const amount = data.purchase_units?.[0]?.amount?.value;
      const currency = data.purchase_units?.[0]?.amount?.currency_code;
      return {
        id: data.id,
        status: data.status,
        amount: amount ? Math.round(parseFloat(amount) * 100) : 0,
        currency: currency || '',
      };
    },

    /**
     * Verify a webhook's provenance with PayPal, then return the parsed event.
     *
     * Async because verification is a network call. Throws rather than
     * returning a falsy value so an unverified event can never be processed by
     * accident.
     */
    async handleWebhook(rawBody: string, headers: PayPalHeaders): Promise<any> {
      if (!config.webhookId) throw new PayPalWebhookNotConfiguredError();

      const signature: Record<string, string> = {};
      for (const name of SIGNATURE_HEADERS) {
        const value = readHeader(headers, name);
        // Never call verify with partial data — a missing header is a forgery
        // signal, not something PayPal can adjudicate.
        if (!value) throw new PayPalWebhookVerificationError(`missing header ${name}`);
        signature[name] = value;
      }

      // Parsed exactly once and passed through untransformed: re-serializing a
      // mutated object changes key order and breaks verification.
      const event = JSON.parse(rawBody);

      const res = await authedFetch(`${baseURL}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        body: JSON.stringify({
          auth_algo: signature['paypal-auth-algo'],
          cert_url: signature['paypal-cert-url'],
          transmission_id: signature['paypal-transmission-id'],
          transmission_sig: signature['paypal-transmission-sig'],
          transmission_time: signature['paypal-transmission-time'],
          webhook_id: config.webhookId,
          webhook_event: event,
        }),
      });

      if (!res.ok) {
        throw new PayPalWebhookVerificationError(
          `verify endpoint returned ${res.status}: ${await res.text()}`,
        );
      }

      // PayPal answers HTTP 200 for both outcomes; the verdict is in the body.
      const { verification_status: status } = (await res.json()) as {
        verification_status?: string;
      };
      if (status !== 'SUCCESS') {
        throw new PayPalWebhookVerificationError(`verification_status=${status}`);
      }

      return event;
    },

    // Process webhook event
    async processWebhookEvent(event: any): Promise<{
      type: 'payment_success' | 'payment_failure' | 'refund' | 'dispute' | 'other';
      data: unknown;
    }> {
      switch (event.event_type) {
        case 'CHECKOUT.ORDER.APPROVED':
        case 'PAYMENT.CAPTURE.COMPLETED': {
          const resource = event.resource || {};
          const captureId = resource.id;
          const amount = resource.amount
            ? Math.round(parseFloat(resource.amount.value) * 100)
            : 0;
          return {
            type: 'payment_success',
            data: {
              orderId: resource.supplementary_data?.related_ids?.order_id,
              captureId,
              amount,
              currency: resource.amount?.currency_code,
              payerEmail: resource.payer?.email_address,
              payerId: resource.payer?.payer_id,
              metadata: resource.purchase_units?.[0]?.custom_id
                ? JSON.parse(resource.purchase_units[0].custom_id)
                : null,
            },
          };
        }
        case 'PAYMENT.CAPTURE.DENIED':
        case 'PAYMENT.CAPTURE.DECLINED': {
          return {
            type: 'payment_failure',
            data: event.resource,
          };
        }
        case 'PAYMENT.CAPTURE.REFUNDED': {
          return {
            type: 'refund',
            data: event.resource,
          };
        }
        // A dispute is not a refund: no money has moved yet. Mapping it to
        // `refund` corrupted paymentStatus.
        case 'CUSTOMER.DISPUTE.CREATED': {
          return {
            type: 'dispute',
            data: event.resource,
          };
        }
        default:
          return { type: 'other', data: event };
      }
    },

    // Create refund
    async refund(captureId: string, amount?: number): Promise<any> {
      const body: any = {};
      if (amount) {
        body.amount = {
          value: (amount / 100).toFixed(2),
          currency_code: 'USD', // TODO(T042): derive from the original capture
        };
      }
      const res = await authedFetch(`${baseURL}/v2/payments/captures/${captureId}/refund`, {
        method: 'POST',
        headers: {
          'PayPal-Request-Id': `refund_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        },
        body: Object.keys(body).length ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`PayPal refund failed: ${res.status} ${err}`);
      }
      return res.json();
    },

    // Create transaction record from PayPal capture data
    createTransactionFromCapture(capture: PayPalCapture): Omit<Transaction, 'id'> {
      return {
        kind: 'sale',
        status: capture.status === 'COMPLETED' ? 'success' : 'pending',
        amount: capture.amount,
        currency: capture.currency.toUpperCase(),
        gateway: 'paypal',
        metadata: { gatewayTransactionId: capture.id },
        processedAt: new Date(),
      };
    },
  };
}

export type PayPalIntegration = ReturnType<typeof paypalIntegration>;
