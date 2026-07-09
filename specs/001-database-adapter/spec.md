# Feature Specification: Database Adapter Contract

**Feature Branch**: `001-database-adapter`

**Created**: 2026-07-09

**Status**: Implemented (backfilled)

**Input**: Backfilled from implementation audit

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Swap databases without touching app code (Priority: P1)

A store developer builds their storefront against `DatabaseAdapter` and later moves from PocketBase to Supabase (or vice versa) by changing only the adapter construction line and environment variables. Every route, checkout flow, and admin screen keeps working identically.

**Why this priority**: The adapter contract is TillKit's core architectural promise; if adapters diverge behaviorally, everything above them silently breaks.

**Independent Test**: Run the starter's smoke tests against a mock adapter, then against each real adapter with seeded data; identical assertions pass.

**Acceptance Scenarios**:

1. **Given** a starter app on PocketBase, **When** the adapter is swapped to Supabase with equivalent data, **Then** product listing, cart operations, and order creation behave identically.
2. **Given** any adapter, **When** `products.get()` is called with a nonexistent id, **Then** it returns `null` (never throws).
3. **Given** any adapter, **When** a write operation fails (constraint violation, connection error), **Then** the error propagates to the caller.

---

### User Story 2 - Provision a fresh store programmatically (Priority: P2)

A developer points TillKit at an empty database and runs `adapter.setup(features)`; the collections/tables needed for the enabled feature set are created, and the result reports what was provisioned.

**Why this priority**: First-run experience. Manual schema setup is the single largest onboarding hurdle.

**Independent Test**: `setup()` against an empty database, then immediately run the smoke-test checklist.

**Acceptance Scenarios**:

1. **Given** an empty PocketBase instance and superuser auth, **When** `setup(defaultFeatures)` runs, **Then** `products`, `carts`, `orders`, `customers` collections exist and the result lists them with `created: true`.
2. **Given** a database where collections already exist, **When** `setup()` runs again, **Then** nothing is modified and `created: false` is returned (idempotent).
3. **Given** `features.collections: true`, **When** `setup()` runs, **Then** a `collections` store is additionally provisioned; **Given** `features.variants: false`, **Then** variant fields are omitted.

---

### User Story 3 - Query with filters, pagination, and search (Priority: P2)

A developer lists products with `{ limit, offset, sort, order, filters }` and searches by free text, getting paginated results with accurate `total` / `hasMore` metadata.

**Acceptance Scenarios**:

1. **Given** 60 active products, **When** `products.list({ limit: 50 })` is called, **Then** 50 items return with `hasMore: true`.
2. **Given** a product named `Test Shirt`, **When** `products.search("shirt")` is called, **Then** it matches on name or description (case-insensitive contains).
3. **Given** a filter value containing `"` or other special characters, **When** used in `list({ filters })` or `search()`, **Then** it is treated as a literal value, never as query syntax. [GAP]

---

### Edge Cases

- Reads for missing records (`get`, `getBySlug`, `getByNumber`, `getByEmail`, `cart.get`) return `null`; writes throw.
- `cart.updateItem` with quantity ≤ 0 removes the item (PocketBase: `<= 0`; Supabase: `=== 0` — behavior must be unified at `<= 0`). [GAP]
- `orders.create` without explicit statuses defaults to `pending` / `pending` / `unfulfilled`.
- Order numbers: `TK-YYYYMMDD-XXXX` (4 random base36 chars, uppercased). Collisions are possible and currently unhandled — creation must retry or the suffix must be widened. [GAP]
- Concurrent `cart.addItem` calls for the same session may race; last-write-wins is acceptable, lost items are not.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `@tillkit/core` MUST define `DatabaseAdapter` with four namespaces (`products`, `cart`, `orders`, `customers`) plus `setup(features)`; core MUST NOT import adapter code.
- **FR-002**: Every shipped adapter MUST implement the full contract with identical observable semantics (null-on-missing reads, throw-on-failed writes, quantity ≤ 0 removes cart item). [GAP — Supabase/PocketBase diverge on several points listed in Known Gaps]
- **FR-003**: `setup(features)` MUST provision all storage required by the enabled features, idempotently. [GAP — Supabase `setup()` builds SQL strings but never executes them; it reports `created: true` without creating anything]
- **FR-004**: All monetary fields MUST be stored and returned as integer cents with no transformation in the adapter layer.
- **FR-005**: User-supplied values used in filters or search queries MUST be escaped for the backend's query syntax. [GAP — PocketBase escapes only `"`; Supabase interpolates search text raw into a PostgREST `.or(...ilike...)` expression]
- **FR-006**: `cart.updateItem` MUST recompute the item's line total from its stored unit price. [GAP — Supabase hardcodes `line_total = quantity * 100`]
- **FR-007**: `orders.addTransaction` MUST append a transaction linked to the order and return the refreshed order.
- **FR-008**: List operations MUST support `limit`, `offset`, `sort`, `order`, and equality `filters`, returning `{ items, total, page, perPage, hasMore }`.
- **FR-009**: Order numbers MUST be unique per store; generation MUST tolerate collisions. [GAP]
- **FR-010**: Adapter field-name mapping (camelCase ↔ backend naming) MUST be applied on both read and write paths. [GAP — Supabase `orders.update` spreads camelCase keys onto snake_case columns]

