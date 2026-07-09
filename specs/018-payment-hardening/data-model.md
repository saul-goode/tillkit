# Phase 1 Data Model: Payment Hardening

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

All monetary values are integer cents (constitution IV). All new fields are additive; no existing field changes type or meaning.

---

## Entity: Order (modified)

Two new fields on the existing `Order`, enabling the idempotency guarantee.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `gateway` | `'stripe' \| 'paypal' \| null` | yes | Which gateway produced this order. Null for manually-created orders. |
| `gatewayRef` | `string \| null` | yes | The gateway's identifier for the payment that created this order: Stripe Checkout **session id** (`cs_…`), PayPal **order id**. Null for manual orders. |

**Constraint**: `UNIQUE (gateway, gatewayRef)`, applied **only to rows that have a gateway reference**.

> **Corrected after empirical testing against PocketBase v0.22.47.** An earlier
> draft of this document assumed "NULLs never conflict in a unique index" and
> therefore that a plain composite index was sufficient. That is false on
> PocketBase: text fields store `''`, not `NULL`, so a plain composite unique
> index makes the *second* manual order (`gateway: ''`, `gatewayRef: ''`)
> collide with the first. Verified — the insert is rejected with
> `validation_not_unique` on both fields. A **partial** index is required.

- **PocketBase (SQLite)**: `CREATE UNIQUE INDEX idx_orders_gateway_ref ON orders (gateway, gatewayRef) WHERE gatewayRef != ''`. Verified: unlimited manual orders coexist; `(stripe, cs_1)` twice is rejected; `(paypal, cs_1)` coexists with `(stripe, cs_1)`; 10 concurrent inserts of one key yield exactly 1 success.
- **Supabase (Postgres)**: real `NULL`s, so `CREATE UNIQUE INDEX ... ON orders (gateway, gateway_ref) WHERE gateway_ref IS NOT NULL`. The predicate is stated explicitly rather than relying on NULL-distinctness, so both backends express the same intent.

**Why not reuse `orderNumber`**: it is TillKit's own human-facing identifier (`TK-YYYYMMDD-XXXX`), unrelated to any gateway. The current PayPal code conflates the two and is broken as a result (research R6).

**Related repair**: `orders.orderNumber` is declared `unique: true` in the PocketBase adapter, which has been a no-op since PocketBase v0.14. This plan adds `CREATE UNIQUE INDEX idx_orders_number ON orders (orderNumber)` so the declared constraint becomes real.

### State transitions (unchanged, restated for context)

`status`: `pending → confirmed → paid → fulfilled → shipped → delivered`, with `cancelled` / `refunded` as terminal branches.
`paymentStatus`: `pending → authorized → paid → (partially_refunded | refunded)`, `failed` terminal.

Idempotent creation must never advance an existing order's state — a redelivered `payment_success` returns the existing order untouched.

---

## Entity: ProcessedWebhookEvent (new)

An append-only ledger recording that a gateway event's side effects have run. Distinct from `Order.gatewayRef`: refunds, payment failures, and disputes create no order, yet must still be exactly-once.

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `string` | no | Adapter-generated primary key. |
| `gateway` | `'stripe' \| 'paypal'` | no | Namespaces the event id — ids are only unique per gateway. |
| `eventId` | `string` | no | Gateway's event identifier (Stripe `evt_…`; PayPal event `id`). |
| `eventType` | `string` | no | Raw gateway event type, retained for debugging. |
| `outcome` | `'processed' \| 'ignored' \| 'failed'` | no | `ignored` = recognized but no side effects (e.g. `other`). `failed` = handler threw; the row exists so the retry is visible, and it does **not** block reprocessing. |
| `orderId` | `string \| null` | yes | Order created or affected, when applicable. |
| `processedAt` | `Date` | no | Set on insert. |

**Constraint**: `UNIQUE (gateway, eventId)`.

**Semantics**:
- A successful insert means *this* process won the race and must run the side effects.
- A unique violation means another process already claimed the event; the current request performs no side effects and acknowledges.
- Rows with `outcome: 'failed'` are diagnostic. Because a failed handler returns a retryable status (FR-009), the gateway will redeliver; the claim row must therefore be **removed or updated** on failure so the retry can re-claim. Chosen behavior: on handler failure, delete the claim row before returning the error status. (Recorded explicitly because "insert claim, then fail, then never retry" is the classic bug in this pattern.)

**Retention**: unbounded for v1. A future pruning job may delete rows older than the gateway's redelivery window (Stripe: 3 days; PayPal: 3 days of retries).

---

## Entity: CartRevalidationResult (new, transient — not persisted)

Produced by the checkout revalidation step (US4); never stored.

| Field | Type | Notes |
|---|---|---|
| `ok` | `boolean` | True when the cart may proceed to payment. |
| `priceChanges` | `Array<{ itemId, name, oldPrice, newPrice }>` | Integer cents. Cart is updated to `newPrice` before the shopper is re-shown the cart. |
| `stockIssues` | `Array<{ itemId, name, requested, available }>` | Present when `inventory.available < requested` and `allowOutOfStock` is false. |
| `removedItems` | `Array<{ itemId, name }>` | Products deleted or moved to `draft`/`archived` since add-to-cart. |

**Rule**: `ok` is true only when all three arrays are empty. Any non-empty array blocks session creation and returns the shopper to `/cart` with an explanation (spec FR-010).

---

## Contract additions to `DatabaseAdapter`

See [contracts/database-adapter.md](./contracts/database-adapter.md) for exact signatures and semantics. Summary:

```
orders.getByGatewayRef(gateway, ref): Promise<Order | null>
orders.create(...)                    // unchanged signature; now accepts gateway/gatewayRef

webhookEvents.claim(event): Promise<{ claimed: boolean; existing?: ProcessedWebhookEvent }>
webhookEvents.release(gateway, eventId): Promise<void>   // on handler failure, so retry can re-claim
webhookEvents.get(gateway, eventId): Promise<ProcessedWebhookEvent | null>
```

`claim` is the atomic primitive. It MUST be implemented as a constrained insert whose conflict is detected, never as a read followed by a write.

---

## Schema delivery

| Backend | Mechanism | Notes |
|---|---|---|
| PocketBase | `setup()` for new stores (adds `indexes` arrays); `tillkit migrate` for existing stores via `collections.update()` | Also retro-fits the missing unique indexes on `orderNumber` and `products.slug`. |
| Supabase | `docs/deployment.md` SQL for new stores; `tillkit migrate` **prints** the SQL for existing stores | The adapter cannot execute DDL (research R4). `setup()` must stop reporting `created: true` when it created nothing. |

Required Postgres DDL:

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway_ref text;
-- Partial: manual orders (gateway_ref IS NULL) must never conflict.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_gateway_ref
  ON orders (gateway, gateway_ref) WHERE gateway_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway     text NOT NULL,
  event_id    text NOT NULL,
  event_type  text NOT NULL,
  outcome     text NOT NULL,
  order_id    uuid REFERENCES orders(id),
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events ON processed_webhook_events (gateway, event_id);
```

Equivalent PocketBase index SQL (note the partial predicate — PocketBase text
fields are `''`, never `NULL`):

```sql
CREATE UNIQUE INDEX `idx_orders_gateway_ref` ON `orders` (`gateway`, `gatewayRef`) WHERE `gatewayRef` != ''
CREATE UNIQUE INDEX `idx_orders_number`      ON `orders` (`orderNumber`)
CREATE UNIQUE INDEX `idx_webhook_events`     ON `processed_webhook_events` (`gateway`, `eventId`)
```
