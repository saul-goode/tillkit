---

description: "Task list for Payment Hardening (spec 018)"
---

# Tasks: Payment Hardening

**Input**: Design documents from `/specs/018-payment-hardening/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: REQUIRED. The constitution's quality gates state "a behavior change without a corresponding test is incomplete." Tests for the idempotency contract are not merely coverage — case T019 (concurrent `claim`) is the only check that distinguishes a correct implementation from a read-then-write one that appears to work.

**Organization**: Tasks are grouped by user story. Story labels map to [spec.md](./spec.md) user stories.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 (PayPal verification), US2 (idempotency), US4 (checkout revalidation)
- **US3 (operator refunds) is OUT OF SCOPE** — deferred to new spec 020, gated on 017 admin auth. See [plan.md](./plan.md#complexity-tracking). Its FR-006 (refund currency) is integration-level and lands in Polish.

## Path Conventions

pnpm monorepo. Packages under `packages/`, reference storefront under `templates/starter/`. Paths below are repo-relative and exact.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Tooling that later phases depend on. No product behavior changes.

- [x] T001 [P] Add `.specify/feature.json` to `.gitignore` (per-developer spec-kit state, not shared)
- [ ] T002 [P] Initialize changesets (`pnpm changeset init`) so the breaking `handleWebhook` signature change can be recorded in `.changeset/`
- [ ] T003 [P] Add a `test` script (`vitest run`) to `packages/adapters/pocketbase/package.json` and `packages/adapters/supabase/package.json` — neither defines one today, so adapter tests would never run in CI
- [ ] T004 Create the shared adapter contract suite skeleton in `packages/adapters/__tests__/contract.test.ts`, exporting a `runContractTests(adapterFactory, name)` harness that both adapters invoke, plus `packages/adapters/vitest.config.ts`

**Checkpoint**: `pnpm test` discovers adapter tests (currently zero exist).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `DatabaseAdapter` contract change, the schema that enforces it, and the migration that reaches existing stores.

**⚠️ CRITICAL**: US2 cannot begin until this phase completes. US1 and US4 have **no hard dependency** on this phase and may proceed in parallel with it (see Dependencies).

**⚠️ ORDER MATTERS**: T005–T008 write the contract tests *first*; they must fail before T009–T016 make them pass. Without the unique indexes from T011/T014, the idempotency tests pass vacuously — the constraint is what makes them meaningful.

### Contract tests (write first, must fail)

- [ ] T005 [P] Write contract tests 1–3 (`getByGatewayRef` hit/miss; duplicate `(gateway, gatewayRef)` throws `DUPLICATE_GATEWAY_REF`; two `gateway: null` orders coexist) in `packages/adapters/__tests__/contract.test.ts`
- [ ] T006 [P] Write contract tests 4, 6, 7 (`claim` once/`claimed:false` thereafter; `release` makes an event re-claimable; same `eventId` under different gateways does not collide) in `packages/adapters/__tests__/contract.test.ts`
- [ ] T007 Write contract test 5 — **concurrency**: `Promise.all` of 10 simultaneous `claim` calls with one key yields exactly one `claimed: true` — in `packages/adapters/__tests__/contract.test.ts`. This is the test that fails against a read-then-write implementation.
- [ ] T008 [P] Write contract test 8 (`setup()` reports only what it actually created; Supabase must not return `created: true` having executed no DDL) in `packages/adapters/__tests__/contract.test.ts`

### Core contract

- [ ] T009 [P] Add `gateway` and `gatewayRef` (both nullable) to `Order`, and add the `ProcessedWebhookEvent` entity, in `packages/core/src/types/index.ts` per [data-model.md](./data-model.md)
- [ ] T010 Add `orders.getByGatewayRef(gateway, ref)`, the `webhookEvents` namespace (`claim`/`complete`/`release`/`get`), and optional `gateway`/`gatewayRef` on `OrderInput` to `packages/core/src/database/index.ts` per [contracts/database-adapter.md](./contracts/database-adapter.md); export a `DUPLICATE_GATEWAY_REF` error code constant from `packages/core/src/index.ts`

### PocketBase adapter

- [ ] T011 Fix the decorative unique constraints in `packages/adapters/pocketbase/src/index.ts` `setup()`: field-level `unique: true` (lines ~389, ~418, ~457) has been a no-op since PocketBase v0.14. Replace with an `indexes` array creating `idx_orders_number` on `orders(orderNumber)` and `idx_products_slug` on `products(slug)`
- [ ] T012 Extend `setup()` in `packages/adapters/pocketbase/src/index.ts` to add `orders.gateway`/`orders.gatewayRef` fields plus `CREATE UNIQUE INDEX idx_orders_gateway_ref ON orders (gateway, gatewayRef)`, and to provision the `processed_webhook_events` collection with `CREATE UNIQUE INDEX idx_webhook_events ON processed_webhook_events (gateway, eventId)`
- [ ] T013 Implement `orders.getByGatewayRef` and duplicate-detection in `orders.create` (catch `ClientResponseError` `status === 400`, confirm via re-read, rethrow if the re-read misses so non-conflict 400s are never swallowed) in `packages/adapters/pocketbase/src/index.ts`
- [ ] T014 Implement the `webhookEvents` namespace in `packages/adapters/pocketbase/src/index.ts` as a constrained insert with 400-catch + confirming read (composite indexes may omit `validation_not_unique`)

### Supabase adapter

- [ ] T015 [P] Implement `orders.getByGatewayRef` and duplicate-detection in `orders.create` (`error.code === '23505'` → `DUPLICATE_GATEWAY_REF`) in `packages/adapters/supabase/src/index.ts`
- [ ] T016 [P] Implement the `webhookEvents` namespace in `packages/adapters/supabase/src/index.ts` using `.upsert(row, { onConflict: 'gateway,event_id', ignoreDuplicates: true }).select()` — empty `data` means already existed, one row means this call claimed it
- [ ] T017 Correct `setup()` in `packages/adapters/supabase/src/index.ts` to stop reporting `created: true` when it executed no DDL; return the required SQL in its result so callers can surface it

### Migration and schema delivery

- [ ] T018 Create the additive, idempotent migration script at `templates/starter/scripts/migrate.ts` and register `"migrate": "tsx scripts/migrate.ts"` in `templates/starter/package.json`. PocketBase: apply missing fields/indexes via `pb.collections.update()`. Supabase: print the DDL (the adapter cannot execute it). Re-running must be a clean no-op.
- [ ] T019 [P] Add the Postgres DDL from [data-model.md](./data-model.md#schema-delivery) (`gateway_ref` column, both unique indexes, `processed_webhook_events` table) to the Supabase section of `docs/deployment.md`

**Checkpoint**: Contract tests T005–T008 pass against **both** adapters. Foundation ready; US2 unblocked.

---

## Phase 3: User Story 1 - Forged PayPal webhooks are rejected (Priority: P1) 🎯 MVP

**Goal**: Every PayPal webhook is verified against PayPal's postback API before any processing. An unsigned forged POST changes nothing. An unconfigured `webhookId` fails closed.

**Independent Test**: POST a fabricated `PAYMENT.CAPTURE.COMPLETED` to `/webhooks/paypal` → 400, zero state change. Delete `PAYPAL_WEBHOOK_ID` → still 400, never processed. Fully testable without any Phase 2 work.

### Tests for User Story 1

- [x] T020 [P] [US1] Write verification tests in `packages/integrations/paypal/src/__tests__/webhook-verification.test.ts` with the verify endpoint mocked: valid signature accepted; `verification_status: "FAILURE"` rejected; each of the five `paypal-*` headers missing → rejected; absent `webhookId` → `PayPalWebhookNotConfiguredError` (fail closed, never processed)
- [x] T021 [P] [US1] Write OAuth token-cache tests in `packages/integrations/paypal/src/__tests__/token-cache.test.ts`: token reused within the window; refreshed after `expires_in − 60s`; a 401 triggers exactly one re-fetch; concurrent callers share one in-flight promise (no stampede)
- [x] T022 [P] [US1] Write route-level tests in `packages/server/src/__tests__/paypal-webhook.test.ts`: forged payload → 400 and no order created; verified payload → processed

### Implementation for User Story 1

- [x] T023 [US1] Implement instance-scoped OAuth token caching in `packages/integrations/paypal/src/index.ts` (`expires_in − 60s`, refresh on 401, shared in-flight promise). Must NOT be module-global — that would leak tokens across integrations with different credentials.
- [x] T024 [US1] Add `PayPalWebhookNotConfiguredError` and `PayPalWebhookVerificationError` to `packages/integrations/paypal/src/index.ts`
- [x] T025 [US1] Rewrite `handleWebhook` in `packages/integrations/paypal/src/index.ts` to be **async** and verify via `POST /v1/notifications/verify-webhook-signature` per [contracts/paypal-webhook-verification.md](./contracts/paypal-webhook-verification.md). Extract the five headers case-insensitively; pass `JSON.parse(rawBody)` **untransformed** as `webhook_event` (re-serializing breaks verification); accept only `verification_status === "SUCCESS"`; inspect the body, not the HTTP status (200 is returned for both outcomes).
- [x] T026 [US1] Add the `dispute` normalized event type and remap `CUSTOMER.DISPUTE.CREATED` → `dispute` (currently mislabeled `refund`, which corrupts `paymentStatus`) in `processWebhookEvent`, `packages/integrations/paypal/src/index.ts`
- [x] T027 [US1] Update `packages/server/src/routes/paypal-webhooks.ts` to `await` the now-async `handleWebhook`, pass `config.webhookId` through to the integration, and return 400 with a loud log when verification fails or config is absent
- [x] T028 [US1] Add `PAYPAL_WEBHOOK_ID`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` to `.env.example` and `templates/starter/.env.example`

