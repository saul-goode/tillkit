# Feature Specification: Product Search

**Feature Branch**: `008-search`
**Created**: 2026-07-09
**Status**: Implemented (backfilled)
**Input**: Backfilled from implementation audit

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Shopper searches the catalog with automatic fallback (Priority: P1)

A shopper types a query on `/products` (or a client calls the search API) and gets matching products — served by Meilisearch when configured, otherwise by the database adapter's built-in search. The store works identically (with lower relevance quality) when Meilisearch is absent.

**Why this priority**: Search must never be a hard dependency; the fallback path is what makes it shippable in the starter.

**Independent Test**: Run the starter once with and once without `MEILISEARCH_HOST`/`MEILISEARCH_API_KEY` and confirm `/products?q=shirt` returns matches in both configurations.

**Acceptance Scenarios**:

1. **Given** Meilisearch env vars are set, **When** the shopper searches `/products?q=shirt`, **Then** up to 50 results come from the Meilisearch index.
2. **Given** Meilisearch env vars are absent, **When** the same search runs, **Then** results come from `database.products.search(q)` (PocketBase `name~`/`description~` contains-match) and the page renders normally.
3. **Given** an empty or whitespace query, **When** the search service is called, **Then** it short-circuits to `{items: [], total: 0}` without hitting any provider.
4. **Given** GET `/api/search?q=mug&page=2&perPage=10&status=active&sort=price:asc`, **Then** the route passes pagination, a status filter, and sort to the provider and returns `{items, total, page, perPage}` JSON; provider errors return 500 JSON, and a blank `q` returns an empty result.

---

### User Story 2 - Store developer keeps the index in sync with catalog mutations (Priority: P2)

When products are created, updated, or deleted through the product/admin routes, the search index is updated automatically, best-effort.

**Why this priority**: A stale index silently degrades Story 1; sync must ride existing mutations without new operator burden.

**Independent Test**: With a mock provider, create/update/delete a product via the API and assert `add`/`update`/`remove` were invoked; then make the provider throw and assert the mutation still succeeds.

**Acceptance Scenarios**:

1. **Given** a configured search service, **When** POST `/api/products` succeeds, **Then** `sync(product, 'create')` calls the provider's `add`; PATCH maps to `update`; DELETE maps to `remove(productId)`.
2. **Given** the provider throws during sync, **When** any mutation completes, **Then** the error is logged and the mutation response is unaffected (never fails the request).
3. **Given** the database provider, **When** sync runs, **Then** `add`/`remove`/`update` are no-ops by design — the database is always current.

---

### User Story 3 - Store developer swaps search backends behind one contract (Priority: P3)

A store developer selects a backend via `createSearchProvider({provider: 'database' | 'meilisearch', ...})` without touching consumers, and uses `mockSearchProvider` in tests.

**Why this priority**: Contract integrity keeps consumers backend-agnostic; valuable but invisible to shoppers.

**Independent Test**: Point `createSearchService` at each provider and run the same search/sync assertions against the shared `SearchProvider` interface.

**Acceptance Scenarios**:

1. **Given** `createSearchProvider({provider: 'meilisearch', host, apiKey})`, **Then** a REST-backed provider is returned (index name defaults to `products`, overridable via `MEILISEARCH_INDEX`); `{provider: 'database', database}` returns the fallback; an unknown provider throws.
2. **Given** `meilisearchProvider.index(products)`, **Then** it PATCHes index settings (searchable/filterable/sortable attributes, ranking rules) and POSTs documents augmented with a flattened `_searchable` field (`name + description + slug`).
3. **Given** `mockSearchProvider`, **Then** it matches name/description/slug in memory for tests (it is intentionally not constructible via the factory).

### Edge Cases

