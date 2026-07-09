# TillKit Constitution

TillKit is an open-source, self-hostable e-commerce starter kit. Its promise to
developers: clone it, wire a database and a payment key, and have a working
store they can deploy anywhere and extend without fighting the framework.
Every principle below exists to protect that promise.

## Core Principles

### I. Server-First Rendering
The server renders HTML; HTMX supplies interactivity. There is no client-side
build step, no bundler, no hydration. A feature that requires a client
framework to function violates this principle. Client JavaScript beyond HTMX
is permitted only for progressive enhancement (e.g., the cart-count badge) and
the page must remain functional without it.

### II. Adapter Contract Integrity
`DatabaseAdapter` in `@tillkit/core` is the single persistence contract.
Rules:
- `@tillkit/core` imports nothing from adapters or integrations. Dependency
  flow is one-way: adapters/integrations/server/templates depend on core.
- Any change to the `DatabaseAdapter` interface MUST be implemented in every
  shipped adapter (PocketBase, Supabase) within the same change set. An
  adapter that stubs a contract method must throw a descriptive error, never
  silently no-op.
- Server routes and starter code program against the contract, never against
  a concrete adapter.

### III. Graceful Degradation of Optional Integrations
Payments, subscriptions, search, email, shipping, and images are optional.
Each is constructed at startup only when its required environment variables
are present, and every consumer MUST handle its absence: degrade to a
fallback (e.g., database search when Meilisearch is absent) or render a
clear "not configured" state (e.g., checkout without Stripe). No feature may
hard-require an optional integration, and a missing integration must never
crash the app at startup or at request time.

### IV. Integer-Cents Money (NON-NEGOTIABLE)
All monetary amounts are integer cents everywhere: types, storage, APIs,
webhook payloads, seeds, and tests. Division by 100 happens only at the
display boundary (`formatPrice`) and conversion from external gateways
(e.g., PayPal's decimal strings) happens immediately at the integration
boundary. Every calculation that could produce a fraction rounds to an
integer at that step (`Math.round`), never at the end of a chain.

### V. Spec-Driven Change Flow
Behavior changes start in `specs/`, not in code. Bug reports and user
feedback are triaged as spec defects first: either the implementation
violates the spec (fix the code) or the spec was wrong or silent (amend the
spec, then the code). Specs carry a Status (Proposed / Partially implemented
/ Implemented) and are updated in the same change set as the code they
describe. The `/speckit-specify → plan → tasks → implement` flow governs new
features; small fixes may skip plan/tasks but never skip the spec amendment.

### VI. Runtime Portability
`packages/*` must run on any modern JS runtime (Node ≥18, Cloudflare
Workers, Deno): Web-standard APIs only — `fetch`, `crypto`, `URL`, Hono.
Node-only APIs (`node:fs`, `node:path`, process signals) are permitted only
in `templates/*`, CLI tooling, and adapter code where the backing service
demands it. A package that gains a Node-only dependency must document it as
a breaking portability change.

## Technology Constraints

- TypeScript, strict mode, ESM only. Relative imports carry `.js` extensions.
- pnpm workspace; internal deps use `workspace:*`; packages consume each
  other through built `dist/` output (`pnpm build` before `pnpm test`).
- Every package builds with `tsup src/index.ts --format esm --dts` and
  exposes its entire public surface through `src/index.ts`.
- Vitest for tests, colocated with source (`*.test.ts`, `__tests__/`).
- ESLint via root `.eslintrc.json` (legacy format — the lint script depends
  on `--ext`). `pnpm lint` must exit clean.
- Hono is the only HTTP framework. Zod validates external config input.

## Security Requirements

- Webhook endpoints MUST verify provenance (signature or provider verify
  API) before acting on a payload. An unverified webhook handler is a spec
  violation even if it "works".
- Money-moving operations (order creation, refunds, subscription changes)
  MUST be idempotent under webhook redelivery.
- Admin surfaces MUST be authenticatable before TillKit 1.0; until then the
  gap is documented in the relevant spec, not hidden.
- Secrets live in environment variables only — never in code, config files,
  or specs.

## Development Workflow

1. New feature: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` →
   `/speckit-implement`. The plan must pass a constitution check before
   tasks are generated.
2. Bug fix from feedback: locate the governing spec, record the defect as a
   spec amendment (new/changed FR or edge case), then fix code and tests
   together.
3. Quality gates for every change set: `pnpm lint`, `pnpm build`,
   `pnpm test` all green. A behavior change without a corresponding test is
   incomplete.
4. Specs live in `specs/NNN-name/spec.md`. Numbering is chronological and
   never reused. `specs/ROADMAP.md` is the priority-ordered index.

## Governance

This constitution supersedes ad-hoc practice. Amendments are made by editing
this file with a version bump and a dated entry, in the same change set as
whatever prompted them. Every `/speckit-plan` constitution check verifies
the plan against the principles above; violations require either a plan
revision or a documented, justified exception in the plan's Complexity
Tracking section.

**Version**: 1.0.0 | **Ratified**: 2026-07-09 | **Last Amended**: 2026-07-09
