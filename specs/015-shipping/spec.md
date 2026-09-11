# Feature Specification: Shipping Rates & Fulfillment

**Feature Branch**: `015-shipping`

**Created**: 2026-07-09

**Status**: Partially implemented (backfilled)

**Input**: Backfilled from implementation audit

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Shopper sees and pays real shipping at checkout (Priority: P1)

During checkout, the store quotes shipping rates from the configured provider against the shopper's address; the chosen rate is added to the order total in integer cents. With no provider configured, the flat-rate provider serves as the zero-config default.

**Why this priority**: Checkout currently collects a shipping address via Stripe but never quotes rates — every order ships at `totalShipping: 0` unless set manually, which is silent revenue loss.

**Independent Test**: Configure flat-rate (domestic 500), check out a 20oz cart to a domestic address, and verify the payment session and order carry 750 shipping (500 × 1.5 weight tier).

**Acceptance Scenarios**:

1. **Given** a configured provider, **When** checkout has a destination address, **Then** `calculateShipping` maps cart items to packages and offers the returned rates before payment. [GAP — no checkout path calls this]
2. **Given** flat-rate config, **Then** rates are: base (domestic vs international) × weight multiplier (>16oz ×1.5, >32oz ×2, >64oz ×2.5), rounded to cents, plus an Expedited option at ×1.5 (5/14 vs 2/7 delivery days). (Implemented.)
3. **Given** returned rates, **Then** `selectRate` supports `cheapest`, `fastest`, or a `serviceLevel` preference, falling back to cheapest when no match. (Implemented.)

---

### User Story 2 - Operator buys a label and tracks post-order (Priority: P2)

After an order is paid, the operator purchases a shipping label for the selected rate (EasyPost) and shoppers/operators can view tracking status and events.

**Acceptance Scenarios**:

1. **Given** EasyPost, **When** `createShipment(rateId, from, to, packages)` runs, **Then** addresses/parcel/shipment are created and the rate is bought via `/shipments/:id/buy`, returning tracking number/URL, `labelUrl`, and the purchased rate converted dollars→cents (`Math.round(parseFloat(rate) * 100)`). (Implemented; no order-flow caller — GAP.)
2. **Given** a tracking number, **Then** `getTracking` creates an EasyPost tracker and maps status and timestamped events. (Implemented; unconsumed.)
3. **Given** flat-rate, **Then** `createShipment`/`getTracking` return intentional mocks (empty tracking) — documented as such, acceptable for the no-carrier default.

---

### Edge Cases

- Currency: EasyPost returns decimal dollar strings; conversion to integer cents happens immediately at the integration boundary (constitution IV). Flat-rate math is cents throughout.
- `mapServiceLevel` is a keyword heuristic on the carrier service name (overnight/next/express; expedited/priority/2 day; international/worldwide; else standard) — carrier renames can misclassify.
- EasyPost `testMode` flag does not change the base URL — both branches are `https://api.easypost.com/v2`; the API key alone determines test vs production. Config implies behavior it doesn't have.
- Missing contact data: EasyPost addresses fall back to name "Ship To" and hardcoded phone `555-555-5555` (carriers require a phone) — placeholder data on real labels.
- Multiple packages are collapsed into one parcel for rating (summed weight, max length/width, summed height); `createShipment` drops dimensions entirely and sends only total weight. [GAP — dimensional/oversize pricing is wrong]
- `calculateShipping` enforces a 1oz minimum per item but ignores `item.quantity` when building package weight, and hardcodes declared `value: 0`. [GAP]
- `FlatRateConfig.freeThreshold` is declared but never read — free-shipping-over-X does not work. [GAP]

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST define a provider contract — `getRates`, `createShipment`, `getTracking` — with rates/labels in integer cents (implemented).
- **FR-002**: Checkout MUST quote rates from the configured provider for the shopper's destination and add the selected rate to the order's `totalShipping`. [GAP — nothing imports `@tillkit/integration-shipping`; Stripe collects the address but no rating occurs]
- **FR-003**: Flat-rate MUST be the zero-config default provider so shipping charges work with no carrier account. [GAP — provider exists but is never constructed as a default anywhere]
- **FR-004**: Rate conversion from carrier decimal strings MUST happen immediately at the integration boundary with `Math.round` (implemented for EasyPost).
- **FR-005**: Package weight for rating MUST account for item quantities, and declared value MUST reflect item prices in cents. [GAP — quantity ignored, `value` hardcoded 0]
- **FR-006**: Label purchase MUST transmit the parcel dimensions used for rating, not weight alone. [GAP — `createShipment` sends only total weight]
- **FR-007**: `FlatRateConfig.freeThreshold` MUST grant free shipping when the order subtotal meets it. [GAP — field exists, never evaluated]
- **FR-008**: EasyPost `testMode` MUST either select the correct environment or be removed as misleading. [GAP — flag has no effect; the key determines the environment]
- **FR-009**: Operators MUST be able to buy labels and view tracking from the order detail page post-payment. [GAP — no admin/order integration]
- **FR-010**: A missing shipping integration MUST degrade gracefully — checkout proceeds with a defined fallback (flat rate or zero) and never crashes (constitution III).

### Key Entities *(include if feature involves data)*

- **ShippingRate**: id, carrier, service, `serviceLevel`, `rate` (cents), currency, delivery estimate.
- **Package**: weight (oz), optional dimensions (in), declared `value` (cents).
- **ShipmentResult / TrackingInfo**: label purchase output (tracking number/URL, `labelUrl`, cents rate) and status/event history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero paid orders with `totalShipping: 0` in a store that configured shipping (today: all orders).
- **SC-002**: A flat-rate store charges correct tiered shipping with no carrier credentials.
- **SC-003**: An EasyPost store can go quote → checkout → label → tracking without leaving TillKit.
- **SC-004**: All shipping amounts stored anywhere are integer cents; conversions occur only inside the EasyPost provider.

## Assumptions

- Weights are ounces and dimensions inches (EasyPost conventions); metric support is out of scope.
- One shipment per order for v1; split shipments are future work.
- EasyPost is the only carrier-backed provider for now; the provider contract is the extension point for others.

## Known Gaps

- Nothing imports the package: checkout never quotes rates; orders carry `totalShipping: 0` unless set manually (FR-002, FR-003).
- `calculateShipping` ignores quantity and hardcodes declared value 0 (FR-005).
- `createShipment` drops parcel dimensions (FR-006).
- `freeThreshold` unimplemented (FR-007); `testMode` is a no-op (FR-008).
- Hardcoded fallback phone `555-555-5555` on carrier labels; no label/tracking surface in admin (FR-009).

## Existing Implementation (reference)

- `packages/integrations/shipping/src/index.ts` — contract types, `easypostProvider` (EasyPost v2, basic auth), `flatRateProvider`, `createShippingService` (`calculateShipping`/`selectRate`), `createShippingProvider`.
- `templates/starter/src/routes/checkout.ts` — Stripe checkout collecting shipping address without rating (the would-be consumer).
- `packages/core/src/types/index.ts` — `totalShipping` on Cart/Order that this feature should populate.
