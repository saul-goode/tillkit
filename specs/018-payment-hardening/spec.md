# Feature Specification: Payment Hardening

**Feature Branch**: `018-payment-hardening`

**Created**: 2026-07-09

**Status**: Proposed

**Input**: v1 roadmap priority: payment hardening — consolidates the trust-critical gaps identified in specs 004 and 005

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Forged PayPal webhooks are rejected (Priority: P1)

An attacker who discovers a store's PayPal webhook URL POSTs a fabricated `PAYMENT.CAPTURE.COMPLETED` event. Nothing happens: the store verifies every PayPal webhook against PayPal's verify-webhook-signature API (using the configured `webhookId`) before processing.

**Why this priority**: Today any anonymous HTTP request can be processed as a completed payment. This is the single most severe defect in the codebase.

**Independent Test**: POST fabricated events with missing/invalid transmission headers → 400, zero state change; a genuinely signed sandbox event → processed.

**Acceptance Scenarios**:

1. **Given** a PayPal webhook with absent or invalid `paypal-transmission-sig`/related headers, **When** received, **Then** respond 400 and process nothing.
2. **Given** verification succeeds, **Then** the event flows to the existing normalized processing.
3. **Given** `PAYPAL_WEBHOOK_ID` is not configured, **Then** the PayPal webhook route refuses to process events (fail closed), logging the misconfiguration.

---

### User Story 2 - Redelivered events and refreshed pages never duplicate money state (Priority: P1)

Stripe redelivers a webhook; a shopper refreshes the success page five times; a race delivers the webhook while the success page is mid-creation. In all cases: exactly one order, exactly one inventory decrement, exactly one confirmation email.

**Acceptance Scenarios**:

1. **Given** an order already created for Stripe session `cs_x`, **When** `createOrderFromStripeSession` runs again for `cs_x` (any path), **Then** it returns the existing order id and performs no writes.
2. **Given** the same webhook event id delivered twice, **Then** the second delivery is acknowledged without side effects.
3. **Given** concurrent success-page and webhook processing for the same session, **Then** one path wins and the other observes the winner's order (uniqueness enforced at the persistence layer, not by in-memory checks).

---

### User Story 3 - Operator-initiated refunds (Priority: P2)

An operator refunds an order (full or partial) from the admin order page. The gateway refund is created, a `refund` transaction is appended, `paymentStatus` becomes `refunded`/`partially_refunded`, and inventory is optionally restocked.

**Acceptance Scenarios**:

1. **Given** a paid Stripe order, **When** the operator refunds 500 of a 1999 order, **Then** a gateway refund for 500 cents is created, a `refund` transaction (amount 500, parent = original sale) is appended, and `paymentStatus` is `partially_refunded`.
2. **Given** the refund webhook later arrives for that refund, **Then** it is recognized as already-recorded (idempotency) rather than double-recorded.
3. **Given** a PayPal order refund, **Then** the refund currency comes from the original capture. [Fixes: PayPal `refund()` hardcodes `'USD'` for partial refunds]

---

### User Story 4 - Checkout revalidation (Priority: P2)

Between add-to-cart and checkout, prices changed and stock ran out. Checkout revalidates each line against current product data before creating the payment session and surfaces discrepancies to the shopper instead of charging stale amounts.

**Acceptance Scenarios**:

1. **Given** a cart item whose product price changed from 1999 to 2499, **When** checkout starts, **Then** the shopper sees the updated price before any payment session is created.
2. **Given** a cart item with quantity 5 but `inventory.available` 2 (and `allowOutOfStock: false`), **Then** checkout blocks with an actionable message.

---

### Edge Cases

- PayPal access tokens are re-fetched on every API call — add caching with expiry to avoid rate limits during webhook bursts (correctness-adjacent: token endpoint throttling can fail refund/capture calls).
- Stripe API version is pinned (`2023-10-16`) in two places — centralize; document the upgrade procedure.
- `createOrGetCustomer` interpolates raw email into a Stripe search query — escape or use exact-match listing.
- Refund of an order created via the success page whose webhook never arrived (or vice versa) — idempotency records must cover both creation paths.
- Order email fallback `unknown@example.com` (spec 004): resolve email from the Stripe customer object before falling back; a paid order without contact info should be loudly logged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: PayPal webhooks MUST be verified via PayPal's verify-webhook-signature API with the configured `webhookId` before processing; fail closed when unconfigured.
- **FR-002**: Order creation MUST be idempotent on gateway session/capture id, enforced by a uniqueness guarantee in persistence (e.g. session id recorded on the order; adapters enforce/lookup before create).
- **FR-003**: Webhook processing MUST be idempotent on gateway event id via a processed-events record with the event id, gateway, and outcome.
- **FR-004**: The DatabaseAdapter contract MUST gain the minimal surface needed for FR-002/FR-003 (e.g. `orders.getByGatewayRef(gateway, ref)` or an idempotency-key store), implemented in both adapters in the same change set (constitution II).
- **FR-005**: Admin MUST offer full and partial refunds for Stripe and PayPal orders, appending `refund` transactions with `parentId` linking the original sale and updating `paymentStatus` per the refunded ratio.
- **FR-006**: Refund currency MUST derive from the original transaction, never a hardcoded default.
- **FR-007**: Checkout MUST revalidate unit prices and inventory availability server-side immediately before creating a gateway session; discrepancies update the cart and inform the shopper.
- **FR-008**: The Stripe webhook route MUST create the order by default on `payment_success` when no custom `onPaymentSuccess` is supplied (closes spec 005 FR-003).
- **FR-009**: Handler failures after signature verification MUST yield a retryable (non-2xx) response, never a false ack.
- **FR-010**: PayPal OAuth tokens MUST be cached until near expiry.

### Key Entities

- **Processed Event**: `{ gateway, eventId, processedAt, outcome }` — the idempotency ledger.
- **Gateway Reference on Order**: session/capture id stored queryably (today it's buried in transaction metadata).
- **Refund Transaction**: existing `Transaction` with `kind: refund`, `parentId` → original sale.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Fuzzed/forged webhook traffic (both gateways) produces zero state changes across a full test matrix.
- **SC-002**: A chaos test replaying every webhook 3× with concurrent success-page hits yields exactly one order, one decrement, one email per payment.
- **SC-003**: Operators complete full and partial refunds from admin without touching a gateway dashboard; store `paymentStatus` matches gateway state.
- **SC-004**: Zero stale-price charges: any price drift between cart and checkout is surfaced pre-payment.

## Assumptions

- Idempotency persistence rides on existing adapters (no new infra dependency).
- Refund UI lives in the existing admin order page; admin auth (specs 009/017) lands before or with this — refund endpoints must not ship unauthenticated.
- Disputes/chargebacks get a normalized `dispute` event type but full dispute management is out of scope for v1.

## Existing Implementation (reference)

- `packages/integrations/paypal/src/index.ts` — unverified `handleWebhook`, hardcoded refund currency, uncached tokens.
- `packages/integrations/stripe/src/index.ts` — `createRefund` exists (unwired to admin), customer search interpolation.
- `packages/server/src/routes/webhooks.ts`, `paypal-webhooks.ts` — order-creation paths needing idempotency.
- `packages/server/src/routes/admin.ts` — order page where refund UI belongs.
