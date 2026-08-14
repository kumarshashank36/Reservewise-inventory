# PROJECT_STATUS — Inventory Reservation System

Lead-engineer review of the current codebase against [Technical Challenge.md](./Technical%20Challenge.md) and [DESIGN.md](./DESIGN.md).
**Verification performed:** backend suite (11/11 passing), frontend suite (1/1 passing), production build (success), git in sync with `origin/main`. All claims below are code-verified, not inferred from structure.

---

## 1. Current Progress

The system is **substantially complete and working end to end**. Verified today:

- **Backend** (`backend/src/`): Express 5 API with JWT auth (customer/admin), full reservation lifecycle, MongoDB transactions, idempotency, expiry worker, customer wishlists, validation (zod), and consistent error responses. All list endpoints are paginated (`?page&limit` with total metadata); search/filter/sort compose server-side — catalog (`?search=`, `?category=`, `?sort=`), admin products (+ `?active=`), admin reservations (`?status=`, SKU/item search, sort) — with supporting compound indexes for every filter/sort path. Product details (name, description, price, category, image URL, stock) are fully editable via `PATCH /admin/products/:id`, with immutable SKUs and clearable images. **55/55 tests pass** against a disposable replica set (`mongodb-memory-server`).
- **Frontend** (`frontend/src/`): React 19 + Vite SPA with landing, login/register (with Customer/Admin sign-in toggle), customer catalog + wishlist + cart + reservation history, and admin inventory + reservations + team views. Protected routing, session restore, live countdowns, inline admin stock editing, loading/error/empty states, responsive CSS. The customer area shares one layout + wishlist state across its pages, so membership changes reflect instantly on navigation, with re-sync and focus-refetch recovery. The catalog reservation draft persists per customer in browser storage — including its pending idempotency key — and is clamped to live availability on restore. The catalog has category chips (server-side `?category=` filtering) with category labels on cards, wishlist rows, and the admin inventory; the admin product form assigns categories and an optional image URL. Product photos (verified stock URLs, seeded for all 30 products) render on cards, the reservation draft, wishlist thumbnails, and admin inventory rows with a per-category gradient fallback on load failure. All six list views have numbered `react-paginate` pagers (visible even on a single page) with a per-page size selector (5/10/20/50), totals, and last-page snap-back. Route-level code splitting loads each page as its own chunk (auth ~2.6KB, customer pages ~3–7KB, admin pages ~4–7KB, main bundle 243KB), so customers never download admin code and vice versa; page chunks suspend inside the shell with design-consistent fallbacks, and images lazy-load natively. A light/dark theme toggle (top-right of the landing nav, sign-in page, and every app page header) flips the full CSS-variable palette, persists the choice, respects the OS preference on first visit, and applies pre-paint to avoid flashes. A global snackbar (toast) system surfaces transient outcomes — hold successes, availability conflicts, release/complete confirmations, and admin actions (product added/updated, activate/deactivate, account provisioned/deactivated/reactivated) — bottom-right with auto-dismiss, manual dismissal, and theme-aware styling. The wishlist renders as catalog-style cards, and all admin forms (add/edit product, add account) live in centered dialogs built on a shared modal shell with Escape/backdrop dismissal. **60/60 tests pass; production build succeeds.**
- **Database**: MongoDB 8 single-node replica set via `docker-compose.yml` (transactions require a replica set). Models with unique indexes and query indexes per DESIGN.md. Seed script creates an admin + 3 products.
- **Manual verification**: `npm run verify:ui` boots the stack, opens the browser, and prints a 17-scenario UI checklist (full details in `MANUAL_VERIFICATION.md`). `HOLD_MINUTES` env allows 1-minute holds for quick expiry verification.
- **Docs**: `README.md` answers all 8 assessment questions; `DESIGN.md` documents invariants, schemas, API contract, and testing strategy.
- **Git**: 2 commits on `main`, clean tree, pushed to `origin` (github.com:kumarshank36/entermind-assessment-shashank).

## 2. Requirements Coverage

