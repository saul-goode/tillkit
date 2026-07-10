# Feature Specification: PocketBase ≥0.23 Compatibility

**Feature Branch**: `021-pocketbase-compatibility`

**Created**: 2026-07-09

**Status**: Implemented

**Input**: Discovered while implementing spec 018; verified empirically against live PocketBase v0.22.47 and v0.39.6

## Problem

`adapter.setup()` could not provision a store on any PocketBase newer than v0.22.
The current release is v0.39.x, so a developer following the README downloaded a
PocketBase that TillKit could not set up. This blocked every new user at first run.

The failure was worse than an error. Measured against v0.39.6:

- A collection-create payload using the v0.22 `schema:` key returns **HTTP 200 and
  creates a collection with zero user fields**. The key is silently ignored.
- The only reason `setup()` fails loudly at all is the unique indexes added in spec
  018: index creation then dies with `SQL logic error: no such column: slug`. Before
  018, `setup()` would have reported success and left behind empty collections.

Three independent breaks existed between v0.22 and v0.23+:

| Surface | v0.22 | v0.23+ |
|---|---|---|
| Field list key | `schema:` | `fields:` |
| Field options | nested `options: { maxSize, maxSelect, values }` | flat props on the field |
| `created` / `updated` | added implicitly to every collection | must be declared as `autodate` fields |
| Superuser auth | `POST /api/admins/auth-with-password` | `POST /api/collections/_superusers/auth-with-password` |

The `created` change was the quiet one: the adapter sorts `products.list` and
`orders.list` by `-created` and reads `record.created` as the fallback for
`processedAt` on webhook-ledger rows. Against a v0.23+ collection provisioned
without `autodate` fields, `sort=-created` returns HTTP 400 and `record.created` is
`undefined`.

## Decision

**TillKit targets PocketBase ≥0.23 only.** v0.22 and earlier are unsupported.

