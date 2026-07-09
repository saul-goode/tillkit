# Feature Specification: Product Images

**Feature Branch**: `014-images`

**Created**: 2026-07-09

**Status**: Partially implemented (backfilled)

**Input**: Backfilled from implementation audit

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator uploads a product image from admin (Priority: P1)

A store operator adds an image on the admin product form; the configured image provider stores it, and the product's `images` gain a URL (plus size variants where the provider supports them). With no provider configured, the form still accepts a plain image URL (external provider, the zero-config default).

**Why this priority**: The integration package exists but has no callers; product imagery currently depends on operators hand-writing URL strings via the API.

**Independent Test**: Configure Cloudinary test credentials, upload a file from the admin product form, and verify the product renders the returned `secure_url` in the storefront.

**Acceptance Scenarios**:

1. **Given** a configured provider, **When** the operator uploads a file on the product form, **Then** `createImageService(...).uploadProductImage` runs (2048×2048 `inside`, quality 85) and the result URL is saved on the product. [GAP — no admin upload UI exists]
2. **Given** provider `external` (default), **When** the operator supplies an image URL, **Then** it is stored as-is; programmatic `upload()` throws a descriptive error by design.
3. **Given** a variant image, **Then** `uploadVariantImage` uses 800×800 `inside`, quality 80.

---

### User Story 2 - Responsive images in the storefront (Priority: P2)

Storefront pages render `srcset`s built from provider variants (thumbnail 150 → small 300 → medium 600 → large 1200 → full 2048) so shoppers load appropriately sized images.

**Acceptance Scenarios**:

1. **Given** an uploaded image key, **When** `getResponsiveSrcSet(key)` is called, **Then** it emits `"<variantUrl> <width>w"` pairs for each configured size (implemented; unconsumed).
2. **Given** the Cloudinary provider, **Then** variants are transform URLs (`w_,h_,c_` segments) — no extra uploads (implemented).

---

### User Story 3 - Provider choice by configuration (Priority: P3)

A developer selects `external`, `sharp`, `cloudinary`, or `r2` in config; `createImageProvider` constructs it, and absence of image config degrades to `external` behavior rather than crashing (constitution III).

**Acceptance Scenarios**:

1. **Given** each `ImageConfig` variant, **When** `createImageProvider(config)` runs, **Then** the matching provider is returned; unknown providers throw a descriptive error (implemented).
2. **Given** sharp/r2 selected, **Then** uploads MUST actually persist bytes retrievable at the returned URLs. [Currently false — see gaps]

---

### Edge Cases

- Filenames are sanitized (`[^a-zA-Z0-9.-]` → `-`) and prefixed with `Date.now()` — collisions within the same millisecond are possible but tolerated.
- Sharp is loaded lazily via dynamic `import('sharp')` so the dependency is optional until first upload; r2Provider degrades gracefully when sharp is absent (uploads unresized).
- Cloudinary requests are signed (sorted-params + SHA-1 via `crypto.subtle`) for upload and destroy — no unsigned uploads.
- `externalProvider.getUrl(key)` returns the key unchanged: keys are full URLs; `getVariants` returns only `{ original }`.
- The package-level config shapes (`SharpConfig` with `storage: 'local'|'s3'|'r2'`) and the core zod schemas (`filesystem`/`s3`/`vercel-blob`, `publicUrl` vs `customDomain`) disagree — config written against one does not satisfy the other. [GAP]

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST define a provider contract — `upload`, `delete`, `getUrl`, `getVariants` — with results carrying url/key/dimensions/format/size/variants (implemented).
- **FR-002**: `external` MUST be the zero-config default: image URLs managed elsewhere, uploads rejected with a descriptive error (implemented; must remain the default when no config is present).
- **FR-003**: The sharp provider MUST persist processed output to its configured storage and return URLs that resolve. [GAP — it resizes/re-encodes in memory, logs, and returns URLs to files that were never written; `delete` only logs]
- **FR-004**: The r2 provider MUST authenticate with a real AWS SigV4 signature. [GAP — the Authorization header contains the literal placeholder `Signature=...`; every upload fails auth. Its `delete` also only logs]
- **FR-005**: The Cloudinary provider MUST sign uploads/destroys and derive size variants as transform URLs (implemented — complete).
- **FR-006**: Product image upload MUST be reachable from the admin product form using the configured provider. [GAP — nothing imports `@tillkit/integration-images`]
- **FR-007**: Storefront product rendering MUST use responsive variants where available. [GAP — starter renders raw `img.url` only]
- **FR-008**: Core config (`ImageConfig` zod) and the integration package's config types MUST agree so validated config constructs a provider directly. [GAP — shapes diverge]
- **FR-009**: Image handling MUST not affect money paths; any stored `size` is bytes, never cents (no conversion concerns — informational).

### Key Entities *(include if feature involves data)*

- **ImageResult**: `url`, `key`, optional `width`/`height`/`format`/`size` (bytes), `variants` map (name → URL).
- **Product.images**: today, plain URL objects in product JSON; intended to hold provider results.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can attach an image to a product entirely from admin, with any configured provider (currently impossible).
- **SC-002**: 100% of URLs returned by any provider's `upload` resolve to a retrievable image (currently false for sharp and r2).
- **SC-003**: A store with no image config still fully works with externally hosted URLs.
- **SC-004**: Storefront pages ship `srcset` for provider-managed images.

## Assumptions

- `sharp` remains an optional peer dependency (Node-only is acceptable: image processing happens in adapter-like integration code, and Cloudinary/external stay runtime-portable per constitution VI).
- `DEFAULT_IMAGE_SIZES` (150/300/600/1200/2048) are the canonical variant set.
- Direct-to-provider client uploads (pre-signed URLs) are future work; v1 uploads proxy through the server.

## Known Gaps

- Nothing imports the package — no admin upload UI, no starter usage; product images are hand-entered URL strings (FR-006, FR-007).
- sharpProvider never persists output despite a `storage` config field (FR-003).
- r2Provider has a placeholder SigV4 signature and cannot authenticate (FR-004).
- Core zod `ImageConfig` and package config types have drifted apart (FR-008).
- Attachment-style declarations exist but are unused end to end.

## Existing Implementation (reference)

- `packages/integrations/images/src/index.ts` — provider contract, `sharpProvider`, `cloudinaryProvider`, `r2Provider`, `externalProvider`, `DEFAULT_IMAGE_SIZES`, `createImageService`, `createImageProvider`.
- `packages/core/src/config.ts` — `ExternalImageConfig`/`SharpImageConfig`/`CloudinaryImageConfig`/`R2ImageConfig` zod schemas (unconsumed).
- `templates/starter/src/app.ts` — renders `product.images[].url` directly (the would-be consumer).
- `packages/server/src/routes/admin.ts` — product form lacking any image field (the other would-be consumer).
