# Contract: PayPal webhook verification

**Spec**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md) (R1, R2)

Replaces `handleWebhook(body, _headers)` — which today performs `JSON.parse(body)` and nothing else, accepting any anonymous POST as a genuine payment event.

---

## Signature change (breaking)

```ts
// before — synchronous, headers ignored
handleWebhook(body: string | Buffer, _headers: Record<string, string | string[] | undefined>): any

// after — async (verification is a network call), headers required
handleWebhook(rawBody: string, headers: Headers | Record<string, string>): Promise<PayPalWebhookEvent>
```

Verification requires a round trip, so the method must become `async`. `packages/server/src/routes/paypal-webhooks.ts` must `await` it. This is a breaking change to a published package and requires a changeset.

`rawBody` MUST be the exact string received (`await c.req.text()`). It is parsed exactly once; the parsed object is passed to PayPal as `webhook_event` without any transformation. Re-serializing a mutated object changes key order or number formatting and causes verification to fail (research R1).

---

## Verification procedure

1. **Config gate.** If `config.webhookId` is absent, throw `PayPalWebhookNotConfiguredError`. The route maps this to HTTP 400 with a loud log. **Never** fall through to processing (spec FR-001, "fail closed").

2. **Extract headers**, case-insensitively (`Headers.get()` is case-insensitive across Node/Workers/Deno; when given a plain object, lower-case the keys first):

   | Header | Postback body field |
   |---|---|
   | `paypal-auth-algo` | `auth_algo` |
   | `paypal-cert-url` | `cert_url` |
   | `paypal-transmission-id` | `transmission_id` |
   | `paypal-transmission-sig` | `transmission_sig` |
   | `paypal-transmission-time` | `transmission_time` |

   Any missing header ⇒ reject (do not call the API with partial data).

3. **POST** to `{baseUrl}/v1/notifications/verify-webhook-signature` with `Authorization: Bearer <cached token>`, `Content-Type: application/json`, and body:

   ```json
   {
     "auth_algo": "…", "cert_url": "…",
     "transmission_id": "…", "transmission_sig": "…", "transmission_time": "…",
     "webhook_id": "<config.webhookId>",
     "webhook_event": { /* JSON.parse(rawBody), untransformed */ }
   }
   ```

   `baseUrl` follows the existing sandbox switch.

4. **Inspect the body, not the status.** The endpoint returns HTTP 200 for both outcomes. Accept only `verification_status === "SUCCESS"`; anything else throws `PayPalWebhookVerificationError`.

5. Return the parsed event.

---

## OAuth token caching (research R2)

`getAccessToken` currently runs on **every** API call — now including every webhook verification.

| Requirement | Behavior |
|---|---|
| Cache scope | Per `paypalIntegration()` instance. MUST NOT be module-global (would leak across instances with different credentials). |
| Reuse window | Until `issuedAt + expires_in - 60s`. `expires_in` is ~32400s (≈9h). |
| Invalidation | On HTTP 401 from any API call, discard and re-fetch once. |
| Concurrency | Concurrent callers during a refresh share one in-flight promise; do not stampede the token endpoint. |

---

## Event vocabulary correction

`processWebhookEvent` currently maps `CUSTOMER.DISPUTE.CREATED` → `refund`. A dispute is not a refund: money has not moved, and treating it as one corrupts `paymentStatus`.

| PayPal event | Normalized type |
|---|---|
| `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED` | `payment_success` |
| `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.DECLINED` | `payment_failure` |
| `PAYMENT.CAPTURE.REFUNDED` | `refund` |
| `CUSTOMER.DISPUTE.CREATED` | `dispute` *(new type)* |
| anything else | `other` |

Adding `dispute` to the shared vocabulary requires a matching amendment to spec 005 (constitution V).

---

## Refund currency (spec FR-006)

`refund(captureId, amount?)` hardcodes `currency_code: 'USD'` whenever a partial amount is supplied. It MUST derive the currency from the original capture. Since PayPal's refund call needs the currency up front, the integration fetches the capture (or accepts the currency from the caller's stored `Transaction`, which already records it) rather than assuming.

---

## Testing constraints

- **PayPal's webhook simulator cannot be used to validate this path.** Its events explicitly cannot be verified against the postback endpoint, and they carry the literal webhook id `WEBHOOK_ID` (research R1). Unit tests MUST mock the verify endpoint.
- Required unit cases: valid signature accepted; `verification_status: "FAILURE"` rejected; each missing header rejected; absent `webhookId` fails closed; token cache reused within the window and refreshed after expiry; a 401 triggers exactly one re-fetch.
- End-to-end validation against a real sandbox webhook delivery (via tunnel) is a manual step in [../quickstart.md](../quickstart.md) — it cannot be automated in CI without PayPal credentials.
