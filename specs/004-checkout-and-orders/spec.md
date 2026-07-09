# Feature Specification: Checkout & Order Creation

**Feature Branch**: `004-checkout-and-orders`

**Created**: 2026-07-09

**Status**: Implemented (backfilled)

**Input**: Backfilled from implementation audit

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pay for a cart with Stripe Checkout (Priority: P1)

A shopper with items in their cart clicks "Proceed to Checkout", is redirected to Stripe-hosted Checkout, pays, and lands on a success page showing their order number. Behind the scenes an order exists with a `sale` transaction, the cart is cleared, and inventory is decremented.

**Why this priority**: This is the money path — the reason the kit exists.

**Independent Test**: With Stripe test keys, complete a checkout with card `4242…`; verify order record, transaction, empty cart, decremented stock.

**Acceptance Scenarios**:

1. **Given** a cart with one item at price 1999, **When** the shopper POSTs `/checkout`, **Then** they are redirected to a Stripe Checkout session whose line items total 1999 cents and whose metadata carries the cart id.
2. **Given** a paid Stripe session, **When** the shopper returns to `/checkout/success?session_id=…`, **Then** an order is created with `status: paid`, `paymentStatus: paid`, a `sale` transaction (gateway `stripe`, amount = `session.amount_total`), the cart is cleared, and inventory decrements per item.
3. **Given** an unpaid or pending session, **When** the success page loads, **Then** no order is created and a "Payment Pending" page renders.
4. **Given** Stripe is not configured, **When** the shopper visits the cart, **Then** checkout is replaced by a "Checkout unavailable" notice (constitution III) and POST `/checkout` returns an explanatory error page.

---

### User Story 2 - Pay with PayPal (Priority: P2)

A shopper checks out via PayPal Orders v2: an order is created with the cart's amount breakdown, the shopper approves on PayPal, the payment is captured, and a TillKit order is created from the capture.

**Acceptance Scenarios**:

1. **Given** a cart, **When** a PayPal checkout session is created, **Then** the purchase unit's amount breakdown (item_total, shipping, tax_total) converts integer cents to PayPal decimal strings at the integration boundary only.
2. **Given** an approved PayPal order, **When** payment is captured, **Then** `createOrderFromPayPalCapture` creates an order with a `paypal` transaction and the capture amount converted back to cents.

---

### User Story 3 - Cancel and resume (Priority: P3)

A shopper who abandons Stripe Checkout returns via `/checkout/cancel` and finds their cart intact.

**Acceptance Scenarios**:

1. **Given** an in-progress checkout, **When** the shopper cancels, **Then** the cancel page renders and the cart still contains all items.

---

### Edge Cases

- Success page reached twice for the same session (refresh, back button): a second order MUST NOT be created. [GAP — `createOrderFromStripeSession` has no idempotency check; a refresh before cart clearing completes can double-create]
- Cart cleared or expired between payment and success-page visit: order creation returns `null`, "Payment Pending" renders — but payment was taken. Recovery relies on the webhook path.
- `session.customer_email` absent: order email falls back to `unknown@example.com`. [GAP — placeholder email on a real paid order; should be resolved from Stripe customer or made a hard failure]
- Shipping name splitting (`firstName` = first token) mangles multi-word first names — acceptable, documented.
- Stripe amounts are already integer cents; PayPal decimal strings convert with `Math.round(parseFloat(v) * 100)` immediately at the boundary.
- Checkout currently sends only `price_data` built from cart items — product price changes between add-to-cart and checkout are honored from the cart snapshot, not re-validated. [GAP — no server-side price/inventory revalidation at checkout time]

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Checkout MUST create a Stripe Checkout session (mode `payment`) from the cart with line items in integer cents, `billing_address_collection: required`, shipping address collection, and the cart id in metadata.
- **FR-002**: Order creation from a Stripe session MUST verify `payment_status === 'paid'` before creating anything.
- **FR-003**: A successful order creation MUST atomically-in-effect: create the order (items snapshot, subtotal, total from `amount_total`, currency uppercased, shipping address), append a `sale` transaction with session/payment-intent ids in metadata, clear the cart, and decrement inventory.
- **FR-004**: Order creation MUST be idempotent per Stripe session id — the same session can never produce two orders. Enforced by a unique `(gateway, gatewayRef)` index and insert-and-catch, not by a check-then-insert (spec 018).
- **FR-005**: The success page MUST display the created order's `orderNumber`.
- **FR-006**: When the payment integration is absent, every checkout entry point MUST degrade to an informative non-crashing state.
- **FR-007**: PayPal checkout MUST convert cents↔decimal strings only at the integration boundary and carry cart metadata via `custom_id`.
- **FR-008**: Allowed shipping countries MUST be configurable. [GAP — hardcoded `['US','CA','GB','AU']` in the Stripe integration]
- **FR-009**: The PayPal brand name MUST be configurable. [GAP — hardcoded `'TillKit Store'`]
- **FR-010**: Checkout MUST revalidate cart prices and inventory availability server-side before creating the payment session. `revalidateCart()` blocks session creation on any price drift, stock shortfall, or removed product, and the starter reconciles the cart before returning the shopper to `/cart` (spec 018 US4).