- Filter values containing `"` or Meilisearch filter syntax: interpolated raw into `key = "value"` / `key IN [...]` expressions — filter injection, see Known Gaps.
- Meilisearch returns `estimatedTotalHits` instead of `totalHits`: total falls back to the estimate, then 0.
- Database provider pagination: fetches ALL matches from the adapter, then slices in memory — acceptable at starter scale only.
- Products created before Meilisearch was configured: never indexed, silently missing from results (see Known Gaps).
- Non-OK Meilisearch response: provider throws with the response body; consumers (product search route, starter) catch and fall back to the database.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define a `SearchProvider` contract — `search(query, options)`, `index(products)`, `add(product)`, `remove(productId)`, `update(product)` — with `SearchOptions` supporting page, perPage, filters, sort.
- **FR-002**: System MUST ship a Meilisearch provider (REST client with Bearer auth) and a database provider that delegates to `db.products.search` with in-memory pagination and no-op index maintenance.
- **FR-003**: `createSearchService` MUST short-circuit empty/whitespace queries to an empty result and map `sync(product, 'create'|'update'|'delete')` to provider `add`/`update`/`remove`.
- **FR-004**: The starter MUST construct Meilisearch only when `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` are present (index name `MEILISEARCH_INDEX`, default `products`) and MUST fall back to database search when absent or on provider failure.
- **FR-005**: Server MUST expose GET `/api/search` with q/page/perPage/status/sort, returning `{items, total, page, perPage}` JSON and 500 JSON on provider error.
- **FR-006**: Product and admin mutations MUST sync the index best-effort; sync failures never fail the mutation.
- **FR-007**: Meilisearch filter expressions MUST escape or reject user-influenced values instead of raw string interpolation. [GAP]
- **FR-008**: System MUST provide an index rebuild/backfill command so an existing catalog can be (re)indexed after Meilisearch is configured. [GAP]
- **FR-009**: Search results MUST carry integer-cent prices unchanged; the index stores products as-is (price remains e.g. 1999, formatted to $19.99 only at render).

### Key Entities

- **SearchProvider**: Backend contract (search/index/add/remove/update); implementations: meilisearch, database, mock.
- **SearchResult**: `{items: Product[], total, page, perPage}` — uniform across providers.
- **SearchService**: Contract wrapper adding empty-query short-circuit and mutation `sync` mapping.
- **Indexed document**: Product plus flattened `_searchable` text field (Meilisearch bulk index path).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A store with no Meilisearch configuration serves every search query via the database fallback with zero errors at startup or request time.
- **SC-002**: With Meilisearch configured, a product mutation is searchable/absent in the index after the mutation response without operator action (best-effort, single request cycle).
- **SC-003**: Swapping `provider: 'database'` for `provider: 'meilisearch'` requires zero changes in server routes or starter templates.
- **SC-004**: 100% of search failures degrade to the database path or a JSON error — no search condition can take down a page render.

## Assumptions

- Relevance quality difference between backends is accepted: Meilisearch offers typo tolerance and ranking; DB fallback is substring matching.
- The catalog fits in memory for database-provider pagination at starter scale.
- Meilisearch API key and host are trusted deployment configuration (secrets in env vars only).

## Known Gaps

- **Filter injection in Meilisearch provider**: `packages/integrations/search/src/index.ts` builds filter strings by interpolating values into `${key} = "${value}"` / `IN [...]` without escaping quotes or operators; a crafted `status` value from `/api/search?status=` can alter the filter expression (FR-007).
- **No index rebuild/backfill command**: only `index()` exists as library surface; nothing calls it. Products created before Meilisearch was configured are never indexed and silently missing (FR-008).
- **Cross-reference — Supabase adapter fallback**: the database fallback's quality and safety depend on the adapter; Supabase's `products.search` uses `ilike` with raw query interpolation (injection surface). That defect belongs to the database-adapter spec but directly affects fallback search.
- **Index vs add inconsistency**: bulk `index()` adds the `_searchable` flattened field but single-document `add`/`update` do not, so incrementally synced documents lack it.

## Existing Implementation (reference)

- `/Users/rusty/projects/tillkit/packages/integrations/search/src/index.ts` — `SearchProvider` contract, `meilisearchProvider`, `databaseSearchProvider`, `mockSearchProvider`, `createSearchService`, `createSearchProvider` factory.
- `/Users/rusty/projects/tillkit/packages/server/src/routes/search.ts` — GET `/api/search` (q/page/perPage/status/sort).
- `/Users/rusty/projects/tillkit/packages/server/src/routes/products.ts` — GET `/search` with DB fallback; best-effort sync on mutations.
- `/Users/rusty/projects/tillkit/templates/starter/src/index.ts` — env-gated Meilisearch construction (`MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`, `MEILISEARCH_INDEX`).
- `/Users/rusty/projects/tillkit/templates/starter/src/app.ts` — `/products?q=` uses the search service, falls back to `database.products.search`.
