# Feature Specification: Payment Webhooks

**Feature Branch**: `005-payment-webhooks`

**Created**: 2026-07-09

**Status**: Partially implemented (backfilled)

**Input**: Backfilled from implementation audit

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trust only verified payment events (Priority: P1)

A store operator relies on webhook-driven order state. Every webhook endpoint verifies the event came from the gateway before acting; a forged POST to a webhook URL changes nothing.

**Why this priority**: Webhooks mutate money-adjacent state. An unverified endpoint lets anyone mark payments succeeded. This is the constitution's Security Requirements section made concrete.

**Independent Test**: POST a well-formed but unsigned/mis-signed payload to each webhook route; assert 4xx and zero state change.

**Acceptance Scenarios**:

1. **Given** the Stripe webhook route, **When** a payload arrives with an invalid `stripe-signature`, **Then** the response is 400 and no handler runs. *(Implemented — `stripe.webhooks.constructEvent` verifies.)*
2. **Given** the Stripe subscription webhook route, **When** the signature is invalid, **Then** 400 and no processing. *(Implemented.)*
3. **Given** the PayPal webhook route, **When** an unsigned forged payload arrives, **Then** it is rejected. [GAP — `handleWebhook` only `JSON.parse`s the body; any anonymous POST is processed as a genuine event]

---

### User Story 2 - Payment lifecycle drives order state (Priority: P1)

Stripe events map to a normalized result (`payment_success` / `payment_failure` / `refund` / `other`) and the store reacts: successful payments produce orders even if the shopper never returns to the success page; refunds are recorded.

**Acceptance Scenarios**:

1. **Given** a `checkout.session.completed` event, **When** processed, **Then** the result type is `payment_success` with session id, payment intent id, amount, currency, customer email/id, shipping, and metadata.
2. **Given** `charge.refunded`, **Then** type `refund` with charge id, amount, currency.
3. **Given** an unrecognized event type, **Then** type `other`, acknowledged with 200 and no side effects.
4. **Given** a `payment_success` webhook for a session whose shopper never visited the success page, **Then** an order is still created. [GAP — the webhook route only invokes an optional `onPaymentSuccess` callback; the starter registers none, so webhook-only payments produce no order]

---

### User Story 3 - Redelivery is safe (Priority: P2)

Gateways redeliver webhooks. Processing the same event twice produces the same end state as processing it once.

**Acceptance Scenarios**:

1. **Given** a `payment_success` event already processed into an order, **When** redelivered, **Then** no duplicate order, no double inventory decrement. [GAP — no event-id or session-id dedup anywhere]

---

### Edge Cases

- Webhook handler errors after signature verification: respond 4xx/5xx so the gateway retries; must not 200-ack an event whose side effects failed. (Current code 200-acks after the switch even if a custom handler threw — verify and tighten.)
- Subscription events flow through a separate route (`/api/subscriptions/webhook`) with its own verified provider — event-type mapping documented in spec 007.
- PayPal `CUSTOMER.DISPUTE.CREATED` maps to `refund` — a dispute is not a refund; the normalized vocabulary needs an explicit `dispute` type. [GAP]
- Raw body handling: signature verification requires the exact raw payload; any middleware that parses the body first breaks verification.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every webhook endpoint MUST verify event provenance before any processing — Stripe via signature verification, PayPal via its verify-signature API using the configured `webhookId`. [GAP — PayPal]
- **FR-002**: Webhook processing MUST be idempotent keyed on gateway event id (and session/capture id for order creation). [GAP]
- **FR-003**: A `payment_success` event MUST result in an order existing for that payment, whether or not the success page was ever visited. [GAP — starter wires no `onPaymentSuccess`; order creation should default to `createOrderFromStripeSession` when no custom handler is provided]
- **FR-004**: Verification failures MUST return 4xx with no side effects; processing failures after verification MUST return a retryable status, not a false 200 ack.
- **FR-005**: Events MUST be normalized to a gateway-agnostic vocabulary (`payment_success`, `payment_failure`, `refund`, `dispute` [GAP — missing], `other`) so store code never branches on raw gateway event names.
- **FR-006**: Custom lifecycle callbacks (`onPaymentSuccess`, `onPaymentFailure`, `onRefund`) MUST be supported and awaited; their errors must not be swallowed into a 200.
- **FR-007**: Webhook secrets MUST come from environment configuration; a webhook route MUST refuse to start (or clearly no-op) when its secret is absent rather than accept unverified traffic.

### Key Entities

- **Webhook Event**: raw gateway payload + verified provenance.
- **Normalized Result**: `{ type, data }` gateway-agnostic mapping.
- **Processed-event record**: persistence needed for idempotency (does not exist yet — see spec 018).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Forged webhook POSTs (any gateway) produce zero state changes — verifiable by test.
- **SC-002**: Replaying any recorded webhook stream N times yields the same store state as playing it once.
- **SC-003**: In a store with webhooks configured, 100% of paid Stripe sessions produce orders with zero shopper cooperation (close the browser after paying).

## Assumptions

- Stripe webhook secret (`STRIPE_WEBHOOK_SECRET`) and PayPal `webhookId` are available wherever webhooks are enabled.
- Idempotency persistence (processed event ids) will live behind the DatabaseAdapter — schema addition tracked in spec 018.
- Local development uses Stripe CLI forwarding; production endpoints are HTTPS.

## Known Gaps

- **PayPal webhook signature verification is entirely absent** — the single most severe defect in the codebase. `webhookId` config exists but is unused; headers are accepted and ignored. Fix in spec 018.
- No idempotency/dedup for any gateway.
- Starter's Stripe webhook route logs `payment_success` but creates no order (no default handler).
- Dispute events mislabeled as refunds.
- 200-ack behavior on handler failure needs verification and tightening (FR-004/FR-006).

## Existing Implementation (reference)

- `packages/server/src/routes/webhooks.ts` — Stripe webhook route + `createOrderFromStripeSession`.
- `packages/server/src/routes/paypal-webhooks.ts` — PayPal webhook route + order-from-capture.
- `packages/integrations/stripe/src/index.ts` — verified `handleWebhook`, `processWebhookEvent` mapping.
- `packages/integrations/stripe/src/subscriptions.ts` — verified subscription webhooks.
- `packages/integrations/paypal/src/index.ts` — unverified `handleWebhook` (the gap).
- `templates/starter/src/routes/webhooks.ts` — starter webhook mounting.