### Key Entities

- **Order**: immutable snapshot of purchased items with statuses (`status`, `paymentStatus`, `fulfillmentStatus`), totals in cents, addresses, and transactions.
- **Transaction**: money movement record — `kind` (sale/refund/…), `status`, `amount`, `gateway`, gateway metadata.
- **Checkout Session**: gateway-side object referenced by id; TillKit stores only its ids in transaction metadata.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A test-mode Stripe checkout completes end-to-end (cart → pay → order visible in admin) with zero manual intervention.
- **SC-002**: Refreshing the success page N times yields exactly 1 order (currently fails).
- **SC-003**: 100% of paid sessions eventually produce an order (webhook fallback covers success-page misses).
- **SC-004**: Zero orders exist with `email: unknown@example.com` in a correctly configured store.

## Assumptions

- Stripe-hosted Checkout (not embedded Payment Element) is the supported card flow; SCA is delegated to Stripe.
- The webhook path (spec 005) is the source of truth for payment events; the success-page path is a UX convenience that must converge to the same outcome.
- Refunds are initiated via gateway dashboards today; first-class refund flows are deferred to spec 020, gated on admin auth (spec 017).

## Known Gaps

Closed by spec 018:

- ~~No idempotency on order creation (FR-004)~~ — enforced by a unique `(gateway, gatewayRef)` index. The success page and the webhook race in production; only the database can arbitrate.
- ~~No server-side revalidation of prices/inventory at checkout (FR-010)~~ — `revalidateCart()` gates session creation.
- ~~A paid order with no customer email fell back to `unknown@example.com` silently~~ — the email is now resolved from `customer_details` first, and the fallback logs loudly.

Still open:

- The starter interpolates product names and other database-sourced strings raw into HTML throughout (`<h3>${item.name}</h3>`). A store admin — or anyone who can write a product name — can inject markup. Needs its own spec.
- `decrementInventoryForOrder` decrements product-level inventory even for variant line items, while revalidation reads variant-level inventory. The two disagree for variant products.
- Hardcoded shipping countries and PayPal brand name (FR-008, FR-009).
- Revalidation and payment are not transactional: stock can sell out in the window between `revalidateCart()` and the webhook's inventory decrement. Blocking that window entirely requires reservations, which no spec covers yet.

## Existing Implementation (reference)

- `templates/starter/src/routes/checkout.ts` — POST /checkout, success, cancel pages.
- `packages/server/src/routes/webhooks.ts` — `createOrderFromStripeSession` (the order-creation path).
- `packages/server/src/routes/paypal-webhooks.ts` — `createOrderFromPayPalCapture`.
- `packages/integrations/stripe/src/index.ts` — session creation, refund helper.
- `packages/integrations/paypal/src/index.ts` — Orders v2 create/capture/refund.
- `packages/server/src/__tests__/integration.test.ts` — order-from-session tests.
