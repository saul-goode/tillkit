# TillKit Local Smoke Test Runbook

## Step 0: Prerequisites
- Node.js v20+ (`node --version`)
- pnpm (`pnpm --version`)
- PocketBase **v0.23 or newer** (current release recommended). Older servers are
  rejected by `db:setup`: v0.23 changed the collection format, and a pre-0.23
  server silently accepts a collection payload while creating no fields.

## Step 1: Start PocketBase
```bash
# Download PocketBase (macOS arm64 example)
curl -fsSL https://github.com/pocketbase/pocketbase/releases/download/v0.39.6/pocketbase_0.39.6_darwin_arm64.zip -o /tmp/pb.zip
unzip -o /tmp/pb.zip -d /tmp
xattr -c /tmp/pocketbase

# Run it
mkdir -p ~/pb_data
/tmp/pocketbase serve --dir=~/pb_data --http=127.0.0.1:8090 &

# Create first admin (one-time)
/tmp/pocketbase superuser upsert test@test.com test123456
```

**Verify:** http://127.0.0.1:8090/api/health should return `{ code: 200 }`

---

## Step 2: Create Collections

```bash
cd ~/tillkit/templates/starter
POCKETBASE_URL=http://127.0.0.1:8090 \
POCKETBASE_ADMIN_EMAIL=test@test.com \
POCKETBASE_ADMIN_PASSWORD=test123456 \
pnpm db:setup
```

This provisions `products`, `carts`, `orders`, `customers`, and
`processed_webhook_events` with their fields, their `created`/`updated`
timestamps, and the unique indexes that make payment idempotency real. It is
create-if-missing, so re-running it is a no-op.

Collection schemas live in `packages/adapters/pocketbase/src/index.ts` — that is
the single source of truth. Do not hand-build collections in the dashboard.

**Upgrading an existing store** (created before spec 018) needs the indexes
added rather than the collections created:

```bash
pnpm migrate
```

Without it, idempotency fails open: duplicate orders are created and nothing
looks wrong.

**Verify:** http://127.0.0.1:8090/_/ → `orders` → Indexes shows
`idx_orders_number` and `idx_orders_gateway_ref`.

---

## Step 3: Seed Data
`db:setup` already seeded **Test Shirt** ($19.99) and **Test Mug** ($12.99), and
skips seeding if any product exists. Nothing to do here.

Prices are stored as **integer cents** — `1999` is $19.99. If you add records by
hand in the dashboard, enter cents.

---

## Step 4: Start TillKit
```bash
cd ~/tillkit/templates/starter
cp .env.example .env
# Edit .env to add:
# POCKETBASE_URL=http://localhost:8090
# APP_URL=http://localhost:3000

pnpm dev   # or: npx tsx src/index.ts
```

---

## Step 5: Smoke Test Checklist
Visit each URL and verify:

| URL | Expected |
|-----|----------|
| http://localhost:3000/ | Homepage with product cards |
| http://localhost:3000/products | Product listing with search box |
| http://localhost:3000/products?q=shirt | Search results for "shirt" |
| http://localhost:3000/products/test-shirt | Product detail page + Add to Cart |
| http://localhost:3000/cart | Cart items + checkout button |
| http://localhost:3000/admin | Admin dashboard with today's orders |
| http://localhost:3000/admin/orders | Order list with filter |
| http://localhost:3000/admin/products | Product list with search + edit/delete |
| http://localhost:3000/admin/products/new | Product create form |
| http://localhost:3000/health | JSON with features + search:true |
| http://localhost:3000/api/products | JSON array of products |
| http://localhost:3000/api/products/search?q=mug | Search results JSON |
| http://localhost:3000/api/search?q=shirt | Search via SearchProvider JSON |

---

## Step 6: Admin CRUD Test
In `/admin/products`:
1. Click **Create Product** → fill name/slug/price → submit → should redirect to list
2. Click **Edit** on a product → change price → submit → should update
3. Click **Delete** → should remove row via HTMX

---

## Step 7: Inventory Webhook Test (Optional)
If you have a webhook catcher (e.g. Zapier webhook URL):
```bash
# In .env:
INVENTORY_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/xxx
INVENTORY_WEBHOOK_SECRET=secret

# Complete a checkout (Stripe in test mode)
# Observe webhook payload sent on order paid
```

---

## Step 8: Subscription Test (Optional)
If you have Stripe keys:
```bash
# In .env:
STRIPE_SECRET_KEY=sk_test_xx
STRIPE_WEBHOOK_SECRET=whsec_xx

# Then:
POST /api/subscriptions
{ "customerId": "cus_xxx", "planId": "price_xxx" }
```

---

## Known Issues (Fixed Before Testing)
- `app-context.ts` was corrupted by leanctx dedup (fixed)
- `.env.example` was corrupted (fixed)
- ~~PocketBase requires manual schema setup~~ — `pnpm db:setup` provisions
  everything (spec 018 fixed `setup()`; spec 021 made it work on current
  PocketBase releases)
