import { pocketbaseAdapter, type PocketbaseAdapterConfig } from '@tillkit/adapter-pocketbase';
import { stripeIntegration, type StripeConfig } from '@tillkit/integration-stripe';

// Environment configuration
export const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://localhost:8090';
export const POCKETBASE_ADMIN_TOKEN = process.env.POCKETBASE_ADMIN_TOKEN;
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
export const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Initialize database
const dbConfig: PocketbaseAdapterConfig = { url: POCKETBASE_URL };
if (POCKETBASE_ADMIN_TOKEN) {
  dbConfig.adminToken = POCKETBASE_ADMIN_TOKEN;
}
export const database = pocketbaseAdapter(dbConfig);

// Initialize Stripe if credentials present
export const stripe =
  STRIPE_SECRET_KEY && STRIPE_PUBLISHABLE_KEY
    ? stripeIntegration({
        provider: 'stripe',
        secretKey: STRIPE_SECRET_KEY,
        publishableKey: STRIPE_PUBLISHABLE_KEY,
        successUrl: `${APP_URL}/checkout/success`,
        cancelUrl: `${APP_URL}/checkout/cancel`,
      } satisfies StripeConfig)
    : null;

// Helper: Get or create session ID
export function getSessionId(c: any): string {
  const cookie = c.req.header('cookie') || '';
  const match = cookie.match(/sessionId=([^;]+)/);
  return match ? match[1] : crypto.randomUUID();
}

export function setSessionCookie(c: any, sessionId: string) {
  c.header(
    'Set-Cookie',
    `sessionId=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
    { append: true },
  );
}

/**
 * Escape a string for interpolation into HTML text.
 *
 * `layout()` interpolates `flashMessage` raw, and the messages built from
 * revalidation carry product names straight out of the database.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A one-shot message carried across a redirect in a cookie.
 *
 * `take` clears it, so a message shown once is not shown again on refresh.
 * Values are URI-encoded because a cookie may not contain `;` or `,`.
 */
const FLASH_COOKIE = 'tillkit_flash';

export function setFlash(c: any, message: string) {
  c.header(
    'Set-Cookie',
    `${FLASH_COOKIE}=${encodeURIComponent(message)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=30`,
    { append: true },
  );
}

export function takeFlash(c: any): string | undefined {
  const match = (c.req.header('cookie') || '').match(new RegExp(`${FLASH_COOKIE}=([^;]+)`));
  if (!match) return undefined;
  c.header('Set-Cookie', `${FLASH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`, {
    append: true,
  });
  return decodeURIComponent(match[1]);
}

// HTML Layout
export const layout = (title: string, content: string, flashMessage?: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | TillKit</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="https://unpkg.com/htmx.org@1.9.10"></script>
</head>
<body>
  <nav>
    <a href="/">TillKit</a>
    <a href="/products">Products</a>
    <a href="/cart">Cart (<span id="cart-count"></span>)</a>
    ${stripe ? '<a href="/admin/orders">Admin</a>' : ''}
  </nav>
  <main>
    ${flashMessage ? `<div class="flash flash-${flashMessage.includes('Error') ? 'error' : 'success'}">${flashMessage}</div>` : ''}
    ${content}
  </main>
  <script>
    document.body.addEventListener('htmx:afterRequest', function(evt) {
      if (evt.detail.xhr.getResponseHeader('X-Cart-Updated')) {
        updateCartCount();
      }
    });
    function updateCartCount() {
      fetch('/cart/count')
        .then(r => r.text())
        .then(count => document.getElementById('cart-count').textContent = count);
    }
    updateCartCount();
  </script>
</body>
</html>`;
