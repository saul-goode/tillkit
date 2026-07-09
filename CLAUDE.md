# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Spec-driven development

This repo uses GitHub spec-kit. **Behavior changes start in `specs/`, not in code.**

- `.specify/memory/constitution.md` — project principles; every plan is checked against it. Read it before designing anything.
- `specs/NNN-name/spec.md` — one spec per capability, with a Status line (Proposed / Partially implemented / Implemented). Existing features were backfilled; treat the spec as the source of truth for intended behavior and the code as the source of truth for current behavior — where they disagree, that's either a bug or a pending spec amendment.
- `specs/ROADMAP.md` — priority-ordered index of all specs and their status.
- New features: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
- Bug fixes: amend the governing spec (FR or edge case) in the same change set as the code fix. Small fixes may skip plan/tasks, never the spec amendment.

## Commands

```bash
pnpm install
pnpm build                          # tsup/tsc across all workspace packages
pnpm test                           # recursive: only core, server, and starter define a test script
pnpm lint                           # eslintrc config at repo root; lint:fix to autofix
pnpm dev                            # runs templates/starter (tsx watch) on :3000

pnpm --filter @tillkit/core test    # single package
pnpm --filter @tillkit/core test:watch
pnpm --filter @tillkit/core exec vitest run src/edge-cases.test.ts   # single file
pnpm --filter @tillkit/core exec vitest run -t "calculates tax"      # single test by name

pnpm --filter tillkit-starter db:setup   # provision + seed PocketBase (needs it running)
```

Packages consume each other through `dist/` (`main`/`types` point there, deps are `workspace:*`), so **run `pnpm build` before `pnpm test` on a fresh clone** or after changing a package another package imports. Vitest will otherwise resolve stale or missing `dist` output.

ESLint uses the legacy `.eslintrc.json` format, not flat config, because the lint script relies on `--ext` (which flat config rejects). It is non-type-aware by design, so it needs no per-package `tsconfig` wiring. `tsc --noEmit` is not part of any script and the test files currently have pre-existing type errors; `tsup --dts` only typechecks what `src/index.ts` reaches.

`db:setup` runs `templates/starter/scripts/setup-pocketbase.ts`, which delegates to the adapter's own `setup()` so the collection schemas stay in one place. Set `POCKETBASE_ADMIN_TOKEN` for any instance that isn't a fresh unsecured one — collection creation needs superuser auth. Three older scripts sit beside it (`init-pocketbase.ts`, `init-pb-plain.mjs`, `init-pb.sh`); they are unreferenced, hand-roll the schemas, and `init-pocketbase.ts` is actively wrong (it applies the *products* schema to all four collections and seeds prices as dollars). Don't copy from them.

`TEST_RUNBOOK.md` has the manual smoke-test procedure: booting PocketBase, the exact collection schemas to create, seed records, and the URL checklist.

## Architecture

pnpm workspace (`packages/*`, `packages/adapters/*`, `packages/integrations/*`, `templates/*`). Server-first: Hono renders HTML string templates, HTMX handles interactivity, and there is no client build step.

**`@tillkit/core` owns the contracts.** Everything else depends on it and nothing else depends on anything else. The two contracts that matter:

- `DatabaseAdapter` (`core/src/database/index.ts`) — four namespaces (`products`, `cart`, `orders`, `customers`) plus `setup(features)`. `adapter-pocketbase` and `adapter-supabase` each implement the whole surface. Adding a method means touching both adapters.
- Config schemas (`core/src/config.ts`) — Zod schemas for images, payment, server, theme, and `StoreFeatures`. `StoreFeatures` flags (`variants`, `collections`, `inventoryTracking`, `subscriptions`, `multiCurrency`) drive both route mounting and what collections `adapter.setup()` provisions.

**There are two app entry points, and they are not the same app.**

- `createHonoApp()` in `@tillkit/server` is the library factory: mounts `/health`, `/api/products`, and conditionally `/api/subscriptions`, `/api/search`, `/admin`.
- `createStarterApp()` in `templates/starter/src/app.ts` **does not call `createHonoApp`**. It builds its own Hono instance with the storefront HTML routes (`/`, `/products`, `/cart`, `/checkout`) and mounts `createAdminRoutes` / `createSubscriptionRoutes` from the server package directly.

So a route added to `@tillkit/server` will not appear in the starter unless it is also mounted there. When changing routes, check which of the two you actually mean.

**Optional integrations are gated on environment variables at startup, not on config flags.** `templates/starter/src/index.ts` constructs the Stripe subscription provider only if `STRIPE_SECRET_KEY` *and* `STRIPE_WEBHOOK_SECRET` are set, and the Meilisearch service only if `MEILISEARCH_HOST` *and* `MEILISEARCH_API_KEY` are set; the provider is then passed as an optional dep into the app factory, which conditionally mounts routes. Search silently falls back to `database.products.search()` when Meilisearch is absent, and checkout renders an "unavailable" notice when Stripe is absent. Every feature must degrade this way — assume the env var is missing.

**Starter shared state lives in `app-context.ts`**, which instantiates `database` and `stripe` as module-level singletons and exports the `layout()` HTML shell, `getSessionId()`, and `setSessionCookie()`. `routes/checkout.ts` and `routes/webhooks.ts` import those singletons rather than receiving them through the factory's `deps` argument. Carts key off a `sessionId` cookie (30-day, HttpOnly), not a logged-in user.

**Order creation happens in the server package, not the starter.** `createOrderFromStripeSession()` (`server/src/routes/webhooks.ts`) is the whole post-payment path: verify the session is paid, read the cart, create the order, add a `sale` transaction, clear the cart, then `decrementInventoryForOrder()`. Inventory decrement optionally POSTs an `InventoryChangeEvent` to `INVENTORY_WEBHOOK_URL`; a webhook failure is logged and swallowed so it never fails the order. `createOrderFromPayPalCapture()` is the PayPal equivalent.

## Conventions

- **All money is integer cents.** `price: 1999` is $19.99. `formatPrice()` divides by 100 — it is the only place that should. Tax and discount math round to cents (`Math.round`).
- **ESM only**, with mandatory `.js` extensions on relative imports (`./routes/products.js`) even though the source is `.ts`. `moduleResolution: "bundler"`, `strict`, plus `noUnusedLocals` / `noUnusedParameters` / `noImplicitReturns`.
- Every package builds with `tsup src/index.ts --format esm --dts` and re-exports its public surface from `src/index.ts`. New packages follow that shape.
- PocketBase stores structured fields (`items`, `inventory`, `variants`, `addresses`, `transactions`, `metadata`) as JSON columns; the adapter is responsible for the shape, so schema changes usually mean editing both the adapter and the collection definitions in `TEST_RUNBOOK.md`.