A payload carrying *both* `schema:` and `fields:` was verified to provision
correctly on both versions (each ignores the other's key), so dual support is
technically possible. It is rejected: it preserves a payload trick and two code
paths indefinitely in exchange for compatibility with a version nobody installs.
`setup()` never worked on ≥0.23, and only began working at all in spec 018, so
there is effectively no installed base depending on the v0.22 provisioning path.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Provision a store on a current PocketBase (Priority: P1)

A developer downloads today's PocketBase release, runs `pnpm db:setup`, and gets a
working store: every collection has its fields, its unique indexes, and working
`created` / `updated` timestamps.

**Why this priority**: This is the first thing every new user does. It does not
work. Nothing else in the project matters if a developer cannot get past setup.

**Independent Test**: Against a fresh PocketBase ≥0.23, run `pnpm db:setup`, then
the full adapter contract suite.

**Acceptance Scenarios**:

1. **Given** a fresh PocketBase v0.39.x, **When** `setup(defaultFeatures)` runs, **Then** all collections are created with their declared fields, `maxSize` / `maxSelect` / `values` applied, and their unique indexes present.
2. **Given** a provisioned store, **When** `products.list()` runs with no explicit sort, **Then** it sorts by `-created` and returns 200.
3. **Given** a provisioned store, **When** `setup()` runs a second time, **Then** nothing is modified and `created: false` is returned.
4. **Given** a PocketBase < 0.23, **When** `setup()` runs, **Then** it fails with a clear message naming the minimum supported version — never a silent partial provision.

---

### User Story 2 - Migrate and authenticate against a current PocketBase (Priority: P1)

`pnpm migrate` and the contract-test harness authenticate as superuser and repair
an existing store.

**Why this priority**: `migrate.ts` is how spec 018's unique indexes reach an
existing store. It authenticated via `pb.admins.authWithPassword`, which returns
404 on ≥0.23 — so the idempotency guarantees could not be installed at all.

**Acceptance Scenarios**:

1. **Given** admin credentials and a PocketBase ≥0.23, **When** `pnpm migrate` runs, **Then** it authenticates successfully and adds any missing fields and indexes.
2. **Given** a store already migrated, **When** `pnpm migrate` runs again, **Then** it is a clean no-op.

---

### Edge Cases

- A collection created before this change (v0.22 shape, implicit `created`) must keep working after the adapter is upgraded — `autodate` declarations are additive and `migrate` must not drop existing timestamps.
- `setup()` must detect the server version *before* writing anything, so an unsupported server produces zero side effects.
- Record CRUD through the JS SDK across a 16-minor-version gap was not verified up front; the contract suite run against v0.39.6 established it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The PocketBase adapter MUST emit collection definitions using the `fields:` key with flat field properties (`maxSize`, `maxSelect`, `values`), never the v0.22 `schema:` key or nested `options`.
- **FR-002**: Every provisioned collection MUST declare `created` and `updated` as `autodate` fields, because ≥0.23 no longer adds them implicitly and the adapter depends on both.
- **FR-003**: Superuser authentication MUST use the `_superusers` auth collection. `pb.admins.*` MUST NOT be called.
- **FR-004**: The pinned `pocketbase` JS SDK MUST be a version that speaks the ≥0.23 API (≥0.23; current latest is 0.27).
- **FR-005**: `setup()` MUST check the server version before performing any write and MUST fail with an actionable message naming the minimum supported version when it is too old. A silent partial provision is forbidden.
- **FR-006**: The shared adapter contract suite MUST run against a PocketBase ≥0.23 in CI, and MUST be the evidence that record CRUD, filtering, sorting, and the spec-018 unique indexes all still hold.
- **FR-007**: `TEST_RUNBOOK.md`, `README.md`, and `docs/deployment.md` MUST state the minimum supported PocketBase version and MUST NOT document the v0.22 collection shape.

### Key Entities

- **Collection definition**: the `fields:` array the adapter sends to `POST /api/collections`.
- **Field builder**: `text` / `number` / `email` / `json` / `select` / `autodate` — the only place the wire format is known.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a freshly downloaded PocketBase release, `pnpm db:setup` followed by the smoke checklist passes with zero manual schema steps.
- **SC-002**: The 21-case adapter contract suite passes against PocketBase ≥0.23 in CI.
- **SC-003**: `setup()` against a PocketBase < 0.23 writes nothing and exits with a message naming the minimum version.
- **SC-004**: No code path in `packages/` references `schema:`, nested field `options`, or `pb.admins`.

## Assumptions

- The v0.22 CI binary is replaced, not supplemented. There is no matrix across PocketBase versions.
- `migrate.ts` continues to target existing stores; it is not responsible for upgrading a v0.22 *server*, only for repairing collections on a supported one.

## Verified

Against a live PocketBase v0.39.6, with v0.22.47 kept alongside as the negative case:

- `db:setup` on a pristine server creates all five collections with their fields, `created`/`updated` timestamps, and unique indexes, seeds the demo products, and is a clean no-op on re-run.
- `setup()` against v0.22.47 throws `UnsupportedPocketBaseVersionError` and writes nothing.
- The 21-case adapter contract suite passes, including the concurrent-insert and unique-index cases.
- `products.list()` (default `sort=-created`), `getBySlug`, `search`, `create`, and `delete` all work through SDK 0.27.
- `migrate` repairs a store whose `orders` collection predates spec 018: it adds `gateway`/`gatewayRef` and both indexes, preserves existing rows and their `created` values, then rejects a duplicate `orderNumber` and a duplicate `(stripe, cs_1)` while still letting two manual orders coexist.

## Known Gaps

- PocketBase has no long-term-support policy; this spec pins a floor, not a ceiling, and a future release may break the `fields:` shape again. FR-005's version check is the guard that makes the next break loud.
- The version check probes for the `_superusers` auth route rather than reading a version number, because `/api/health` reports none. It answers "≥0.23 or not", not "which version".
- Supabase is untouched by this spec and its contract suite remains env-gated.

## Existing Implementation (reference)

- `packages/adapters/pocketbase/src/index.ts` — field builders, collection definitions, `setup()`.
- `templates/starter/scripts/migrate.ts` — `pb.admins.authWithPassword`.
- `packages/adapters/pocketbase/src/__tests__/contract.test.ts` — `pb.admins.authWithPassword`.
- `.github/workflows/ci.yml` — downloads PocketBase v0.22.47.
- `TEST_RUNBOOK.md` — documents the v0.22 collection shape by hand.
