# TillKit

[![Build](https://img.shields.io/badge/build-passing-success)](https://github.com/yourname/tillkit)
[![Tests](https://img.shields.io/badge/tests-41%20passing-success)](https://github.com/yourname/tillkit)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

TillKit is an open-source e-commerce commerce platform/starter kit that can be deployed anywhere: Vercel, Cloudflare, AWS, or your own server. It's built with a server-first philosophy using **Hono** and **HTMX** for minimal client-side JavaScript.

> **Why "Till"?** A till is the drawer where money goes in a physical store. Simple, unpretentious, and exactly what this is — a box for handling commerce.

## ✨ Features

- 🛒 Full shopping cart with session persistence
- 🔌 Multiple database adapters (PocketBase, Supabase)
- 💳 Stripe payment integration with webhooks
- 📊 Built-in admin dashboard for order management
- 🏗️ Framework-agnostic with Hono (Node.js, Cloudflare Workers, Deno)
- 📦 Type-safe TypeScript throughout
- 🎨 Plain CSS default, Tailwind optional
- 📱 Responsive by default
- 🧪 41 tests and counting

## 🚀 Quick Start

```bash
# Create a new TillKit project
npm create tillkit

# Navigate and install
cd my-store
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Run development server
pnpm dev

# Open http://localhost:3000
```

## 📂 Project Structure

```
tillkit/
├── packages/
│   ├── core/              # Commerce types & logic
│   ├── server/            # Hono app factory
│   ├── adapters/
│   │   ├── pocketbase/    # PocketBase adapter
│   │   └── supabase/      # Supabase adapter
│   ├── integrations/
│   │   └── stripe/        # Stripe payments
│   └── create-tillkit/    # CLI scaffolding
├── templates/
│   └── starter/           # Starter template
└── docs/
    ├── deployment.md      # Deployment guide
    ├── faq.md            # FAQ
    └── examples.md       # Code examples
```

## 🛠 Manual Setup

If you prefer to set up manually without the CLI:

```bash
# Create project
mkdir my-store && cd my-store
pnpm init

# Install core packages
pnpm add @tillkit/core @tillkit/server hono @hono/node-server
pnpm add @tillkit/adapter-pocketbase  # or supabase
pnpm add @tillkit/integration-stripe   # optional

# Add dev dependencies
pnpm add -D typescript tsx

# Create src/index.ts
# (see templates/starter for example)
```

## 🏗 Architecture

### Database Adapters

```typescript
import { pocketbaseAdapter } from '@tillkit/adapter-pocketbase';
// or
import { supabaseAdapter } from '@tillkit/adapter-supabase';

const db = pocketbaseAdapter({
  url: process.env.POCKETBASE_URL,
});
```

### Payments (Stripe)

```typescript
import { stripeIntegration } from '@tillkit/integration-stripe';

const stripe = stripeIntegration({
  provider: 'stripe',
  secretKey: process.env.STRIPE_SECRET_KEY,
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  successUrl: '/checkout/success',
  cancelUrl: '/cart',
});

// Create checkout session
const session = await stripe.createCheckoutSession(cart);
return c.redirect(session.url);
```

### Server App

```typescript
import { createHonoApp } from '@tillkit/server';

const app = createHonoApp({ database: db });

app.get('/', async (c) => {
  const products = await db.products.list({ limit: 10 });
  return c.json(products);
});
```

## 📖 Documentation

- **[Deployment Guide](./docs/deployment.md)** - Deploy to Vercel, Cloudflare, VPS
- **[FAQ](./docs/faq.md)** - Common questions
- **[Examples](./docs/examples.md)** - Code samples for common patterns
- **[Architecture](./ARCHITECTURE.md)** - System design overview

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @tillkit/core test
```

## 🚀 Deployment

### Vercel (Easiest)

```bash
vercel --prod
```

### Cloudflare Workers

```bash
wrangler deploy
```

### VPS / Docker

```bash
docker build -t tillkit .
docker run -p 3000:3000 --env-file .env tillkit
```

See [deployment.md](./docs/deployment.md) for detailed instructions.

## 📦 Packages

| Package | Version | Description |
|---------|---------|-------------|
| `@tillkit/core` | 0.0.1 | Commerce types & cart logic |
| `@tillkit/server` | 0.0.1 | Hono app factory & routes |
| `@tillkit/adapter-pocketbase` | 0.0.1 | PocketBase integration |
| `@tillkit/adapter-supabase` | 0.0.1 | Supabase integration |
| `@tillkit/integration-stripe` | 0.0.1 | Stripe payments |
| `@tillkit/create-tillkit` | 0.0.1 | Project scaffolding CLI |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing`
3. Commit your changes: `git commit -am 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing`
5. Open a Pull Request

### Development Setup

```bash
# Clone repo
git clone https://github.com/yourname/tillkit.git
cd tillkit

# Install dependencies
pnpm install

# Build packages
pnpm build

# Run tests
pnpm test

# Start dev mode
pnpm dev
```

## 📝 License

MIT licensed. See [LICENSE](./LICENSE) for details.

## 🙏 Credits

- Built with [Hono](https://hono.dev)
- Database via [PocketBase](https://pocketbase.io) & [Supabase](https://supabase.com)
- Payments via [Stripe](https://stripe.com)
- Inspired by SvelteKit's philosophy

## 🛣️ Roadmap

- [x] Core commerce logic
- [x] PocketBase adapter
- [x] Supabase adapter
- [x] Stripe integration
- [x] Admin dashboard
- [x] Complete checkout flow
- [ ] More payment providers (PayPal, etc.)
- [x] Inventory webhooks
- [x] Subscription billing
- [x] Admin product management
- [x] Search (Meilisearch)

> Multi-tenancy is a platform feature — out of scope for this starter kit.
> Build it on top of TillKit if you need multi-store SaaS.

## 📬 Support

- 💬 [GitHub Discussions](https://github.com/yourname/tillkit/discussions)
- 🐛 [GitHub Issues](https://github.com/yourname/tillkit/issues)
- 📧 [Email](mailto:support@tillkit.dev)

---

<p align="center">
  <strong>Built for commerce. Anywhere.</strong>
</p>
