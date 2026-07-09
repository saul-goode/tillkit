# Feature Specification: Cart & Pricing

**Feature Branch**: `003-cart-and-pricing`
**Created**: 2026-07-09
**Status**: Implemented (backfilled)
**Input**: Backfilled from implementation audit

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Shopper builds a cart anonymously (Priority: P1)

A shopper adds products to a cart without creating an account. The cart is tied to a browser session cookie and survives page reloads for 30 days.

**Why this priority**: The cart is the bridge from browsing to checkout; anonymous carts are the starter kit's default purchase path.

**Independent Test**: With a fresh browser session, add a product, reload, and confirm the cart page shows the item and the nav badge shows the count.

**Acceptance Scenarios**:

1. **Given** a first-time visitor with no cookie, **When** they POST `/cart/add`, **Then** a `sessionId` cookie (UUID, HttpOnly, SameSite=Lax, Max-Age 2592000) is set and the item is stored against that session.
2. **Given** a product priced 1999, **When** the shopper adds quantity 2, **Then** the cart page shows a line total of $39.98 and a subtotal of $39.98 (computed as 2 × 1999 = 3998 cents).
3. **Given** an item already in the cart, **When** the same product+variant is added again, **Then** quantities merge into one line instead of creating a duplicate line.
4. **Given** an HTMX add-to-cart, **When** the fragment response arrives with the `X-Cart-Updated` header, **Then** the nav cart-count badge refreshes via GET `/cart/count` (plain-text number).

---

### User Story 2 - Shopper edits cart contents (Priority: P2)

A shopper changes quantities or removes lines from the cart page.

**Why this priority**: Cart editing is required for a usable purchase flow but depends on Story 1 existing.

**Independent Test**: With one cart line, POST `/cart/update` and `/cart/remove` and verify the resulting cart page.

**Acceptance Scenarios**:

1. **Given** a line with quantity 3, **When** the shopper updates it to 1, **Then** the cart shows quantity 1 and the recalculated line total.
2. **Given** a line with quantity 1, **When** the shopper updates the quantity to 0, **Then** the line is removed entirely (adapter deletes the row at quantity <= 0).
3. **Given** any update or remove, **When** the request completes, **Then** the shopper is redirected to `/cart` showing current state (works without JavaScript).

---

### User Story 3 - Store developer computes order totals (Priority: P3)

A store developer composes tax, shipping, and discount utilities from `@tillkit/core` to produce order totals in integer cents.

**Why this priority**: Pricing math is consumed by checkout and admin code; it is library surface rather than a shopper-visible journey.

**Independent Test**: Unit-test the pure functions in `packages/core/src/commerce/` with concrete cent values (covered by the existing 41 passing core tests).

**Acceptance Scenarios**:

1. **Given** subtotal 10000 and a matching tax rate of 0.0825 for country/province, **When** `calculateTax` runs, **Then** it returns 825 (Math.round to whole cents at that step).
2. **Given** shipping rates priced 599 and 999, **When** `calculateShipping` runs with no selected rate id, **Then** it returns the cheapest rate (599); with a selected id, it returns that rate's price.
3. **Given** a 10% percentage discount on subtotal 1999, **When** `calculateDiscount` runs, **Then** the discount is Math.round(1999 × 0.10) = 200 cents; a fixed discount of 500 yields exactly 500.
4. **Given** subtotal 3998, tax 330, shipping 599, discount 500, **When** cart totals are computed, **Then** total = 3998 + 330 + 599 − 500 = 4427 cents, rendered as $44.27.

### Edge Cases

