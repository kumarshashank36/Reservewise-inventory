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

### 3. Login

1. Sign out (↗ button, bottom of sidebar) → **Sign in** with a wrong password.
2. **Expected:** "Email or password is incorrect" error.
3. Sign in with the correct password.
4. **Expected:** you return to the customer workspace.

### 4. Catalog

1. Open **Catalog**.
2. **Expected:** three seeded products (Lumen Desk Lamp, Form Task Chair, Grid Storage Shelf), each showing price and units available. The stepper `+` is disabled when quantity reaches `available`, and `−` is disabled at 0.

### 5. Reserve inventory

1. Add 2 × Desk Lamp and 1 × Chair → the cart panel shows "3 units selected" with line totals.
2. Click **Reserve inventory**.
3. **Expected:** a success notice with the hold length, the cart empties, and the catalog now shows 2 fewer lamps and 1 fewer chair available.
   *Rule: multi-product reservation; available = onHand − reserved.*

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

1. Sign in as `admin@example.com`.
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
