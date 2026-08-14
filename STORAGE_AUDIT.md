# STORAGE_AUDIT — where data and state live

Read-only audit of every piece of data/state in the application, its storage location, and whether the placement is appropriate. **No code was changed.** Findings are verified against the actual source (greps + file reads), not assumptions.

**Guiding principle:** MongoDB is the single source of truth for inventory, reservations, wishlists, users, and roles. Everything client-side is a cache, a preference, or user intent — never authoritative business data.

---

## 1. Storage layers — complete inventory

### Backend / MongoDB (`inventory` database)

| Collection | Contents | Source of truth for |
| --- | --- | --- |
| `users` | name, email (unique, lowercase), `passwordHash` (bcrypt, cost 12, never serialized), `role`, `deletedAt` (soft delete) | identity, roles, deactivation |
| `products` | sku (unique/immutable), name, description, category, imageUrl, priceCents, `onHand`, `reserved` (available is always derived) | inventory and pricing |
| `reservations` | customerId, status, item snapshots (sku/name/qty/price), `idempotencyKey`, expiresAt + terminal timestamps | reservations, holds, idempotency replay |
| `wishlistitems` | customerId + productId (unique pair), createdAt | wishlist membership |

No sessions collection — authentication is stateless (JWT). No audit-log or settings collection.

### Browser `localStorage` (3 keys, all in `frontend/src`)

| Key | Contents | File |
| --- | --- | --- |
| `reservewise.session` | `{ token, user }` — JWT + cached user snapshot | `context/AuthContext.jsx` |
| `reservewise.draft.<userId>` | `{ items: {productId: quantity}, key }` — cart selections + pending idempotency key | `pages/CustomerCatalogPage.jsx` |
| `reservewise.theme` | `'light' \| 'dark'` | `theme.js` |

### `sessionStorage`

**None.** Zero usage anywhere.

### Cookies

