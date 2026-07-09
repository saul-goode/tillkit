# Contract: DatabaseAdapter additions

**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

Every shipped adapter MUST implement this identically (constitution II). The shared suite at `packages/adapters/__tests__/contract.test.ts` runs these assertions against each adapter; an adapter that cannot satisfy a method MUST throw a descriptive error, never silently no-op.

---

## `orders.getByGatewayRef(gateway, ref)`

```ts
getByGatewayRef(gateway: 'stripe' | 'paypal', ref: string): Promise<Order | null>
```

| Requirement | Behavior |
|---|---|
| Match | Returns the order whose `(gateway, gatewayRef)` equals the arguments. |
| Miss | Returns `null`. MUST NOT throw. |
| Backend error | Throws (distinguishable from a miss). |

Backed by the unique index, so at most one row can match.

---

## `orders.create(data)` — extended input

`OrderInput` gains optional `gateway` and `gatewayRef`. Behavior on conflict is the critical part:

| Requirement | Behavior |
|---|---|
| Fresh payment | Inserts and returns the new order. |
| Duplicate `(gateway, gatewayRef)` | MUST reject with an error the caller can identify as a uniqueness conflict — **not** a generic failure. Adapters expose this by throwing an error with `code === 'DUPLICATE_GATEWAY_REF'`. |
| Manual order | `gateway`/`gatewayRef` omitted → both stored as `null`; unlimited such orders coexist (NULLs do not conflict in a unique index). |

Callers use insert-and-catch, never check-then-insert:

```ts
try {
  return await db.orders.create({ ...orderData, gateway, gatewayRef })
} catch (err) {
  if (err.code === 'DUPLICATE_GATEWAY_REF') {
    return await db.orders.getByGatewayRef(gateway, gatewayRef)   // the winner's order
  }
  throw err
}
```

**Adapter-specific detection** (research R3/R4):
- PocketBase: `ClientResponseError` with `status === 400`. Composite indexes may not populate `data.<field>.code`, so the adapter MUST confirm by re-reading via `getByGatewayRef` before classifying as a duplicate. If the re-read misses, rethrow the original error — a 400 that is not a conflict must not be swallowed.
- Supabase: `error.code === '23505'`.

---

## `webhookEvents` namespace (new)

```ts
webhookEvents: {
  claim(event: {
    gateway: 'stripe' | 'paypal'
    eventId: string
    eventType: string
  }): Promise<{ claimed: boolean; existing?: ProcessedWebhookEvent }>

  complete(gateway: 'stripe' | 'paypal', eventId: string, result: {
    outcome: 'processed' | 'ignored'
    orderId?: string
  }): Promise<void>

  release(gateway: 'stripe' | 'paypal', eventId: string): Promise<void>

  get(gateway: 'stripe' | 'paypal', eventId: string): Promise<ProcessedWebhookEvent | null>
}
```

### `claim` — the atomic primitive

| Requirement | Behavior |
|---|---|
| First caller | Inserts the row with `outcome: 'processed'` pending completion; returns `{ claimed: true }`. |
| Concurrent/subsequent caller | Insert conflicts on `(gateway, eventId)`; returns `{ claimed: false, existing }`. MUST NOT throw. |
| Atomicity | MUST be a single constrained insert. A read-then-write implementation is a contract violation — the success-page and webhook paths race in production. |
| Missing constraint | If the unique index does not exist, `claim` silently always returns `claimed: true` and idempotency fails open. Adapters SHOULD surface this: on `setup()`/migration, verify the index exists and log an error if absent. |

Implementations:
- PocketBase — `create()`, catching `status === 400`, then confirming via `get()`.
- Supabase — `.upsert(row, { onConflict: 'gateway,event_id', ignoreDuplicates: true }).select()`. Empty `data` ⇒ already existed (`claimed: false`); one row ⇒ `claimed: true`. No error-code branching.

### `release` — why it exists

If a handler throws *after* claiming, the event must be reprocessable, because the route returns a retryable status and the gateway will redeliver (spec FR-009). `release` deletes the claim row.

Required call pattern:

```ts
const { claimed, existing } = await db.webhookEvents.claim({ gateway, eventId, eventType })
if (!claimed) return c.json({ received: true, deduplicated: true })   // already handled

try {
  const orderId = await runSideEffects(event)
  await db.webhookEvents.complete(gateway, eventId, { outcome: 'processed', orderId })
} catch (err) {
  await db.webhookEvents.release(gateway, eventId)   // allow redelivery to retry
  throw err                                          // -> retryable status to the gateway
}
return c.json({ received: true })
```

Omitting `release` produces the classic failure: a claimed-then-failed event that can never be retried, permanently losing the payment's side effects.

---

## Contract test suite (required)

`packages/adapters/__tests__/contract.test.ts` runs identical assertions against every adapter. Minimum cases:

1. `getByGatewayRef` returns the order on match, `null` on miss.
2. `orders.create` with a duplicate `(gateway, gatewayRef)` throws `code === 'DUPLICATE_GATEWAY_REF'`.
3. Two manual orders (`gateway: null`) both insert successfully.
4. `claim` returns `claimed: true` once and `claimed: false` for every subsequent call with the same key.
5. **Concurrency**: `Promise.all` of N simultaneous `claim` calls with the same key yields exactly one `claimed: true`. This is the test that fails if an adapter implements `claim` as read-then-write.
6. `release` makes a claimed event claimable again.
7. Same `eventId` under two different gateways does not collide.
8. `setup()` reports only what it actually created (Supabase must not claim `created: true` having executed no DDL).

Cases 5 and 8 are the ones that catch the defects this plan exists to fix; they are not optional.
