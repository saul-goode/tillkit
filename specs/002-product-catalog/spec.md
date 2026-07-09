# Feature Specification: Product Catalog

**Feature Branch**: `002-product-catalog`
**Created**: 2026-07-09
**Status**: Implemented (backfilled)
**Input**: Backfilled from implementation audit

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Shopper browses and views products (Priority: P1)

A shopper lands on the storefront, sees featured products on the home page, browses the full product list, and opens a product detail page showing price, images, and an add-to-cart control.

**Why this priority**: Browsing is the entry point of every purchase; without it the store has no function.

**Independent Test**: Seed one active product, load `/`, `/products`, and `/products/:slug`, and confirm the product renders with a correctly formatted price.

**Acceptance Scenarios**:

1. **Given** an active product with price 1999 (integer cents), **When** the shopper opens `/products/:slug`, **Then** the page renders the name and the price formatted as $19.99.
2. **Given** at least 7 active products, **When** the shopper loads the home page, **Then** exactly 6 featured products are shown with a link to `/products`.
3. **Given** a slug that matches no product, **When** the shopper requests `/products/:slug`, **Then** a 404 page with a link back to `/products` is rendered.
4. **Given** the product list page, **When** the shopper loads `/products` with no query, **Then** up to 50 products render along with a search box.

---

### User Story 2 - Store developer manages products via JSON API (Priority: P2)

A store developer creates, updates, lists, and deletes products through a JSON API so seed scripts, admin tools, and external systems can manage the catalog.

**Why this priority**: The catalog must be populatable and maintainable programmatically before any storefront traffic matters.

**Independent Test**: Exercise POST, GET (list/by-slug), PATCH, and DELETE against `/api/products` and confirm JSON responses and status codes.

**Acceptance Scenarios**:

1. **Given** a valid product payload with price 4500, **When** POST `/api/products` is called, **Then** the response is 201 with the created product carrying price 4500 (no decimal conversion).
2. **Given** 45 products, **When** GET `/api/products?page=2&limit=20` is called, **Then** items 21–40 are returned via offset pagination.
3. **Given** products in draft and active status, **When** GET `/api/products?status=active` is called, **Then** only active products are returned.
4. **Given** an unknown slug, **When** GET `/api/products/:slug` is called, **Then** the response is 404 with a JSON error body.
5. **Given** a product mutation while the search index is unreachable, **When** POST/PATCH/DELETE completes, **Then** the API request still succeeds and the sync failure is only logged.

---

### User Story 3 - Shopper finds products by keyword (Priority: P3)

A shopper types a keyword into the product list search box or an API client calls the product search endpoint and receives matching products.

**Why this priority**: Useful once the catalog exceeds a screenful; browsing works without it.

**Independent Test**: Call GET `/api/products/search?q=shirt` with and without a configured search service and confirm matches are returned either way.

**Acceptance Scenarios**:

1. **Given** no `q` parameter, **When** GET `/api/products/search` is called, **Then** `{ items: [] }` is returned without querying any backend.
2. **Given** a configured search service that throws, **When** GET `/api/products/search?q=x` is called, **Then** the route falls back to `db.products.search(q)` and still returns results.

### Edge Cases

- Product with `status: 'draft'` or `'archived'`: excluded only when the caller filters by status; the list endpoint returns all statuses by default.
- Product fields containing HTML (e.g. name `<script>alert(1)</script>`): currently interpolated into storefront pages unescaped — see Known Gaps.
- `compareAtPrice` present: available on the type for strikethrough pricing; display is up to the template.
- Non-numeric `page`/`limit` query values parse to `NaN` and are passed to the adapter unvalidated.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST represent a product with slug, name, price (integer cents), optional compareAtPrice (integer cents), images, variants, options, inventory, seo, status (`draft` | `active` | `archived`), and optional subscription metadata.
- **FR-002**: System MUST expose GET `/api/products` with page/limit pagination and an optional status filter, returning a JSON list result.
- **FR-003**: System MUST expose GET `/api/products/:slug` returning the product, or a 404 JSON error when the slug is unknown.
- **FR-004**: System MUST expose POST `/api/products` (201), PATCH `/api/products/:id`, and DELETE `/api/products/:id` for catalog management.
- **FR-005**: Product mutations MUST sync to the search index best-effort: a sync failure is logged and MUST NOT fail the API request (graceful degradation of the optional search integration).
- **FR-006**: Catalog mutation endpoints MUST require authentication before TillKit 1.0. [GAP]
- **FR-007**: Storefront MUST render a home page with up to 6 featured products, a `/products` list of up to 50 products with a search box, and a `/products/:slug` detail page with an HTMX add-to-cart form.
- **FR-008**: Storefront MUST render prices via `formatPrice`, dividing cents by 100 only at the display boundary (1999 → $19.99).
- **FR-009**: Storefront pages MUST remain functional without client JavaScript; HTMX is progressive enhancement only.
- **FR-010**: Storefront MUST HTML-escape product-sourced fields (name, description, image URLs) when interpolating into HTML. [GAP]
- **FR-011**: GET `/api/products/search?q=` MUST return matches from the search service when configured, falling back to the database adapter's search on error or absence.

### Key Entities

- **Product**: Catalog unit. Slug (URL identity), name, price/compareAtPrice in integer cents, images, variants (each with own sku/price/inventory), options, inventory levels, seo fields, lifecycle status, optional subscription metadata.
- **ProductVariant**: Purchasable variation of a product; carries sku, price override (integer cents), and its own inventory.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can create a product via the API and see it on the storefront within one request cycle (no rebuild or cache flush).
- **SC-002**: 100% of displayed prices are derived from integer cents via `formatPrice`; no monetary value is stored or transmitted as a float.
- **SC-003**: All catalog pages render fully server-side; the storefront works with client JavaScript disabled except for the cart-count badge.
- **SC-004**: A search-index outage causes zero failed catalog API requests (sync errors are logged only).

## Assumptions

- Catalog data is entered by a trusted store operator today; the missing HTML escaping (FR-010) is tolerable only under that assumption and is still tracked as a gap.
- Offset pagination is sufficient at starter-kit catalog sizes; no cursor pagination is required.
- Draft/archived visibility rules on the storefront are the template author's responsibility; the API is deliberately unfiltered by default.

## Known Gaps

- **No auth on mutation routes**: POST/PATCH/DELETE in `packages/server/src/routes/products.ts` are labeled admin but enforce no authentication; anyone who can reach the API can alter the catalog (FR-006). Constitution requires this be documented until admin auth ships.
- **No HTML escaping in storefront templates**: product name/description/images are string-interpolated into pages in `templates/starter/src/app.ts` without escaping, an XSS vector if product data is ever untrusted (FR-010).
- **Unvalidated pagination input**: non-numeric `page`/`limit` become `NaN` and reach the adapter unchecked.

## Existing Implementation (reference)

- `/Users/rusty/projects/tillkit/packages/core/src/types/index.ts` — Product/ProductVariant types (integer-cents price, status union, subscription metadata).
- `/Users/rusty/projects/tillkit/packages/server/src/routes/products.ts` — JSON API: list, search with DB fallback, get-by-slug 404, create/update/delete with best-effort search sync.
- `/Users/rusty/projects/tillkit/templates/starter/src/app.ts` — home (6 featured), `/products` (50 + search box), `/products/:slug` detail with HTMX add-to-cart, 404 page.
- `/Users/rusty/projects/tillkit/templates/starter/src/app-context.ts` — shared layout, adapter construction.
- `/Users/rusty/projects/tillkit/packages/core/src/commerce/product.ts` — `formatPrice` display-boundary conversion.
