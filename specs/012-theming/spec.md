# Feature Specification: Theming

**Feature Branch**: `012-theming`

**Created**: 2026-07-09

**Status**: Partially implemented (backfilled)

**Input**: Backfilled from implementation audit

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Storefront and admin render the configured theme (Priority: P1)

A store owner sets a theme (`minimal`, `modern`, or `boutique`) in configuration; the storefront and admin pages render CSS variables generated from that theme, including dark-mode variants.

**Why this priority**: The theme system is fully built but decorative until a page actually renders it; this story makes the whole package real.

**Independent Test**: Set `theme: { name: 'boutique' }`, load a storefront page, and verify the emitted `:root` block contains boutique's `--primary: #7c2d12` (and admin likewise).

**Acceptance Scenarios**:

1. **Given** a configured theme name, **When** any storefront page renders, **Then** its stylesheet includes `getThemeStyles(name)` output: a `:root` block, a `[data-theme="dark"]` block, and a `@media (prefers-color-scheme: dark)` block for `data-theme="auto"`. [Currently fails — starter serves static `styles.css`]
2. **Given** an unknown theme name, **Then** rendering falls back to `minimal` (already the behavior of `getThemeStyles`/`getCurrentTheme`).
3. **Given** admin pages, **Then** they consume the same theme variables instead of hardcoded inline `<style>` blocks. [Currently fails]

---

### User Story 2 - Light/dark/auto modes (Priority: P2)

A shopper's OS dark-mode preference is respected when the store is in `auto` mode; an explicit `light`/`dark` mode wins via the `data-theme` attribute.

**Independent Test**: Render with `data-theme="auto"` and emulate `prefers-color-scheme: dark`; verify dark variable values apply; set `data-theme="light"` and verify they don't.

**Acceptance Scenarios**:

1. **Given** a theme with `dark` overrides, **When** CSS is generated, **Then** dark values are `theme.colors` merged with `theme.dark` (partial override semantics).
2. **Given** `ThemeManager` server-side in `auto` mode, **Then** `getEffectiveMode()` resolves to `light` (documented server default) while the CSS media query handles the client side.

---

### User Story 3 - Custom themes and email styling (Priority: P3)

A developer derives a custom theme with `createTheme(name, base, overrides)` and styles transactional emails with `generateInlineThemeCSS` (emails cannot load stylesheets).

**Acceptance Scenarios**:

1. **Given** `createTheme('brand', minimalTheme, { colors: { primary: '#123456' } })`, **Then** the result merges colors and dark overrides onto the base and carries the new name.
2. **Given** `generateInlineThemeCSS(theme, mode)`, **Then** variables are emitted as a single `;`-joined declaration string suitable for a `style` attribute.

---

### Edge Cases

- `ThemeManager.setTheme` silently ignores unknown names (no error) — current registry is the module-level `themes` record; `createTheme` results are not registered anywhere.
- `toggleDarkMode` from `auto` defaults to `dark`.
- The CLI writes `theme: { name: 'plain' | 'tailwind' }` — neither matches a built-in theme, so a consumer would always fall back to `minimal` (cross-ref spec 011).
- Typography/spacing/radii/shadows are optional per-theme; generation merges defaults (`defaultTypography` etc.) so every variable is always emitted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST define themes as data: colors (26 semantic slots), optional dark color overrides, and optional typography/spacing/radii/shadow scales (implemented: `Theme` interface).
- **FR-002**: The system MUST ship three built-in themes — `minimal` (zinc, default), `modern` (blue), `boutique` (warm) (implemented).
- **FR-003**: The system MUST generate CSS custom properties for a theme: `generateCSSVariables` (per mode), `generateThemeCSS` (`:root` + `[data-theme="dark"]` + `prefers-color-scheme` auto block), and `generateInlineThemeCSS` for emails (implemented).
- **FR-004**: Unknown theme names MUST fall back to `minimal`, never crash (implemented).
- **FR-005**: The starter storefront MUST render its page CSS from the active theme rather than a static hand-written stylesheet. [GAP]
- **FR-006**: Admin (and auth) pages MUST consume theme variables instead of hardcoded inline styles. [GAP]
- **FR-007**: The active theme MUST be selectable via configuration (`ThemeConfig` in core config / CLI styling answer) and honored at runtime. [GAP — `ThemeConfig` zod schema and the CLI prompt both nominally reference theming but connect to nothing]
- **FR-008**: Developers MUST be able to define custom themes (`createTheme`) and have them usable wherever built-ins are (registration/lookup path). [GAP — no registration mechanism beyond the static `themes` record]
- **FR-009**: Dark mode MUST support `light`/`dark`/`auto`, with `auto` following `prefers-color-scheme` client-side and resolving to light server-side (implemented in generation; unconsumed).

### Key Entities *(include if feature involves data)*

- **Theme**: named set of color/typography/spacing/radius/shadow tokens with optional dark overrides.
- **ThemeConfig** (core config): `{ name, css?, layout? }` — the intended selection surface, currently inert.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Switching the configured theme name changes storefront and admin appearance with zero template edits (currently impossible).
- **SC-002**: 100% of color usage in starter/admin CSS goes through `var(--…)` tokens; zero hardcoded hex values outside theme definitions.
- **SC-003**: OS dark-mode users see dark variants on `auto` stores without any JavaScript.
- **SC-004**: The three built-in themes render visually distinct stores from the same templates.

## Assumptions

- Themes ship in `@tillkit/server` (re-exported via `packages/server/src/index.ts`); moving them to core is not required by this spec.
- `ThemeManager` (mutable runtime with `onChange` listeners) targets long-lived server processes; per-request theme resolution from config is the primary intended path.
- Theme persistence (per-shopper mode preference cookie) is out of scope for this spec.

## Known Gaps

- Nothing consumes the theme system: starter serves static `styles.css` from disk; admin and auth pages ship hardcoded inline `<style>` blocks (FR-005/FR-006).
- Config and CLI reference theming in name only — no code path reads `ThemeConfig.name` into `getThemeStyles` (FR-007).
- CLI writes theme names (`plain`/`tailwind`) that don't exist as themes (spec 011).
- No custom-theme registration; `createTheme` output can't be selected by name (FR-008).

## Existing Implementation (reference)

- `packages/server/src/themes/index.ts` — `Theme` types, defaults, 3 built-ins, `generateCSSVariables`/`generateThemeCSS`/`generateInlineThemeCSS`, `getThemeStyles`, `createTheme`, `ThemeManager`/`themeManager`.
- `packages/server/src/index.ts` — `export * from './themes/index.js'`.
- `packages/core/src/config.ts` — `ThemeConfig` zod schema (unconsumed).
- `templates/starter/src/styles.css`, `packages/server/src/routes/admin.ts`, `packages/server/src/routes/auth.ts` — the hardcoded styling the theme system should replace.
