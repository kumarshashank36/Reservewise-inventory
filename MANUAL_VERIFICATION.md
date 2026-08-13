# Manual UI Verification Guide

A scripted, step-by-step pass over every feature of the inventory reservation system, driven entirely through the browser. Each scenario lists the steps, what to expect, and the underlying rule from the technical challenge it exercises.

## Start here

```sh
npm install
npm run verify:ui
```

The script boots MongoDB (Docker), seeds an admin plus three products, starts the API and the web app, opens `http://localhost:5173`, and prints a compact checklist. Press **Ctrl+C** when finished (MongoDB keeps running).

**Seeded admin sign-in:** `admin@example.com` with the password from `SEED_ADMIN_PASSWORD` (default `verify-local-password-123`; anything you set yourself overrides it). The verify script resets the seeded admin's password to this value on every run, so these credentials always work.

**Fast path for expiry:** the hold window is configurable through `HOLD_MINUTES` (default 10).

```sh
HOLD_MINUTES=1 npm run verify:ui
```

## Scenarios

### 1. Landing page

1. Open `http://localhost:5173`.
2. **Expected:** hero copy, "Start reserving" and "Sign in" links. All links work.

### 2. Customer registration

1. Click **Create account** → fill name, a new email, and a 6-character password → submit.
2. **Expected:** the password fails with a validation error (minimum 10 characters).
3. Use a 10+ character password → submit.
4. **Expected:** you land in the customer workspace with a sidebar (Catalog / My reservations) and your name bottom-left.
   *Rule: validation; role-based workspace.*

### 3. Login (with role toggle)

1. Sign out (↗ button, bottom of sidebar) → the sign-in screen shows a **Customer / Admin** toggle with **Customer** selected by default.
2. Enter your customer email and a wrong password → submit.
3. **Expected:** "Email or password is incorrect" error (no hint about whether the email exists).
4. Enter your customer email with the correct password but keep **Admin** selected → submit.
5. **Expected:** "This is a customer account. Select the Customer sign-in type and try again." error.
6. Switch the toggle to **Customer** and sign in.
7. **Expected:** you return to the customer workspace.
   *Rule: the backend enforces that the account role matches the selected sign-in type; the redirect follows the authenticated role.*

### 4. Catalog

1. Open **Catalog**.
2. **Expected:** seeded products with a category chip row (**All / Electronics / Furniture / Clothing / Home & Living / Stationery**), each card showing its category label, price, and units available. The stepper `+` is disabled when quantity reaches `available`, and `−` is disabled at 0.

### 5. Reserve inventory

1. Add 2 × Desk Lamp and 1 × Chair → the cart panel shows "3 units selected" with line totals.
2. Click **Reserve inventory**.
3. **Expected:** a success notice with the hold length, the cart empties, and the catalog now shows 2 fewer lamps and 1 fewer chair available.
4. Add a quantity, then navigate to Wishlist and back to Catalog.
5. **Expected:** the draft (selections) is still there — it persists per customer across navigation and refreshes.
6. With a draft selected, stop the backend (`kill` its process or Ctrl+C the dev run) and click Reserve → the failure notice appears.
7. Restart the backend, navigate away and back to Catalog, click Reserve again.
8. **Expected:** the retry succeeds — the draft kept its idempotency key, so the same hold is replayed rather than a duplicate reservation being created.
   *Rule: multi-product reservation; available = onHand − reserved; retries with the same key are safe.*

### 6. Countdown

1. Open **My reservations**.
2. **Expected:** the pending reservation shows a **ticking "Expires in m:ss"** counter and Release/Complete buttons.

### 7. Release (cancel)

1. Click **Release** on the pending reservation.
2. **Expected:** status becomes **Cancelled**; back in the catalog the units are available again.
   *Rule: cancelling makes inventory available again.*

### 8. Complete

1. Reserve 1 × Grid Storage Shelf → **Complete** it.
2. **Expected:** status **Completed**. In the admin inventory (see scenario 12) the product's **on-hand dropped by 1** and reserved returned to 0 — the sale consumed real stock.
   *Rule: completed sales consume inventory without breaking onHand ≥ reserved.*

