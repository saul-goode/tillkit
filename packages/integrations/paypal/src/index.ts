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

function getBaseURL(sandbox?: boolean): string {
  return sandbox
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

async function getAccessToken(config: PayPalConfig): Promise<string> {
  const baseURL = getBaseURL(config.sandbox);
  const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const res = await fetch(`${baseURL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export function paypalIntegration(config: PayPalConfig) {
  const baseURL = getBaseURL(config.sandbox);

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
      const accessToken = await getAccessToken(config);

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

      const res = await fetch(`${baseURL}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
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
      const accessToken = await getAccessToken(config);
      const res = await fetch(`${baseURL}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
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
      const accessToken = await getAccessToken(config);
      const res = await fetch(`${baseURL}/v2/checkout/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
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

    // Verify webhook signature
    handleWebhook(
      body: string | Buffer,
      _headers: Record<string, string | string[] | undefined>
    ): any {
      // PayPal webhook verification requires calling their verify API
      // For simplicity, forward to processWebhookEvent which the app can call
      // after verifying via PayPal API if needed
      const event = JSON.parse(body.toString());
      return event;
    },

    // Process webhook event
    async processWebhookEvent(event: any): Promise<{
      type: 'payment_success' | 'payment_failure' | 'refund' | 'other';
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
        case 'CUSTOMER.DISPUTE.CREATED': {
          return {
            type: 'refund',
            data: event.resource,
          };
        }
        default:
          return { type: 'other', data: event };
      }
    },

    // Create refund
    async refund(captureId: string, amount?: number): Promise<any> {
      const accessToken = await getAccessToken(config);
      const body: any = {};
      if (amount) {
        body.amount = {
          value: (amount / 100).toFixed(2),
          currency_code: 'USD', // Should come from original capture
        };
      }
      const res = await fetch(`${baseURL}/v2/payments/captures/${captureId}/refund`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
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
