# Feature Specification: Storefront Starter Template

**Feature Branch**: `010-storefront-starter`

**Created**: 2026-07-09

**Status**: Implemented (backfilled)

**Input**: Backfilled from implementation audit

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and buy from the reference store (Priority: P1)

A shopper visits the starter store: home page with 6 featured products, `/products` listing with search, `/products/:slug` detail, a session-cookie cart with HTMX add/update/remove and a live nav cart count, and Stripe checkout.

**Why this priority**: `templates/starter` is the working store every TillKit project begins from — it is the product demo, the integration test bed, and the scaffolding source.

**Independent Test**: With PocketBase seeded and Stripe test keys, walk home → product → add to cart → cart → checkout and verify each page server-renders and works with JavaScript disabled (except the cart-count badge, which is progressive enhancement).

**Acceptance Scenarios**:

1. **Given** seeded products, **When** the shopper opens `/`, **Then** 6 featured products render server-side (`database.products.list({ limit: 6 })`).
2. **Given** `/products?q=term`, **When** Meilisearch is configured, **Then** results come from the search service; otherwise `database.products.search` answers — same page, no error (graceful degradation).
3. **Given** a product page, **When** "Add to Cart" is submitted, **Then** the item is added under the shopper's `sessionId` cookie, the response sets `X-Cart-Updated`, and the nav badge refreshes via the `/cart/count` fetch listener.
4. **Given** Stripe is not configured, **When** the shopper views the cart, **Then** the checkout button is replaced by a "Checkout unavailable - Stripe not configured" notice.

---

### User Story 2 - Boot with only the integrations you have (Priority: P2)

A developer runs the starter with just PocketBase and gets a working store; adding `STRIPE_SECRET_KEY`+`STRIPE_WEBHOOK_SECRET` enables subscription billing, adding `MEILISEARCH_HOST`+`MEILISEARCH_API_KEY` enables Meilisearch — each choice is logged at startup.

**Independent Test**: Boot with an empty env and confirm the log announces the database-search fallback and the app serves pages; add each env pair and confirm the corresponding route/feature appears.

**Acceptance Scenarios**:

1. **Given** no Meilisearch env vars, **When** the server boots, **Then** it logs "Using database search fallback" and `/api/search` is not mounted.
2. **Given** Stripe subscription env vars, **When** the server boots, **Then** `createStripeSubscriptionProvider` is constructed and `/api/subscriptions` is mounted; otherwise it is absent.
3. **Given** Meilisearch init throws, **Then** the error is logged and boot continues without search (no startup crash).

---

### User Story 3 - Compose the app as a factory (Priority: P3)

A developer calls `createStarterApp({ database, stripe, search?, subscriptionProvider? })` to get a Hono app they can serve on any Node host, with the server package's admin and subscription route factories mounted inside.

**Independent Test**: Construct the app in a test with a mock adapter and exercise routes without binding a port (as `src/smoke.test.ts` does).

**Acceptance Scenarios**:

1. **Given** the factory, **When** called, **Then** it builds its own Hono app — it deliberately does not call `createHonoApp`; the starter owns storefront HTML and mounts `createAdminRoutes` at `/admin` and (conditionally) `createSubscriptionRoutes` at `/api/subscriptions` directly. This is intentional architecture, not drift.
2. **Given** `/styles.css`, **Then** the CSS is read from disk with `node:fs/promises` (Node-only APIs are acceptable in `templates/*` per constitution VI).

---

### Edge Cases

- Cart fetch errors are caught: `/cart/count` returns `"0"`, `/cart` renders the empty state — no 500s from a cold PocketBase.
- `getSessionId` falls back to `crypto.randomUUID()` when no cookie exists; the cookie is set (30-day `Max-Age`, `HttpOnly`, `SameSite=Lax`) on cart routes.
- Cart line totals prefer `item.lineTotal` and fall back to `price * quantity`; all arithmetic in integer cents, `formatPrice` only at display.
- Product names, descriptions, and the search query echo are interpolated into HTML without escaping — a product named `<script>…` executes in shoppers' browsers. [GAP]
- Nav "Admin" link renders only when `stripe` is configured — an unrelated condition; a Stripe-less store has admin mounted but unlinked. [GAP — minor]

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The starter MUST serve home (6 products), `/products` (+`?q` search), `/products/:slug`, `/cart` (+ `/cart/count`, `/cart/add`, `/cart/update`, `/cart/remove`), `/checkout` (mounted `checkoutRouter`), and `/webhooks` (mounted `webhooksRouter`) as server-rendered HTML.
- **FR-002**: Optional integrations (Stripe checkout, Stripe subscriptions, Meilisearch) MUST be env-gated at boot, log their fallback choice, and never crash the app when absent.
- **FR-003**: The cart MUST be keyed by an `HttpOnly` session cookie and remain fully usable without client JavaScript; the cart-count badge is progressive enhancement only.
- **FR-004**: All prices MUST flow as integer cents, formatted via `formatPrice` at display only.
- **FR-005**: `createStarterApp` MUST accept its dependencies (`database`, `stripe`, `search?`, `subscriptionProvider?`) so tests can inject fakes.
- **FR-006**: All interpolated user/product data MUST be HTML-escaped. [GAP]
- **FR-007**: The storefront MUST work without third-party CDNs. [GAP — HTMX 1.9.10 from unpkg; also skewed vs admin's 1.9.12]
- **FR-008**: The nav Admin link SHOULD be gated on admin availability, not on Stripe configuration. [GAP]
- **FR-009**: The listening port SHOULD honor `PORT`. [GAP — `serve` hardcodes 3000 despite `.env.example`/generated config mentioning `PORT`]

### Key Entities *(include if feature involves data)*

- **Cart**: session-scoped; items carry `productId`, `name`, `sku` (slug), `price` (cents), `quantity`, optional `image`.
- **Product**: read-only in the storefront; `images` are URL objects; `slug` is the public identifier.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fresh clone with only PocketBase reaches a browsable, cart-capable store in one command — zero optional env vars required.
- **SC-002**: Every storefront flow (browse, search, cart mutate) completes with JavaScript disabled.
- **SC-003**: Toggling each optional env pair adds/removes its feature with no code changes and no startup failures.
- **SC-004**: 0 stored-XSS vectors from product data (currently fails FR-006).

## Assumptions

- PocketBase is the assumed dev database (`app-context.ts` constructs `pocketbaseAdapter` directly); swapping adapters means editing that module.
- `app-context.ts` module-level singletons (`database`, `stripe`, env constants, `layout`) imported by route files are the current composition pattern — accepted for the template, refactor not required by this spec.
- Currency is hardcoded `USD` at display call sites.

## Known Gaps

- No HTML escaping of interpolated product/search data (FR-006) — XSS.
- HTMX from unpkg CDN, and version skew: starter 1.9.10 vs admin 1.9.12 (FR-007).
- Admin nav link conditioned on Stripe presence (FR-008).
- Port 3000 hardcoded in `src/index.ts` (FR-009).

## Existing Implementation (reference)

- `templates/starter/src/index.ts` — boot, env-gating, `@hono/node-server` on port 3000.
- `templates/starter/src/app.ts` — `createStarterApp`, storefront pages, route mounting, `/styles.css`.
- `templates/starter/src/app-context.ts` — singletons, session helpers, `layout()` with cart-count script.
- `templates/starter/src/routes/checkout.ts`, `templates/starter/src/routes/webhooks.ts` — mounted routers (specs 004/005).
- `templates/starter/src/smoke.test.ts` — 6 smoke tests.
