# Feature Specification: Discounts & Promo Codes

**Feature Branch**: `013-discounts`

**Created**: 2026-07-09

**Status**: Partially implemented (backfilled)

**Input**: Backfilled from implementation audit

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Shopper applies a promo code at cart/checkout (Priority: P1)

A shopper enters a code (case-insensitive) in the cart; the engine validates it (enabled, date window, usage limit, minimum purchase) and the cart's `totalDiscount` and total update before payment.

**Why this priority**: A discount engine that no checkout consults produces zero business value; wiring code entry into the cart is the smallest slice that makes the package real.

**Independent Test**: Seed a `SAVE10` percentage discount, apply it to a cart, and verify the reduced total flows into the payment session amount.

**Acceptance Scenarios**:

1. **Given** an enabled 10% order discount `SAVE10` and a cart subtotal of 10000, **When** the shopper applies `save10`, **Then** `applyCode` matches case-insensitively and returns an `AppliedDiscount` of 1000 cents. [Engine implemented; no cart/checkout UI calls it — GAP]
2. **Given** a discount outside its `startsAt`/`expiresAt` window, disabled, over its `usageLimit`, or a cart under `minPurchase`, **Then** validation fails with the specific error message and nothing is applied.
3. **Given** a valid application, **When** the order is placed, **Then** `incrementUsage` records the redemption and the discount amount is persisted on the order. [GAP — nothing does this]

---

### User Story 2 - Automatic discounts apply themselves (Priority: P2)

Discounts without a code apply automatically; when several qualify, the best one (largest amount) is used.

**Acceptance Scenarios**:

1. **Given** multiple enabled code-less discounts, **When** `getAutomaticDiscounts(cart)` runs, **Then** valid ones return sorted by amount descending, and `getBestAutomaticDiscount` returns the first. (Engine implemented; unconsumed.)

---

### User Story 3 - Operator manages discounts in admin (Priority: P3)

A store operator creates, disables, and reviews usage of discounts (percentage, fixed amount, free shipping, buy-X-get-Y) from the admin UI, persisted in the database.

**Acceptance Scenarios**:

1. **Given** the admin, **When** the operator creates a discount via a form (or `DiscountPresets` semantics), **Then** it persists through the `DatabaseAdapter` and survives restart. [GAP — no admin UI, no persistence]
2. **Given** `getStats()`, **Then** the operator sees per-discount `usageCount` vs `usageLimit`.

---

### Edge Cases

- Percentage math rounds to integer cents per step (`Math.round(subtotal * pct/100)`), capped by `maxDiscount`; fixed amounts cap at the subtotal (order) or line total (line_item) — a discount can never exceed what it applies to.
- `buy_x_get_y`: sets = `floor(quantity / (buyQuantity + getQuantity))`, discount = free items × price × `getPercentageOff`; quantities below one full set discount nothing.
- `free_shipping` discounts `cart.totalShipping` — which is currently always 0 in real carts (spec 015), making free-shipping codes no-ops today.
- Product targeting: `excludedProductIds` wins; `productIds` acts as an allowlist; `variantIds` only checked when the item has a variant.
- `amount <= 0` after calculation is rejected as "does not apply to any items".
- Usage counts live in the in-memory `Map`; restarts reset `usageCount`, so `usageLimit` is unenforceable across process restarts. [GAP]

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support discount types `percentage`, `fixed_amount`, `free_shipping`, `buy_x_get_y` with targets `order`, `line_item`, `shipping` (implemented in `DiscountEngine`).
- **FR-002**: Validation MUST enforce enabled state, date window, usage limit, and minimum purchase, and reject zero-value applications (implemented).
- **FR-003**: All discount amounts MUST be integer cents; each fractional step rounds immediately (implemented).
- **FR-004**: Shoppers MUST be able to enter a promo code at cart/checkout and see the discounted total before paying. [GAP — no consumer]
- **FR-005**: Applied discounts MUST populate `Cart.totalDiscount`/`Order.totalDiscount` and reduce the payment-session amount. [GAP — fields exist on the types but nothing populates them via this engine]
- **FR-006**: Discounts and their usage counts MUST persist via a `DatabaseAdapter`-backed store so limits survive restarts. [GAP — in-memory Map only]
- **FR-007**: Redemption MUST increment usage exactly once per completed order (idempotent under webhook redelivery, per constitution). [GAP]
- **FR-008**: Operators MUST be able to manage discounts from admin. [GAP — no UI]
- **FR-009**: The project MUST have one discount system: the engine and the older, tested `calculateDiscount` in `commerce/pricing.ts` MUST be consolidated. [GAP — two overlapping implementations are exported from core]

### Key Entities *(include if feature involves data)*

- **Discount**: id, optional `code` (absent = automatic), type/target, `amount` (percent 0-100 or cents), constraints (`minPurchase`, `maxDiscount`, `usageLimit`, date window), `appliesTo` product/variant filters, `buyXGetY` config, `enabled`, timestamps.
- **AppliedDiscount**: calculated result — id, code, type/target, `amount` in cents, human description.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A promo code entered in the cart reduces the amount actually charged by the payment gateway (currently impossible).
- **SC-002**: A discount with `usageLimit: 100` can never be redeemed a 101st time, across restarts and webhook retries.
- **SC-003**: Exactly one discount code path exists in `@tillkit/core` (currently two).
- **SC-004**: All engine math holds the integer-cents invariant — zero fractional cent values in any order record.

## Assumptions

- Single-discount-per-order is acceptable for v1 (`getBestAutomaticDiscount` semantics); stacking rules are future work.
- `DiscountPresets` factories (`percentageOff`, `fixedOff`, `freeShipping`, `buyXGetY`) define the canonical creation defaults for the future admin UI.
- Persistence will extend `DatabaseAdapter` (constitution II: implemented in both shipped adapters in the same change set).

## Known Gaps

- Zero consumers: no checkout path applies discounts, no admin UI manages them (FR-004, FR-008).
- No persistence — in-memory Map; `usageCount` lost on restart, limits unenforceable (FR-006, FR-007).
- `Cart`/`Order` `totalDiscount` fields exist but are never populated by this engine (FR-005); `commerce/cart.ts` already subtracts `totalDiscount` in its total calculation.
- Two overlapping discount systems: `DiscountEngine` (untested-in-flow) and the older, simpler, tested `calculateDiscount` in `commerce/pricing.ts` (FR-009).
- Free-shipping discounts are no-ops while shipping is never quoted (spec 015 dependency).

## Existing Implementation (reference)

- `packages/core/src/discounts/index.ts` — types, `DiscountEngine`, `DiscountPresets`, `createDiscountEngine`.
- `packages/core/src/index.ts` — exports (aliasing `Discount` as `PromoDiscount`).
- `packages/core/src/commerce/pricing.ts` — older `calculateDiscount` (tested in `packages/core/src/index.test.ts`).
- `packages/core/src/types/index.ts`, `packages/core/src/commerce/cart.ts` — `totalDiscount` fields and total math.
