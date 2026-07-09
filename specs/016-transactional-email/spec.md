# Feature Specification: Transactional Email

**Feature Branch**: `016-transactional-email`

**Created**: 2026-07-09

**Status**: Partially implemented (backfilled — providers built, nothing wired)

**Input**: Backfilled from implementation audit + v1 roadmap (priority: transactional email)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Order confirmation email (Priority: P1)

A shopper completes checkout and receives an order confirmation email within a minute: order number, line items with prices, totals, and a link back to the store. The store operator configured this by setting two environment variables (provider API key + from-address).

**Why this priority**: Confirmation email is the minimum bar for a store shoppers trust; its absence is the most visible gap in the current kit.

**Independent Test**: Complete a test checkout with Resend/SendGrid test credentials; assert one send API call with correct order data.

**Acceptance Scenarios**:

1. **Given** email is configured, **When** an order is created (success page or webhook path), **Then** exactly one confirmation email is sent to the order's email with order number, items, and totals formatted from integer cents.
2. **Given** email is NOT configured, **When** an order is created, **Then** the order flow completes normally with no email attempt (constitution III).
3. **Given** the email provider errors, **When** a confirmation send fails, **Then** the order still completes; the failure is logged, never blocking the money path.

---

### User Story 2 - Fulfillment lifecycle emails (Priority: P2)

When an operator marks an order shipped or delivered in admin, the shopper is notified (with tracking info once spec 015 lands).

**Acceptance Scenarios**:

1. **Given** an order transitions to `shipped` via admin, **Then** a shipped email is sent once for that transition (re-saving the same status re-sends nothing).
2. **Given** a refund is processed, **Then** a refund-processed email is sent.

---

### User Story 3 - Provider choice (Priority: P3)

A developer picks SendGrid, Resend, or SMTP by config; the template set and trigger logic are identical across providers.

**Acceptance Scenarios**:

1. **Given** any provider, **When** `send()` is called, **Then** it returns `{ id, status }` and honors the default from-address when the message omits one.
2. **Given** SMTP config, **Then** mail is actually delivered. [GAP — SMTP provider is a console.log stub returning `status: 'logged'`]

---

### Edge Cases

- Order email is the placeholder `unknown@example.com` (spec 004 gap): do not send; log a warning.
- Duplicate order-creation events (webhook redelivery) must not duplicate emails — email dispatch keys on order id + email type.
- Templates render money via cents/100 — must use the shared `formatPrice`, not ad-hoc division, for locale/currency correctness. [GAP — templates hardcode `$${(v/100).toFixed(2)}`]
- `EmailMessage.attachments` is declared but no provider sends attachments — either implement or drop the field. [GAP]
- Multi-recipient (`to: string[]`) supported by the type; verify each provider handles arrays.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST send an order confirmation on order creation when email is configured. [GAP — no trigger exists anywhere; the integration is imported by nothing]
- **FR-002**: Email MUST be env-gated (e.g. `EMAIL_PROVIDER` + `RESEND_API_KEY`/`SENDGRID_API_KEY` + `EMAIL_FROM`) and constructed at startup like Stripe/Meilisearch are today. [GAP]
- **FR-003**: Email dispatch MUST never fail or delay order creation, status updates, or refunds — always fire-and-forget with logged failures.
- **FR-004**: Lifecycle triggers MUST cover: order confirmation, shipped, delivered, refund processed. (Abandoned-cart exists as a template; wiring it is out of scope for v1.)
- **FR-005**: Each (order, email-type) pair MUST send at most once. [GAP — requires a sent-record, likely in order metadata]
- **FR-006**: Templates MUST be overridable by the store developer (pass custom `EmailTemplates` to the service) while shipping working defaults.
- **FR-007**: The SMTP provider MUST either deliver mail or be removed from the factory; a silent `logged` status masquerading as success is not acceptable. [GAP]
- **FR-008**: Store name and URL in templates MUST come from store configuration, not hardcoded values.

### Key Entities

- **EmailMessage**: to/from/subject/text/html.
- **EmailProvider**: `send(message) → { id, status }` — SendGrid and Resend implementations are real today.
- **EmailTemplates**: named renderers (orderConfirmation, orderShipped, orderDelivered, refundProcessed, abandonedCart) → EmailMessage.
- **EmailService**: provider + templates + default from; owns the convenience send methods.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A store with `RESEND_API_KEY` + `EMAIL_FROM` set sends confirmations with zero code changes.
- **SC-002**: 100% of created orders (webhook or success-page path) with a real email address trigger exactly one confirmation.
- **SC-003**: Provider outage changes nothing about order throughput.
- **SC-004**: A developer can replace all templates without forking the package.

## Assumptions

- Resend is the recommended default (simplest API); SendGrid supported; SMTP deferred until a real transport is chosen (nodemailer conflicts with runtime portability — likely a separate Node-only subpath export).
- Email triggers live in the order-creation path (`createOrderFromStripeSession` / PayPal equivalent) and admin status transitions — both in `@tillkit/server`, receiving an optional `EmailService`.
- HTML templates stay dependency-free inline HTML (no MJML/react-email) per the kit's minimal-tooling philosophy.

## Known Gaps

- The entire integration is unwired: implemented providers and templates with zero consumers, not even a dependency edge from server/starter.
- No trigger points, no env-gating, no once-only guarantee.
- SMTP provider is a stub; attachments field is dead; templates bypass `formatPrice`; store name/URL hardcoded at template-creation call time (acceptable) but no config plumbing exists to supply them.

## Existing Implementation (reference)

- `packages/integrations/email/src/index.ts` — providers (SendGrid, Resend real; SMTP stub), templates, service.
- `packages/server/src/routes/webhooks.ts` + `templates/starter/src/routes/checkout.ts` — the order-creation paths where triggers belong.
- `packages/server/src/routes/admin.ts` — status transitions where shipped/delivered triggers belong.