### Key Entities

- **DatabaseAdapter**: the contract; consumers program only against it.
- **QueryOptions / PaginatedResult**: shared list semantics across namespaces.
- **SetupResult**: `{ created, createdCollections }` reporting provisioning outcomes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contract test suite runs identically against every shipped adapter and passes (currently no shared contract suite exists — adapters are only exercised indirectly).
- **SC-002**: Swapping adapters in the starter requires changing ≤ 2 lines of application code plus env vars.
- **SC-003**: `setup()` on an empty database yields a store that passes the TEST_RUNBOOK smoke checklist with zero manual schema steps.
- **SC-004**: Malicious filter/search input (quotes, operators, `%`) returns empty or literal-match results — never a backend error or data leak.

## Assumptions

- PocketBase requires superuser auth (`adminToken`) for collection creation; unauthenticated `setup()` only works on a fresh unsecured instance.
- The `adminEmail`/`adminPassword` fields in the PocketBase config are accepted but unused; only `adminToken` is honored. Either wire them or remove them.
- Cart items, order items, transactions, and addresses are stored relationally where the backend supports it (PocketBase: separate collections; Supabase: separate tables) — this is an adapter-internal detail invisible to the contract.

## Known Gaps

Fixed under spec 018 (verified against a live PocketBase v0.22.47):

- ~~Supabase `setup()` is a no-op that reports success~~ — now returns `created: false`, `createdCollections: []`, and a `requiredSql` array. Contract case 8 enforces this.
- ~~Supabase `cart.updateItem` hardcodes `line_total = quantity * 100`~~ — now computes from the item's real unit price (FR-006).
- ~~No shared adapter contract test suite exists~~ — `packages/adapters/__tests__/contract.ts`, run against both adapters (live PocketBase in CI; Supabase env-gated).
- ~~Order-number collision is unhandled~~ — and it was worse than documented. See below.

Discovered while implementing 018:

- **PocketBase field-level `unique: true` is silently ignored** (removed in v0.14; the SDK drops the unknown key). The adapter declared it on `orders.orderNumber`, `products.slug`, and `collections.slug` — **none were enforced**. Empirically confirmed: a legacy store accepts duplicate order numbers. Uniqueness now comes from an `indexes` array. Existing stores must run `pnpm migrate`.
- **PocketBase `setup()` never worked against a real server.** JSON fields require `options.maxSize` and select fields require `options.maxSelect` + `options.values`; the adapter passed `values` at the top level, so every `collections.create` failed with `validation_required`. This is why `TEST_RUNBOOK.md` instructs users to build collections by hand. Fixed.
- **The PocketBase SDK auto-cancels concurrent identical requests**, rejecting the earlier one with `status: 0`. On a server this is wrong: the success-page and webhook paths legitimately issue the same insert concurrently, and one would be cancelled rather than either winning or hitting the unique index. The adapter now sets `autoCancellation(false)`.
- **PocketBase text fields store `''`, never `NULL`.** A plain composite unique index on `(gateway, gatewayRef)` therefore makes the second manual order collide with the first. Partial indexes (`WHERE gatewayRef != ''`) are required.

Still open:

- The adapter emits the PocketBase **v0.22 `schema:` format**, renamed to `fields:` in v0.23. TillKit cannot provision a store on any PocketBase ≥ 0.23 (current release: 0.39.x). This is a hard compatibility ceiling and needs its own spec.
- Supabase `orders.update` doesn't snake_case its payload — camelCase updates target nonexistent columns.
- PocketBase escapes only double quotes in filters; Supabase escapes nothing in `search()`.
- Cart-item removal threshold differs (`<= 0` vs `=== 0`).
- The Supabase half of the contract suite is env-gated and therefore unverified in CI; parity is asserted from the contract, not demonstrated.

## Existing Implementation (reference)

- `packages/core/src/database/index.ts` — the contract.
- `packages/adapters/pocketbase/src/index.ts` — full implementation incl. working `setup()`.
- `packages/adapters/supabase/src/index.ts` — implementation with transform layer; stub `setup()`.
- `docs/deployment.md` — manual SQL that duplicates what `setup()` should do.
