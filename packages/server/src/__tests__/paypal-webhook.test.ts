import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { createPayPalWebhookRoutes } from '../routes/paypal-webhooks.js';
import {
  PayPalWebhookNotConfiguredError,
  PayPalWebhookVerificationError,
} from '@tillkit/integration-paypal';
import type { DatabaseAdapter } from '@tillkit/core';

const FORGED_BODY = JSON.stringify({
  id: 'WH-FORGED',
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  resource: { id: 'cap-forged', amount: { value: '999.00', currency_code: 'USD' } },
});

/** Minimal database stub that records any write attempt. */
function createSpyDatabase() {
  const writes: string[] = [];
  const db = {
    orders: {
      create: vi.fn(async () => {
        writes.push('orders.create');
        return { id: 'o1' };
      }),
      addTransaction: vi.fn(async () => {
        writes.push('orders.addTransaction');
      }),
    },
  } as unknown as DatabaseAdapter;
  return { db, writes };
}

function mountRoute(paypal: any, onPaymentSuccess?: any) {
  const { db, writes } = createSpyDatabase();
  const app = new Hono();
  app.route('/webhooks', createPayPalWebhookRoutes({ database: db, paypal, onPaymentSuccess }));
  return { app, writes };
}

describe('PayPal webhook route', () => {
  it('rejects a forged payload with 400 and performs no writes', async () => {
    const onPaymentSuccess = vi.fn();
    const paypal = {
      // A real integration throws here — nothing downstream should run.
      handleWebhook: vi.fn(async () => {
        throw new PayPalWebhookVerificationError('verification_status=FAILURE');
      }),
      processWebhookEvent: vi.fn(),
    };
    const { app, writes } = mountRoute(paypal, onPaymentSuccess);

    const res = await app.request('/webhooks/paypal', { method: 'POST', body: FORGED_BODY });

    expect(res.status).toBe(400);
    expect(paypal.processWebhookEvent).not.toHaveBeenCalled();
    expect(onPaymentSuccess).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('fails closed with 400 when the webhook id is not configured', async () => {
    const paypal = {
      handleWebhook: vi.fn(async () => {
        throw new PayPalWebhookNotConfiguredError();
      }),
      processWebhookEvent: vi.fn(),
    };
    const { app, writes } = mountRoute(paypal);

    const res = await app.request('/webhooks/paypal', { method: 'POST', body: FORGED_BODY });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Webhook verification not configured' });
    expect(paypal.processWebhookEvent).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('processes a verified event', async () => {
    const onPaymentSuccess = vi.fn();
    const paypal = {
      handleWebhook: vi.fn(async () => ({ id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' })),
      processWebhookEvent: vi.fn(async () => ({
        type: 'payment_success',
        data: { captureId: 'cap-1', amount: 1999, currency: 'USD' },
      })),
    };
    const { app } = mountRoute(paypal, onPaymentSuccess);

    const res = await app.request('/webhooks/paypal', { method: 'POST', body: '{}' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(onPaymentSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ captureId: 'cap-1', amount: 1999 }),
    );
  });

  it('passes the raw body and request headers to the verifier', async () => {
    const paypal = {
      handleWebhook: vi.fn(async () => ({ event_type: 'OTHER' })),
      processWebhookEvent: vi.fn(async () => ({ type: 'other', data: {} })),
    };
    const { app } = mountRoute(paypal);

    await app.request('/webhooks/paypal', {
      method: 'POST',
      body: FORGED_BODY,
      headers: { 'paypal-transmission-id': 'tx-1' },
    });

    const [rawBody, headers] = paypal.handleWebhook.mock.calls[0] as [string, Headers];
    expect(rawBody).toBe(FORGED_BODY); // exact bytes — re-serializing breaks verification
    expect(headers.get('paypal-transmission-id')).toBe('tx-1');
  });

  it('returns a retryable 5xx when a verified event fails during processing', async () => {
    const paypal = {
      handleWebhook: vi.fn(async () => ({ event_type: 'PAYMENT.CAPTURE.COMPLETED' })),
      processWebhookEvent: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
    };
    const { app } = mountRoute(paypal);

    const res = await app.request('/webhooks/paypal', { method: 'POST', body: '{}' });

    // Must not be a terminal 400 — the gateway should redeliver.
    expect(res.status).toBe(500);
  });
});
