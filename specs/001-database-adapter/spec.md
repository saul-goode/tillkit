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
- `cart.updateItem` with quantity ≤ 0 removes the item. Both adapters now use `<= 0`; a negative quantity must never persist, or checkout would credit the shopper.
- `orders.create` without explicit statuses defaults to `pending` / `pending` / `unfulfilled`.
- Order numbers: `TK-YYYYMMDD-XXXX` (4 random base36 chars, uppercased). Collisions are possible and currently unhandled — creation must retry or the suffix must be widened. [GAP]
- Concurrent `cart.addItem` calls for the same session may race; last-write-wins is acceptable, lost items are not.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `@tillkit/core` MUST define `DatabaseAdapter` with four namespaces (`products`, `cart`, `orders`, `customers`) plus `setup(features)`; core MUST NOT import adapter code.
- **FR-002**: Every shipped adapter MUST implement the full contract with identical observable semantics (null-on-missing reads, throw-on-failed writes, quantity ≤ 0 removes cart item). [GAP — Supabase/PocketBase diverge on several points listed in Known Gaps]
- **FR-003**: `setup(features)` MUST provision all storage required by the enabled features, idempotently. An adapter that cannot execute DDL MUST report `created: false` and surface the SQL the operator has to run, never claim success.
- **FR-004**: All monetary fields MUST be stored and returned as integer cents with no transformation in the adapter layer.
- **FR-005**: User-supplied values used in filters or search queries MUST be escaped for the backend's query syntax. [GAP — PocketBase escapes only `"`; Supabase interpolates search text raw into a PostgREST `.or(...ilike...)` expression]
- **FR-006**: `cart.updateItem` MUST recompute the item's line total from its stored unit price.
- **FR-007**: `orders.addTransaction` MUST append a transaction linked to the order and return the refreshed order.
- **FR-008**: List operations MUST support `limit`, `offset`, `sort`, `order`, and equality `filters`, returning `{ items, total, page, perPage, hasMore }`.
- **FR-009**: Order numbers MUST be unique per store; generation MUST tolerate collisions. [GAP]
- **FR-010**: Adapter field-name mapping (camelCase ↔ backend naming) MUST be applied on both read and write paths. [GAP — Supabase `orders.update` spreads camelCase keys onto snake_case columns]
- **FR-011**: `cart.get` MUST return items in the contract's `CartItem` shape (camelCase, with a stable `id` addressable by `updateItem` / `removeItem`), and `subtotal` MUST equal the sum of `price × quantity` over those items. An adapter MUST NOT return raw backend rows.
- **FR-012**: `cart.addItem` for a `(productId, variantId)` pair already in the cart MUST increment that line's quantity rather than append a second line.
- **FR-013**: The PocketBase adapter MUST target PocketBase ≥0.23 and MUST refuse to provision against an older server rather than partially create collections (spec 021).

### Key Entities

- **DatabaseAdapter**: the contract; consumers program only against it.
- **QueryOptions / PaginatedResult**: shared list semantics across namespaces.
- **SetupResult**: `{ created, createdCollections }` reporting provisioning outcomes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contract test suite runs identically against every shipped adapter and passes. `packages/adapters/__tests__/contract.ts` exists and runs against a live PocketBase in CI; the Supabase harness is env-gated and skips, so parity there is asserted rather than demonstrated.
- **SC-002**: Swapping adapters in the starter requires changing ≤ 2 lines of application code plus env vars.
- **SC-003**: `setup()` on an empty database yields a store that passes the TEST_RUNBOOK smoke checklist with zero manual schema steps.
- **SC-004**: Malicious filter/search input (quotes, operators, `%`) returns empty or literal-match results — never a backend error or data leak.

## Assumptions

- PocketBase requires superuser auth for collection creation. The adapter takes an `adminToken`; `db:setup` and `migrate` also accept `POCKETBASE_ADMIN_EMAIL` + `POCKETBASE_ADMIN_PASSWORD` and exchange them for one via the `_superusers` auth collection.
- The `adminEmail`/`adminPassword` fields on `PocketbaseAdapterConfig` are accepted but unused; only `adminToken` is honored. Either wire them or remove them. [GAP]
- Structured collections diverge by backend and this is invisible to the contract: PocketBase stores cart items, order items, and transactions as JSON columns; Supabase stores them as related tables.

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

Discovered while implementing 018 US4 (cart, verified against a live PocketBase v0.22.47):

- **The PocketBase cart was entirely non-functional.** `addItem` / `updateItem` / `removeItem` / `clear` wrote to a `cart_items` collection that `setup()` never provisioned, so every mutation failed with a 404; and `cart.get()` read the `carts.items` JSON column, which nothing ever wrote, so it returned `[]` regardless. The storefront cart could never hold an item on the starter's default adapter. No test covered the round-trip. Fixed by making all four mutations operate on the JSON column that `get()` reads — the design the schema, `TEST_RUNBOOK.md`, and CLAUDE.md all already describe. `cart_items` was vestigial (FR-011).
- **Supabase `cart.get()` returned untransformed `cart_items` rows**, so callers reading `item.productId` or `item.lineTotal` silently got `undefined` where the contract promises them. Fixed with a `toCartItem` mapper (FR-011).
- **Neither adapter recomputed `subtotal` after a cart mutation**; PocketBase never wrote it and Supabase returned a stale stored column. Both now derive it from the items, so it cannot drift from what the shopper is charged (FR-011).
- **Neither adapter deduplicated `addItem`**, so adding the same product twice produced two lines (FR-012).
- Cart behavior is now covered by seven cases in the shared contract suite. The absence of *any* cart coverage is what let a completely dead cart ship.

Closed by spec 021 (PocketBase ≥0.23 compatibility):

- ~~The adapter emits the PocketBase v0.22 `schema:` format~~ — it now emits `fields:` with flat field props, declares `created`/`updated` as `autodate`, and `setup()` refuses a pre-0.23 server rather than half-provisioning it. The contract suite runs against v0.39.6.
- ~~`docs/deployment.md` contained two conflicting `cart_items` DDL blocks~~ — the PocketBase section no longer hand-writes SQL at all; it calls `db:setup`.

Still open:

- Supabase `orders.update` doesn't snake_case its payload — camelCase updates target nonexistent columns.
- PocketBase escapes only double quotes in filters; Supabase escapes nothing in `search()`.
- The Supabase half of the contract suite is env-gated and therefore unverified in CI; parity is asserted from the contract, not demonstrated. **The seven new cart cases are unrun against Supabase** — its cart fixes are written to the contract, not proven by it.
- `decrementInventoryForOrder` ignores `variantId` and always decrements product-level inventory, while a variant may carry its own `inventory`. Revalidation reads variant inventory, so the two can disagree.

## Existing Implementation (reference)

- `packages/core/src/database/index.ts` — the contract.
- `packages/adapters/pocketbase/src/index.ts` — full implementation incl. working `setup()`.
- `packages/adapters/supabase/src/index.ts` — implementation with transform layer; stub `setup()`.
- `docs/deployment.md` — manual SQL that duplicates what `setup()` should do.
