import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  paypalIntegration,
  PayPalWebhookNotConfiguredError,
  PayPalWebhookVerificationError,
} from '../index.js';

const TOKEN_URL = 'https://api-m.sandbox.paypal.com/v1/oauth2/token';
const VERIFY_URL =
  'https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature';

const CONFIG = {
  provider: 'paypal' as const,
  clientId: 'test-client',
  clientSecret: 'test-secret',
  webhookId: 'WH-TEST-123',
  sandbox: true,
};

/** Headers PayPal actually sends, in the casing it sends them. */
function paypalHeaders(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string> = {
    'PAYPAL-AUTH-ALGO': 'SHA256withRSA',
    'PAYPAL-CERT-URL': 'https://api.sandbox.paypal.com/cert.pem',
    'PAYPAL-TRANSMISSION-ID': 'tx-id-1',
    'PAYPAL-TRANSMISSION-SIG': 'sig-abc',
    'PAYPAL-TRANSMISSION-TIME': '2026-07-09T12:00:00Z',
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete base[k];
    else base[k] = v;
  }
  return base;
}

const EVENT_BODY = JSON.stringify({
  id: 'WH-EVT-1',
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  resource: { id: 'cap-1', amount: { value: '19.99', currency_code: 'USD' } },
});

/** Mock fetch: token endpoint always OK; verify endpoint returns `status`. */
function mockFetch(verificationStatus: string, opts: { tokenExpiresIn?: number } = {}) {
  return vi.fn(async (url: string | URL, _init?: RequestInit) => {
    const href = url.toString();
    if (href === TOKEN_URL) {
      return new Response(
        JSON.stringify({ access_token: 'tok-1', expires_in: opts.tokenExpiresIn ?? 32400 }),
        { status: 200 },
      );
    }
    if (href === VERIFY_URL) {
      // PayPal returns HTTP 200 for both SUCCESS and FAILURE.
      return new Response(JSON.stringify({ verification_status: verificationStatus }), {
        status: 200,
      });
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
}

describe('PayPal webhook verification', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('accepts an event when verification_status is SUCCESS', async () => {
    const fetchMock = mockFetch('SUCCESS');
    vi.stubGlobal('fetch', fetchMock);

    const paypal = paypalIntegration(CONFIG);
    const event = await paypal.handleWebhook(EVENT_BODY, paypalHeaders());

    expect(event.id).toBe('WH-EVT-1');
    expect(event.event_type).toBe('PAYMENT.CAPTURE.COMPLETED');
  });

  it('rejects when verification_status is FAILURE, despite HTTP 200', async () => {
    vi.stubGlobal('fetch', mockFetch('FAILURE'));

    const paypal = paypalIntegration(CONFIG);
    await expect(paypal.handleWebhook(EVENT_BODY, paypalHeaders())).rejects.toBeInstanceOf(
      PayPalWebhookVerificationError,
    );
  });

  it('fails closed when webhookId is not configured', async () => {
    const fetchMock = mockFetch('SUCCESS');
    vi.stubGlobal('fetch', fetchMock);

    const paypal = paypalIntegration({ ...CONFIG, webhookId: undefined });
    await expect(paypal.handleWebhook(EVENT_BODY, paypalHeaders())).rejects.toBeInstanceOf(
      PayPalWebhookNotConfiguredError,
    );
    // Must never reach the verify endpoint, and never process the event.
    const verifyCalls = fetchMock.mock.calls.filter((c) => c[0].toString() === VERIFY_URL);
    expect(verifyCalls).toHaveLength(0);
  });

  it.each([
    'PAYPAL-AUTH-ALGO',
    'PAYPAL-CERT-URL',
    'PAYPAL-TRANSMISSION-ID',
    'PAYPAL-TRANSMISSION-SIG',
    'PAYPAL-TRANSMISSION-TIME',
  ])('rejects when %s is missing', async (header) => {
    const fetchMock = mockFetch('SUCCESS');
    vi.stubGlobal('fetch', fetchMock);

    const paypal = paypalIntegration(CONFIG);
    await expect(
      paypal.handleWebhook(EVENT_BODY, paypalHeaders({ [header]: undefined })),
    ).rejects.toBeInstanceOf(PayPalWebhookVerificationError);

    // Never call verify with partial data.
    expect(fetchMock.mock.calls.filter((c) => c[0].toString() === VERIFY_URL)).toHaveLength(0);
  });

  it('reads headers case-insensitively from a Headers object', async () => {
    vi.stubGlobal('fetch', mockFetch('SUCCESS'));

    const paypal = paypalIntegration(CONFIG);
    const headers = new Headers(paypalHeaders());
    const event = await paypal.handleWebhook(EVENT_BODY, headers);
    expect(event.id).toBe('WH-EVT-1');
  });

  it('sends the untransformed parsed event and maps headers to postback fields', async () => {
    const fetchMock = mockFetch('SUCCESS');
    vi.stubGlobal('fetch', fetchMock);

    const paypal = paypalIntegration(CONFIG);
    await paypal.handleWebhook(EVENT_BODY, paypalHeaders());

    const verifyCall = fetchMock.mock.calls.find((c) => c[0].toString() === VERIFY_URL)!;
    const body = JSON.parse((verifyCall[1] as RequestInit).body as string);

    expect(body).toMatchObject({
      auth_algo: 'SHA256withRSA',
      cert_url: 'https://api.sandbox.paypal.com/cert.pem',
      transmission_id: 'tx-id-1',
      transmission_sig: 'sig-abc',
      transmission_time: '2026-07-09T12:00:00Z',
      webhook_id: 'WH-TEST-123',
    });
    // webhook_event must be the parsed object, byte-equivalent to what arrived.
    expect(body.webhook_event).toEqual(JSON.parse(EVENT_BODY));
  });

  it('rejects a forged payload that carries no PayPal headers at all', async () => {
    const fetchMock = mockFetch('SUCCESS');
    vi.stubGlobal('fetch', fetchMock);

    const paypal = paypalIntegration(CONFIG);
    await expect(paypal.handleWebhook(EVENT_BODY, {})).rejects.toBeInstanceOf(
      PayPalWebhookVerificationError,
    );
    expect(fetchMock.mock.calls.filter((c) => c[0].toString() === VERIFY_URL)).toHaveLength(0);
  });
});

describe('PayPal event vocabulary', () => {
  it('maps a dispute to `dispute`, not `refund`', async () => {
    const paypal = paypalIntegration(CONFIG);
    const result = await paypal.processWebhookEvent({
      event_type: 'CUSTOMER.DISPUTE.CREATED',
      resource: { dispute_id: 'd-1' },
    });
    expect(result.type).toBe('dispute');
  });

  it('maps an actual refund to `refund`', async () => {
    const paypal = paypalIntegration(CONFIG);
    const result = await paypal.processWebhookEvent({
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: { id: 'r-1' },
    });
    expect(result.type).toBe('refund');
  });

  it('converts capture amounts to integer cents', async () => {
    const paypal = paypalIntegration(CONFIG);
    const result = await paypal.processWebhookEvent({
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'cap-1', amount: { value: '19.99', currency_code: 'USD' } },
    });
    expect(result.type).toBe('payment_success');
    expect((result.data as { amount: number }).amount).toBe(1999);
  });
});
