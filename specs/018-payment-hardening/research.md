# Phase 0 Research: Payment Hardening

**Spec**: [spec.md](./spec.md) | **Date**: 2026-07-09

All NEEDS CLARIFICATION items from Technical Context are resolved below.

---

## R1. PayPal webhook verification method

**Decision**: Use PayPal's postback API, `POST /v1/notifications/verify-webhook-signature`, requiring `verification_status === "SUCCESS"`.

**Rationale**: The offline path needs (a) a CRC32 implementation, absent from Web Crypto, and (b) extraction of a SubjectPublicKeyInfo blob from an X.509 PEM certificate before `crypto.subtle.importKey`, which accepts only `spki`/`pkcs8`/`raw`/`jwk` and cannot parse X.509. Node can do this with `crypto.createPublicKey()`, but that is not Web-standard and is unavailable on Workers/Deno. Hand-rolling an ASN.1/DER parser to satisfy constitution VI (runtime portability) is disproportionate custom crypto for the trust boundary we are trying to secure. The postback API is a bearer-token JSON POST — portable across all three runtimes with no custom crypto.

**Alternatives considered**:
- *Offline self-verification*: PayPal's docs list it first and it avoids a per-webhook round trip. Rejected for v1 on the crypto-portability grounds above; recorded as a future optimization if webhook latency becomes a problem. Message format for later reference: `transmission_id|transmission_time|webhook_id|crc32(raw_body)`, RSASSA-PKCS1-v1_5 + SHA-256, `cert_url` host restricted to `*.paypal.com` over HTTPS.
- *A PayPal SDK*: modern official server SDKs do not implement webhook verification at all; the ones that did are archived.

**Implementation constraints discovered**:
- Required inbound headers (case-insensitive lookup; `Headers.get()` is case-insensitive on all runtimes): `paypal-auth-algo`, `paypal-cert-url`, `paypal-transmission-id`, `paypal-transmission-sig`, `paypal-transmission-time`.
- Postback body fields: `auth_algo`, `cert_url`, `transmission_id`, `transmission_sig`, `transmission_time`, `webhook_id` (from config, not a header), `webhook_event`.
- `webhook_event` must be the parsed JSON **object**, obtained by `JSON.parse(rawBody)` with no transformation. Re-serializing a mutated/normalized object changes key order or number formatting and makes verification fail.
- The endpoint returns HTTP 200 for both outcomes. The `verification_status` field must be inspected — status code alone is not a verdict.
- `handleWebhook` must therefore become **async** (currently synchronous). This is a breaking signature change to a published package.

**Testing constraint (important)**: PayPal's webhook simulator produces events that **cannot be verified via the postback API** — the docs say so explicitly. Simulator events use the literal webhook id `WEBHOOK_ID` and only exercise the offline path. Consequence: the postback path cannot be validated by the simulator; it needs a real sandbox webhook delivery through a tunnel. Unit tests must therefore mock the verify endpoint, and an end-to-end sandbox check is a manual quickstart step.

