# Reservewise — Inventory Reservation System

Reservewise is a MERN inventory reservation application built for the Entermind technical assessment. Customers can browse active products, place ten-minute multi-product holds, and complete or cancel their own reservations. Administrators can safely manage inventory and review reservation activity.

## Demo

Watch a walkthrough of the app: [demo video](https://drive.google.com/file/d/1QubEMrHFyyzzthpRwK-D24U_pqKnIxS1/view?usp=sharing)

## Architecture

```text
React + Vite SPA  →  Express REST API  →  MongoDB replica set
                         │
                  service layer owns transactions,
                  idempotency, expiration, and rules
```

The client and API are intentionally separate workspaces. Routes/controllers handle HTTP and validation; services contain business logic; Mongoose models define persistence and indexes. See [DESIGN.md](./DESIGN.md) for the full business-rule analysis, schemas, API contract, and phased plan.

The frontend is React 19 + Vite with Tailwind CSS v4, shadcn-style primitives (Radix dialog, `ui/` components), and lucide icons. Route-level code splitting keeps customer, admin, and auth code in separate chunks; list state lives in URL query params with server-side pagination/search/filter/sort; light/dark theming flips a `data-theme` palette; and a shared wishlist + pending-reservation context feeds live animated sidebar badges. A fixed bottom-right watermark is present on every route.

## Run locally

Prerequisites: Node.js 20+, npm, and Docker Desktop.

1. Create local configuration files. Never commit the resulting `.env` files.

   ```sh
   cp .env.example .env
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

2. Set a unique 32+ character `JWT_SECRET` in `backend/.env` and use matching MongoDB credentials in `.env` and `backend/.env`.

3. Start MongoDB. Compose initializes a single-node replica set, which is necessary for transaction support.

   ```sh
   docker compose up -d
   docker compose ps
   ```

4. Install dependencies and optionally seed an admin, two demo customers, and 30 products. Choose a real local-only seed password; it is not stored in source control. The demo customers use `SEED_CUSTOMER_PASSWORD` (default `verify-local-password-123`) and are reset to it on every seed run.

   ```sh
   npm install
   SEED_ADMIN_PASSWORD='a-long-local-password' npm run seed --workspace backend
   ```

5. In separate terminals, start the API and the web app.

   ```sh
   npm run dev:backend
   npm run dev:frontend
   ```

Open `http://localhost:5173`. Customers can register themselves or sign in with the seeded fixtures `customer@example.com` / `priya@example.com` (Customer sign-in type, `SEED_CUSTOMER_PASSWORD`). The sign-in screen asks for a Customer or Admin sign-in type and the API rejects accounts whose role does not match the selection. The seeded admin signs in as `admin@example.com` (Admin sign-in type) with the `SEED_ADMIN_PASSWORD` used above; additional customer or admin accounts can be provisioned from the admin **Team** page, and customer accounts can be soft-deleted and reactivated there (administrators cannot be deleted). The catalog ships with 30 products across five categories (Electronics, Furniture, Clothing, Home & Living, Stationery) and is browsable by category chips with server-side filtering. Seeded products carry verified stock-photo URLs, rendered on catalog and wishlist cards, reservation rows, and the admin inventory; if an image is missing or fails to load, the UI shows a per-category gradient tile with a category pictogram instead.

The reservation hold window defaults to 10 minutes; set `HOLD_MINUTES=1` in `backend/.env` (or prefix a dev command with it) to shorten holds while demoing expiry.

Google Analytics is strictly opt-in: set `VITE_GA_MEASUREMENT_ID` (a GA4 measurement ID like `G-XXXXXXXXXX`) in `frontend/.env` to track a page view on every route. No analytics script loads and nothing is tracked by default, so local runs and reviewers are never tracked without the deployer's explicit configuration.

## Test, lint, and build

```sh
npm test
npm run lint
npm run build --workspace frontend
```

The backend suite (56 tests) starts a disposable MongoDB replica set and covers authentication, role gates, stock adjustment constraints, atomic reservations, idempotency (including a concurrent duplicate-key race), duplicate-line merging, cancellation, expiry, customer isolation, completion, contention (single- and multi-customer), transition-vs-expiry-worker races, status-filtered customer lists, and transaction retry behaviour. The frontend suite (65 tests) covers the auth flow, session restore, catalog/cart/reservation flows, admin inventory editing, wishlist behaviour, sidebar badges, and loading/error states. ESLint (flat config, recommended baseline plus react-hooks rules) is enforced over both workspaces.

## Manual UI verification

One command boots the full stack and prints a step-by-step checklist that walks through every feature in the browser, including a two-browser concurrency scenario and a fast path for expiry:

```sh
npm run verify:ui          # 10-minute holds
HOLD_MINUTES=1 npm run verify:ui   # 1-minute holds, for verifying expiry quickly
```

The printed checklist walks through every feature in the browser, including a two-browser concurrency scenario and a fast path for expiry.

## Key decisions and trade-offs

- `Product.onHand` and `Product.reserved` are the only stock counters; availability is always calculated as `onHand - reserved`.
- Wishlists are per-customer bookmarks and never touch inventory counters — only the reservation transaction moves stock. Wishlist reads show live availability and reservations from the wishlist reuse the same endpoint and rules.
- Completing a reservation consumes its units: `onHand` and `reserved` are decremented together in the same transaction, so a completed sale reduces physical stock without ever breaking `onHand >= reserved`.
- Reservations store immutable product snapshots (SKU, name, price, quantity, plus image/category display fields). Later product edits do not rewrite history.
- MongoDB transactions require a replica set. This is why local Compose is not a plain standalone `mongod`.
- Schema management is declarative: Mongoose models define collections and indexes, synced at startup, and data backfills are idempotent scripts under `backend/src/scripts` (see [DESIGN.md](./DESIGN.md)). Production would add a versioned migration runner applied before deploy.
- There is no reservation TTL index: deleting expired documents would lose audit data and would not atomically return stock.
- JWTs are used for the requested stateless authentication approach. The UI persists the current session for convenience; a production deployment should prefer short-lived access tokens with an HttpOnly refresh-token flow.

## Assessment questions

### 1. How does the system keep inventory correct concurrently?

Each create-reservation request runs in a MongoDB transaction. For every product it conditionally increments `reserved` only where `onHand - reserved >= requestedQuantity`. If any item fails, the transaction aborts and rolls back all earlier increments. Items are processed in stable ObjectId order to reduce conflict churn, and transient transaction failures are retried a bounded number of times.

### 2. What if the response is lost and the client retries?

`POST /reservations` requires an `Idempotency-Key`. `(customerId, idempotencyKey)` has a unique index. A replay returns the reservation created by the original request (with an `Idempotency-Replayed` header) rather than taking stock again. A duplicate-key race resolves by reading the winner.

### 3. How are multi-product reservations kept atomic?

All product availability checks, `reserved` increments, and reservation insertion happen in one MongoDB transaction. A product without enough stock throws a conflict and the complete transaction is aborted—there is no partial hold.

### 4. How are expiry and cancellation handled?

Pending reservations have a ten-minute `expiresAt` (configurable via `HOLD_MINUTES`). A background worker periodically finds due records and performs the same transactional state transition used by cancellation: claim the state change conditionally, then decrement every item’s `reserved` counter and mark the record terminal. The claim-then-release order guarantees two competing actors cannot release the same units twice. Completion uses the same claim pattern, re-checks `expiresAt` inside the update so a hold cannot complete after its window ended, and consumes the units by decrementing `onHand` and `reserved` together.

### 5. Failure scenarios considered and recovery

Handled scenarios include request retries, concurrent final-unit requests, transaction write conflicts, partial multi-item availability, race conditions between completion/cancellation/expiry, invalid input, deleted/expired credentials, customer cross-account access, inactive products, and unsafe admin stock reductions. Transactions roll back incomplete work; unique keys and status guards make replays safe; logs include request IDs and unexpected errors.

### 6. First bottleneck at 100,000 concurrent users

High-contention product documents—especially a popular low-stock SKU—would be the first contention hotspot, followed by API/database connection capacity and unbounded history growth. I would add read replicas/cache for the catalog, a queue or per-SKU reservation partitioning strategy for very hot products, cursor-based pagination for very large history collections, rate limits, horizontal API scaling, observability, and a production MongoDB cluster with tested transaction latency budgets.

### 7. What remains before production readiness?

Add refresh-token rotation/secure cookies, email verification/password recovery, rate limiting, audit logs for inventory changes, CSRF strategy where cookies are used, structured metrics/tracing/alerts, migration tooling, backups and restore drills, a server-state query library (e.g. TanStack Query) to replace the hand-rolled fetch plumbing, broader end-to-end/accessibility tests, secrets management, and a multi-node MongoDB deployment.

### 8. How AI was used

**Where AI helped:** initial scaffolding, test-case generation (especially the concurrency and race-condition scenarios), repetitive UI work (pagination, debounced search, snackbars, dialogs), accessibility details, and the tailwind migration. Everything was verified incrementally against real tests and builds rather than accepted wholesale.

**What AI-generated suggestions or code I changed or rejected:**

- **`z.coerce.boolean()` for the admin inventory `active` filter** — rejected: it coerces the string `'false'` into `true`. Replaced with a strict `z.enum(['true', 'false'])` plus an explicit transform.
- **A TTL index on pending reservations** — rejected: deleting expired documents would erase audit history and cannot atomically return stock. Replaced with a background expiry worker that performs the same transactional release as cancellation.
- **A persisted `available` counter on products** — rejected: two stored counters invite drift. Availability is always derived as `onHand - reserved`.
- **A global client store (Redux/Zustand)** — rejected for this scope: business state is server-owned, so URL-param list state, React Context for shared UI state (auth, wishlist, toasts), and local state cover it without a second source of truth. The README documents the upgrade path (TanStack Query) if server-state caching becomes worth the complexity.
- **AI-generated visual rework of the landing page and full-size product images** — adjusted/reverted after review: the landing kept its original design (recolored to the app theme), and catalog images were switched to width-matched variants after oversized decodes caused scroll jank.
- **`node --watch`-style hot reload / CI workflow** — rejected where it conflicted with the deliverable scope (CI intentionally out of scope).

**Which important engineering decisions I made myself:** the transaction-backed conditional inventory increments, status-guarded release/complete transitions, customer-scoped idempotency keys, immutable reservation item snapshots, the no-TTL audit trade-off, and the server-authoritative frontend state model — each chosen against the brief and covered by automated tests.
