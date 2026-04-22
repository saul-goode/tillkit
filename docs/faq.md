# TillKit FAQ

## General Questions

### What is TillKit?
TillKit is an open-source e-commerce starter kit for building fast, server-side rendered online stores. It uses HTMX for interactivity instead of heavy JavaScript frameworks.

### Why Hono instead of Express?
Hono is lighter, faster, and works across multiple JavaScript runtimes (Node.js, Deno, Cloudflare Workers). This gives you deployment flexibility.

### Can I use React/Vue/Svelte with TillKit?
Yes, but the design philosophy is server-first with HTMX. You can add client-side JavaScript where needed, but the default patterns expect server-rendered HTML.

### Is TillKit production-ready?
The core is solid but consider it beta. Test thoroughly before using for client work. The adapter pattern means you can swap implementations as needed.

## Database Questions

### Why PocketBase?
PocketBase is lightweight, self-hostable, and has a built-in admin UI. Great for prototypes and small-to-medium stores.

### Why Supabase?
Supabase offers more scalability, built-in auth, and real-time features. Good for larger stores or when you need PostgreSQL features.

### Can I use PostgreSQL directly?
Absolutely! The adapter pattern means you can create a PostgreSQL adapter. Use the PocketBase/Supabase adapters as templates.

### How do I handle database migrations?
For PocketBase: Use the admin UI or PB migrations.
For Supabase: Use their migration system or tools like dbmate.

## Payment Questions

### Does TillKit support PayPal?
Not yet, but the payment adapter pattern makes it possible to add. Stripe is the first integration.

### What about Apple Pay / Google Pay?
Stripe Checkout supports these automatically. The customer sees them as payment options.

### Can I do subscriptions?
Stripe integration is currently one-time payments. Subscription support is on the roadmap.

### How do I handle taxes?
The starter uses simplified tax calculation. For real-world use, integrate with TaxJar, Avalara, or similar services.

## Deployment Questions

### Can I deploy to Vercel?
Yes, and it's one of the easiest options. The `npm create tillkit` CLI can scaffold a Vercel-ready project.

### Can I deploy to Cloudflare Workers?
Yes! TillKit works on edge runtimes. Use the Wrangler template.

### Can I self-host?
Yes, traditional VPS deployment is fully supported. See the deployment guide.

### What about AWS/GCP/Azure?
You can deploy anywhere Node.js runs. Just set the environment variables.

## Development Questions

### How do I add a new page?
Add a route in `src/index.ts`:
```typescript
app.get('/custom-page', (c) => {
  const html = layout('Custom Page', `
    <h1>My Custom Page</h1>
  `);
  return c.html(html);
});
```

### How do I customize styling?
Edit `src/styles.css` for global styles. For component-level styles, add inline styles or scoped CSS.

### How do I add Tailwind?
Run the CLI with `--styling tailwind` or add it manually:
```bash
pnpm add -D tailwindcss
npx tailwindcss init
```

### Where do I put images?
- Development: `public/` folder
- Production: Use Cloudinary, R2, or similar
- The CLI can set this up for you

## Admin Questions

### How do I access the admin panel?
Navigate to `/admin` on your deployed site. Set `ADMIN_TOKEN` environment variable for basic auth.

### Can I edit products in the admin?
Currently orders only. Products are managed through PocketBase/Supabase UI. A product admin is on the roadmap.

### Is there role-based access control?
Basic admin token only. Full RBAC would require database schema changes.

## Common Issues

### "Database connection failed"
- Check URL and credentials
- Verify database is running
- Check firewall rules

### "Stripe checkout not working"
- Verify API keys
- Check Stripe Dashboard for errors
- Ensure webhook secret is set

### "Images not loading"
- If using external provider: Check URL
- If self-hosted: Verify public folder path
- Check browser console for 404s

### "Styles not applying"
- Verify `/styles.css` endpoint responds
- Check browser network tab for CSS
- Look for syntax errors in styles

## Advanced Topics

### Can I use a CDN?
Yes. Built Hono apps are static JS files. Deploy to any CDN that supports Worker/Pages.

### How do I add caching?
Hono has built-in cache helpers:
```typescript
app.get('/products', cache({ cacheName: 'products', cacheControl: 'max-age=3600' }), async (c) => {
  // ...
});
```

### Can I use a different payment provider?
Yes! Implement the PaymentAdapter interface:
```typescript
export interface PaymentAdapter {
  createCheckoutSession(cart: Cart): Promise<CheckoutSession>;
  getSession(sessionId: string): Promise<PaymentSession>;
  handleWebhook(payload: string): Promise<WebhookEvent>;
}
```

### How do I extend the database schema?
Extend the types in `@tillkit/core` and corresponding adapter. The adapters handle transformation between DB schema and TillKit types.

## Contributing

### How do I contribute?
- Fork the repo
- Make changes
- Submit PR
- Ensure tests pass

### What needs work?
Check GitHub issues for `good first issue` labels.

### Can I use this commercially?
Yes! MIT licensed. Build your business on TillKit.

## Getting Help

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Discord**: [Join our server](https://discord.gg/tillkit)
- **Docs**: [tillkit.dev/docs](https://tillkit.dev/docs)

## Quick Links

- [Quick Start Guide](./quickstart.md)
- [Deployment Guide](./deployment.md)
- [API Reference](./api.md)
- [Examples](./examples.md)
