# TillKit Deployment Guide

## Quick Start

### Prerequisites
- Node.js 18+ installed
- PNPM (or npm/yarn)
- Database (PocketBase or Supabase)
- Stripe account (for payments)

### 1. Create New Project

```bash
# Using NPM/npm create (recommended)
npm create tillkit

# Or use npx directly
npx @tillkit/create-tillkit
```

The CLI will prompt you for:
- **Platform**: Node.js, Vercel, or Cloudflare Workers
- **Database**: PocketBase or Supabase
- **Styling**: Plain CSS or Tailwind CSS
- **Payment**: Stripe integration

### 2. Configure Environment Variables

Create a `.env` file in your project root:

**Required (PocketBase):**
```env
POCKETBASE_URL=https://your-pocketbase-instance.com
POCKETBASE_ADMIN_TOKEN=your-admin-token
```

**Required (Supabase):**
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
```

**For Stripe (optional):**
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
APP_URL=http://localhost:3000
```

**For Admin (optional):**
```env
ADMIN_TOKEN=your-secure-token-for-admin
```

### 3. Set Up Database

#### PocketBase Setup

1. Install PocketBase from [pocketbase.io](https://pocketbase.io/)
2. Create collections:

```sql
-- products
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  compare_at_price INTEGER,
  images JSON,
  variants JSON,
  options JSON,
  inventory JSON,
  seo JSON,
  metadata JSON,
  status TEXT DEFAULT 'active',
  created TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%fZ')),
  updated TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%fZ'))
);

-- carts
CREATE TABLE carts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  subtotal INTEGER DEFAULT 0,
  total_tax INTEGER DEFAULT 0,
  total_shipping INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  created TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%fZ')),
  updated TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%fZ'))
);

-- cart_items
CREATE TABLE cart_items (
  id TEXT PRIMARY KEY,
  cart_id TEXT REFERENCES carts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  variant_id TEXT,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  image JSON,
  line_total INTEGER NOT NULL
);

-- orders
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  customer_id TEXT,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  payment_status TEXT DEFAULT 'pending',
  fulfillment_status TEXT DEFAULT 'unfulfilled',
  subtotal INTEGER DEFAULT 0,
  total_tax INTEGER DEFAULT 0,
  total_shipping INTEGER DEFAULT 0,
  total_discount INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  shipping_address JSON,
  billing_address JSON,
  notes TEXT,
  metadata JSON,
  created TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%fZ')),
  updated TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%fZ'))
);

-- transactions
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  gateway TEXT NOT NULL,
  parent_id TEXT,
  processed_at TEXT,
  metadata JSON
);

-- customers
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  default_address_id TEXT,
  metadata JSON,
  created TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%fZ')),
  updated TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%fZ'))
);

-- addresses
CREATE TABLE addresses (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT,
  line1 TEXT,
  line2 TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  country TEXT,
  is_default BOOLEAN DEFAULT FALSE
);
```

#### Supabase Setup

1. Create project at [supabase.com](https://supabase.com)
2. Run SQL in Supabase SQL Editor:

```sql
-- Enable Row Level Security (RLS) policies as needed

-- Products table
CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  compare_at_price INTEGER,
  images JSONB DEFAULT '[]',
  variants JSONB DEFAULT '[]',
  options JSONB DEFAULT '[]',
  inventory JSONB,
  seo JSONB,
  metadata JSONB,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Carts table
CREATE TABLE carts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  subtotal INTEGER DEFAULT 0,
  total_tax INTEGER DEFAULT 0,
  total_shipping INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cart items
CREATE TABLE cart_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cart_id UUID REFERENCES carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  image JSONB,
  line_total INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  customer_id UUID,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  payment_status TEXT DEFAULT 'pending',
  fulfillment_status TEXT DEFAULT 'unfulfilled',
  subtotal INTEGER DEFAULT 0,
  total_tax INTEGER DEFAULT 0,
  total_shipping INTEGER DEFAULT 0,
  total_discount INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  shipping_address JSONB,
  billing_address JSONB,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order items
CREATE TABLE order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  image JSONB,
  line_total INTEGER NOT NULL
);

-- Transactions
CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  gateway TEXT NOT NULL,
  parent_id UUID,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

-- Customers
CREATE TABLE customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  default_address_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Addresses
CREATE TABLE addresses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT,
  line1 TEXT,
  line2 TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  country TEXT,
  is_default BOOLEAN DEFAULT FALSE
);

-- Indexes for performance
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_carts_session_id ON carts(session_id);
CREATE INDEX idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX idx_orders_email ON orders(email);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_customers_email ON customers(email);
```

### 4. Development

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Visit http://localhost:3000
```

### 5. Deployment

#### Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

**Configure environment variables in Vercel Dashboard:**
- Go to Project Settings → Environment Variables
- Add all variables from `.env` file
- Set `APP_URL` to your production domain

#### Cloudflare Workers

```bash
# Install Wrangler
npm i -g wrangler

# Login
wrangler login

# Configure wrangler.toml
cat > wrangler.toml << 'EOF'
name = "tillkit-store"
main = "./dist/index.js"
compatibility_date = "2024-01-01"

[vars]
APP_URL = "https://your-domain.com"

[[kv_namespaces]]
binding = "TILLKIT_SESSIONS"
id = "your-kv-namespace-id"
EOF

# Deploy
wrangler deploy
```

#### Traditional VPS (DigitalOcean, Linode, etc.)

```bash
# Build for production
pnpm build

# Start with PM2
npm i -g pm2
pm2 start dist/index.js --name tillkit
pm2 save
pm2 startup
```

Or use Docker:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```bash
# Build and run
docker build -t tillkit .
docker run -p 3000:3000 --env-file .env tillkit
```

## Post-Deployment Setup

### 1. Configure Stripe Webhooks

In Stripe Dashboard → Developers → Webhooks:
- Add endpoint: `https://your-domain.com/webhooks/stripe`
- Select events:
  - `checkout.session.completed`
  - `invoice.payment_failed`
  - `charge.refunded`

Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`

### 2. Set Up Domain

Point your domain to your deployment:
- Vercel: Automatic, just add custom domain in settings
- Cloudflare: Use CNAME record
- VPS: Point A record to server IP

Update `APP_URL` environment variable to your domain.

### 3. Add Products

Via PocketBase/Supabase UI:
1. Create products with name, slug, price (in cents)
2. Upload images
3. Set status to `active`

Or via API:
```bash
curl -X POST https://your-api.com/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "awesome-t-shirt",
    "name": "Awesome T-Shirt",
    "price": 2500,
    "status": "active"
  }'
```

### 4. Configure Admin Access

Set `ADMIN_TOKEN` and access `/admin` with:
```bash
curl https://your-domain.com/admin/orders \
  -H "Authorization: Bearer your-admin-token"
```

## Troubleshooting

### Database Connection Issues
- Verify URLs and credentials
- Check database is running (PocketBase: `pocketbase serve`)
- Ensure proper network access (firewall rules for Supabase)

### Stripe Payment Failures
- Verify keys are correct (test vs live)
- Check Stripe Dashboard for block reasons
- Ensure webhook secret is configured

### Build Failures
- Run `pnpm install` to sync workspaces
- Clear cache: `rm -rf node_modules && pnpm install`

## Environment Quick Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `POCKETBASE_URL` | *PocketBase only* | Your PocketBase instance URL |
| `POCKETBASE_ADMIN_TOKEN` | *Optional* | For elevated permissions |
| `SUPABASE_URL` | *Supabase only* | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | *Supabase only* | Service role key (keep secret!) |
| `STRIPE_SECRET_KEY` | *Payments* | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | *Payments* | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | *Webhooks* | Webhook signing secret |
| `APP_URL` | Yes | Your production URL |
| `ADMIN_TOKEN` | *Optional* | For admin access |
| `PORT` | Optional | Server port (default: 3000) |
