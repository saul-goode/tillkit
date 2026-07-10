# TillKit Spec Roadmap

Priority-ordered index of all capability specs. Status values: **Implemented** (backfilled, matches code), **Partial** (built with known gaps, or built but unwired), **Proposed** (not built).

Workflow: bugs and feedback amend the governing spec below; new capabilities get a new numbered spec via `/speckit-specify`. See `.specify/memory/constitution.md` for the rules every plan is checked against.

## v1 priorities (in order)

These four, plus closing the `[GAP]`-tagged FRs in specs 001/004/005/009, are what stands between the current codebase and "viable for other developers".

| # | Spec | Status | Why it's a priority |
|---|------|--------|---------------------|
| 0 | [021 PocketBase ≥0.23 Compatibility](021-pocketbase-compatibility/spec.md) | Implemented | `setup()` could not provision a store on any PocketBase newer than v0.22 — a pre-0.23 payload returns HTTP 200 and creates **zero fields**. Blocked every new user at first run. |
| 1 | [018 Payment Hardening](018-payment-hardening/spec.md) | Partial | US1 (PayPal webhook verification), US2 (idempotency), US4 (checkout revalidation) **done**. Remaining: Phase 6 polish + spec 020 (operator refunds). |
| 2 | [017 Customer Accounts & Auth](017-customer-accounts/spec.md) | Proposed | Existing prototype has no password verification and forgeable sessions; admin (spec 009) needs the same session mechanism to close its zero-auth gap. |
| 3 | [016 Transactional Email](016-transactional-email/spec.md) | Partial | Providers built (SendGrid/Resend), wired to nothing. Order confirmations are table stakes; also unblocks password reset for 017. |
| 4 | [019 Project Operations](019-project-operations/spec.md) | Partial | LICENSE + CI + artifact untracking **done**. Remaining: publishing via changesets, docs correction, contribution guides. |

## Implemented capabilities (backfilled)

| Spec | Status | Notable gaps |
|------|--------|--------------|
| [001 Database Adapter Contract](001-database-adapter/spec.md) | Implemented | Supabase `setup()` is a no-op that reports success; `updateItem` price bug; filter escaping; no contract test suite |
| [002 Product Catalog](002-product-catalog/spec.md) | Implemented | Mutation API unauthenticated; no HTML escaping in storefront |
| [003 Cart & Pricing](003-cart-and-pricing/spec.md) | Implemented | Currency hardcoded USD in display; Supabase line-total bug |
| [004 Checkout & Orders](004-checkout-and-orders/spec.md) | Implemented | No idempotency; no price/stock revalidation; placeholder fallback email |
| [005 Payment Webhooks](005-payment-webhooks/spec.md) | Partial | PayPal unverified; webhook path creates no order by default; no dedup |
| [007 Subscriptions](007-subscriptions/spec.md) | Implemented | Management routes unauthenticated; no local persistence; storefront never surfaces plans |
| [008 Search](008-search/spec.md) | Implemented | Meilisearch filter injection; no index backfill command |
| [009 Admin Dashboard](009-admin-dashboard/spec.md) | Partial | **Zero authentication** (closes via 017); revenue stats capped at 100 orders; CDN-loaded HTMX |
| [010 Storefront Starter](010-storefront-starter/spec.md) | Implemented | No HTML escaping; HTMX version skew vs admin |
| [011 Scaffolding CLI](011-scaffolding-cli/spec.md) | Partial | platform/subscriptions prompts ignored; Supabase path emits broken config; template path breaks if published |

## Built but unwired (decide: wire it or cut it)

Each of these is substantial working code with zero consumers. Every one should either get wired per its spec or be removed — shipping dead exports violates the docs-tell-the-truth principle.

| Spec | Status | What exists / what's missing |
|------|--------|------------------------------|
| [006 Inventory](006-inventory/spec.md) | Partial | Server-side decrement-on-paid-order is wired; core `InventoryManager` (reservations) is not. No oversell prevention anywhere. |
| [012 Theming](012-theming/spec.md) | Partial | Full 3-theme CSS-variable system; starter/admin use hardcoded styles instead. |
| [013 Discounts](013-discounts/spec.md) | Partial | Full engine (codes, BOGO, auto-discounts); no checkout integration, no persistence, no admin UI. Overlaps older `calculateDiscount`. |
| [014 Images](014-images/spec.md) | Partial | Cloudinary complete; sharp doesn't persist; R2 signature is a placeholder; no upload UI. |
| [015 Shipping](015-shipping/spec.md) | Partial | EasyPost complete, flat-rate rating works; checkout never quotes rates — orders ship at 0. |

## Sequencing notes

- 018 (payment hardening) needs a small DatabaseAdapter addition (gateway-ref lookup / idempotency ledger) — do it under constitution II: both adapters in one change set, and stand up the spec-001 contract test suite in the same effort.
- 017 before finishing 009's auth gap; they share the session mechanism.
- 016 unblocks 017's password reset and verification flows.
- 019's LICENSE + CI items are afternoon-sized and unblock everything socially; do them first even though the spec ranks fourth overall.
- 020 (operator refunds) carries 018's deferred User Story 3 and is gated on 017 (admin auth): a refund endpoint on today's unauthenticated `/admin` would expose a money-movement button to any visitor.
- 021 was discovered while implementing 018 and ranks above everything: a developer following the README could not get past `db:setup`.