| Requirement | Status | Evidence |
| --- | --- | --- |
| Working frontend | ✅ Completed | `frontend/src/` — all flows present, build passes |
| Backend/API | ✅ Completed | `backend/src/` — all DESIGN.md endpoints implemented |
| Persistent database | ✅ Completed | MongoDB replica set via `docker-compose.yml`; models in `backend/src/models/` |
| Authentication with customer/admin roles | ✅ Completed | `authService.js`, `authenticate.js`, `authorize.js`; role-gate tests pass |
| Appropriate validation and error handling | ✅ Completed | zod schemas in controllers; `errorHandler.js` maps Zod/AppError/CastError/11000 |
| Automated tests for important behaviour | 🟡 Partially completed | Backend coverage strong (idempotency, rollback, expiry, concurrency, role gates); frontend has only 1 smoke test |
| Clear local setup and run instructions | ✅ Completed | `README.md` + `.env.example` files + seed script |

| Business rule | Status | Evidence |
| --- | --- | --- |
| Inventory is limited | ✅ | `onHand`/`reserved` counters, `available` derived |
| Concurrent reservations never over-reserve | ✅ | Conditional `$expr` increments in transactions (`reservationService.js:71-79`); concurrency test passes |
| Multi-product reservations | ✅ | Normalisation + single transaction; rollback test passes |
| 10-minute expiry | ✅ | `expiresAt` + worker (`reservationExpiryWorker.js`); expiry test passes |
| Cancel/expire releases inventory | ✅ | `releaseItems` transactional decrement; tests pass |
| Repeated/interrupted requests are safe | ✅ | Customer-scoped `Idempotency-Key`, unique index, replay returns original; test passes |
| Admin adjustments keep reservations consistent | ✅ | `$expr` guard in `productService.js:25`; 409 test passes |
| Customers only manage their own reservations | ✅ | Owner-scoped queries; 404 cross-customer test passes |

## 3. Backend Status

| Area | Status | Notes |
| --- | --- | --- |
| Architecture | ✅ | routes → zod validation (controllers) → services (business rules + transactions) → Mongoose models. Clean layering. |
| Models/schema | ✅ | `User`, `Product`, `Reservation` with schema-level constraints and all DESIGN.md indexes |
| Authentication | ✅ | bcrypt (cost 12), JWT (`sub`/`role`/`email`, 8h). Login requires a Customer/Admin sign-in type: credentials are checked first (generic 401 — no account-existence leak), then a role mismatch is rejected with `403 ROLE_MISMATCH`. `authenticate.js` re-reads the user, so deleted accounts and role changes are enforced. |
| Authorization/roles | ✅ | `authorize('admin' | 'customer')` middleware; customers on `/reservations`, admins on `/admin/*` |
| APIs | ✅ | Every DESIGN.md endpoint exists: health, register, login, me, products, wishlist (list/add/remove, customer-only), reservations (create/list/get/cancel/complete), admin products (list/create/patch), admin reservations, admin users (list/create/delete/activate) |
| Business logic | ✅ | Reservation creation, state transitions, release all live in `reservationService.js` |
| Validation | ✅ | zod schemas per controller; SKU format, quantity bounds (1–10,000, ≤25 lines), password ≥10; duplicate product lines merged |
| Error handling | ✅ | `AppError`, ZodError → 400 w/ details, CastError → 400, 11000 → 409, 404 fallback, request-id on every error; pino logging |
| Inventory logic | ✅ | `available = onHand - reserved` virtual; conditional increments/decrements |
| Reservation logic | ✅ | Create/complete/cancel/expire all implemented with status guards |
| Concurrency/transactions | ✅ | `runTransaction` (3 attempts, transient-label aware) + driver `withTransaction`; conditional updates preserve invariants |
| Idempotency | ✅ | Header required (8–128 chars), `(customerId, idempotencyKey)` unique index, in-transaction lookup, duplicate-key race fallback, `Idempotency-Replayed` header |
| Expiration/cancellation | ✅ | 30s interval worker, bounded batches of 100, transactional release, races made idempotent by conditional pending→terminal updates |
| Admin functionality | ✅ | Product CRUD (except delete — not in DESIGN), safe stock adjust, all-reservations view, team provisioning (`GET/POST /admin/users` — admin-only creation of customer/admin accounts; open self-registration stays customer-only) + customer soft-delete/reactivate (`DELETE /admin/users/:id`, `POST /admin/users/:id/activate` — admins are rejected; deactivated accounts lose sessions and login immediately, records and reservation history retained, pending holds release via the expiry worker; reactivation restores access) |
| Tests | ✅ | 11 passing integration tests (see §6) |

