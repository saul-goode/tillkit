# Feature Specification: Subscriptions

**Feature Branch**: `007-subscriptions`
**Created**: 2026-07-09
**Status**: Implemented (backfilled)
**Input**: Backfilled from implementation audit

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Store developer creates recurring billing via a provider contract (Priority: P1)

A store developer wires a `SubscriptionProvider` (Stripe today) and creates subscriptions through JSON routes, receiving what the client needs to confirm payment (Stripe `clientSecret` for SCA, or a future provider's `approvalUrl`).

**Why this priority**: Subscription creation is the revenue-bearing core; everything else manages what this creates.

**Independent Test**: With `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` set, POST `/api/subscriptions` with a customerId and planId and assert the response shape.

**Acceptance Scenarios**:

1. **Given** a configured Stripe provider and plan priced 999 cents/month, **When** POST `/api/subscriptions` is called with `{customerId, planId}`, **Then** the response contains `{id, status, clientSecret?, currentPeriodEnd}` and the Stripe subscription was created with `payment_behavior: 'default_incomplete'` (SCA-ready — payment confirmed client-side via clientSecret).
2. **Given** `trialDays: 14` in the request, **When** the subscription is created, **Then** the provider applies the trial before the first charge.
3. **Given** the provider throws (bad plan, Stripe error), **When** POST `/api/subscriptions` is called, **Then** the route returns 400 with `{error}` JSON.
4. **Given** `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` is absent, **When** the starter boots, **Then** no provider is constructed, subscription routes are not mounted, and the app runs normally (graceful degradation).

---

### User Story 2 - Subscription lifecycle is managed and observed via webhooks (Priority: P2)

A store developer inspects, cancels, and re-plans subscriptions, and receives verified provider webhooks normalized into `SubscriptionEvent`s.

**Why this priority**: Recurring billing is unusable without cancel/upgrade and renewal/failure visibility.

**Independent Test**: Exercise GET `/:id`, POST `/:id/cancel`, POST `/:id/update`, and POST `/webhook` with a signed Stripe test event (23 server tests cover these routes).

**Acceptance Scenarios**:

1. **Given** an active subscription, **When** POST `/api/subscriptions/:id/cancel` with `{immediately: true}` is called, **Then** the provider cancels now and returns `{id, status, canceledAt}`; without `immediately`, it cancels at period end.
2. **Given** POST `/:id/update` without `planId`, **Then** the route returns 400 `{error: 'planId required'}`; with a `planId`, the provider swaps the plan.
3. **Given** a webhook POST with a valid `stripe-signature`, **When** the payload is an `invoice.payment_succeeded` event, **Then** signature verification passes via `stripe.webhooks.constructEvent` and the normalized event type is `invoice_paid` with the subscriptionId.
4. **Given** a webhook POST with a missing or invalid signature, **Then** the route returns 400 `{error: 'Invalid webhook'}` and processes nothing (constitution: webhooks MUST verify provenance).
5. **Given** `invoice.payment_failed` / `customer.subscription.created` / `customer.subscription.deleted` events, **Then** they map to `payment_failed` / `subscription_created` / `subscription_canceled` respectively.

---

### User Story 3 - Shopper subscribes to a product from the storefront (Priority: P3)

A shopper viewing a subscription-enabled product sees its plans (e.g. $9.99/month, 14-day trial) and can start a subscription from the product page.

**Why this priority**: Completes the shopper-facing loop, but the API-first flow (Story 1) already delivers value to developers. NOT implemented today.

**Independent Test**: Render a product whose `subscription.enabled` is true and assert plan options appear — currently fails (storefront ignores the field).

**Acceptance Scenarios**:

1. **Given** a product with `subscription: {enabled: true, plans: [{amount: 999, interval: 'month'}], trialDays: 14}`, **When** the shopper opens the product page, **Then** the plan renders as "$9.99/month, 14-day free trial" alongside one-time purchase. *(Not implemented — see Known Gaps.)*

### Edge Cases

- Unknown subscription id on GET `/:id`: provider error is surfaced as 404 JSON.
- Cancel called twice: second call surfaces the provider error as 400; no local state to corrupt (nothing is persisted).
- Webhook event types outside the mapped set: normalized to type `other` and acknowledged 200 (no retries storm).
- Cancel body absent or malformed JSON: parsed as `{}`, treated as cancel-at-period-end.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `@tillkit/core` MUST define a provider-agnostic `SubscriptionProvider` contract: `createSubscription` → `{id, status, clientSecret?, approvalUrl?, currentPeriodEnd}`, `cancelSubscription(id, immediately?)`, `updateSubscription(id, newPlanId)`, `getSubscription`, `handleWebhook(payload, signature?)`, `processWebhookEvent` → `SubscriptionEvent`; core imports nothing from integrations.
- **FR-002**: Plan amounts MUST be integer cents (`SubscriptionPlan.amount`), with currency and `interval`/`intervalCount`.
- **FR-003**: The Stripe implementation MUST create subscriptions with `payment_behavior: 'default_incomplete'` and return the payment intent's clientSecret for client-side confirmation.
- **FR-004**: Webhook handling MUST verify the Stripe signature with `stripe.webhooks.constructEvent`; a missing secret or signature MUST throw, and the route MUST answer 400 without processing.
- **FR-005**: Server MUST expose POST `/` (create), GET `/:id`, POST `/:id/cancel`, POST `/:id/update`, POST `/webhook` as JSON routes constructed from `{database, subscriptionProvider}`.
- **FR-006**: Subscription management routes MUST require authentication/ownership checks before TillKit 1.0. [GAP]
- **FR-007**: The starter MUST construct the provider only when `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are both present; absence must not crash startup or requests.
- **FR-008**: Subscription state changes received via webhook MUST be persisted through the `DatabaseAdapter` so the store has a local record. [GAP]
- **FR-009**: The storefront MUST render subscription plans for products whose `subscription.enabled` is true. [GAP]
- **FR-010**: Webhook processing MUST be idempotent under redelivery once local persistence exists (constitution: money-moving operations).

### Key Entities

- **SubscriptionPlan**: id, name, amount (integer cents), currency, interval (month/year/week/day), intervalCount, optional provider binding.
- **Subscription**: provider-side record — customer, status (`incomplete`/`active`/`past_due`/`canceled`/`unpaid`/`paused`/`trialing`), plan, period bounds, cancelAtPeriodEnd, optional trialEnd.
- **SubscriptionEvent**: normalized webhook outcome — type (`subscription_created`, `invoice_paid`, `payment_failed`, `subscription_canceled`, …), subscriptionId, customerId?, raw data.
- **SubscriptionMetadata** (on Product): `{enabled, plans[], trialDays?, description?}` marking a product as subscribable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with only two Stripe env vars can create, inspect, cancel, and re-plan a subscription through JSON routes with no Stripe SDK code of their own.
- **SC-002**: 100% of processed webhooks passed signature verification; 0 unverified payloads are ever acted upon.
- **SC-003**: A store without Stripe env vars boots and serves all non-subscription traffic with zero errors.
- **SC-004**: The 23 server route tests stay green across provider changes, proving the routes depend only on the contract.

## Assumptions

- Stripe is the only shipped provider; the contract's `approvalUrl` field anticipates a PayPal-style redirect provider.
- Customer identity (`customerId`) is created upstream (e.g. checkout flow); these routes do not create Stripe customers.
- Client-side payment confirmation (Stripe.js with the clientSecret) is the template author's responsibility.

## Known Gaps

- **No auth on management routes**: anyone who can reach the API can cancel or re-plan any subscription by id (`packages/server/src/routes/subscriptions.ts`); constitution requires this documented until admin auth ships (FR-006).
- **No local persistence**: `config.database` is accepted by `createSubscriptionRoutes` but never used — webhook events are logged and acknowledged, so the store keeps no record of subscription state (FR-008), and idempotency (FR-010) cannot be enforced yet.
- **Storefront never renders subscription options**: `Product.subscription` metadata exists but no template reads it; shoppers cannot subscribe through the UI (FR-009).

## Existing Implementation (reference)

- `/Users/rusty/projects/tillkit/packages/core/src/subscriptions/index.ts` — `SubscriptionProvider` contract, `SubscriptionPlan`, `Subscription`, `SubscriptionEvent`, `SubscriptionMetadata`.
- `/Users/rusty/projects/tillkit/packages/integrations/stripe/src/subscriptions.ts` — `createStripeSubscriptionProvider` (default_incomplete, signature-verified webhooks, event mapping).
- `/Users/rusty/projects/tillkit/packages/server/src/routes/subscriptions.ts` — JSON routes: create/get/cancel/update/webhook.
- `/Users/rusty/projects/tillkit/templates/starter/src/index.ts` — env-gated provider construction (`STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`).
- `/Users/rusty/projects/tillkit/packages/core/src/types/index.ts` — `Product.subscription?: SubscriptionMetadata`.
