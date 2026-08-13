# Inventory Reservation System — Technical Design

## Requirements analysis

### Invariants

1. For every product, `onHand >= reserved >= 0`. Available inventory is derived as `onHand - reserved` and is never stored independently.
2. A pending reservation either reserves *all* of its requested items or none of them. A request cannot leave a partial reservation.
3. Only pending, unexpired reservations contribute to `reserved` inventory. Completing a reservation consumes its units: `onHand` and `reserved` are decremented together in the same transaction, so the sale reduces physical stock without ever breaking `onHand >= reserved`. Completed reservations are retained as audit records; cancelled and expired reservations release their holds.
4. A customer can read, cancel, or complete only reservations where `customerId` is their own id. Admins have read access to all reservations and write access to inventory.
5. Stock reductions by an administrator cannot make `onHand < reserved`. Such a request is rejected rather than invalidating existing reservations.
6. Retries with the same customer-scoped idempotency key return the original reservation response and never reserve stock twice.

### Edge cases to cover

- Two customers reserve the final unit concurrently.
- One reservation asks for several products while one is unavailable.
- A request is retried after its server-side transaction committed but before the client received the response.
- A reservation is cancelled/completed at the same time as the expiration worker processes it.
- An administrator lowers stock below currently reserved units.
- A customer attempts to fetch, complete, or cancel another customer’s reservation.
- Invalid quantities, duplicate product lines, nonexistent/inactive products, malformed identifiers, and expired JWTs.
- Transactions aborting or briefly conflicting under load.

## Architecture

```text
React + Vite SPA
  ├─ Auth / API client (JWT in memory; persisted only for session restore)
  ├─ Customer catalog and reservation screens
  └─ Admin inventory and reservation screens
             │ HTTPS / JSON
Express API
  ├─ routes → validation → controllers → services
  ├─ JWT authentication and role authorization
  ├─ reservation service (MongoDB transactions)
  └─ expiry worker (periodic transactional release)
             │
MongoDB replica set
  ├─ users, products, reservations
  └─ unique/indexed idempotency and query paths
```

The API keeps HTTP concerns in routes/controllers. Services own business rules and MongoDB transactions. Mongoose models own schema-level constraints and indexes. A MongoDB replica set is required locally because transactions are a correctness requirement; Docker Compose will provide one.

## MongoDB data model

### `users`

```js
{
  _id: ObjectId,
  name: String,
  email: String,              // lowercase, unique
  passwordHash: String,
  role: 'customer' | 'admin',
  createdAt: Date,
  updatedAt: Date
}
```

Indexes: `{ email: 1 }` unique.

### `products`