Sources: [Integrate webhooks](https://developer.paypal.com/api/rest/webhooks/rest/), [Verify webhook signature](https://docs.paypal.ai/reference/api/rest/verify-webhook-signature/verify-webhook-signature), [Webhooks simulator](https://developer.paypal.com/api/rest/webhooks/simulator/)

---

## R2. PayPal OAuth token caching

**Decision**: Cache the client-credentials token in integration-instance state; reuse until `now >= issuedAt + expires_in - 60s`.

**Rationale**: `getAccessToken` currently runs on **every** API call (create order, capture, get, refund, and now every webhook verification). Tokens live ~9 hours (`expires_in` ≈ 32400s). A token request per call adds a round trip to every operation and risks 429s during webhook bursts — exactly when correctness matters most. Re-fetch on 401 to handle rotation.

**Alternatives considered**: no caching (status quo — rejected, see above); a shared module-level cache (rejected — leaks across multiple `paypalIntegration()` instances with different credentials).

---

## R3. Uniqueness guarantee — PocketBase

**Decision**: Create unique indexes via the `indexes` array on `collections.create()` / `collections.update()`. Detect violation by catching `status === 400` on insert.

**Rationale and critical finding**: Field-level `unique: true` was **removed from PocketBase in v0.14**. The adapter pins SDK `^0.21.0` and passes `unique: true` on `products.slug`, `collections.slug`, and `orders.orderNumber` (`packages/adapters/pocketbase/src/index.ts:389,418,457`). The SDK silently ignores the unknown key. **No uniqueness constraint exists on any of those fields today.** The adapter never uses an `indexes` array (verified: zero occurrences). This means:
- Order numbers can silently collide (spec 001 FR-009 is worse than documented — not merely "unhandled collisions" but *no constraint at all*).
- Any idempotency scheme built on read-then-write would have no backstop.

Correct form:
```js
await pb.collections.create({
  name: 'orders',
  type: 'base',
  schema: [ /* fields */ ],
  indexes: [
    'CREATE UNIQUE INDEX `idx_orders_gateway_ref` ON `orders` (`gateway`, `gatewayRef`)',
    'CREATE UNIQUE INDEX `idx_orders_number` ON `orders` (`orderNumber`)',
  ],
})
```

**Violation detection**: `ClientResponseError` with `status === 400`. For single-column indexes the response carries `data.<field>.code === 'validation_not_unique'`, but for **composite** indexes PocketBase may return a generic 400 (and per discussion #6353, occasionally a 500 from the SQLite constraint). Therefore: treat `status === 400` on the idempotent insert as "already exists" and confirm with a follow-up read, rather than string-matching the error code.

**Schema-format risk**: the `schema:` key was renamed to `fields:` in PocketBase v0.23. The adapter's current format is correct for 0.21/0.22 servers and will break on 0.23+. Out of scope for this plan, but must be recorded as a spec-001 gap.

---

## R4. Uniqueness guarantee — Supabase

**Decision**: Use `.upsert(row, { onConflict: '<cols>', ignoreDuplicates: true }).select()`. An empty `data` array means the row already existed; a returned row means this call inserted it.

**Rationale**: This compiles to `INSERT ... ON CONFLICT DO NOTHING`, which is atomic at the database and needs no error-code branching. The alternative — plain `.insert()` and inspecting `error.code === '23505'` — is equally atomic but forces every call site to distinguish a unique violation from a real error, and the adapter's existing `if (error) throw error` idiom makes that easy to get wrong.

**Critical dependency**: both approaches require the unique constraint to actually exist. Supabase's `setup()` builds `CREATE TABLE` strings and **never executes them** (`packages/adapters/supabase/src/index.ts`, ~lines 538–666; the comment concedes "We can't run DDL from REST easily"). So `setup()` cannot deliver the constraint.

**Alternatives considered for delivering DDL to Supabase**:
- *Direct Postgres connection from `setup()`* (via `pg`/`postgres.js`): would make Supabase symmetric with PocketBase, but adds a Node-only driver to a package that constitution VI requires to run on Workers/Deno. **Rejected on constitutional grounds.**
- *A `SECURITY DEFINER` `exec_sql` RPC*: technically works, but asks users to install an arbitrary-DDL function — a privilege-escalation footgun. Rejected.
- *Documented SQL + a migration script that prints it* (chosen): matches how Supabase tables are already provisioned in this project (manual SQL in `docs/deployment.md`).

---

## R5. Migration strategy for existing stores

**Decision**: Ship an idempotent, additive `tillkit migrate` script. PocketBase: apply new fields and indexes programmatically via `collections.update()`. Supabase: print the exact SQL for the operator to run, because the adapter cannot execute DDL.

**Rationale**: `setup()` is create-if-missing per collection, so an existing store gets **nothing** from a schema change — the new `gatewayRef` column and both unique indexes would silently never appear, and idempotency would fail open (every insert succeeds, duplicates return). A separate migration entry point is the only way to reach installed stores. It also repairs the decorative-unique bug from R3 for stores created before this change.

**Deliberate non-goal**: a startup schema probe that refuses to boot on stale schema was considered and rejected for v1 — it adds a probe to every cold start (costly on Workers) and can block deploys. Instead, the migration is documented as required and the ledger insert path treats a *missing* constraint as an operational error surfaced in logs, not a silent success.

**Alternatives considered**: manual SQL in docs only (rejected — silently breaks every existing store, and the failure mode is "idempotency quietly does nothing"); full migration framework with version tracking (rejected as over-engineering for one migration; revisit if a second lands).

---

## R6. Idempotency key placement

**Decision**: Add a first-class, nullable `gatewayRef` column on `orders` (paired with the existing notion of `gateway`), unique on `(gateway, gatewayRef)`. Add a separate `processed_webhook_events` store unique on `(gateway, eventId)`.

**Rationale**: The Stripe session id is currently buried in the *transaction's* `metadata` JSON (`packages/server/src/routes/webhooks.ts:184–195`). JSON fields are not portably indexable or uniquely constrainable across SQLite and Postgres, so that value cannot serve as an idempotency key where it sits. Order creation needs a queryable, constrained column.

Two separate mechanisms are needed because they answer different questions:
- `orders.gatewayRef` — "does an order already exist for this payment?" Guards the success-page/webhook race on order creation.
- `processed_webhook_events` — "have we already run side effects for this delivery?" Guards redelivery of any event type, including ones that create no order (refunds, failures).

**Discovered defect**: `createOrderFromPayPalCapture` (`packages/server/src/routes/paypal-webhooks.ts:97–98`) already attempts an idempotency check — `database.orders.getByNumber?.(paypalOrder.id)` — but `getByNumber` queries TillKit's own `orderNumber` (`TK-YYYYMMDD-XXXX`) in both adapters (verified: `pocketbase/src/index.ts:274`, `supabase/src/index.ts:359`). It is called with a PayPal order id, so it can never match. The check always falls through and creates a duplicate. It is a read-then-write TOCTOU *and* it queries the wrong column. The Stripe path has no check at all.

---

## R7. Scope decisions (confirmed with maintainer)

- **Refunds (spec 018 User Story 3) are deferred** to a follow-up spec that depends on 017 (admin auth). Shipping refund endpoints onto today's unauthenticated `/admin` would hand any visitor a money-movement button. The PayPal hardcoded-`'USD'` refund-currency fix (FR-006) still lands here, because it is integration-level and exposes no new surface.
- **Migration** ships as a versioned `tillkit migrate` script (R5).

---

## Resolved Technical Context

| Unknown | Resolution |
|---|---|
| PayPal verification method | Postback API; `handleWebhook` becomes async |
| Token caching | Instance-level, `expires_in − 60s`, refresh on 401 |
| PocketBase uniqueness | `indexes` array; catch 400 + confirm by read |
| Supabase uniqueness | `upsert(…, {ignoreDuplicates:true}).select()`; constraint delivered by migration |
| Existing-store upgrade | `tillkit migrate`, additive and idempotent |
| Idempotency key | `orders.gatewayRef` + `processed_webhook_events` |
| Refund scope | Deferred to spec 020 |
