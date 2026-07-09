# Feature Specification: Inventory

**Feature Branch**: `006-inventory`
**Created**: 2026-07-09
**Status**: Partially implemented (backfilled)
**Input**: Backfilled from implementation audit

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stock decrements when an order is paid (Priority: P1)

When a store operator's customer completes payment, each ordered item's available inventory decreases by the ordered quantity so catalog stock reflects reality.

**Why this priority**: Without paid-order decrement, inventory numbers are fiction; this is the minimum viable inventory feature and it is wired today.

**Independent Test**: Mark an order paid via the payment webhook path with a product at known stock and verify the product's `inventory.available` decreased.

**Acceptance Scenarios**:

1. **Given** a product with `inventory.available` 10, **When** an order containing 3 units is paid, **Then** available becomes 7 and `inventory.quantity` is preserved.
2. **Given** a product with available 2, **When** an order for 5 units is paid, **Then** available becomes 0, never negative (`Math.max(0, ...)`).
3. **Given** an order item whose product no longer exists or has no `inventory` object, **When** the order is paid, **Then** that item is skipped and remaining items still decrement.

---

### User Story 2 - Store operator receives inventory change webhooks (Priority: P2)

A store operator configures an external endpoint (ERP, spreadsheet sync, alerting) that receives a JSON event for every inventory decrement caused by a paid order.

**Why this priority**: Integrations depend on it, but the core decrement works without it; it is optional and env-gated per the constitution.

**Independent Test**: Set `INVENTORY_WEBHOOK_URL` (and optionally `INVENTORY_WEBHOOK_SECRET`), pay an order, and assert the endpoint receives one POST per decremented item.

**Acceptance Scenarios**:

1. **Given** a configured webhook URL and secret, **When** stock decrements from 10 to 7 for order `ord_1`, **Then** a POST is sent with JSON body `{productId, variantId, sku, oldAvailable: 10, newAvailable: 7, delta: -3, reason: "order_paid", orderId: "ord_1", timestamp}` and header `X-Inventory-Webhook-Secret`.
2. **Given** the webhook endpoint is down or returns non-2xx, **When** the order is paid, **Then** the failure is logged and swallowed — the order flow and stock update still succeed.
3. **Given** `INVENTORY_WEBHOOK_URL` is unset, **When** an order is paid, **Then** stock decrements with no webhook attempt (graceful absence).

---

### User Story 3 - Shopper cannot buy more than available stock (Priority: P3)

A shopper attempting to add or check out more units than are available is stopped, optionally via short-lived reservations while the cart is active.

**Why this priority**: Oversell prevention matters for real stores, but the starter can ship without it; today this story is NOT implemented end-to-end.

**Independent Test**: With a product at available 1, attempt to add quantity 5 to the cart and expect rejection — currently fails (cart accepts any quantity).

**Acceptance Scenarios**:

1. **Given** a product with available 1, **When** a shopper adds quantity 5 to the cart, **Then** the add is rejected with an "Only 1 available" style message. *(Not implemented — see Known Gaps.)*
2. **Given** reservations are enabled, **When** a shopper's reservation passes its 30-minute expiry, **Then** the reserved quantity returns to available stock automatically.

### Edge Cases

