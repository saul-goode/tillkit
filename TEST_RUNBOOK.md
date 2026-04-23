# TillKit Local Smoke Test Runbook

## Step 0: Prerequisites
- Node.js v20+ (`node --version`)
- pnpm (`pnpm --version`)
- PocketBase binary (optional — can run via Docker)

## Step 1: Start PocketBase
```bash
# Download PocketBase (macOS arm64 example)
curl -fsSL https://github.com/pocketbase/pocketbase/releases/download/v0.37.3/pocketbase_0.37.3_darwin_arm64.zip -o /tmp/pb.zip
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
Go to http://127.0.0.1:8090/_/ and log in:
- Email: `test@test.com`
- Password: `test123456`

Create these collections with schema:

### `products` (base)
| Field | Type | Required |
|-------|------|----------|
| slug | text | ✅ |
| name | text | ✅ |
| description | text | ❌ |
| price | number | ❌ |
| status | select (draft/active/archived) | ❌ |
| images | json | ❌ |
| variants | json | ❌ |
| options | json | ❌ |
| inventory | json | ❌ |
| seo | json | ❌ |
| metadata | json | ❌ |
| subscription | json | ❌ |

### `orders` (base)
| Field | Type | Required |
|-------|------|----------|
| email | text | ✅ |
| status | select (pending/confirmed/paid/fulfilled/shipped/delivered/cancelled/refunded) | ❌ |
| paymentStatus | select (pending/authorized/paid/partially_refunded/refunded/failed) | ❌ |
| fulfillmentStatus | select (unfulfilled/partially_fulfilled/fulfilled/returned) | ❌ |
| items | json | ❌ |
| subtotal | number | ❌ |
| totalTax | number | ❌ |
| totalShipping | number | ❌ |
| total | number | ❌ |
| currency | text | ❌ |
| shippingAddress | json | ❌ |
| billingAddress | json | ❌ |
| transactions | json | ❌ |
| notes | text | ❌ |
| metadata | json | ❌ |

### `carts` (base)
| Field | Type |
|-------|------|
| sessionId | text ✅ |
| items | json |
| subtotal | number |
| totalTax | number |
| totalShipping | number |
| total | number |
| currency | text |
| metadata | json |

### `customers` (base)
| Field | Type |
|-------|------|
| email | text ✅ |
| firstName | text |
| lastName | text |
| phone | text |
| addresses | json |
| metadata | json |

---

## Step 3: Seed Data
In PocketBase dashboard → `products` → + New Record:
- **Test Shirt**: slug=`test-shirt`, name=`Test Shirt`, price=`1999`, status=`active`, inventory=`{"quantity":100,"available":100,"allowOutOfStock":false}`
- **Test Mug**: slug=`test-mug`, name=`Test Mug`, price=`1299`, status=`active`, inventory=`{"quantity":50,"available":50,"allowOutOfStock":false}`

In `orders` → + New Record:
- email=`test@example.com`, status=`paid`, items=`[{"productId":"shirt","name":"Test Shirt","sku":"test-shirt","price":1999,"quantity":1,"total":1999}]`, total=`1999`

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
- PocketBase requires manual schema setup (documented above)
