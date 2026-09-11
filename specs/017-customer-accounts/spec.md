# Feature Specification: Customer Accounts & Authentication

**Feature Branch**: `017-customer-accounts`

**Created**: 2026-07-09

**Status**: Proposed (an unwired, insecure prototype exists — treat as scaffolding, not a foundation)

**Input**: v1 roadmap priority: customer accounts & auth

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register and sign in securely (Priority: P1)

A shopper creates an account with email + password. The password is hashed with a modern KDF; the session is a signed, tamper-proof cookie. Signing in with a wrong password fails; forging a session cookie fails.

**Why this priority**: Everything else in accounts (order history, addresses, admin auth reuse) sits on this. The existing prototype is dangerous to ship: it verifies no passwords, stores the literal string `'placeholder'` as the hash, and its session cookie is unsigned base64 JSON anyone can mint.

**Independent Test**: Register; assert stored hash is a real KDF output. Attempt login with wrong password → rejected. Hand-craft a session cookie for another customer id → rejected.

**Acceptance Scenarios**:

1. **Given** a new visitor, **When** they register with a valid email and a password ≥ 8 chars, **Then** a customer record is created with a KDF password hash and they are signed in.
2. **Given** an existing account, **When** login is attempted with the wrong password, **Then** it fails with a generic error (no user-enumeration signal) — same response shape as unknown email.
3. **Given** a session cookie whose signature does not verify, **When** any authenticated route is hit, **Then** the request is treated as anonymous.
4. **Given** a registered email, **When** someone registers it again, **Then** registration fails without confirming the account exists (respond as if a confirmation was sent, or use a neutral error).

---

### User Story 2 - Order history and account page (Priority: P2)

A signed-in shopper visits `/account`, sees their profile and recent orders, and can log out.

**Acceptance Scenarios**:

1. **Given** a signed-in customer with 3 orders, **When** they open `/account`, **Then** their 3 orders show with number, date, status, and total; another customer's orders never appear.
2. **Given** an anonymous visitor, **When** they open `/account`, **Then** they are redirected to `/auth/login?redirect=/account` and returned there after signing in.
3. **Given** guest-checkout orders placed with the same email before registering, **When** the account is created, **Then** those orders MAY be linked (see Assumptions).

---

### User Story 3 - Cart continuity across login (Priority: P2)

The anonymous cart (session-cookie keyed, spec 003) survives login: signing in associates the cart with the customer rather than discarding it.

**Acceptance Scenarios**:

1. **Given** an anonymous cart with 2 items, **When** the shopper logs in, **Then** the cart still has 2 items and carries `customerId`.

---

### User Story 4 - Saved addresses (Priority: P3)

A signed-in shopper saves shipping addresses and picks one at checkout instead of retyping.

**Acceptance Scenarios**:

1. **Given** a saved default address, **When** the shopper reaches checkout, **Then** it is offered as the prefilled shipping address.

---

### Edge Cases

- Password reset requires email (spec 016) — reset flow ships only after transactional email lands; until then, no self-service reset (documented limitation).
- Session expiry: 30-day rolling cookie; logout invalidates the cookie client-side (stateless sessions mean no server-side revocation in v1 — acceptable, documented).
- The auth session (customer identity) and the cart session (anonymous cart id) are distinct cookies; login must bridge them, not merge them into one mechanism.
- Rate limiting on login/registration endpoints (constitution: money-adjacent surfaces) — at minimum, a fixed-window limiter per IP+email.
- Customer type has no first-class password-hash field; the prototype stashed it in `metadata`. The contract needs an explicit, never-serialized-to-client credential field or a separate credentials store. [NEEDS CLARIFICATION: extend `Customer` vs. new `credentials` namespace on DatabaseAdapter — decide at plan time]

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Passwords MUST be hashed with a memory-hard KDF available on all supported runtimes (Web Crypto PBKDF2 at high iterations as the portable baseline; scrypt/argon2 where the runtime allows). Plaintext or placeholder storage is prohibited.
- **FR-002**: Session cookies MUST be integrity-protected (HMAC-signed, e.g. via Web Crypto) with `HttpOnly; Secure; SameSite=Lax`; the signing secret comes from `SESSION_SECRET` env.
- **FR-003**: Auth MUST be env-gated and optional: a store without `SESSION_SECRET` runs guest-checkout-only, and no route breaks (constitution III).
- **FR-004**: Login and registration responses MUST NOT reveal whether an email is registered.
- **FR-005**: State-changing auth forms (login, register, logout, address CRUD) MUST carry CSRF protection compatible with the HTMX/form-POST architecture.
- **FR-006**: `/account` MUST show only the authenticated customer's data; order queries filter by the session's customer id, never by client-supplied ids.
- **FR-007**: Login MUST attach the current anonymous cart to the customer.
- **FR-008**: The starter MUST mount auth routes and show login/account links in the layout when auth is enabled.
- **FR-009**: Admin authentication (spec 009's gap) MUST be able to reuse this session mechanism with a role/flag distinguishing operators from shoppers.
- **FR-010**: Auth pages MUST be server-rendered HTML consistent with the storefront (no client framework).

### Key Entities

- **Customer**: existing entity; gains a credential (hash + algorithm + params) stored so it can never leak through existing customer-read paths.
- **Session**: signed cookie payload `{ customerId, email, role?, iat }` — stateless in v1.
- **Address**: existing entity; gains "default" semantics already present as `defaultAddressId`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A forged or tampered session cookie is rejected 100% of the time (property test over mutations).
- **SC-002**: Registered credentials verify round-trip; wrong passwords rejected 100%.
- **SC-003**: A shopper can register, shop, check out, and review the order in `/account` end-to-end.
- **SC-004**: With auth unconfigured, the full existing smoke-test checklist still passes unchanged.
- **SC-005**: The existing prototype's vulnerabilities (unsigned session, no password check) are gone — covered by regression tests.

## Assumptions

- Stateless signed-cookie sessions are sufficient for v1; a session store (revocation, "log out everywhere") is deferred.
- Guest checkout remains the default path; accounts are additive, never required to buy.
- Linking pre-registration guest orders by email is deferred unless email verification ships (claiming orders by unverified email is an account-takeover vector).
- Email verification and password reset land together with spec 016 (transactional email) as a fast-follow.

## Known Gaps (in the existing prototype)

- `POST /login` never checks the password — any known email signs in.
- Registration stores `metadata.passwordHash: 'placeholder'`.
- Session cookie is unsigned base64 JSON; `sessionSecret` config is accepted and ignored.
- No CSRF protection anywhere.
- Not mounted by `createHonoApp` or the starter — currently dead code, which is the only reason the above isn't an active incident.

## Existing Implementation (reference)

- `packages/server/src/routes/auth.ts` — the prototype (routes, session middleware, requireAuth).
- `templates/starter/src/app-context.ts` — the separate anonymous cart-session mechanism (must remain distinct).
- `packages/core/src/types/index.ts` — Customer/Address types.