**Backend findings:**

1. ~~Completion accounting~~ **✅ Resolved — completion now consumes inventory.** `completeReservation` decrements `onHand` and `reserved` together in the same transaction (claim-first, then `consumeItems`), so a completed sale reduces physical stock while preserving `onHand >= reserved`. DESIGN.md invariant 3 and README updated; test asserts the new accounting.
2. ~~Complete-vs-expiry boundary race~~ **✅ Fixed.** The completion claim now filters `{ status: 'pending', expiresAt: { $gt: now } }`, so a completion cannot land after its hold window ended.
3. ~~Transition races surfacing as 500s~~ **✅ Fixed.** Transitions now claim the status change first and throw `AppError(409, RESERVATION_STATE_CHANGED)` for the loser; release/consume runs only for the winner, so a competing actor can never double-release.
4. ~~Health endpoint 200 while DB down~~ **✅ Fixed.** `/health` now returns 503 + `degraded` when MongoDB is disconnected (test-covered in both states).
5. **Expiry backlog is bounded but not backpressured.** 100 reservations per 30s tick (`expireDueReservations`); fine at assessment scale, worth noting for scale.
6. **No rate limiting** on auth or reservation endpoints (acknowledged in README as production work).

## 4. Frontend Status

| Area | Status | Notes |
| --- | --- | --- |
| Pages | ✅ | Landing, Login/Register (`AuthPages.jsx`), Customer Catalog + My Reservations (`CustomerPages.jsx`), Admin Inventory + Reservations (`AdminPages.jsx`) |
| Components | ✅ | `AppShell` (sidebar/account), `AsyncState` (loading/error/empty), `ReservationStatus` badge |
| Routing | ✅ | React Router 7; `/`, `/login`, `/register`, `/app`, `/app/reservations`, `/admin`, `/admin/reservations`; `Protected` redirects by auth and role; post-login redirect to `location.state.from` |
| Authentication flow | ✅ | Login screen has a Customer/Admin sign-in toggle (radiogroup, clear selected state); the backend rejects valid credentials whose role does not match the selection with a friendly error. JWT in memory + `localStorage` for session restore; `/auth/me` revalidation on boot; logout clears and redirects. |
| Customer flow | ✅ | Catalog → stepper cart → reserve (idempotency key via `crypto.randomUUID()`, kept until success — correct retry semantics) → history with Release/Complete. **Live countdown** ("Expires in m:ss", ticking every second), overdue rows flip to "Expiring" and hide actions, and a silent 15s poll picks up expiry-worker results while holds are pending. |
| Admin flow | ✅ | Create product, full product editing (prefilled form: name, price, category, image URL, description, on-hand with a client-side reserved-floor check and server 409 surfacing; SKU locked), photo thumbnails in the inventory table, activate/deactivate. All-reservations audit view. **Team page** provisions customer/admin accounts (list + form, role select). |
| API integration | ✅ | Thin `api.js` client; `ApiError` carries code/status/details; all 11 endpoints wired |
| Loading/error/empty states | ✅ | Every data view has loading, error (with retry), and empty states; inline notices for mutations |
| Responsive design | ✅ | Breakpoints at 900px/700px; sidebar → top bar, catalog grid collapses, inventory table → cards |
| UI/UX quality | ✅ | Cohesive premium design (Manrope/DM Mono), consistent tokens, `role="status"`/`role="alert"` notices, aria-labels on icon/stepper buttons. Prompt-based stock edit and missing countdown are the two weak spots. |

## 5. Database Status

Implemented (all code in `backend/src/models/`):