### 9. Expiry (fast path)

1. Stop the current run (Ctrl+C), then boot with a 1-minute hold window: `HOLD_MINUTES=1 npm run verify:ui`.
2. Register/reserve an item, then open **My reservations** and watch the countdown reach zero.
3. **Expected:** the row flips to **Expiring** with "Hold window ended — inventory is being released" and the action buttons disappear. Within ~30 seconds (the expiry worker interval) the row becomes **Expired** and the catalog shows the stock again.
   *Rule: pending reservations expire; expired holds release their inventory.*

### 10. Customer isolation

1. Register a second customer in an incognito window.
2. **Expected:** their **My reservations** list is empty even though another account holds reservations. (The API also returns 404 for another customer's reservation id — covered by automated tests.)
   *Rule: customers only access their own reservations.*

### 11. Concurrency in the UI

1. As admin, add a product with **on-hand = 1** (scenario 14).
2. In a normal window sign in as customer A; in an incognito window sign in as customer B.
3. Both add the 1 available unit and click **Reserve inventory** as close to simultaneously as you can.
4. **Expected:** exactly one customer sees the success notice; the other sees "… no longer has enough available inventory". The catalog never shows negative availability.
   *Rule: the system never reserves more inventory than exists, even concurrently.*

### 12. Admin inventory

1. Sign in as `admin@example.com` with the **Admin** toggle selected (the **Customer** toggle rejects this account with a role-mismatch error).
2. **Expected:** the inventory table shows every product with **Available / Reserved / On hand** columns and Active/Inactive status. Customer-only routes redirect here; admin-only routes redirect customers away.

### 13. Admin stock adjustment (safe reductions)

1. On a product with reserved > 0, click **Adjust**, type a value **below reserved** → **Save**.
2. **Expected:** an inline error: "On-hand inventory cannot be reduced below currently reserved inventory (N)" and the value is unchanged. (The API enforces the same rule server-side — a 409.)
3. Type a valid value → **Save**.
4. **Expected:** the row updates after a reload.
   *Rule: admin adjustments never invalidate existing valid reservations.*

### 14. Admin catalog control

1. Click **Add product**, fill SKU/name/price/on-hand → submit.
2. **Expected:** the new product appears in the table and in the customer catalog (active by default).
3. **Deactivate** a product → it disappears from the customer catalog but stays in the admin table. **Activate** restores it.

### 15. Admin reservation audit

1. Open **Reservations**.
2. **Expected:** every customer's reservations with customer name/email, item snapshots (SKU × quantity), status badge, and timestamps — including completed, cancelled, and expired history.

### 16. Session, redirects, and roles

1. While signed in, refresh the page → you stay signed in (token is revalidated against `/auth/me`).
2. Sign out → you land on the landing page.
3. While signed in as a customer, visit `http://localhost:5173/admin` → redirected to `/app`. As an admin, visit `/app` → redirected to `/admin`.

### 17. Responsive layout

1. Narrow the browser below 700px.
2. **Expected:** the sidebar becomes a top bar, the inventory table becomes stacked cards with labelled values, the cart moves below the product grid, and forms become single-column.

### 18. Admin team provisioning

1. As admin, open **Team** in the sidebar.
2. **Expected:** every account is listed with name, email, role badge, and creation date.
3. Fill the form to add a new **Admin** account (name, unique email, 10+ character password) → **Add account**.
4. **Expected:** the account appears in the list; a duplicate email or a short password shows an error.
5. Sign out, then sign in as the new account with the **Admin** toggle → lands in the admin workspace.
6. **Expected:** signing in as that same account with the **Customer** toggle shows the role-mismatch error.
   *Rule: open self-registration stays customer-only; only admins can provision admin accounts.*

### 19. Customer deactivation (soft delete)

1. Register a fresh customer, then as admin open **Team**.
2. **Expected:** the customer row has a **Deactivate** button; admin rows do not.
3. Click **Deactivate** → the row switches to **Confirm / Keep**; click **Confirm**.
4. **Expected:** the row now shows a **deactivated** badge with the deactivation time, and the button is gone.
5. In the customer's browser (or after signing out and trying to sign in as them): refreshing a page they had open signs them out, and signing in shows "This account has been deactivated. Contact an administrator for help."
6. **Expected:** their reservation history still appears in the admin Reservations audit view.
7. Back in **Team**, click **Reactivate** on the deactivated row.
8. **Expected:** the badge flips back to **customer**, sign-in works again, and even the session that was open before deactivation becomes valid again on refresh.
   *Rule: only customers can be soft-deleted; their data is retained, their sessions die immediately while deactivated, and reactivation restores access.*

### 20. Wishlist

1. As a customer, open the **Catalog** and click the **♡** heart on a product card.
2. **Expected:** the heart fills to ♥ immediately; open **Wishlist** in the sidebar — the product is listed with live availability and a "Saved products are not reserved" note.
3. **Expected:** catalog availability is unchanged by hearting (wishlist never holds stock); the admin inventory view also shows no change.
4. In the Wishlist, use the stepper to pick a quantity and click **Reserve**.
5. **Expected:** a hold success notice appears, availability drops in the wishlist, and the item shows under My reservations with its countdown. The wishlist entry remains.
6. Add a product with on-hand = 1 (as admin), heart it as customer A, and have customer B (incognito) reserve the last unit.
7. **Expected:** customer A's wishlist now shows **Unavailable**; reserving it from the wishlist fails with the insufficient-inventory message while the item stays saved.
8. Click **Remove** on a wishlist item.
9. **Expected:** the item disappears and inventory is untouched.
   *Rule: wishlists are per-customer bookmarks; only a successful reservation changes inventory.*

### 21. Pagination

1. Open the customer **Catalog** — the seed ships 12 products, so a pager appears below the grid.
2. **Expected:** a "12 products · Page 1 of 2" bar with numbered page buttons (**1 2**), an active-state highlight on the current page, a **Per page** dropdown (5 / 10 / 20 / 50), and **Previous / Next** controls; Next loads page 2 and Previous becomes enabled. Choosing a new page size resets to page 1 and refetches (e.g. 20 → one page, 5 → three pages).
3. The same pager appears on admin **Inventory** (12 products), and on **My reservations**, **Wishlist**, admin **Reservations**, and **Team** once those lists exceed 10 items.
4. **Expected:** even with a single page of data the bar stays visible ("Page 1 of 1" with disabled controls), and visiting a page beyond the last (e.g. after removing the last item on page 2) snaps back to the last valid page.
   *Rule: every list endpoint is server-paginated (page/limit with totals); the draft cart still counts selections across all pages.*

### 22. Category browsing

1. On the Catalog, click **Electronics** in the chip row.
2. **Expected:** only electronics products show (6 seeded), the chip highlights, the pager reflects the filtered total, and the wishlist/admin views show the category label on each item.
3. Click **All** → the full 30-product catalog returns across pages.
4. As admin, add a product with a chosen **Category** from the form.
5. **Expected:** it appears under that category chip for customers; a filtered category with no products shows "No products in <category>".
   *Rule: category filtering is server-side (`?category=`), combined with pagination and the active-only catalog.*

## What is NOT manually verifiable via the UI (by design)

These are the properties the UI cannot easily demonstrate, so they are enforced by automated tests instead (`npm test` — 26 backend, 19 frontend):

- Idempotent retry with the same key after a lost response (backend test: concurrent duplicate keys).
- Atomic rollback of a multi-product reservation when one line fails (backend test).
- Cancel/complete racing the expiry worker release exactly once (backend tests).
- Transaction retry on transient MongoDB errors (unit tests).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `MongoDB did not become healthy` | Start Docker Desktop, then `docker compose up -d && docker compose ps`. |
| `API failed to start` | Check `/tmp/reservewise-api.log`; port 4000 may be in use (`lsof -i :4000`). |
| `Web app failed to start` | Check `/tmp/reservewise-web.log`; port 5173 may be in use (`lsof -i :5173`). |
| Seed complains about the password | `SEED_ADMIN_PASSWORD` must be at least 10 characters. |
| Stale data while verifying | The reservations page polls every 15s while holds are pending; a manual refresh always works. |