**Checkpoint**: US1 is independently shippable. The most severe defect in the codebase is closed.

---

## Phase 4: User Story 2 - Redelivery and refresh never duplicate (Priority: P1)

**Goal**: Exactly one order, one inventory decrement, and one set of side effects per payment — under webhook redelivery, success-page refresh, and concurrent success-page/webhook races.

**Independent Test**: Replay a `payment_success` event N times → one order. `stripe events resend` → `{deduplicated: true}`. Refresh `/checkout/success` five times → one order.

**Depends on**: Phase 2 (contract + schema + migration).

### Tests for User Story 2

- [ ] T029 [P] [US2] Write idempotency tests in `packages/server/src/__tests__/idempotency.test.ts`: the same Stripe session processed twice yields one order and one inventory decrement; a redelivered event id is acknowledged as `deduplicated`; concurrent success-page + webhook processing for one session yields exactly one order
- [ ] T030 [P] [US2] Write handler-failure tests in `packages/server/src/__tests__/idempotency.test.ts`: a throwing handler releases its claim (so redelivery can retry) and returns a **retryable** status — never a false 200 ack

### Implementation for User Story 2

- [ ] T031 [US2] Make `createOrderFromStripeSession` idempotent in `packages/server/src/routes/webhooks.ts`: pass `gateway: 'stripe'`, `gatewayRef: session.id` to `orders.create`; on `DUPLICATE_GATEWAY_REF` return the existing order via `getByGatewayRef` (insert-and-catch, never check-then-insert)
- [ ] T032 [US2] Resolve the order email from the Stripe customer object before falling back, and loudly log when a paid order would otherwise be created with `unknown@example.com` (spec 004 gap) in `packages/server/src/routes/webhooks.ts`
- [ ] T033 [US2] **Delete the broken idempotency check** at `packages/server/src/routes/paypal-webhooks.ts:97` — `database.orders.getByNumber?.(paypalOrder.id)` queries TillKit's `orderNumber` (`TK-…`) with a PayPal order id, can never match, and always falls through to create a duplicate. Replace with `gateway: 'paypal'`, `gatewayRef: paypalOrder.id` insert-and-catch.
- [ ] T034 [US2] Wrap the Stripe webhook route in the claim/complete/release lifecycle from [contracts/database-adapter.md](./contracts/database-adapter.md#release--why-it-exists) in `packages/server/src/routes/webhooks.ts`. On handler failure, `release` the claim **before** returning the error status — omitting this permanently loses that payment's side effects on retry.
- [ ] T035 [US2] Apply the same claim/complete/release lifecycle to `packages/server/src/routes/paypal-webhooks.ts`
- [ ] T036 [US2] Make the Stripe webhook route create the order by default on `payment_success` when no custom `onPaymentSuccess` is supplied (spec 005 FR-003) in `packages/server/src/routes/webhooks.ts` — today a shopper who closes the tab after paying produces a paid-but-orderless store
- [ ] T037 [US2] Fix the error response in `packages/server/src/routes/webhooks.ts`: a handler that throws after successful signature verification currently returns 400 `{error: 'Invalid signature'}`, which is both misleading and non-retryable in intent. Distinguish verification failure (400, terminal) from processing failure (5xx, retryable).

**Checkpoint**: US1 + US2 both work independently. The trust-critical half of spec 018 is complete.

---

## Phase 5: User Story 4 - Checkout revalidation (Priority: P2)

**Goal**: Prices and stock are revalidated server-side immediately before a payment session is created. Stale prices are never charged; oversells are blocked.

**Independent Test**: Change a product's price after adding it to a cart, then start checkout → shopper is returned to `/cart` with the change shown and no Stripe session is created.

**Depends on**: Nothing in Phase 2. May run in parallel with US1/US2.

### Tests for User Story 4

- [ ] T038 [P] [US4] Write revalidation tests in `packages/server/src/__tests__/revalidation.test.ts`: price drift 1999 → 2499 blocks session creation; quantity 5 against `inventory.available: 2` with `allowOutOfStock: false` blocks; a deleted or `archived` product is reported as removed; a clean cart returns `ok: true`

### Implementation for User Story 4

- [ ] T039 [US4] Implement `revalidateCart(db, cart): Promise<CartRevalidationResult>` in a new `packages/server/src/checkout.ts` per [data-model.md](./data-model.md#entity-cartrevalidationresult-new-transient--not-persisted). `ok` is true only when `priceChanges`, `stockIssues`, and `removedItems` are all empty.
- [ ] T040 [US4] Export `revalidateCart` from `packages/server/src/index.ts`
- [ ] T041 [US4] Call `revalidateCart` before `stripe.createCheckoutSession` in `templates/starter/src/routes/checkout.ts`; on `!ok`, update the cart to current prices, drop removed items, and redirect to `/cart` with a flash message explaining what changed

**Checkpoint**: All in-scope user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Spec amendments the constitution requires in this change set, plus the integration-level fix carried over from the deferred US3.

- [ ] T042 [P] Fix `refund()` in `packages/integrations/paypal/src/index.ts` to derive currency from the original capture instead of hardcoding `'USD'` on partial refunds (spec 018 FR-006 — integration-level, exposes no admin surface, so it lands here despite US3 being deferred)
- [ ] T043 [P] Amend `specs/001-database-adapter/spec.md`: FR-009 understates reality — order-number uniqueness is *unenforced*, not merely collision-prone (PocketBase field-level `unique` is a no-op since v0.14). Add a gap: the adapter's `schema:` key breaks on PocketBase ≥0.23 (renamed to `fields:`). Add: `setup()` must not report `created: true` having executed no DDL.
- [ ] T044 [P] Amend `specs/005-payment-webhooks/spec.md`: mark FR-001 (PayPal verification) and FR-002 (idempotency) satisfied; record that the PayPal path's prior idempotency check queried the wrong column and was inert; add `dispute` to the normalized event vocabulary (FR-005).
- [ ] T045 [P] Amend `specs/004-checkout-and-orders/spec.md`: mark FR-004 (idempotency) and FR-010 (revalidation) satisfied; record the `unknown@example.com` fallback fix.
- [ ] T046 Create `specs/020-operator-refunds/spec.md` carrying spec 018's User Story 3 (full/partial refunds from admin), with an explicit dependency on 017 (admin auth), and update `specs/ROADMAP.md` to list it and to mark 018's status
- [ ] T047 [P] Write a changeset in `.changeset/` recording the **breaking** `handleWebhook` signature change (sync → async) in `@tillkit/integration-paypal`, and the minor `DatabaseAdapter` addition in `@tillkit/core`
- [ ] T048 [P] Document the migration requirement in `docs/deployment.md` and `README.md`: existing stores MUST run `pnpm migrate`, because without the unique indexes idempotency silently fails open
- [ ] T049 Run every scenario in [quickstart.md](./quickstart.md), including the **manual** PayPal sandbox delivery (scenario 6) — PayPal's simulator cannot verify postback signatures, so CI cannot prove interoperability with the live verifier
- [ ] T050 Run the full gate defined in `.github/workflows/ci.yml` locally — `pnpm lint && pnpm build && pnpm test && git diff --exit-code` — and confirm the adapter contract suite from `packages/adapters/__tests__/contract.test.ts` is included in the run

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. **Blocks US2 only.**
- **US1 (Phase 3)**: depends on Setup only. Touches `packages/integrations/paypal` + its route — no overlap with Phase 2 files.
- **US2 (Phase 4)**: depends on Phase 2 completing.
- **US4 (Phase 5)**: depends on Setup only. Touches `packages/server/src/checkout.ts` + starter checkout.
- **Polish (Phase 6)**: T042 after US1; T043–T046 after the work they describe; T049–T050 last.

This deviates from the template's "Foundational blocks all stories" because it is not true here, and pretending otherwise would serialize the highest-severity fix (US1) behind the largest chunk of work (the adapter contract change).

### Critical ordering within Phase 2

T005–T008 (tests) → T009–T010 (contract) → T011–T014 (PocketBase) ∥ T015–T017 (Supabase) → T018–T019 (migration/docs).

**T011 and T012 are load-bearing.** Every idempotency test passes vacuously if the unique indexes do not exist — `claim` always succeeds, `create` never conflicts. Verify the indexes exist (quickstart scenario 1) before trusting a green suite.

### Parallel Opportunities

- Setup: T001, T002, T003 all `[P]`.
- Phase 2: the two adapters are independent once T009–T010 land — T011–T014 (PocketBase) run parallel to T015–T017 (Supabase). Contract tests T005, T006, T008 are `[P]`; T007 is not (same file, and it is the one that must be written deliberately).
- **US1, US2, and US4 touch disjoint files** and can be developed by three people concurrently once Phase 2 clears for US2.
- Polish: T042–T045, T047, T048 all `[P]`.

## Parallel Example: Phase 2 adapters

```bash
# After T009–T010 (core contract) land, both adapters proceed independently:
Task: "T013 Implement orders.getByGatewayRef in packages/adapters/pocketbase/src/index.ts"
Task: "T015 Implement orders.getByGatewayRef in packages/adapters/supabase/src/index.ts"
Task: "T014 Implement webhookEvents in packages/adapters/pocketbase/src/index.ts"
Task: "T016 Implement webhookEvents in packages/adapters/supabase/src/index.ts"
```

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1 Setup (T001–T004)
2. Phase 3 US1 (T020–T028)
3. **STOP and VALIDATE**: forged PayPal webhooks rejected; unconfigured webhook id fails closed
4. Ship. This closes the single most severe defect and requires **no schema change and no migration**.

US1 is deliberately first *and* independent: it needs no adapter work, so the highest-severity fix reaches users without waiting on the contract change.

### Incremental Delivery

1. Setup → US1 → ship (MVP: verification)
2. Foundational → US2 → migrate → ship (idempotency; **requires `pnpm migrate` on existing stores**)
3. US4 → ship (revalidation)
4. Polish: spec amendments, changeset, quickstart

### Deferred

**US3 (operator refunds)** is not in this task list. It ships as spec 020 after 017 (admin auth), because refund endpoints on today's unauthenticated `/admin` would expose a money-movement button to any visitor.

## Notes

- Money is integer cents everywhere; PayPal decimal↔cents conversion stays at the integration boundary.
- Every idempotent write is insert-and-catch. A `get`-then-`create` implementation passes casual review and fails T007.
- `release` on handler failure is mandatory — a claimed-then-failed event that is never released can never be retried, permanently losing that payment's side effects.
- Commit after each task or logical group; each checkpoint is a valid stopping point.