**None.** No cookie is set or read by the app (helmet/cors don't touch cookies; no cookie parser is installed). This is deliberate — the JWT travels in the `Authorization: Bearer` header, so there is no CSRF surface.

### React / client-side state (in-memory, per component/context)

| State | Where | Nature |
| --- | --- | --- |
| Auth session (in-memory copy) | `AuthContext` | mirror of localStorage session; revalidated via `/auth/me` on boot |
| Wishlist id set | `WishlistContext` | **cache** of server wishlist membership (optimistic toggles) |
| Catalog products / page data | `CustomerCatalogPage` (and each list page) | fetched page snapshot; stale-response guarded |
| Draft quantities + key | `CustomerCatalogPage` | mirrored 1:1 into localStorage |
| Pagination / search / filter / sort | URL search params (`?page&limit&q&category&sort&active&status`) via `useSearchParams` | shareable UI state, single request source |
| Countdown clock (`now`), action flags, form fields, snackbar stack, dialog open state, per-row confirm state | various components | ephemeral UI state |
| Page-size / sort defaults | module constants (`PAGE_SIZE`, `categories.js`) | static config |

---

## 2. Per-item analysis

### Authentication / session
- **Location:** JWT in `localStorage` (`reservewise.session`) + in-memory React context; `Authorization: Bearer` header on every API call. No cookies, no server-side session store.
- **Files:** `AuthContext.jsx`, `api.js`, `authService.js`, `authenticate.js`.
- **Appropriate?** Workable for this assessment and explicitly documented as a trade-off in the README. Stateless JWT keeps the API horizontally scalable.
- **Backend persistence?** Sessions don't need a DB, but a **refresh/revocation story does**: with an 8h stateless token there is no server-side way to revoke a token before expiry (except deleting/deactivating the user — which `authenticate` does enforce via the DB re-read).
- **Security concerns:** a token in localStorage is readable by any injected script (XSS) and by extensions; the cached `user` object is display data and can go stale. CSRF is a non-issue with header-only auth.
- **Recommendation (for production):** short-lived access token in memory + `HttpOnly; Secure; SameSite=Strict` refresh cookie with rotation and server-side revocation, per README §7. For the assessment, current approach is acceptable if documented (it is).

### JWT / token
- **Location:** issued by `authService.createToken` (`sub`, `role`, `email`; expiry `JWT_EXPIRES_IN`, default 8h). Never stored in MongoDB. Re-validated on every request in `authenticate.js`, which also **re-reads the user document** so role changes/deletions take effect immediately regardless of the token's claims.
- **Appropriate?** Yes — the DB remains authoritative for role/identity; claims are advisory.
- **Consistency:** excellent — the role claim in the token is effectively redundant with the DB read (kept consistent by construction). No change needed.

### User data
- **Location:** MongoDB `users` (authoritative) + cached snapshot inside `reservewise.session.user` (id/name/email/role/createdAt/deletedAt).
- **Appropriate?** Mostly. The cache is refreshed from `/auth/me` on every boot and cleared when the token is invalid.
- **Concern:** the cached role drives UI routing until the next reload. If an admin demotes a customer mid-session, the UI keeps the old role until refresh — the API still rejects (server-side `authorize`), so this is UX-only and safe.
- **Recommendation:** revalidate `/auth/me` on window focus (or accept and document). Do not store more than the display fields client-side.

### Products / inventory
- **Location:** MongoDB `products` (`onHand`, `reserved`; `available` derived). Client holds only fetched page snapshots (catalog/wishlist/admin lists) and a persisted **draft** of intended quantities (see below).
- **Appropriate?** Fully correct. No inventory math happens client-side except cosmetic clamping of draft quantities to displayed availability; the server's transactional conditional updates are the only writer of `onHand`/`reserved`.
- **Consistency:** wishlist/admin pages poll or refetch, so displayed availability is a short-lived cache, never a store. No change needed.

### Reservations
- **Location:** MongoDB `reservations` (authoritative: statuses, item snapshots, idempotency keys, timestamps). Client pages hold fetched list snapshots only.
- **Appropriate?** Yes. Completion/cancellation/expiry mutate the DB transactionally; the client never derives reservation state.
- **Note:** the customer list page's "Expiring" badge is a local clock projection while the server worker is authoritative — acceptable display sugar; the row re-syncs within 15s.

### Wishlist
- **Location:** MongoDB `wishlistitems` (authoritative, unique per customer+product) + `WishlistContext` in-memory `Set` of ids used for heart toggles across pages.
- **Appropriate?** Yes — the context is a **cache with optimistic updates and rollback**, and the wishlist page re-syncs when the cache disagrees with the server. Server remains the source of truth.
- **Concern:** cross-tab changes don't propagate to the cached set (page-level focus refetch covers the list; hearts in a background tab could look stale). Minor.
- **Recommendation:** optionally listen to `storage` events or refetch the set on focus; no backend change.

### Cart / reservation draft
- **Location:** `localStorage` per user (`reservewise.draft.<userId>`): `{ items, key }` — selections **and the pending idempotency key**; mirrored in React state.
- **Appropriate?** **Yes — this is the correct call.** A cart draft is user intent, not business data; the challenge only cares about actual reservations, which are server-side. Persisting the key alongside the draft is what makes retries after navigation/refresh safe (same key → same reservation replay).
- **Backend persistence?** Not required. (A server-side draft would add a cart API and conflict-resolution complexity for no correctness gain here.)
- **Consistency:** the key is invalidated whenever the draft is edited and the draft is clamped to live availability on load — so a persisted draft can never reserve more than exists and never replays a different request. Strong.
- **Minor notes:** the draft survives logout (keyed by user id) — harmless but could be cleared on sign-out if desired; `CustomerReservationsPage.jsx` still carries **unused** `readDraft`/`emptyDraft` helpers (leftover from the page-file split) — dead code, worth deleting.

### Pagination / search / filter / sort state
- **Location:** browser URL query parameters (`page`, `limit`, `q`, `category`, `sort`, `active`, `status`), read by `useSearchParams` and passed straight to the API. No persistence in localStorage.
- **Appropriate?** Excellent — shareable, back/forward-friendly, defaults omitted from the URL, and the server request is derived purely from the URL. No sensitive data.
- **Recommendation:** none.

### Customer / admin role
- **Location:** MongoDB `users.role` (authoritative). Mirrored in the JWT claim, the cached session user, and `req.user` (populated from the DB per request).
- **Appropriate?** Correct in both directions: role-gated login enforces the DB value at sign-in; `authorize` enforces the DB value per request; client routing uses the cached role for UX only.
- **Recommendation:** none beyond the user-data revalidation note above.

### Other persistent application data
- **Theme preference** (`reservewise.theme`): pure UI preference — localStorage is the right place; applied pre-paint via an inline script. No concerns.
- **URL state:** covered above.
- **Snackbars, dialogs, confirmations, form drafts in dialogs:** ephemeral React state; correctly not persisted (a half-filled admin form is intentionally discarded on close).

---

## 3. Summary of findings

### Correct as-is (keep)
1. Inventory (`onHand`/`reserved`), reservations, wishlists, users/roles — all server-authoritative, transactional, and re-read per request where it matters (role, existence).
2. Draft cart in localStorage **with** its idempotency key — intent + retry safety done right.
3. Pagination/search/filter/sort in URL params.
4. Theme in localStorage with pre-paint application.
5. No cookies ⇒ no CSRF surface.

### Issues / recommendations (priority order)
1. **Session storage hardening (production, post-assessment):** move from 8h JWT-in-localStorage to short-lived access token + HttpOnly refresh cookie with rotation/revocation. Current approach is assessment-appropriate and documented.
2. ~~Mid-session role/user staleness~~ **✅ Fixed** — `AuthContext` revalidates `/auth/me` on window focus/visibility, so role changes and deactivations reflect without a reload (test-covered).
3. ~~Wishlist cache cross-tab staleness~~ **✅ Fixed** — `WishlistContext` refetches the membership set on window focus/visibility (test-covered).
4. ~~Dead code~~ **✅ Fixed** — unused `readDraft`/`emptyDraft`/`money`/`heldMinutes` helpers and stale imports removed from `CustomerReservationsPage.jsx`.
5. ~~Draft survival across sign-out~~ **✅ Fixed** — `logout` now removes `reservewise.draft.<userId>` alongside the session (test-covered).

### Bottom line
The backend/database **is** the source of truth for every business-critical domain. localStorage holds only a token+user snapshot, a user-intent draft with its replay key, and a theme preference; React state and URL params are caches and UI state. No business-critical data is duplicated, derived, or trusted client-side.
