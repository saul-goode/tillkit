import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { paypalIntegration } from '../index.js';

const TOKEN_URL = 'https://api-m.sandbox.paypal.com/v1/oauth2/token';
const ORDER_URL = 'https://api-m.sandbox.paypal.com/v2/checkout/orders/order-1';

const CONFIG = {
  provider: 'paypal' as const,
  clientId: 'test-client',
  clientSecret: 'test-secret',
  webhookId: 'WH-TEST-123',
  sandbox: true,
};

const ORDER_RESPONSE = {
  id: 'order-1',
  status: 'COMPLETED',
  purchase_units: [{ amount: { value: '19.99', currency_code: 'USD' } }],
};

function tokenCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter((c) => c[0].toString() === TOKEN_URL);
}

describe('PayPal OAuth token caching', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('fetches a token once and reuses it across calls within the window', async () => {
    let issued = 0;
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = url.toString();
      if (href === TOKEN_URL) {
        issued++;
        return new Response(
          JSON.stringify({ access_token: `tok-${issued}`, expires_in: 32400 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(ORDER_RESPONSE), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const paypal = paypalIntegration(CONFIG);
    await paypal.getOrder('order-1');
    await paypal.getOrder('order-1');
    await paypal.getOrder('order-1');

    expect(tokenCalls(fetchMock)).toHaveLength(1);
  });

  it('refreshes the token once it is within 60s of expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T00:00:00Z'));

    const fetchMock = vi.fn(async (url: string | URL) => {
      if (url.toString() === TOKEN_URL) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 120 }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(ORDER_RESPONSE), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const paypal = paypalIntegration(CONFIG);
    await paypal.getOrder('order-1');
    expect(tokenCalls(fetchMock)).toHaveLength(1);

    // 30s later: still inside the window (120 - 60 = 60s of usable life).
    vi.setSystemTime(new Date('2026-07-09T00:00:30Z'));
    await paypal.getOrder('order-1');
    expect(tokenCalls(fetchMock)).toHaveLength(1);

    // 70s in: past expires_in - 60s, so a refresh is required.
    vi.setSystemTime(new Date('2026-07-09T00:01:10Z'));
    await paypal.getOrder('order-1');
    expect(tokenCalls(fetchMock)).toHaveLength(2);
  });

  it('concurrent callers share one in-flight token request (no stampede)', async () => {
    let resolveToken: (v: Response) => void;
    const tokenPromise = new Promise<Response>((r) => (resolveToken = r));

    const fetchMock = vi.fn(async (url: string | URL) => {
      if (url.toString() === TOKEN_URL) return tokenPromise;
      return new Response(JSON.stringify(ORDER_RESPONSE), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const paypal = paypalIntegration(CONFIG);
    const all = Promise.all([
      paypal.getOrder('order-1'),
      paypal.getOrder('order-1'),
      paypal.getOrder('order-1'),
    ]);

    resolveToken!(
      new Response(JSON.stringify({ access_token: 'tok', expires_in: 32400 }), { status: 200 }),
    );
    await all;

    expect(tokenCalls(fetchMock)).toHaveLength(1);
  });

  it('re-fetches exactly once when the API returns 401', async () => {
    let orderAttempts = 0;
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = url.toString();
      if (href === TOKEN_URL) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 32400 }), {
          status: 200,
        });
      }
      if (href === ORDER_URL) {
        orderAttempts++;
        // First attempt: stale token. Retry succeeds.
        if (orderAttempts === 1) return new Response('unauthorized', { status: 401 });
        return new Response(JSON.stringify(ORDER_RESPONSE), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${href}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const paypal = paypalIntegration(CONFIG);
    const order = await paypal.getOrder('order-1');

    expect(order.amount).toBe(1999);
    expect(orderAttempts).toBe(2);
    // Initial token + one refresh after the 401. Not more.
    expect(tokenCalls(fetchMock)).toHaveLength(2);
  });

  it('does not share a token cache across integration instances', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (url.toString() === TOKEN_URL) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 32400 }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(ORDER_RESPONSE), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    // Different credentials must not reuse each other's token.
    await paypalIntegration(CONFIG).getOrder('order-1');
    await paypalIntegration({ ...CONFIG, clientId: 'other' }).getOrder('order-1');

    expect(tokenCalls(fetchMock)).toHaveLength(2);
  });
});
