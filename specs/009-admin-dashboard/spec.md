# Feature Specification: Admin Dashboard

**Feature Branch**: `009-admin-dashboard`

**Created**: 2026-07-09

**Status**: Partially implemented (backfilled)

**Input**: Backfilled from implementation audit

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Authenticated store operator manages the store (Priority: P1)

A store operator signs in and reaches an admin area at `/admin` that no anonymous visitor can access. From there they see today's revenue, today's order count, total products, and the five most recent orders.

**Why this priority**: An admin surface that mutates orders and products must not be world-writable; the constitution requires admin to be authenticatable before 1.0 and mandates documenting the gap until then.

**Independent Test**: Request any `/admin` route without a session and verify a redirect to login; sign in and verify the dashboard renders with correct stats.

**Acceptance Scenarios**:

1. **Given** no authenticated session, **When** any `/admin` route is requested, **Then** the request is rejected or redirected to a login page. [Currently fails — no auth exists]
2. **Given** an authenticated operator, **When** they open `/admin`, **Then** they see Today's Revenue (integer-cent sum formatted at display), Today's Orders count, Total Products, and the 5 most recent orders.

---

### User Story 2 - Review and progress orders (Priority: P2)

The operator lists orders, filters by status, opens an order detail page, and updates the order's status (e.g., paid → fulfilled).

**Independent Test**: Seed orders in mixed statuses; filter by `?status=paid`; open one; change status to fulfilled and verify persistence.

**Acceptance Scenarios**:

1. **Given** existing orders, **When** the operator opens `/admin/orders`, **Then** up to 50 orders render, and selecting a status in the filter dropdown auto-submits and narrows the list via `db.orders.list({ filters: { status } })`.
2. **Given** an order detail page, **When** the operator submits the status form, **Then** `db.orders.updateStatus` runs and the operator is redirected to `/admin/orders`; a missing status yields 400, an unknown id yields 404.

---

### User Story 3 - Product CRUD with search (Priority: P3)

The operator creates, edits, searches, and deletes products from `/admin/products`, with prices entered as integer cents and optional stock when inventory tracking is on.

**Independent Test**: Create a product at price 1999, search for it, edit it, delete it via the HTMX delete button, and confirm each step against the database.

**Acceptance Scenarios**:

1. **Given** the create form, **When** submitted, **Then** the product is created with `price` parsed as an integer (cents) and, when `features.inventoryTracking` is on and stock was entered, an inventory object (`available`, `quantity`, `allowOutOfStock: false`).
2. **Given** `?q=` on `/admin/products`, **Then** results come from the search service (page size 20) with a database fallback when the search service errors or is absent.
3. **Given** the product list, **When** Delete is clicked, **Then** an `hx-confirm` prompt guards an `hx-delete` request; on success the server sets `HX-Redirect: /admin/products`.
4. **Given** any product mutation, **Then** search index sync is attempted best-effort and a sync failure never fails the mutation (graceful degradation).

---

### Edge Cases

- Dashboard "today" stats are computed by client-side filtering of `db.orders.list({ limit: 100 })`; a store with more than 100 recent orders undercounts today's revenue and order count. [GAP]
- Order status dropdowns expose only `pending`/`paid`/`fulfilled`/`cancelled` — a subset of the `OrderStatus` values used elsewhere (e.g., refund-related statuses are unreachable from the UI).
- Variants are read-only in the edit form ("Variants can be added via API"); no variant CRUD exists in admin.
- Product and order fields (names, descriptions, emails) are interpolated into admin HTML without escaping; a hostile product name can inject markup into the admin UI.
- HTMX is loaded from `https://unpkg.com/htmx.org@1.9.12`; with no network access to the CDN, delete buttons silently stop working.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every `/admin` route MUST require an authenticated operator session; unauthenticated requests MUST be redirected or rejected. [GAP]
- **FR-002**: The dashboard MUST show today's revenue and order count computed over all of today's orders, not a fixed-size recent window. [GAP]
- **FR-003**: `/admin/orders` MUST list orders (currently capped at 50) with a status filter that round-trips via the `status` query parameter.
- **FR-004**: `/admin/orders/:id` MUST render order details and allow updating the status via `db.orders.updateStatus`, returning 400 for a missing status and 404 for an unknown order.
- **FR-005**: The status UI MUST expose every valid `OrderStatus` transition the domain supports. [GAP — only 4 of the statuses are offered]
- **FR-006**: `/admin/products` MUST paginate at 20 per page and support `?q` search through the configured search service, falling back to database search when the service is absent or failing.
- **FR-007**: Product create/update MUST treat price as integer cents (no decimal entry) and write inventory data only when `features.inventoryTracking` is enabled and stock is provided.
- **FR-008**: Product delete MUST be confirm-guarded (HTMX `hx-confirm`) and redirect the full page via `HX-Redirect` on success.
- **FR-009**: Search index synchronization after product mutations MUST be best-effort and never block or fail the mutation.
- **FR-010**: Admin pages MUST work without third-party CDNs (self-hosted HTMX asset). [GAP]
- **FR-011**: All user-controlled data rendered in admin HTML MUST be escaped. [GAP]

### Key Entities *(include if feature involves data)*

- **Order**: listed/filtered by `status`; admin mutates only `status`; totals rendered from integer cents.
- **Product**: full CRUD from admin; `price` in cents; optional `inventory` object; `variants` read-only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0 admin routes reachable without authentication (currently: all are reachable).
- **SC-002**: Dashboard revenue matches the database sum of today's orders exactly, for any order volume.
- **SC-003**: A full product lifecycle (create → search → edit → delete) completes from the UI with no API calls required, except variant management.
- **SC-004**: Admin remains fully functional with outbound internet blocked (no CDN dependency).

## Assumptions

- Single-operator model for now; roles/permissions are out of scope until an auth mechanism exists.
- `createAuthRoutes`/`requireAuth` exist in the server package (customer auth) but are intentionally not yet wired to admin; admin auth may reuse or extend them.
- Admin is mounted at `/admin` by both `createHonoApp` (configurable via `adminPath`, disabled via `enableAdmin: false`) and the starter.

## Known Gaps

- Zero authentication on every admin route — the single most severe gap in the project (FR-001).
- Today's stats computed from a 100-order window (FR-002).
- HTMX served from unpkg CDN, conflicting with the self-hosting story (FR-010).
- No HTML escaping of interpolated data (FR-011).
- Status dropdown covers only 4 statuses; variants are read-only.

## Existing Implementation (reference)

- `packages/server/src/routes/admin.ts` — `createAdminRoutes`, all routes and inline-styled layout.
- `packages/server/src/index.ts` — `createHonoApp` mounts admin unless `enableAdmin: false`.
- `templates/starter/src/app.ts` — starter mounts `createAdminRoutes` at `/admin`.
- `packages/server/src/routes/auth.ts` — `requireAuth`/`createAuthRoutes` (exists, unused by admin).
- `packages/server/src/__tests__/integration.test.ts` — admin integration test coverage (13 admin tests).