- Order with zero items: decrement function returns immediately, no writes.
- `inventory.available` missing but `inventory.quantity` present: quantity is used as the starting value for the decrement.
- Duplicate webhook delivery of the same paid order: decrement is NOT idempotent per order today — redelivery would double-decrement (constitution requires idempotency for money-moving flows; inventory decrement rides that same webhook path).
- Backorders: `InventoryManager` supports `allowBackorders`, but since it is unwired this has no runtime effect.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: On a paid order, system MUST decrement each item's `inventory.available` by the ordered quantity, clamped at 0.
- **FR-002**: The decrement MUST preserve other inventory fields (`quantity` retained or backfilled from the old available value).
- **FR-003**: When an inventory webhook is configured, system MUST POST one `InventoryChangeEvent` JSON per decremented item — fields: productId, variantId?, sku (falls back to product slug), oldAvailable, newAvailable, delta, reason `order_paid`, orderId, ISO timestamp — with the shared secret in `X-Inventory-Webhook-Secret`.
- **FR-004**: Webhook delivery failure MUST be logged and swallowed; it MUST never fail the order or the stock update.
- **FR-005**: The webhook MUST be env-gated (`INVENTORY_WEBHOOK_URL`, optional `INVENTORY_WEBHOOK_SECRET`); absence disables it without error.
- **FR-006**: System MUST prevent adding to cart or checking out quantities exceeding available stock (unless backorders are enabled). [GAP]
- **FR-007**: Reservation-based stock holds (reserve on add-to-cart, release on abandon, commit on purchase, 30-minute expiry) MUST be available to starter code. [GAP]
- **FR-008**: Reservation cleanup timers MUST be disposable (no unclearable `setInterval`). [GAP]
- **FR-009**: Stock status transitions (`in_stock` → `low_stock` at threshold → `out_of_stock` at 0) MUST be recomputed from current availability after every stock operation, including commit. [GAP]
- **FR-010**: Inventory decrement MUST be idempotent under payment-webhook redelivery. [GAP]

### Key Entities

- **InventoryChangeEvent**: Webhook payload describing one stock movement (old/new available, signed delta, reason, order linkage, timestamp).
- **StockLevel**: In-memory record per product(:variant) — total/available/reserved quantities, low-stock threshold, derived status.
- **StockReservation**: Session-scoped temporary hold with quantity and expiry (default 30 minutes).
- **Product.inventory**: Persistent per-product stock (`available`, `quantity`, `allowOutOfStock`) — the only layer the database sees today.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After any paid order, catalog `available` counts reflect the sale within the same webhook handling cycle, with zero negative values.
- **SC-002**: 100% of paid-order stock movements produce a webhook event when configured; 0% of webhook failures block an order.
- **SC-003**: A store with the webhook unconfigured runs indefinitely with no inventory-related errors at startup or request time.
- **SC-004**: (Target, unmet) No order can be placed for more units than are available at payment time.

## Assumptions

- Single-process starter deployment: in-memory reservation state (Layer 2) would be acceptable for the starter but not for multi-instance deployments.
- Restocks, returns, and manual adjustments happen outside TillKit today; the event `reason` values `return`/`restock`/`adjustment` are reserved for future flows.
- The payment webhook is the sole trigger for decrement; there is no decrement at order creation.

## Known Gaps

- **`InventoryManager` is dead code**: `packages/core/src/inventory/index.ts` (reservations, reserve/release/commit/adjust, low-stock threshold) is exported but nothing in the server or starter imports it (FR-007).
- **No oversell prevention**: cart add/update and checkout never consult `inventory.available`; any quantity is accepted (FR-006).
- **Timer leak**: `InventoryManager`'s constructor starts a 60-second `setInterval` for reservation cleanup that is never cleared and has no dispose method (FR-008).
- **`commitStock` stale status**: recomputes status from `availableQuantity`, which commit does not change — total/reserved drop but a now-depleted total cannot flip the status correctly (FR-009).
- **Non-idempotent decrement**: redelivered payment webhooks double-decrement stock (FR-010).

## Existing Implementation (reference)

- `/Users/rusty/projects/tillkit/packages/server/src/inventory.ts` — `decrementInventoryForOrder`, `InventoryChangeEvent`, `sendInventoryWebhook` (Layer 1, wired).
- `/Users/rusty/projects/tillkit/packages/server/src/routes/webhooks.ts` — calls `decrementInventoryForOrder` after marking the order paid.
- `/Users/rusty/projects/tillkit/templates/starter/src/routes/webhooks.ts` and `/Users/rusty/projects/tillkit/templates/starter/src/routes/checkout.ts` — env-gating via `INVENTORY_WEBHOOK_URL` / `INVENTORY_WEBHOOK_SECRET`.
- `/Users/rusty/projects/tillkit/packages/core/src/inventory/index.ts` — `InventoryManager`, `inventoryFromProducts` (Layer 2, unwired).
