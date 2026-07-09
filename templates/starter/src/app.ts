import { Hono } from 'hono';
import { createAdminRoutes, createSubscriptionRoutes } from '@tillkit/server';
import type { Cart, DatabaseAdapter, Product } from '@tillkit/core';
import { formatPrice } from '@tillkit/core';
import {
  getSessionId,
  setSessionCookie,
  layout,
  takeFlash,
} from './app-context.js';
import type { SearchService } from '@tillkit/integration-search';
import type { SubscriptionProvider } from '@tillkit/core';
import { checkoutRouter } from './routes/checkout.js';
import { webhooksRouter } from './routes/webhooks.js';

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createStarterApp(deps: {
  database: DatabaseAdapter;
  stripe: any; // StripeIntegration | null — using any to avoid import complexity in factory
  search?: SearchService;
  subscriptionProvider?: SubscriptionProvider;
}) {
  const { database, stripe, search, subscriptionProvider } = deps;
  const app = new Hono();

  // ===== HOME =====
  app.get('/', async (c) => {
    const products = await database.products.list({ limit: 6 });

    const html = layout(
      'Home',
      `
      <h1>Welcome to TillKit!</h1>
      <p>A server-side e-commerce platform built with Hono, HTMX, and PocketBase.</p>
      <div class="hero">
        <a href="/products" class="button-primary">Browse Products</a>
      </div>
      <h2>Featured Products</h2>
      <div class="products">
        ${products.items.map((p: Product) => renderProductCard(p)).join('')}
      </div>
    `,
    );
    return c.html(html);
  });

  // ===== PRODUCTS =====
  app.get('/products', async (c) => {
    const query = c.req.query('q');
    let products: any[];
    let total = 0;

    if (query && query.trim()) {
      if (search) {
        const result = await search.search(query, { page: 1, perPage: 50 });
        products = result.items;
        total = result.total;
      } else {
        products = await database.products.search(query);
        total = products.length;
      }
    } else {
      const result = await database.products.list({ limit: 50 });
      products = result.items;
      total = result.total;
    }

    const html = layout(
      'Products',
      `
      <h1>Products</h1>
      <form class="search" action="/products" method="get">
        <input type="search" name="q" value="${query || ''}" placeholder="Search products...">
        <button type="submit">Search</button>
        ${query ? `<a href="/products" class="btn btn-sm">Clear</a>` : ''}
      </form>
      <div class="products">
        ${products.length === 0
          ? '<p class="empty">No products found.</p>'
          : products.map((p: Product) => renderProductCard(p)).join('')}
      </div>
      ${query ? `<p style="color:#666;font-size:0.85rem;">${total} result${total !== 1 ? 's' : ''} for "${query}"</p>` : ''}
    `,
    );
    return c.html(html);
  });

  app.get('/products/:slug', async (c) => {
    const slug = c.req.param('slug');
    const product = await database.products.getBySlug(slug);

    if (!product) {
      return c.html(
        layout(
          'Not Found',
          `
          <h1>Product Not Found</h1>
          <p>The product "${slug}" doesn't exist.</p>
          <a href="/products">← Back to Products</a>
        `,
        ),
        404,
      );
    }

    const html = layout(
      product.name,
      `
      <div class="product-detail">
        <div class="product-images">
          ${product.images?.length
            ? product.images.map((img: any) => `<img src="${img.url}" alt="${product.name}">`).join('')
            : '<div class="placeholder-image">No Image</div>'
          }
        </div>
        <div class="product-info">
          <h1>${product.name}</h1>
          <p class="price">${formatPrice(product.price, 'USD')}</p>
          ${product.description ? `<p class="description">${product.description}</p>` : ''}

          <form hx-post="/cart/add" hx-target="#cart-result" hx-swap="innerHTML">
            <input type="hidden" name="productId" value="${product.id}">
            <div class="quantity">
              <label>Quantity:</label>
              <input type="number" name="quantity" value="1" min="1" max="99">
            </div>
            <button type="submit" class="button-primary">Add to Cart</button>
          </form>
          <div id="cart-result"></div>
        </div>
      </div>
    `,
    );
    return c.html(html);
  });

  // ===== CART =====
  app.get('/cart/count', async (c) => {
    const sessionId = getSessionId(c);
    setSessionCookie(c, sessionId);

    try {
      const cart = await database.cart.get(sessionId);
      const count =
        cart?.items?.reduce(
          (sum: number, item: { quantity: number }) => sum + item.quantity,
          0,
        ) || 0;
      return c.text(count.toString());
    } catch {
      return c.text('0');
    }
  });

  app.get('/cart', async (c) => {
    const sessionId = getSessionId(c);
    setSessionCookie(c, sessionId);

    // Consume any message left by a checkout attempt that was turned back.
    const flash = takeFlash(c);

    let cart: Cart | null = null;
    try {
      cart = await database.cart.get(sessionId);
    } catch (err) {
      console.log('Cart fetch error:', err);
    }

    if (!cart || cart.items.length === 0) {
      return c.html(
        layout(
          'Cart',
          `
          <h1>Your Cart is Empty</h1>
          <p>Looks like you haven't added anything yet.</p>
          <a href="/products" class="button-primary">Continue Shopping</a>
        `,
          flash,
        ),
      );
    }

    const subtotal = cart.items.reduce(
      (sum, item) => sum + (item.lineTotal ?? item.price * item.quantity),
      0,
    );

    const html = layout(
      'Cart',
      `
      <h1>Shopping Cart</h1>
      <div class="cart-items">
        ${cart.items
          .map(
            (item: any) => `
          <div class="cart-item">
            <img src="${item.image?.url || '/placeholder.svg'}" alt="${item.name}">
            <div class="item-details">
              <h3>${item.name}</h3>
              <p>${formatPrice(item.price, 'USD')}</p>
            </div>
            <form class="item-quantity" hx-post="/cart/update" hx-target="body">
              <input type="hidden" name="itemId" value="${item.id}">
              <input type="number" name="quantity" value="${item.quantity}" min="0" max="99">
              <button type="submit">Update</button>
            </form>
            <div class="item-total">${formatPrice(item.lineTotal ?? item.price * item.quantity, 'USD')}</div>
            <form hx-post="/cart/remove" hx-target="body">
              <input type="hidden" name="itemId" value="${item.id}">
              <button type="submit" class="danger">×</button>
            </form>
          </div>
        `,
          )
          .join('')}
      </div>
      <div class="cart-totals">
        <div class="total-line">
          <span>Subtotal</span>
          <span>${formatPrice(subtotal, 'USD')}</span>
        </div>
      </div>
      <div class="cart-actions">
        <a href="/products">← Continue Shopping</a>
        ${stripe
          ? `<form action="/checkout" method="post">
               <button type="submit" class="button-primary">Proceed to Checkout →</button>
             </form>`
          : '<p class="notice">Checkout unavailable - Stripe not configured</p>'
        }
      </div>
    `,
      flash,
    );
    return c.html(html);
  });

  app.post('/cart/add', async (c) => {
    const body = await c.req.parseBody();
    const productId = body.productId;
    const quantity = parseInt(body.quantity as string) || 1;

    const sessionId = getSessionId(c);
    setSessionCookie(c, sessionId);

    if (!productId) {
      return c.text('<div class="error">Product ID required</div>');
    }

    try {
      let cart = await database.cart.get(sessionId);
      if (!cart) {
        cart = await database.cart.create(sessionId);
      }

      const product = await database.products.get(productId as string);
      if (!product) {
        return c.text('<div class="error">Product not found</div>');
      }

      await database.cart.addItem(sessionId, {
        productId: product.id,
        name: product.name,
        sku: product.slug,
        price: product.price,
        quantity: quantity,
        image: product.images?.[0],
      });

      c.header('X-Cart-Updated', '1');
      return c.text(
        '<div class="success">Added to cart! <a href="/cart">View Cart</a></div>',
      );
    } catch (err) {
      console.error('Cart add error:', err);
      return c.text('<div class="error">Error adding to cart</div>');
    }
  });

  app.post('/cart/update', async (c) => {
    const body = await c.req.parseBody();
    const sessionId = getSessionId(c);

    try {
      await database.cart.updateItem(
        sessionId,
        body.itemId as string,
        parseInt(body.quantity as string),
      );
      return c.redirect('/cart');
    } catch {
      return c.redirect('/cart');
    }
  });

  app.post('/cart/remove', async (c) => {
    const body = await c.req.parseBody();
    const sessionId = getSessionId(c);

    try {
      await database.cart.removeItem(sessionId, body.itemId as string);
      return c.redirect('/cart');
    } catch {
      return c.redirect('/cart');
    }
  });

  // ===== MOUNT SHARED ROUTERS =====
  app.route('/checkout', checkoutRouter);
  app.route('/webhooks', webhooksRouter);

  // Search API
  if (search) {
    app.get('/api/search', async (c) => {
      const q = c.req.query('q') || '';
      const page = parseInt(c.req.query('page') || '1', 10);
      const perPage = parseInt(c.req.query('perPage') || '20', 10);
      
      if (!q.trim()) {
        return c.json({ items: [], total: 0, page, perPage });
      }
      
      try {
        const result = await search.search(q, { page, perPage });
        return c.json(result);
      } catch (err: any) {
        console.error('Search API error:', err);
        return c.json({ error: 'Search failed' }, 500);
      }
    });
  }
  app.route('/admin', createAdminRoutes({ database, basePath: '/admin', searchService: search }));

  // Subscription API routes
  if (subscriptionProvider) {
    app.route('/api/subscriptions', createSubscriptionRoutes({
      database,
      subscriptionProvider,
    }));
  }

  // ===== SERVE ACTUAL CSS =====
  const cssPath = path.join(__dirname, 'styles.css');
  app.get('/styles.css', async (c) => {
    const css = await fs.readFile(cssPath, 'utf8');
    c.header('Content-Type', 'text/css');
    return c.body(css);
  });

  return app;
}

// Product card component
function renderProductCard(product: Product): string {
  return `
    <div class="product-card">
      <a href="/products/${product.slug}">
        ${product.images?.[0]
          ? `<img src="${product.images[0].url}" alt="${product.name}">`
          : '<div class="placeholder-image"></div>'
        }
        <h3>${product.name}</h3>
        <p class="price">${formatPrice(product.price, 'USD')}</p>
      </a>
      <form hx-post="/cart/add" hx-target="this" hx-swap="outerHTML">
        <input type="hidden" name="productId" value="${product.id}">
        <input type="hidden" name="quantity" value="1">
        <button type="submit">Add to Cart</button>
      </form>
    </div>
  `;
}