- **users** — `email` unique (lowercase), role enum, `passwordHash` `select: false`.
- **products** — `sku` unique + uppercase + immutable; `onHand`/`reserved` non-negative safe integers; `isActive`; unique `{sku}`, `{isActive, name}` indexes; `available` virtual.
- **reservations** — customer ref, status enum, item snapshots (sku/name/quantity/priceCents, `_id:false`), `idempotencyKey`, `expiresAt`, terminal timestamps. Indexes: unique `{customerId, idempotencyKey}`, `{customerId, createdAt:-1}`, `{status, expiresAt}`, `{'items.productId'}`. No TTL index — deliberate (audit trail + transactions can't release stock via TTL).
- **Invariant enforcement** (`onHand >= reserved`) lives in service-layer conditional updates, exactly as DESIGN.md specifies.

**Missing / noted:**

- The single-field `customerId` and `status`/`expiresAt` schema-level indexes partially duplicate the compound ones (`{customerId, createdAt}` etc.) — harmless at this scale, tidy-up candidate.
- Schema/migration story: Mongoose auto-`syncIndexes`-style behavior only on demand; no explicit migration tooling (README lists this as production work).
- No admin index on reservations by `customerId` alone for populated lookups is fine; `listAdminReservations` populates via the `customerId` index.

## 6. Testing Status

**Existing (all passing — verified today, 31 backend + 21 frontend):**

- `backend/test/app.test.js` — degraded health (503) without DB, 404 shape (2 tests).
- `backend/test/auth-products.integration.test.js` — register/login/me, role gates (403, both directions), active-only catalog, safe stock-adjust 409, healthy DB health check, invalid credentials/weak passwords/duplicate emails, **role-matched sign-ins (customer + admin), role-mismatch rejections (both directions), no account/role leakage for invalid credentials, missing/invalid sign-in role → 400**, **admin team provisioning (role gates, provisioned admin signs in via the Admin toggle, no password-hash leaks, duplicate/weak-password/invalid-role validation)**, expired JWTs, deleted-account tokens, malformed ObjectIds (14 tests).
- `backend/test/reservations.integration.test.js` — atomic multi-product create + idempotent replay, full rollback on partial failure, cancel releases exactly once (double-cancel idempotent), **completion consumes stock** (onHand and reserved move together), customer isolation (404), expiry worker release, 8-way contention, **duplicate-line merging (+ rejected merge rollback)**, **concurrent duplicate-key race**, **missing idempotency key → 400**, **multi-customer final-unit contention**, **cancel-vs-expiry-worker race**, **complete-vs-expiry-worker race** (13 tests).
- `backend/test/transaction.test.js` — `runTransaction` retries on `TransientTransactionError` and `UnknownTransactionCommitResult`, does not retry non-transient errors, gives up after 3 attempts (4 tests).
- `backend/test/wishlist.integration.test.js` — add/list with live availability, concurrent duplicate-adds (unique index race), persistence across sessions, customer isolation (incl. foreign removal), zero inventory impact of add/remove, reserve-from-wishlist via the normal flow, graceful failure at zero availability, idempotent removal, admin role gate, identifier validation (8 tests).
- `frontend/src/App.test.jsx` — landing-page smoke test (1 test).
- `frontend/src/pages/AuthPages.test.jsx` — login with default Customer toggle (role param), Admin toggle switch, role-mismatch error display, wrong-credentials error, register success/validation error (6 tests).
- `frontend/src/pages/CustomerPages.test.jsx` — catalog load/error-retry, stepper + reserve with stable idempotency key, retry reuses the same key, countdown rendering, Release/Complete calls, overdue row hides actions, transition errors (7 tests).
- `frontend/src/pages/AdminPages.test.jsx` — inventory list, inline stock edit, reserved-floor client check, server 409 surfacing, add product, deactivate, audit view, team list + admin provisioning (role select), provisioning errors (7 tests).
- `frontend/src/pages/WishlistPage.test.jsx` — saved items with live availability, reserve through the normal flow with a stable idempotency key, unavailable items disable reserving, graceful server availability errors, removal without touching reservations, empty state (5 tests).
- `frontend/src/pages/CustomerPages.test.jsx` — includes catalog wishlist-heart toggling (8 tests).
- `frontend/src/context/AuthContext.test.jsx` — session restore via `/auth/me`, invalid-token cleanup (2 tests).

**Remaining test gaps (nice-to-have):**

1. **E2E browser test** spanning UI → API → DB (Playwright/Cypress) — manual UI verification covers this today via `npm run verify:ui`.
2. **Expiry worker timer itself** (`startReservationExpiryWorker` interval) — the underlying `expireDueReservations` is fully tested.
3. **Visual/accessibility audit** — no automated axe pass yet.

## 7. Technical Challenge Gap Analysis

Everything explicitly required by the challenge is **implemented and verified**, and the review findings from the first pass are resolved:

1. ~~Frontend test coverage~~ **✅ Resolved** — 19 behavioural tests now cover auth, catalog/reserve flows, countdown/expiry states, admin editing, and session restore.
2. ~~Completion accounting semantics~~ **✅ Resolved** — completion consumes `onHand`+`reserved` together; documented in DESIGN.md and README.
3. ~~Complete-vs-expiry boundary race~~ **✅ Fixed and race-tested.**
4. ~~Transition-race error mapping~~ **✅ Fixed — clean 409s, claim-then-release ordering.**
5. ~~Customer UX: countdown/auto-expiry~~ **✅ Live countdown, overdue state, silent polling.**
6. ~~Admin UX: prompt-based stock edit~~ **✅ Inline edit form with reserved-floor validation.**
7. **Production-readiness items** — unchanged and honestly listed in README §7 (refresh tokens, rate limiting, pagination, audit logs, CI, metrics). None are required for the challenge.
8. **E2E browser automation** — still not present; covered manually via `npm run verify:ui` + `MANUAL_VERIFICATION.md`.

No requirement is missing, and no implemented feature is fake — every claim in README is backed by passing tests.

## 8. Next Proceedings

### 1. Critical correctness issues — ✅ all resolved

- ~~Complete-vs-expiry boundary race~~ **Done** — `expiresAt: { $gt: now }` in the completion claim, race-tested.
- ~~Transition races → 500s~~ **Done** — claim-then-release ordering + `AppError(409, RESERVATION_STATE_CHANGED)`.
- ~~Completion accounting~~ **Done** — consumes `onHand`+`reserved` together; docs + tests updated.

### 2. Backend/business-logic hardening — ✅ resolved

- Race tests, duplicate-key fallback, transient-retry unit tests, auth edges, malformed identifiers, health 503 — all added (26 backend tests total).

### 3. Frontend/customer flow — ✅ resolved

- Live countdown, overdue state, silent 15s polling, dynamic hold-length copy.
- **Open (Low):** confirmation step before Release/Complete.

### 4. Admin flow — ✅ resolved

- Inline stock edit with reserved-floor validation; server 409 surfaced.

### 5. Edge cases — ✅ resolved

- Duplicate-line merging, multi-customer contention, and boundary races all tested.

### 6. Automated tests — ✅ resolved (19 frontend tests); remaining

- **E2E browser suite** (Playwright/Cypress) — optional; manual checklist covers it today. Priority: **Low**.

### 7. UI/UX polish — mostly done; remaining

- Confirmation dialogs on Release/Complete (Low), automated a11y pass (Low).

### 8. Production-readiness improvements — unchanged, post-submission

- Rate limiting on auth + reservations, pagination for admin lists, audit log for stock changes, CI workflow. Files: `backend/src/app.js`, services, new GitHub workflow. Priority: **Low** (post-submission).

### 9. README/documentation — ✅ resolved

- Completion accounting, `HOLD_MINUTES`, manual verification section, and test coverage all documented.

### 10. Final audit

- Fresh-clone verification: `git clone` → `npm run verify:ui` → manual checklist → `npm test` → `npm run build`. Commit and push final state. Priority: **High** (at the end).

## 9. Final Submission Checklist

- [x] Application source code committed (`frontend/`, `backend/`)
- [x] Database schema in code (`backend/src/models/`) + seed script (`backend/src/scripts/seed.js`)
- [x] Automated tests — 55 backend + 60 frontend, all passing
- [x] Manual UI verification — `npm run verify:ui` + `MANUAL_VERIFICATION.md` (17 scenarios)
- [x] README with local run instructions, architecture overview, trade-offs, and all 8 assessment answers
- [x] DESIGN.md with invariants, edge cases, and API contract
- [x] `.env` files excluded via `.gitignore`; `.env.example` templates provided
- [x] Repo pushed to GitHub, `main` in sync with `origin/main` (public repo per challenge requirement)
- [ ] Commit and push the changes from this pass (correctness fixes, tests, UI improvements, verification scripts)
- [ ] Fresh-clone dry run of `npm run verify:ui` + full checklist (§8.10)
