# Feature Specification: Project Operations & Publishing

**Feature Branch**: `019-project-operations`

**Created**: 2026-07-09

**Status**: Proposed

**Input**: v1 roadmap priority: project viability ops — what makes TillKit adoptable by developers who didn't write it

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Legally usable: LICENSE exists (Priority: P1)

A developer evaluating TillKit checks the license. The README claims MIT twice and links `./LICENSE` — **the file does not exist**. Until it does, nobody can legally adopt the project. Add the MIT LICENSE file with a copyright holder.

**Why this priority**: Zero-effort, absolute blocker. An OSS project without a license file is unusable regardless of code quality.

**Independent Test**: `test -f LICENSE` and the README badge link resolves.

**Acceptance Scenarios**:

1. **Given** the repo root, **When** a developer looks for LICENSE, **Then** an MIT license file exists and matches every license claim in README and docs.

---

### User Story 2 - CI gates every change (Priority: P1)

A contributor opens a PR; CI runs lint, build, and the full test suite (constitution: quality gates) and blocks merge on failure. The maintainer stops being the only quality gate.

**Acceptance Scenarios**:

1. **Given** a PR with a failing test, **When** CI runs, **Then** the check fails and the failure is visible in the PR.
2. **Given** the build-before-test coupling (packages consume `dist/`), **When** CI runs, **Then** it builds before testing — the pipeline encodes the ordering constraint documented in CLAUDE.md.
3. **Given** a PR touching an adapter, **When** CI runs, **Then** the (future, spec 001) adapter contract suite runs against both adapters.

---

### User Story 3 - Installable packages (Priority: P2)

`npm create tillkit` works for someone outside this repo: packages are published to npm under real versions via changesets, and the scaffolding CLI bundles or fetches the starter template correctly (today the template path is resolved relative to the CLI's `dist/`, which breaks for a published package — spec 011 gap).

**Acceptance Scenarios**:

1. **Given** a merged changeset, **When** the release workflow runs, **Then** versioned packages publish to npm with provenance, and `workspace:*` ranges resolve to real versions.
2. **Given** a machine with only Node and npm, **When** `npm create tillkit` runs, **Then** a working project scaffolds (template packaged with the CLI via `files`, or fetched from the release).

---

### User Story 4 - Docs tell the truth (Priority: P2)

The published docs match implemented behavior. The audit found direct contradictions: FAQ says subscriptions are "on the roadmap" (they're implemented), says admin is "orders only" (product CRUD exists), references an `ADMIN_TOKEN` basic-auth that doesn't exist in code, and a `--styling` CLI flag that isn't real; README's test-count badge and outdated roadmap drift from reality; deployment docs hand out SQL that duplicates (and can drift from) `setup()`.

**Acceptance Scenarios**:

1. **Given** any documented feature claim, **When** checked against the code, **Then** it is accurate — enforced by a docs review pass tied to this spec and by treating future doc drift as spec-violation bugs.
2. **Given** dead external links (tillkit.shop, discord.gg/tillkit, support@tillkit.dev), **Then** they are removed or point at real destinations.

---

### Edge Cases

- Tracked `dist/` files: `.gitignore` lists `dist/` but earlier commits tracked build outputs, so every build dirties the tree. Untrack them (`git rm -r --cached`) as part of CI setup — CI must build from source, not trust committed dist.
- Node version matrix: `engines` says `>=18`; CI should test the floor (18) and current LTS.
- `pnpm test` runs packages sequentially via `pnpm recursive` — fine for CI v1; parallelize later if slow.
- Changesets is already a devDependency with scripts wired (`changeset`, `version-packages`, `release`) but `.changeset/` was never initialized.
- Publishing `create-tillkit` requires deciding template distribution (bundle vs. degit-style fetch) — blocker tracked in spec 011.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repo MUST contain an MIT LICENSE file consistent with all license claims.
- **FR-002**: CI MUST run on every PR and push to main: install (frozen lockfile), build, lint, test — in that order.
- **FR-003**: Committed `dist/` outputs MUST be removed from version control; builds are CI/publish artifacts only.
- **FR-004**: Releases MUST flow through changesets: contributor adds a changeset; a release workflow versions and publishes all public packages together.
- **FR-005**: Every published package MUST declare `files`, `repository`, `license`, and a working `exports` map; `create-tillkit` MUST scaffold correctly when installed from npm.
- **FR-006**: Documentation MUST be corrected to match implemented behavior (FAQ subscription/admin claims, nonexistent flags/env vars, dead links, README badges/roadmap).
- **FR-007**: A CONTRIBUTING guide MUST document the spec-driven workflow (constitution V): where specs live, when a change needs a spec amendment, and the quality gates.
- **FR-008**: A `.github/PULL_REQUEST_TEMPLATE.md` MUST prompt for the governing spec and changeset.
- **FR-009**: `.env.example` files MUST enumerate every env var the code actually reads (audit found `POCKETBASE_URL`, `POCKETBASE_ADMIN_TOKEN`, `APP_URL` missing from the root example).

### Key Entities

- **Release**: a changeset-driven, all-packages version bump published to npm.
- **CI Pipeline**: the executable form of the constitution's quality gates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A stranger can `npm create tillkit`, follow README, and reach a running store without cloning this repo.
- **SC-002**: Every PR shows green lint/build/test checks before merge; broken main becomes impossible via the merge gate.
- **SC-003**: `git status` is clean after `pnpm build` on a fresh clone.
- **SC-004**: Zero factual contradictions between docs/ + README and the codebase at release time.

## Assumptions

- GitHub Actions is the CI platform (repo is GitHub-hosted; spec-kit and `gh` tooling already assume it).
- npm is the registry; the `@tillkit` scope is available (verify before first publish; rename fallback needed if squatted).
- Docs site (tillkit.shop/docs) is out of scope for v1; in-repo markdown is the documentation of record.

## Known Gaps (current state)

- No LICENSE file despite three MIT claims (README ×2, FAQ).
- No `.github/`, no CI of any kind, no `.changeset/` directory.
- Build outputs tracked in git; builds dirty the tree.
- Docs contradict code in at least five places (see User Story 4).
- Packages have never been published; `npm create tillkit` does not work outside this repo.

## Existing Implementation (reference)

- `package.json` — changesets scripts already wired, tooling installed.
- `README.md`, `docs/faq.md`, `docs/deployment.md`, `docs/examples.md` — the drift surface.
- `.gitignore` — already lists `dist/`; tracking predates it.
- `CLAUDE.md` — documents the build-before-test constraint CI must encode.
