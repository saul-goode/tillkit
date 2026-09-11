# Feature Specification: Scaffolding CLI (create-tillkit)

**Feature Branch**: `011-scaffolding-cli`

**Created**: 2026-07-09

**Status**: Partially implemented (backfilled)

**Input**: Backfilled from implementation audit

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scaffold a working store in one command (Priority: P1)

A developer runs `create-tillkit`, answers the prompts, and gets a directory containing a runnable TillKit store whose configuration reflects every answer they gave.

**Why this priority**: The CLI is the front door; if the generated project doesn't run or silently ignores choices, first impressions fail.

**Independent Test**: Run the CLI end-to-end for each prompt combination and verify the generated project installs, boots, and reflects each choice.

**Acceptance Scenarios**:

1. **Given** the prompt flow, **When** the developer answers project name (rejected if the directory exists), platform (node/vercel/cloudflare), database (pocketbase/supabase), inventory-webhooks confirm, subscription-billing confirm, and styling (plain/tailwind), **Then** `templates/starter` is copied recursively into the target, `tillkit.config.ts` is written via `generateConfig`, and `package.json` `name` is set to the project name.
2. **Given** any prompt, **When** the developer cancels, **Then** the CLI exits cleanly with a "Cancelled" outro and writes nothing.
3. **Given** completion, **Then** the outro prints next steps (`cd`, `pnpm install`, `pnpm dev`).

---

### User Story 2 - Choices actually shape the project (Priority: P2)

Every prompt answer materially changes the generated project: platform selects the deploy target wiring, database selects a working adapter, subscriptions emits the provider block, styling sets up the chosen CSS approach.

**Independent Test**: Diff generated projects across differing answers; each answer must produce a corresponding diff that works.

**Acceptance Scenarios**:

1. **Given** database=pocketbase, **Then** the config imports `pocketbaseAdapter` wired to `POCKETBASE_URL` (works today).
2. **Given** database=supabase, **Then** the config MUST wire a working `supabaseAdapter`. [Currently emits `// TODO: Import Supabase adapter` and a broken `{ type: 'supabase' } // Configure me` stub]
3. **Given** subscriptions=yes, **Then** the config MUST include the env-gated `subscriptionProvider` block. [Currently never emitted — see FR-004]
4. **Given** platform=vercel or cloudflare, **Then** the output MUST differ from node (entry point/adapter). [Currently identical]

---

### Edge Cases

- Project name validation checks `fs.existsSync(value)` relative to cwd; an absolute or nested path is accepted but only the final `path.resolve` matters.
- `copyTemplate` copies everything in `templates/starter` — including `scripts/`, tests, and `tsconfig.json`; there is no exclude list.
- Generated config always imports `createStripeSubscriptionProvider` from `@tillkit/integration-stripe`, even when subscriptions were declined — a dead import in most projects.
- `TillKitConfigSchema` (core) has no `inventoryWebhook` or `subscriptionProvider` keys, so `defineConfig` (non-strict zod) silently strips those generated blocks even if emitted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The CLI MUST collect project name, platform, database, inventory webhooks, subscription billing, and styling via interactive prompts, with clean cancellation at every step.
- **FR-002**: The CLI MUST scaffold by copying `templates/starter`, writing `tillkit.config.ts`, and renaming `package.json`.
- **FR-003**: The platform answer MUST change the generated output (server entry/deploy config per node/vercel/cloudflare). [GAP — `platform` is passed to `generateConfig` but never used]
- **FR-004**: The subscriptions answer MUST be honored in the generated config. [GAP — `main()` omits `subscriptions` from the `generateConfig` call, so the block is unreachable]
- **FR-005**: database=supabase MUST emit working `supabaseAdapter` wiring (the adapter package exists). [GAP — emits a TODO stub]
- **FR-006**: styling=tailwind MUST produce a Tailwind-ready project. [GAP — only sets `theme: { name: 'tailwind' }`, a string that matches no built-in theme]
- **FR-007**: The generated `tillkit.config.ts` MUST be consumed by the scaffolded app's runtime. [GAP — the starter reads env vars directly in `app-context.ts`/`index.ts`; the config file is inert]
- **FR-008**: The template source path MUST resolve correctly both in the monorepo and when the package is published to npm. [GAP — `path.join(__dirname, '..', '..', 'templates', 'starter')` from `dist/` resolves to `packages/templates/starter`, which exists in neither location (the starter lives at repo-root `templates/starter`), and `package.json` has no `files` entry bundling templates]
- **FR-009**: Outro links MUST point at real destinations. [GAP — `https://tillkit.shop/docs` and `discord.gg/tillkit` do not exist]
- **FR-010**: Secrets in the generated config MUST come from environment variables only (currently satisfied: all keys read `process.env`).

### Key Entities *(include if feature involves data)*

- **Scaffold answers**: `{ projectName, platform, database, webhooks, subscriptions, styling }` — the CLI's only data model; consumed by `generateConfig` (partially) and the copy step.
- **Generated config**: `tillkit.config.ts` calling `defineConfig` from `@tillkit/core`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every prompt combination yields a project that installs and boots (currently fails for supabase, and template copy fails outright per FR-008).
- **SC-002**: 100% of prompt answers produce an observable difference in the generated project (currently ~3 of 6 do).
- **SC-003**: `npx create-tillkit` works from the published npm package, not only from a source checkout.
- **SC-004**: Zero dead or misleading content in generated output (unused imports, TODO stubs, dead links).

## Assumptions

- pnpm is the assumed package manager (outro instructs `pnpm install`).
- The bin (`bin/create-tillkit.js`) importing `../dist/index.js` (tsc `outDir: ./dist`) is the intended distribution shape.
- Non-interactive/flag-driven operation (CI scaffolding) is out of scope for this spec.

## Known Gaps

- Template path resolves to a nonexistent directory (`packages/templates/starter`) from built output; publishing without a `files` entry for templates makes npm installs unusable (FR-008).
- `subscriptions` answer collected but never passed to `generateConfig` (FR-004); `platform` accepted but unused (FR-003).
- Supabase choice emits a broken stub instead of `supabaseAdapter` wiring (FR-005).
- Styling choice only changes a theme-name string; no Tailwind setup, and the name doesn't match any built-in theme (FR-006, cross-ref spec 012).
- Generated `tillkit.config.ts` is not consumed by the starter runtime (FR-007); `defineConfig` also strips `inventoryWebhook`/`subscriptionProvider` keys absent from `TillKitConfigSchema`.
- Outro documentation/Discord links are fictitious (FR-009).

## Existing Implementation (reference)

- `packages/create-tillkit/src/index.ts` — prompt flow, `copyTemplate`, `generateConfig`, outro.
- `packages/create-tillkit/bin/create-tillkit.js` — bin shim importing `../dist/index.js`.
- `packages/create-tillkit/package.json`, `tsconfig.json` — no `files` field; `outDir: ./dist`.
- `packages/core/src/config.ts` — `defineConfig`/`TillKitConfigSchema` the generated file targets.
- `templates/starter/` — the copied template (spec 010).