- Empty cart: `/cart` renders an empty state with a "Continue Shopping" link; `/cart/count` returns 0.
- No tax rate matches the address: tax is 0, not an error.
- Discount larger than subtotal: current utilities do not clamp; consumers must guard against negative totals.
- Cookie deleted mid-session: a new sessionId is minted and the shopper gets an empty cart; the old cart is orphaned in the database.
- Discounts target the order only; item- or shipping-targeted discounts are not supported.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST key carts to an anonymous `sessionId` cookie generated with `crypto.randomUUID()`, set HttpOnly, SameSite=Lax, Path=/, Max-Age 30 days.
- **FR-002**: System MUST expose GET `/cart` (HTML page), GET `/cart/count` (plain-text item count), POST `/cart/add` (HTMX fragment + `X-Cart-Updated` header), POST `/cart/update`, and POST `/cart/remove` (redirect to `/cart`).
- **FR-003**: Adding the same product+variant combination MUST merge into the existing line's quantity, never duplicate lines.
- **FR-004**: Updating a line to quantity 0 (or below) MUST remove the line.
- **FR-005**: All monetary math MUST operate on integer cents; every step that could produce a fraction rounds with `Math.round` at that step; division by 100 happens only in `formatPrice`.
- **FR-006**: `calculateTax` MUST match a rate table entry by country/province and return rounded cents; no match yields 0.
- **FR-007**: `calculateShipping` MUST return the cheapest available rate by default and a specific rate when selected by id.
- **FR-008**: `calculateDiscount` MUST support `percentage` and `fixed` order-level discounts in cents.
- **FR-009**: Cart totals MUST be subtotal (sum of line totals) plus tax plus shipping minus discount.
- **FR-010**: Line totals persisted by every adapter MUST equal quantity × actual item unit price. [GAP]
- **FR-011**: Display currency MUST follow store configuration when the `multiCurrency` feature flag is enabled. [GAP]
- **FR-012**: Cart mutation endpoints MUST work without client JavaScript (form POST + redirect); HTMX is enhancement only.

### Key Entities

- **Cart**: Session-scoped container of items; identified by sessionId; has computed subtotal/total (integer cents), never persisted as floats.
- **CartItem**: Line joining product (and optional variant) to a quantity; carries unit price and lineTotal in integer cents.
- **TaxRate / ShippingRate / Discount**: Pure-data inputs to the pricing functions; rates and amounts expressed as decimal multipliers or integer cents respectively.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shopper can add, edit, and remove cart items with client JavaScript disabled; every mutation lands back on an accurate `/cart` page.
- **SC-002**: For any cart, displayed subtotal equals the exact integer-cent sum of line totals — zero float drift (e.g. 3 × 1999 renders $59.97, never $59.969…).
- **SC-003**: Cart contents survive browser restarts for 30 days via the session cookie.
- **SC-004**: Pricing utilities are fully covered by unit tests (41 passing in `packages/core`) with cent-exact assertions.

## Assumptions

- One cart per session; no cart merging on login (accounts are out of scope here).
- Orphaned carts from expired/cleared cookies are acceptable; no cleanup job is specified.
- Single-currency (USD) display is acceptable until multiCurrency is implemented (see Known Gaps).

## Known Gaps

- **Supabase adapter pricing bug**: `cart.updateItem` in `packages/adapters/supabase/src/index.ts` writes `line_total: quantity * 100`, hardcoding a 100-cent unit price instead of the item's real price (violates FR-010; the create path computes `item.price * item.quantity` correctly).
- **Currency hardcoded**: the starter passes literal `'USD'` to every `formatPrice` call in `templates/starter/src/app.ts`; a `multiCurrency` feature flag exists but nothing reads it (FR-011).
- **No discount clamping**: a discount exceeding the subtotal can drive the computed total negative; callers must guard.

## Existing Implementation (reference)

- `/Users/rusty/projects/tillkit/templates/starter/src/app-context.ts` — `getSessionId` / `setSessionCookie` (UUID cookie, 30-day, HttpOnly, SameSite=Lax); layout with cart-count badge script.
- `/Users/rusty/projects/tillkit/templates/starter/src/app.ts` — GET `/cart`, GET `/cart/count`, POST `/cart/add|update|remove` routes.
- `/Users/rusty/projects/tillkit/packages/core/src/commerce/cart.ts` — `addToCart` (merge), `calculateLineTotal`, `calculateCartTotals`, `updateCartItemQuantity`, `removeFromCart`, `getCartItemCount`.
- `/Users/rusty/projects/tillkit/packages/core/src/commerce/pricing.ts` — `calculateTax`, `calculateShipping`, `calculateDiscount`, `calculateOrderTotal`.
- `/Users/rusty/projects/tillkit/packages/core/src/commerce/product.ts` — `formatPrice` (÷100 + `Intl.NumberFormat` at display boundary).
- `/Users/rusty/projects/tillkit/packages/adapters/pocketbase/src/index.ts` — cart persistence; deletes line at quantity <= 0.
- `/Users/rusty/projects/tillkit/packages/adapters/supabase/src/index.ts` — cart persistence (contains the line_total bug).