```js
{
  _id: ObjectId,
  sku: String,                // unique, immutable after creation
  name: String,
  description: String,
  priceCents: Number,
  onHand: Number,             // non-negative integer
  reserved: Number,           // non-negative integer
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

`available = onHand - reserved`. MongoDB’s `$expr` condition enforces sufficient available stock on each reservation update. Inventory adjustments use `$expr` to preserve `onHand >= reserved`.

Indexes: `{ sku: 1 }` unique, `{ isActive: 1, name: 1 }`.

### `reservations`

```js
{
  _id: ObjectId,
  customerId: ObjectId,       // ref users
  status: 'pending' | 'completed' | 'cancelled' | 'expired',
  items: [{
    productId: ObjectId,
    sku: String,              // snapshot
    name: String,             // snapshot
    quantity: Number,
    priceCents: Number        // snapshot
  }],
  idempotencyKey: String,
  expiresAt: Date,            // pending only, now + 10 minutes
  completedAt: Date | null,
  cancelledAt: Date | null,
  expiredAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes: `{ customerId: 1, idempotencyKey: 1 }` unique (only when key exists), `{ customerId: 1, createdAt: -1 }`, `{ status: 1, expiresAt: 1 }`, and `{ 'items.productId': 1 }` for admin history. There is no TTL index: automatically deleting an expired reservation would lose its audit trail and, crucially, would not release inventory.

### `wishlistItems`

```js
{
  _id: ObjectId,
  customerId: ObjectId,       // ref users
  productId: ObjectId,        // ref products
  createdAt: Date,
  updatedAt: Date
}
```

Indexes: `{ customerId: 1, productId: 1 }` unique — one entry per product per customer, and the index resolves concurrent double-add races. Wishlist entries are pure bookmarks: they never touch `onHand` or `reserved`. Availability shown to the customer is computed from the live product counters at read time.

## API structure

All endpoints are prefixed with `/api/v1`. Errors use `{ error: { code, message, details? } }`.

| Area | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| Health | `GET /health` | public | liveness/readiness check |
| Auth | `POST /auth/register` | public | create customer account |
| Auth | `POST /auth/login` | public | return JWT and user; body carries the selected sign-in type and valid credentials whose account role does not match it are rejected with `ROLE_MISMATCH` |
| Auth | `GET /auth/me` | authenticated | restore user identity |
| Products | `GET /products` | authenticated | active product catalog with availability |
| Wishlist | `GET /wishlist` | customer | own saved products with live availability |
| Wishlist | `POST /wishlist` | customer | add a product (idempotent) |
| Wishlist | `DELETE /wishlist/:productId` | customer | remove a product (idempotent) |
| Reservations | `POST /reservations` | customer | atomically reserve products; requires `Idempotency-Key` |
| Reservations | `GET /reservations` | customer | own reservation history |
| Reservations | `GET /reservations/:id` | customer owner | one reservation |
| Reservations | `POST /reservations/:id/complete` | customer owner | complete a valid pending reservation |
| Reservations | `POST /reservations/:id/cancel` | customer owner | cancel and release inventory |
| Admin products | `GET /admin/products` | admin | all inventory including inactive |
| Admin products | `POST /admin/products` | admin | create product |
| Admin products | `PATCH /admin/products/:id` | admin | update metadata/status or stock safely |
| Admin reservations | `GET /admin/reservations` | admin | review all reservations |
| Admin users | `GET /admin/users` | admin | list all accounts (no password hashes) |
| Admin users | `POST /admin/users` | admin | provision a customer or admin account |
| Admin users | `DELETE /admin/users/:id` | admin | soft-delete a customer account (admins are rejected; the record and its reservations are retained) |
| Admin users | `POST /admin/users/:id/activate` | admin | reactivate a soft-deleted account (idempotent no-op for active accounts) |

## Customer and admin flows

Customer: register/login → browse active catalog and available quantities → choose products and quantities → send reservation with a generated idempotency key → view pending countdown/history → complete or cancel the reservation. A retry reuses the same key until a response is obtained. The catalog draft (selections plus the pending idempotency key) persists per customer in browser storage, so navigation and refreshes keep the draft; restoring it clamps quantities to live availability, and editing the draft invalidates the old key so a changed request can never replay an earlier one. Products can be hearted into a personal wishlist from the catalog and reserved directly from the wishlist page through the same reservation endpoint; wishlist membership never affects inventory, and a sold-out wishlisted product stays saved while reservations for it fail with the normal availability conflict.

Admin: login → create/edit/deactivate products and adjust on-hand inventory → see all reservations, status, item snapshots, and timestamps → provision customer or administrator accounts from the Team page, soft-delete customer accounts, and reactivate them later (open self-registration stays customer-only, so no one can self-promote to admin). A soft-deleted customer keeps their reservation history, can no longer sign in, and their issued tokens stop working immediately; any pending holds they had release through the normal expiry worker. Reactivation restores sign-in and unexpired pre-deactivation tokens. The UI displays a clear validation error if a stock reduction would conflict with reservations.

Login presents a Customer/Admin sign-in type choice. The API verifies credentials first and returns the same generic `INVALID_CREDENTIALS` for a missing account or wrong password (so the response never reveals account existence), then rejects valid credentials whose account role does not match the selection with `403 ROLE_MISMATCH`. Role enforcement after login is unchanged: the JWT carries the role, `authenticate` re-reads the user from the database on every request, and `authorize` gates each route.

## Reservation, concurrency, expiration, and idempotency strategy

### Create reservation

1. Validate the body, normalise duplicate lines by product, require a bounded positive integer quantity, and require `Idempotency-Key`.
2. In a MongoDB transaction, first look up the customer/key pair. If found, return it unchanged.
3. Read requested active products and capture snapshots. Fail if any are absent/inactive.
4. Increment `reserved` for each product using a conditional update requiring `onHand - reserved >= quantity`. If any update does not match, abort the transaction so prior increments are rolled back.
5. Insert the pending reservation with a ten-minute `expiresAt` (configurable via `HOLD_MINUTES`, default 10) and the unique idempotency key; commit.
6. Retry the full transaction a small, bounded number of times on MongoDB transient transaction errors. A duplicate-key race resolves by retrieving the winning idempotent reservation.

Products are updated in sorted ObjectId order to reduce write-conflict churn. MongoDB’s transaction guarantees atomic visibility; conditional updates protect availability even if competing work reaches a product first.

### State transitions and expiry

Cancellation and expiry transition only an unexpired `pending` reservation. In the same transaction they claim the status change conditionally and then decrement each item’s `reserved`; the claim-then-release order means only one actor can ever release the inventory, so competing actors get a clean conflict instead of a double release. Completing transitions only a pending, unexpired reservation to `completed` and decrements each item’s `onHand` and `reserved` together — the sale consumes physical stock while preserving `onHand >= reserved`. The completion claim also re-checks `expiresAt > now` inside its update, so a completion cannot land after its hold window ended. A background worker runs frequently, finds elapsed pending reservations, and calls the same transactional release operation.

### Inventory adjustments

Admin stock updates set an explicit desired `onHand` amount or apply an auditable delta. The service uses a conditional database update that rejects any final `onHand` below `reserved`. It never silently cancels or alters a valid reservation.

## Testing strategy

- Unit tests: validation, password/JWT helpers, and reservation-service paths.
- Integration tests against `mongodb-memory-server` configured as a replica set: authentication/authorization, transaction rollback, idempotent replay, cancel/expire release, completion, and safe stock adjustment.
- Concurrency integration test: many simultaneous requests for limited stock; the number of successful reserved units must never exceed `onHand`.
- API tests: response/error shape, owner isolation, invalid input, and role gates.
- Frontend tests: key stateful flows and API error/loading states with React Testing Library.
- Manual browser verification: responsive customer and admin journeys.

## Phased implementation plan

1. **Foundation** — scaffold React/Vite and Express, environment validation, Docker Mongo replica set, request/error/logging middleware, health endpoint, shared conventions, and test harness.
2. **Identity and catalog** — user model, JWT auth, role protection, product model, admin inventory CRUD, and active customer catalog.
3. **Reservation core** — transaction-backed multi-product reservation creation, idempotency, state transitions, expiry worker, and extensive integration tests.
4. **Frontend** — premium responsive customer catalog/cart/reservation experience plus protected admin inventory/reservation views.
5. **Hardening and handoff** — full verification, seed data, accessibility polish, README setup/architecture/trade-offs/assessment answers, and a final clean run.
