# Quickstart: Validating Payment Hardening

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Runnable checks that prove the feature works. Each maps to a Success Criterion. Automated checks belong in CI; the two manual scenarios need real gateway credentials and cannot run there.

## Prerequisites

```bash
pnpm install && pnpm build        # packages resolve through dist/
```

For the manual scenarios: a PocketBase instance (`pnpm --filter tillkit-starter db:setup`), Stripe test keys, and a PayPal **sandbox** app with a webhook subscription.

---

## 1. Schema and migration (SC-002 precondition)

Idempotency is only real if the unique indexes exist. Verify before anything else — every downstream check silently passes without them.

```bash
pnpm --filter tillkit-starter migrate          # additive, idempotent
pnpm --filter tillkit-starter migrate          # second run: no-op, exits 0
```

Expected: both unique indexes reported present on `orders` (`idx_orders_gateway_ref`, `idx_orders_number`) and `processed_webhook_events` created. On Supabase the script prints the DDL to apply rather than executing it — see [data-model.md](./data-model.md#schema-delivery).

Confirm the index actually exists (PocketBase):

```bash
curl -s "$POCKETBASE_URL/api/collections/orders" -H "Authorization: $POCKETBASE_ADMIN_TOKEN" \
  | grep -o 'idx_orders_gateway_ref'
```

Empty output means idempotency will fail open. Stop here and fix.

---

## 2. Adapter contract suite (SC-002)

The single most important automated check. Case 5 (concurrent `claim`) is what catches a read-then-write implementation.

```bash
pnpm --filter @tillkit/adapter-pocketbase test
pnpm --filter @tillkit/adapter-supabase  test
```

Expected: identical assertions pass against both adapters. See [contracts/database-adapter.md](./contracts/database-adapter.md#contract-test-suite-required) for the eight required cases.

---

## 3. Forged webhooks are rejected (SC-001)

```bash
pnpm --filter @tillkit/server test -t "webhook"
```

Expected: unsigned/forged PayPal payloads → 400, zero state change; missing `PAYPAL_WEBHOOK_ID` → 400 (fail closed, never processed); invalid Stripe signature → 400.

Manual smoke against a running store — this should change nothing:

```bash
curl -i -X POST localhost:3000/webhooks/paypal \
  -H 'content-type: application/json' \
  -d '{"event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"forged","amount":{"value":"999.00","currency_code":"USD"}}}'
```

Expected: `HTTP/1.1 400`, and no new order (`GET /api/products` unchanged, admin order list unchanged).

---

## 4. Redelivery and refresh never duplicate (SC-002)

```bash
pnpm --filter @tillkit/server test -t "idempotent"
```

Expected: replaying the same Stripe `payment_success` event N times creates exactly one order, one inventory decrement, one `processed_webhook_events` row. Concurrent success-page + webhook processing for one session yields one order; the loser observes the winner's.

Manual (Stripe CLI, real test-mode session):

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
stripe trigger checkout.session.completed
stripe events resend <evt_id>      # redelivery: must be a no-op
```

Expected: second delivery responds `{"received":true,"deduplicated":true}`; order count unchanged.

---

## 5. Checkout revalidation (SC-004)

```bash
pnpm --filter @tillkit/server test -t "revalidat"
```

Expected: a cart line whose product price moved 1999 → 2499 blocks session creation and returns the shopper to `/cart` with the change shown. A line requesting quantity 5 against `inventory.available: 2` (with `allowOutOfStock: false`) blocks with an actionable message. No Stripe session is created in either case.

---

## 6. PayPal postback verification — MANUAL (SC-001)

**PayPal's webhook simulator cannot validate this path** — simulator events are explicitly unverifiable through the postback API and carry the literal webhook id `WEBHOOK_ID` (research R1). A real sandbox delivery is required.

```bash
# expose the local store
ngrok http 3000
# register https://<tunnel>/webhooks/paypal as a sandbox webhook subscription,
# set PAYPAL_WEBHOOK_ID to the id PayPal assigns, then complete a sandbox checkout
```

Expected: the delivered event verifies (`verification_status: "SUCCESS"`), one order is created, and a second delivery of the same event id is deduplicated. Watch the log for exactly one OAuth token fetch across the whole sequence — proof the token cache works.

---

## 7. Full gate

```bash
pnpm lint && pnpm build && pnpm test && git diff --exit-code
```

Everything green, tree clean. This is what CI runs.

---

## Manual coverage gap (record honestly)

Scenarios 6 and the real-money halves of 3–4 need gateway credentials and cannot run in CI. CI proves the logic against mocked gateways; it does **not** prove that TillKit interoperates with PayPal's live verification endpoint. Run scenario 6 against sandbox before any release that touches the PayPal path.
