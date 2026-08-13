# Reservewise — Inventory Reservation System

Reservewise is a MERN inventory reservation application built for the Entermind technical assessment. Customers can browse active products, place ten-minute multi-product holds, and complete or cancel their own reservations. Administrators can safely manage inventory and review reservation activity.

## Architecture

```text
React + Vite SPA  →  Express REST API  →  MongoDB replica set
                         │
                  service layer owns transactions,
                  idempotency, expiration, and rules
```

The client and API are intentionally separate workspaces. Routes/controllers handle HTTP and validation; services contain business logic; Mongoose models define persistence and indexes. See [DESIGN.md](./DESIGN.md) for the full business-rule analysis, schemas, API contract, and phased plan.

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

4. Install dependencies and optionally seed an admin plus twelve products. Choose a real local-only seed password; it is not stored in source control.

   ```sh
   npm install
   SEED_ADMIN_PASSWORD='a-long-local-password' npm run seed --workspace backend
   ```

5. In separate terminals, start the API and the web app.

   ```sh
   npm run dev:backend
   npm run dev:frontend
   ```

Open `http://localhost:5173`. Customers can register themselves. The sign-in screen asks for a Customer or Admin sign-in type and the API rejects accounts whose role does not match the selection. The seeded admin signs in as `admin@example.com` (Admin sign-in type) with the `SEED_ADMIN_PASSWORD` used above; additional customer or admin accounts can be provisioned from the admin **Team** page, and customer accounts can be soft-deleted and reactivated there (administrators cannot be deleted).

The reservation hold window defaults to 10 minutes; set `HOLD_MINUTES=1` in `backend/.env` (or prefix a dev command with it) to shorten holds while demoing expiry.

## Test and build

```sh
npm test
npm run build --workspace frontend
```

The backend suite (26 tests) starts a disposable MongoDB replica set and covers authentication, role gates, stock adjustment constraints, atomic reservations, idempotency (including a concurrent duplicate-key race), duplicate-line merging, cancellation, expiry, customer isolation, completion, contention (single- and multi-customer), transition-vs-expiry-worker races, and transaction retry behaviour. The frontend suite (19 tests) covers the auth flow, session restore, catalog/cart/reservation flows, admin inventory editing, and loading/error states.

## Manual UI verification

One command boots the full stack and prints a step-by-step checklist that walks through every feature in the browser, including a two-browser concurrency scenario and a fast path for expiry:

```sh
npm run verify:ui          # 10-minute holds
HOLD_MINUTES=1 npm run verify:ui   # 1-minute holds, for verifying expiry quickly
```

Detailed steps and expected outcomes live in [MANUAL_VERIFICATION.md](./MANUAL_VERIFICATION.md).

## Key decisions and trade-offs

- `Product.onHand` and `Product.reserved` are the only stock counters; availability is always calculated as `onHand - reserved`.
- Wishlists are per-customer bookmarks and never touch inventory counters — only the reservation transaction moves stock. Wishlist reads show live availability and reservations from the wishlist reuse the same endpoint and rules.
- Completing a reservation consumes its units: `onHand` and `reserved` are decremented together in the same transaction, so a completed sale reduces physical stock without ever breaking `onHand >= reserved`.
- Reservations store immutable product snapshots (SKU, name, price, quantity). Later product edits do not rewrite history.
- MongoDB transactions require a replica set. This is why local Compose is not a plain standalone `mongod`.
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

High-contention product documents—especially a popular low-stock SKU—would be the first contention hotspot, followed by API/database connection capacity and unpaginated admin history. I would add read replicas/cache for the catalog, a queue or per-SKU reservation partitioning strategy for very hot products, strict pagination/cursor indexes, rate limits, horizontal API scaling, observability, and a production MongoDB cluster with tested transaction latency budgets.

### 7. What remains before production readiness?

Add refresh-token rotation/secure cookies, email verification/password recovery, rate limiting, audit logs for inventory changes, CSRF strategy where cookies are used, structured metrics/tracing/alerts, migration tooling, backups and restore drills, filterable/sortable list APIs (all lists are already paginated), broader end-to-end/accessibility tests, CI/CD, secrets management, and a multi-node MongoDB deployment.

### 8. How AI was used

AI assisted with initial scaffolding, test case generation, and UI iteration. The implementation was checked incrementally with actual tests and builds. The core choices—transaction-backed conditional inventory increments, status-guarded releases, customer-scoped idempotency, snapshot items, and the no-TTL audit trade-off—were deliberately selected and tested against the brief rather than accepted blindly.
