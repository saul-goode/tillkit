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

/**
 * Minimal database stub that records any write attempt and keeps a real
 * webhook-event ledger. `claim` is atomic here because JS is single-threaded —
 * a Map check-and-set cannot be preempted. The database-level guarantee is
 * proved by the adapter contract suite, not here.
 */
function createSpyDatabase() {
  const writes: string[] = [];
  const events = new Map<string, any>();
  const key = (g: string, e: string) => `${g}:${e}`;

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
    webhookEvents: {
      async claim(event: { gateway: string; eventId: string; eventType: string }) {
        const k = key(event.gateway, event.eventId);
        const existing = events.get(k);
        if (existing) return { claimed: false, existing };
        events.set(k, { ...event, outcome: 'processed' });
        return { claimed: true };
      },
      async complete(gateway: string, eventId: string, result: any) {
        const row = events.get(key(gateway, eventId));
        if (row) Object.assign(row, result);
      },
      async release(gateway: string, eventId: string) {
        events.delete(key(gateway, eventId));
      },
      async get(gateway: string, eventId: string) {
        return events.get(key(gateway, eventId)) ?? null;
      },
    },
  } as unknown as DatabaseAdapter;
  return { db, writes };
}

function mountRoute(paypal: any, onPaymentSuccess?: any) {
  const { db, writes } = createSpyDatabase();
  const app = new Hono();
  app.route('/webhooks', createPayPalWebhookRoutes({ database: db, paypal, onPaymentSuccess }));
  return { app, writes, db };
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
      handleWebhook: vi.fn(async () => ({ id: 'WH-2', event_type: 'OTHER' })),
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
      handleWebhook: vi.fn(async () => ({ id: 'WH-3', event_type: 'PAYMENT.CAPTURE.COMPLETED' })),
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

describe('PayPal webhook route — exactly-once', () => {
  function verifiedPayPal(overrides: Record<string, unknown> = {}) {
    return {
      handleWebhook: vi.fn(async () => ({ id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' })),
      processWebhookEvent: vi.fn(async () => ({
        type: 'payment_success',
        data: { captureId: 'cap-1', amount: 1999, currency: 'USD' },
      })),
      ...overrides,
    } as any;
  }

  it('runs side effects once and deduplicates a redelivered event', async () => {
    const onPaymentSuccess = vi.fn();
    const { app } = mountRoute(verifiedPayPal(), onPaymentSuccess);

    await app.request('/webhooks/paypal', { method: 'POST', body: '{}' });
    const res = await app.request('/webhooks/paypal', { method: 'POST', body: '{}' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, deduplicated: true });
    expect(onPaymentSuccess).toHaveBeenCalledTimes(1);
  });

  it('records the processed event in the ledger', async () => {
    const { app, db } = mountRoute(verifiedPayPal(), vi.fn());

    await app.request('/webhooks/paypal', { method: 'POST', body: '{}' });

    expect((await db.webhookEvents.get('paypal', 'WH-1'))?.outcome).toBe('processed');
  });

  it('releases the claim when processing fails, so the redelivery can retry', async () => {
    let attempts = 0;
    const onPaymentSuccess = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new Error('transient');
    });
    const { app, db } = mountRoute(verifiedPayPal(), onPaymentSuccess);

    const first = await app.request('/webhooks/paypal', { method: 'POST', body: '{}' });
    expect(first.status).toBe(500);
    // A claim left behind would make this payment's side effects unrecoverable.
    expect(await db.webhookEvents.get('paypal', 'WH-1')).toBeNull();

    const second = await app.request('/webhooks/paypal', { method: 'POST', body: '{}' });
    expect(second.status).toBe(200);
    expect(attempts).toBe(2);
  });

  it('claims nothing when verification fails', async () => {
    const paypal = verifiedPayPal({
      handleWebhook: vi.fn(async () => {
        throw new PayPalWebhookVerificationError('verification_status=FAILURE');
      }),
    });
    const { app, db } = mountRoute(paypal);

    expect((await app.request('/webhooks/paypal', { method: 'POST', body: FORGED_BODY })).status).toBe(400);
    expect(await db.webhookEvents.get('paypal', 'WH-FORGED')).toBeNull();
  });

  it('rejects a verified event that carries no id rather than claiming a blank one', async () => {
    // Claiming under a placeholder id would swallow every later id-less event.
    const paypal = verifiedPayPal({
      handleWebhook: vi.fn(async () => ({ event_type: 'PAYMENT.CAPTURE.COMPLETED' })),
    });
    const { app } = mountRoute(paypal, vi.fn());

    const res = await app.request('/webhooks/paypal', { method: 'POST', body: '{}' });

    expect(res.status).toBe(400);
    expect(paypal.processWebhookEvent).not.toHaveBeenCalled();
  });

  it('acknowledges an unrecognized event type as ignored', async () => {
    const paypal = verifiedPayPal({
      processWebhookEvent: vi.fn(async () => ({ type: 'other', data: {} })),
    });
    const { app, db } = mountRoute(paypal);

    const res = await app.request('/webhooks/paypal', { method: 'POST', body: '{}' });

    expect(res.status).toBe(200);
    expect((await db.webhookEvents.get('paypal', 'WH-1'))?.outcome).toBe('ignored');
  });

  it('records a refund as processed, not ignored', async () => {
    const paypal = verifiedPayPal({
      processWebhookEvent: vi.fn(async () => ({ type: 'refund', data: { captureId: 'cap-1' } })),
    });
    const { app, db } = mountRoute(paypal);

    await app.request('/webhooks/paypal', { method: 'POST', body: '{}' });

    // Recognized-but-unrouted is not the same as unrecognized.
    expect((await db.webhookEvents.get('paypal', 'WH-1'))?.outcome).toBe('processed');
  });
});
