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

- Supabase `setup()` is a no-op that reports success; docs/deployment.md compensates with manual SQL. Either execute DDL (e.g. via a SQL function) or return an explicit "manual setup required" result with the SQL — never claim `created: true` falsely.
- Supabase `cart.updateItem` hardcodes `line_total = quantity * 100` (comment admits "Will recalc actual price").
- Supabase `orders.update` doesn't snake_case its payload — camelCase updates target nonexistent columns.
- PocketBase escapes only double quotes in filters; Supabase escapes nothing in `search()`.
- Cart-item removal threshold differs (`<= 0` vs `=== 0`).
- Order-number collision is unhandled in both adapters.
- No shared adapter contract test suite exists; parity is unenforced.

## Existing Implementation (reference)

- `packages/core/src/database/index.ts` — the contract.
- `packages/adapters/pocketbase/src/index.ts` — full implementation incl. working `setup()`.
- `packages/adapters/supabase/src/index.ts` — implementation with transform layer; stub `setup()`.
- `docs/deployment.md` — manual SQL that duplicates what `setup()` should do.
