#!/usr/bin/env bash
# Manual UI verification launcher for the inventory reservation system.
#
# Boots MongoDB, seeds sample data, starts the API and the web app, opens the
# browser, and prints the feature checklist. Verify each feature in the UI at
# your own pace; press Ctrl+C when done to stop the API and web app.
#
# Usage:
#   npm run verify:ui                     # default 10-minute hold window
#   HOLD_MINUTES=1 npm run verify:ui      # fast path for verifying expiry
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_URL="${API_URL:-http://localhost:4000/api/v1}"
WEB_URL="${WEB_URL:-http://localhost:5173}"
HOLD_MINUTES="${HOLD_MINUTES:-10}"
SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-verify-local-password-123}"

say()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }

STARTED_PIDS=()
cleanup() { for pid in "${STARTED_PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT

# --- 1. Local configuration -----------------------------------------------------
say "Preparing local configuration"
for pair in ".env:.env.example" "backend/.env:backend/.env.example" "frontend/.env:frontend/.env.example"; do
  target="${pair%%:*}"; template="${pair##*:}"
  if [[ ! -f "$target" ]]; then
    cp "$template" "$target"
    say "Created $target from $template"
  fi
done
if ! grep -qE '^JWT_SECRET=.{32,}$' backend/.env; then
  say "Generating a local JWT_SECRET in backend/.env"
  secret="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
  if grep -qE '^JWT_SECRET=' backend/.env; then
    sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=$secret|" backend/.env
  else
    printf '\nJWT_SECRET=%s\n' "$secret" >> backend/.env
  fi
fi

# --- 2. MongoDB ------------------------------------------------------------------
say "Starting MongoDB replica set (Docker)"
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required — install Docker Desktop and start it first."; exit 1
fi
if docker inspect --format '{{.State.Running}}' inventory-reservation-mongo 2>/dev/null | grep -q '^true$'; then
  warn "Reusing the already-running MongoDB container"
elif docker inspect inventory-reservation-mongo >/dev/null 2>&1; then
  say "Starting the existing MongoDB container"
  docker start inventory-reservation-mongo >/dev/null
else
  docker compose up -d mongo >/dev/null
fi
# Readiness is checked against mongod itself (not Docker healthchecks, which pre-existing
# containers may not have) by confirming the replica set answers rs.status(). The API's own
# connection string is the authority on credentials; fall back to the compose defaults.
MONGO_URI="$(grep -E '^MONGODB_URI=' backend/.env 2>/dev/null | head -1 | cut -d= -f2- || true)"
MONGO_URI="${MONGO_URI:-$(grep -E '^MONGODB_URI=' .env 2>/dev/null | head -1 | cut -d= -f2- || true)}"
MONGO_URI="${MONGO_URI:-mongodb://inventory:change-me-locally@localhost:27017/inventory?authSource=admin&replicaSet=rs0}"
ready="no"
for _ in $(seq 1 45); do
  if out="$(docker exec inventory-reservation-mongo mongosh "$MONGO_URI" --quiet --eval 'try { rs.status().ok } catch (error) { quit(1) }' 2>/dev/null | tr -d '[:space:]')" && [[ "$out" == "1" ]]; then
    ready="yes"; break
  fi
  sleep 2
done
if [[ "$ready" != "yes" ]]; then
  echo "MongoDB did not become ready. Check: docker compose ps && docker compose logs mongo"
  exit 1
fi
say "MongoDB replica set is ready"

# --- 3. Seed data ----------------------------------------------------------------
say "Seeding admin user and sample products"
# SEED_ADMIN_RESET keeps the admin password in sync with this run's SEED_ADMIN_PASSWORD.
SEED_ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD" SEED_ADMIN_RESET=true npm run seed --workspace backend

# --- 4. API ----------------------------------------------------------------------
if curl -fsS "$API_URL/health" >/dev/null 2>&1; then
  warn "An API is already running on port 4000 — reusing it. Restart it yourself if you need a different HOLD_MINUTES."
else
  say "Starting API (HOLD_MINUTES=$HOLD_MINUTES) — logs: /tmp/reservewise-api.log"
  HOLD_MINUTES="$HOLD_MINUTES" npm run start --workspace backend > /tmp/reservewise-api.log 2>&1 &
  STARTED_PIDS+=("$!")
  for _ in $(seq 1 45); do curl -fsS "$API_URL/health" >/dev/null 2>&1 && break; sleep 1; done
  curl -fsS "$API_URL/health" >/dev/null || { echo "API failed to start — see /tmp/reservewise-api.log"; exit 1; }
fi

# --- 5. Web app ------------------------------------------------------------------
if curl -fsS "$WEB_URL" >/dev/null 2>&1; then
  warn "A web app is already running on port 5173 — reusing it"
else
  say "Starting web app — logs: /tmp/reservewise-web.log"
  npm run dev --workspace frontend > /tmp/reservewise-web.log 2>&1 &
  STARTED_PIDS+=("$!")
  for _ in $(seq 1 30); do curl -fsS "$WEB_URL" >/dev/null 2>&1 && break; sleep 1; done
  curl -fsS "$WEB_URL" >/dev/null || { echo "Web app failed to start — see /tmp/reservewise-web.log"; exit 1; }
fi

# --- 6. Checklist ----------------------------------------------------------------
open "$WEB_URL" 2>/dev/null || say "Open $WEB_URL in your browser"

cat <<CHECKLIST

Manual UI verification checklist
────────────────────────────────
Admin sign-in: admin@example.com (select the Admin sign-in type) / password from SEED_ADMIN_PASSWORD (default: verify-local-password-123)

 1. LANDING      The hero page loads with sign-in and register links.
 2. REGISTER     Create a customer. A password under 10 chars shows a validation error.
 3. LOGIN        Pick Customer or Admin on the sign-in toggle. A wrong password shows a generic error;
                 a correct password with the wrong toggle shows a role-mismatch error; the matching
                 toggle lands in the right workspace.
 4. CATALOG      Thirty seeded products appear across pages with category chips (Electronics, Furniture,
                 Clothing, Home & Living, Stationery); chips filter server-side; steppers stop at 0 and at available.
 5. RESERVE      Pick quantities → Reserve inventory → success notice with the hold length; availability drops.
                 The draft survives navigation and refreshes; a failed reserve keeps the same hold key for
                 a safe retry.
 6. COUNTDOWN    My reservations shows a ticking "Expires in m:ss" per pending reservation.
 7. RELEASE      Release a reservation → status Cancelled; catalog availability returns.
 8. COMPLETE     Reserve again → Complete → status Completed; the admin inventory view shows on-hand reduced.
 9. EXPIRY       See the fast path below.
10. ISOLATION    Register a second customer → their reservation list starts empty.
11. CONCURRENCY  As admin, add a product with on-hand = 1. In a normal window and an incognito window,
                 two customers reserve the last unit simultaneously → one succeeds, one shows the
                 insufficient-inventory error. (Automated: 8-way contention + cross-customer tests.)
12. ADMIN        Sign in as admin → inventory table shows available / reserved / on-hand.
13. ADMIN EDIT   Rows show photo thumbnails. Edit opens the prefilled form (SKU locked): update name, price,
                 category, image, description, or on-hand; a value below reserved shows an inline error.
14. ADMIN CTRL   Add a product (appears in the customer catalog); deactivate one (disappears); reactivate it.
15. ADMIN AUDIT  Reservations shows every customer's holds with item snapshots and timestamps.
16. SESSION      Refresh the page (still signed in); sign out; visiting /admin as a customer redirects to /app (and vice versa).
17. RESPONSIVE   Narrow the window below 700px: sidebar becomes a top bar and tables become cards.
18. TEAM         As admin, open Team: add a new admin account, sign in with it (Admin toggle), and confirm the
                 customer toggle rejects it with a role-mismatch error.
19. DEACTIVATE   Register a customer, then from Team deactivate them: badge flips to deactivated, their open
                 session dies on refresh, and sign-in shows the account-deactivated message. Admin rows have
                 no Deactivate button. Reactivate restores sign-in and the badge flips back.
20. WISHLIST     Heart a product in the catalog (never affects stock), open Wishlist, reserve from there
                 through the normal flow, watch a sold-out item stay saved but fail to reserve, then remove it.
21. PAGINATION   Lists show a pager with numbered pages, Previous/Next, and a Per-page dropdown (5/10/20/50)
                 that resets to page 1; empty last pages snap back.
22. CATEGORIES   Catalog chips filter by category server-side; admin Add product form assigns a category,
                 and category labels show on cards, wishlist rows, and the admin inventory table.
23. SEARCH/SORT  Catalog: search by name/SKU (Enter) + price/name sort. Admin inventory: search, category,
                 active/inactive, and sort filters. Admin reservations: status filter, SKU search, and
                 newest/oldest sort. All compose with pagination.

Fast path for the 10-minute expiry (scenario 9):
  Stop this script (Ctrl+C), then run:  HOLD_MINUTES=1 npm run verify:ui
  Reserve an item and watch the countdown reach zero, the row show "Expiring", and the stock
  return within ~30s (the expiry worker interval).

Detailed steps and expected outcomes: MANUAL_VERIFICATION.md
Automated equivalents: npm test  (backend 31 tests, frontend 21 tests)

Note: the seed step above resets the seeded admin's password to SEED_ADMIN_PASSWORD.
Press Ctrl+C when you are done (services this script started stop; MongoDB keeps running).
CHECKLIST

wait
