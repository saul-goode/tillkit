# Implementation Plan: Payment Hardening

**Branch**: `018-payment-hardening` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-payment-hardening/spec.md`

## Summary

Close the three trust-critical defects in TillKit's money path: PayPal webhooks are processed without any signature verification; order creation is not idempotent under webhook redelivery or success-page refresh; and checkout never revalidates prices or stock against current product data.

Technical approach: verify PayPal webhooks through PayPal's postback API (portable — no custom crypto); introduce a real database-enforced uniqueness guarantee (`orders.gatewayRef` unique on `(gateway, gatewayRef)`, plus a `processed_webhook_events` ledger unique on `(gateway, eventId)`) so idempotency survives concurrent success-page/webhook races rather than relying on read-then-write; and revalidate the cart server-side immediately before creating a payment session.

Two discoveries from Phase 0 expand the work beyond the spec's original framing:
1. **PocketBase's field-level `unique: true` has been a no-op since v0.14.** The adapter uses it on `orders.orderNumber`. There is currently *no* uniqueness constraint on order numbers, and none on `products.slug`. Idempotency cannot be built on top of this until it is fixed.
2. **`createOrderFromPayPalCapture` already contains an idempotency check that cannot work** — it queries `getByNumber` (TillKit's `orderNumber`) with a PayPal order id. It never matches, always creates a duplicate, and reads as defensive code.

Refunds (spec US3) are **deferred** to a follow-up spec gated on admin authentication; see Complexity Tracking.

## Technical Context

**Language/Version**: TypeScript 5.3, ESM only, `strict` + `noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns`

**Primary Dependencies**: Hono 4 (HTTP), Zod 3 (config validation), `stripe` SDK (Stripe only), raw `fetch` (PayPal — no SDK), `pocketbase` SDK ^0.21, `@supabase/supabase-js`

**Storage**: Via `DatabaseAdapter` only. PocketBase (SQLite) and Supabase (Postgres) must both satisfy the contract.

**Testing**: Vitest. Unit + route-level tests with mocked adapters and gateways; a new shared adapter contract suite; manual sandbox verification for the PayPal postback path (the simulator cannot exercise it — see research R1).

**Target Platform**: Node ≥18, Cloudflare Workers, Deno. `packages/*` restricted to Web-standard APIs (constitution VI).

**Project Type**: pnpm monorepo — library packages (`core`, `server`, adapters, integrations) plus a reference storefront template.

**Performance Goals**: Webhook verification adds ≤1 network round-trip (postback) plus a cached OAuth token. Idempotency checks add ≤1 indexed lookup or 1 conflicting insert per payment event. No added cost on the read-heavy storefront paths.

**Constraints**: Money is integer cents end-to-end. Idempotency must hold under concurrency (no read-then-write). Optional integrations must degrade, not crash. No Node-only APIs in `packages/*`.

**Scale/Scope**: Starter-kit scale — single store, thousands of orders. Correctness under concurrency matters far more than throughput.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Verdict |
|---|---|---|
| **I. Server-First Rendering** | No client-side code added. Webhook + checkout paths are server-only. | PASS |
| **II. Adapter Contract Integrity** | This change **adds to `DatabaseAdapter`** (`orders.getByGatewayRef`, `webhookEvents` namespace). Both adapters must implement it in this change set, and no adapter may silently no-op. Directly motivates standing up the shared contract test suite (spec 001 SC-001). Core imports nothing from adapters. | PASS (with obligation) |
| **III. Graceful Degradation** | PayPal verification requires `PAYPAL_WEBHOOK_ID`. Per spec FR-001 the route must **fail closed** when unconfigured. Note the tension: constitution III says a missing integration must not crash; the Security Requirements say an unverified webhook handler is a violation. Resolution: an unconfigured PayPal webhook route *refuses to process events* (400 + loud log) rather than throwing at startup or processing unverified. Absence of PayPal entirely remains a clean no-op. | PASS |
| **IV. Integer-Cents Money** | PayPal decimal strings convert at the integration boundary only. Revalidation compares integer cents. Refund currency is derived from the original transaction rather than hardcoded. | PASS |
| **V. Spec-Driven Change Flow** | This plan derives from spec 018. Phase 0 discoveries (PocketBase decorative-unique; broken PayPal check) require **amendments to specs 001 and 005** in the same change set. | PASS (with obligation) |
| **VI. Runtime Portability** | Postback verification chosen precisely because offline verification would need an ASN.1/X.509 parser and CRC32 outside Web Crypto. Direct-Postgres DDL from the Supabase adapter **rejected** on this principle. Migration script may use Node APIs — it is tooling, not a package. | PASS |
| **Security: verified webhooks** | The entire point of US1. | PASS |
| **Security: idempotent money ops** | The entire point of US2, enforced at the persistence layer. | PASS |
| **Security: admin authenticatable before 1.0** | Refunds deferred rather than shipped onto an unauthenticated admin. | PASS |

**Result: PASS.** Two obligations carried into Phase 1: (a) both adapters + contract tests in one change set; (b) amend specs 001 and 005.

## Project Structure

### Documentation (this feature)

```text
specs/018-payment-hardening/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── database-adapter.md
│   └── paypal-webhook-verification.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/core/src/
├── database/index.ts          # CONTRACT CHANGE: orders.getByGatewayRef, webhookEvents namespace
└── types/index.ts             # Order gains gateway/gatewayRef; new ProcessedWebhookEvent

packages/adapters/pocketbase/src/index.ts
    # setup(): add `indexes` arrays (fixes decorative unique on orderNumber/slug)
    # setup(): provision processed_webhook_events
    # implement orders.getByGatewayRef + webhookEvents.*
    # unique-violation detection: catch status 400, confirm by read

packages/adapters/supabase/src/index.ts
    # implement orders.getByGatewayRef + webhookEvents.* via upsert(ignoreDuplicates).select()
    # setup(): emit the required DDL in its result (still cannot execute it)

packages/adapters/__tests__/contract.test.ts    # NEW: shared suite, run against both adapters

packages/integrations/paypal/src/index.ts
    # handleWebhook -> async, postback verification against verify-webhook-signature
    # OAuth token caching (expires_in - 60s, refresh on 401)
    # refund(): derive currency from the original capture, not hardcoded 'USD'
    # processWebhookEvent: add 'dispute' type (stop mislabelling disputes as refunds)

packages/server/src/routes/
├── webhooks.ts         # idempotent createOrderFromStripeSession; default onPaymentSuccess
├── paypal-webhooks.ts  # await async handleWebhook; remove broken getByNumber check
└── checkout.ts (new)   # server-side price/stock revalidation helper

templates/starter/src/routes/checkout.ts   # call revalidation before creating a session
templates/starter/scripts/migrate.ts       # NEW: `tillkit migrate` (additive, idempotent)

docs/deployment.md      # Supabase DDL for gateway_ref + processed_webhook_events
```

**Structure Decision**: Existing monorepo layout. The contract change lands in `packages/core`, is implemented in both adapters, and is consumed by `packages/server`. The migration script lives in the starter template (Node-only tooling, permitted outside `packages/*` by constitution VI). A new shared adapter contract suite sits under `packages/adapters/__tests__/` so it can exercise both implementations from one file.

## Phase 1 Design Summary

Artifacts generated: [data-model.md](./data-model.md), [contracts/database-adapter.md](./contracts/database-adapter.md), [contracts/paypal-webhook-verification.md](./contracts/paypal-webhook-verification.md), [quickstart.md](./quickstart.md).

Design decisions worth surfacing:

- **Two distinct idempotency mechanisms**, not one. `orders.gatewayRef` answers "does an order exist for this payment?"; `processed_webhook_events` answers "have side effects already run for this delivery?". Refunds and failures create no order, so the ledger cannot be replaced by the order lookup.
- **Insert-and-catch, not check-then-insert.** Every idempotent write attempts the constrained insert and interprets the conflict. This is the only form that survives the success-page/webhook race, which is a genuine concurrent path in production.
- **Fail-closed on missing verification config**, fail-open never. An unconfigured PayPal webhook id yields 400 + log, not silent acceptance.
- **The migration is the delivery mechanism for correctness.** Without the unique indexes, all idempotency code degrades to no-ops that appear to work. This is why R5 rejects docs-only.

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1 artifacts:

- **II. Adapter Contract Integrity** — the contract in `contracts/database-adapter.md` is defined once and both adapters implement it; the shared suite in `packages/adapters/__tests__/contract.test.ts` runs identical assertions against each. Supabase's inability to execute DDL is handled by returning the required SQL from `setup()` rather than by falsely reporting `created: true` — which additionally repairs a spec-001 gap. **PASS.**
- **VI. Runtime Portability** — final design uses only `fetch` + `Headers` in the PayPal path; no crypto primitives beyond what the runtime provides; no Postgres driver. **PASS.**
- **IV. Integer-Cents** — `data-model.md` types `gatewayRef` as a string and every amount as an integer; PayPal decimal↔cents conversion stays at the integration boundary. **PASS.**
- No new violations introduced.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `DatabaseAdapter` grows a new `webhookEvents` namespace + `orders.getByGatewayRef` | Idempotency demands a database-enforced uniqueness guarantee. Nothing in the current contract can express "insert this exactly once" across two backends. | Storing the gateway ref in the existing transaction `metadata` JSON was considered and rejected: JSON fields are not portably indexable or uniquely constrainable across SQLite and Postgres, so the key could not be constrained where it already sits (research R6). |
| Scope grows to fix PocketBase's decorative `unique: true` | Discovered in Phase 0. Idempotency built on an index that does not exist would silently fail open — the worst possible outcome for a correctness feature. The fix is in the same `setup()` function this plan already edits. | Deferring it was rejected: it would ship an idempotency feature that provably does not work on the default adapter. |
| A `tillkit migrate` script (new tooling surface) | `setup()` is create-if-missing, so existing stores receive no schema change and idempotency fails open for every current user. | Documenting SQL only (rejected — silently breaks installed stores); a versioned migration framework (rejected — over-engineering for one migration). |
| Spec 018 User Story 3 (refunds) removed from scope | Refund endpoints on today's zero-auth `/admin` would expose an unauthenticated money-movement button. | Shipping behind a temporary `ADMIN_TOKEN` was rejected: it introduces a stopgap auth mechanism that spec 017 must later remove, and `docs/faq.md` already falsely documents that token as existing. Tracked as new spec 020, gated on 017. |

## Follow-on spec amendments required (constitution V)

To be made in the same change set as implementation:

- **Spec 001 (Database Adapter)** — FR-009 understates reality: order-number uniqueness is not merely "unhandled on collision", it is unenforced (no index exists). Add: PocketBase `schema:` format breaks on PocketBase ≥0.23. Add: `setup()` must not report `created: true` when it executed no DDL.
- **Spec 005 (Payment Webhooks)** — record that the PayPal order path's existing idempotency check queries the wrong column and is inert. Add the `dispute` event type to the normalized vocabulary.
- **New spec 020 (Operator Refunds)** — carries spec 018's User Story 3, depends on 017.
