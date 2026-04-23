import { Hono } from 'hono';
import type { DatabaseAdapter, StoreFeatures } from '@tillkit/core';
import type { SearchService } from '@tillkit/integration-search';

export interface AdminConfig {
  database: DatabaseAdapter;
  basePath: string;
  features?: StoreFeatures;
  searchService?: SearchService;
}


function adminLayout(title: string, content: string, navActive?: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — TillKit Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #222; }
    .layout { display: flex; min-height: 100vh; }
    .sidebar { width: 240px; background: #111; color: white; padding: 24px 16px; flex-shrink: 0; }
    .sidebar h2 { font-size: 1.1rem; margin-bottom: 24px; font-weight: 600; letter-spacing: -0.02em; }
    .sidebar a { display: block; color: #aaa; text-decoration: none; padding: 10px 14px; border-radius: 6px; margin-bottom: 4px; font-size: 0.9rem; }
    .sidebar a:hover, .sidebar a.active { background: #222; color: white; }
    .main { flex: 1; padding: 32px; overflow: auto; }
    .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .topbar h1 { font-size: 1.6rem; font-weight: 600; }
    .btn { display: inline-block; padding: 8px 16px; background: #000; color: white; text-decoration: none; border-radius: 6px; border: none; font-size: 0.9rem; cursor: pointer; }
    .btn:hover { background: #333; }
    .btn-danger { background: #c00; }
    .btn-danger:hover { background: #900; }
    .btn-sm { padding: 4px 10px; font-size: 0.8rem; }
    .card { background: white; border-radius: 8px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .card h3 { font-size: 1.1rem; margin-bottom: 16px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .stat-card .label { font-size: 0.8rem; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .stat-card .value { font-size: 1.6rem; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; }
    th { font-weight: 600; color: #555; font-size: 0.8rem; text-transform: uppercase; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 500; }
    .badge-pending { background: #fef3c7; color: #b45309; }
    .badge-paid { background: #d1fae5; color: #065f46; }
    .badge-fulfilled { background: #dbeafe; color: #1e40af; }
    .badge-cancelled { background: #fee2e2; color: #991b1b; }
    .badge-draft { background: #f3f4f6; color: #4b5563; }
    .badge-active { background: #dcfce7; color: #166534; }
    .badge-archived { background: #fee2e2; color: #991b1b; }
    .filters { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; }
    select, input[type="text"], input[type="number"], textarea { padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.9rem; font-family: inherit; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-weight: 500; margin-bottom: 6px; font-size: 0.85rem; }
    .form-group input, .form-group select, .form-group textarea { width: 100%; }
    textarea { min-height: 80px; resize: vertical; }
    .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; }
    .actions { display: flex; gap: 8px; }
    @media (max-width: 768px) { .sidebar { display: none; } .stats { grid-template-columns: 1fr; } }
  </style>
  <script src="https://unpkg.com/htmx.org@1.9.12"></script>
</head>
<body>
  <div class="layout">
    <nav class="sidebar">
      <h2>TillKit Admin</h2>
      <a href="/admin" class="${navActive === 'dashboard' ? 'active' : ''}">Dashboard</a>
      <a href="/admin/orders" class="${navActive === 'orders' ? 'active' : ''}">Orders</a>
      <a href="/admin/products" class="${navActive === 'products' ? 'active' : ''}">Products</a>
    </nav>
    <main class="main">
      ${content}
    </main>
  </div>
</body>
</html>`;
}

function formatCurrency(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

export function createAdminRoutes(config: AdminConfig) {
  const { database: db, features = { variants: true, collections: false, inventoryTracking: true, subscriptions: false, multiCurrency: false }, searchService } = config;
  const app = new Hono();

  // Dashboard
  app.get('/', async (c) => {
    const [ordersResult, productsResult] = await Promise.all([
      db.orders.list({ limit: 100 }),
      db.products.list({ limit: 1 }),
    ]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysOrders = ordersResult.items.filter((o: any) => new Date(o.createdAt) >= today);
    const revenue = todaysOrders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);

    const content = `
      <div class="topbar">
        <h1>Dashboard</h1>
      </div>
      <div class="stats">
        <div class="stat-card">
          <div class="label">Today's Revenue</div>
          <div class="value">${formatCurrency(revenue)}</div>
        </div>
        <div class="stat-card">
          <div class="label">Today's Orders</div>
          <div class="value">${todaysOrders.length}</div>
        </div>
        <div class="stat-card">
          <div class="label">Total Products</div>
          <div class="value">${productsResult.total}</div>
        </div>
      </div>
      <div class="card">
        <h3>Recent Orders</h3>
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th><th>Date</th></tr></thead>
          <tbody>
            ${ordersResult.items.slice(0, 5).map((o: any) => `
              <tr>
                <td><a href="/admin/orders/${o.id}">${o.orderNumber || o.id}</a></td>
                <td>${o.email || 'Guest'}</td>
                <td><span class="badge badge-${o.status}">${o.status}</span></td>
                <td>${formatCurrency(o.total || 0)}</td>
                <td>${new Date(o.createdAt).toLocaleDateString()}</td>
              </tr>
            `).join('')}
            ${ordersResult.items.length === 0 ? '<tr><td colspan="5" style="color:#999;">No orders yet</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    `;
    return c.html(adminLayout('Dashboard', content, 'dashboard'));
  });

  // Orders list
  app.get('/orders', async (c) => {
    const status = c.req.query('status');
    const result = await db.orders.list({
      limit: 50,
      filters: status ? { status } : undefined,
    });
    const content = `
      <div class="topbar">
        <h1>Orders</h1>
      </div>
      <div class="card">
        <div class="filters">
          <form method="get">
            <select name="status" onchange="this.form.submit()">
              <option value="">All Statuses</option>
              <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="paid" ${status === 'paid' ? 'selected' : ''}>Paid</option>
              <option value="fulfilled" ${status === 'fulfilled' ? 'selected' : ''}>Fulfilled</option>
              <option value="cancelled" ${status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
          </form>
        </div>
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            ${result.items.map((o: any) => `
              <tr>
                <td>${o.orderNumber || o.id}</td>
                <td>${o.email || 'Guest'}</td>
                <td><span class="badge badge-${o.status}">${o.status}</span></td>
                <td>${formatCurrency(o.total || 0)}</td>
                <td>${new Date(o.createdAt).toLocaleDateString()}</td>
                <td><a class="btn btn-sm" href="/admin/orders/${o.id}">View</a></td>
              </tr>
            `).join('')}
            ${result.items.length === 0 ? '<tr><td colspan="6" style="color:#999;">No orders found</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    `;
    return c.html(adminLayout('Orders', content, 'orders'));
  });

  // Single order
  app.get('/orders/:id', async (c) => {
    const id = c.req.param('id');
    const order = await db.orders.get(id);
    if (!order) return c.notFound();

    const content = `
      <div class="topbar">
        <h1>Order ${order.orderNumber || order.id}</h1>
        <a class="btn" href="/admin/orders">Back to Orders</a>
      </div>
      <div class="card">
        <p><strong>Customer:</strong> ${order.email || 'Guest'}</p>
        <p><strong>Status:</strong> <span class="badge badge-${order.status}">${order.status}</span></p>
        <p><strong>Total:</strong> ${formatCurrency(order.total || 0)}</p>
        <p><strong>Subtotal:</strong> ${formatCurrency(order.subtotal || 0)}</p>
        <p><strong>Currency:</strong> ${order.currency}</p>
        <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
      </div>
      <div class="card">
        <h3>Update Status</h3>
        <form method="post" action="/admin/orders/${order.id}/status">
          <div class="form-group">
            <label>Status</label>
            <select name="status">
              <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="paid" ${order.status === 'paid' ? 'selected' : ''}>Paid</option>
              <option value="fulfilled" ${order.status === 'fulfilled' ? 'selected' : ''}>Fulfilled</option>
              <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
          </div>
          <button type="submit" class="btn">Update Status</button>
        </form>
      </div>
    `;
    return c.html(adminLayout('Order Details', content, 'orders'));
  });

  // Update order status
  app.post('/orders/:id/status', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.parseBody();
    const newStatus = body.status as string | undefined;
    if (!newStatus) return c.json({ error: 'Status required' }, 400);
    try {
      await db.orders.updateStatus(id, newStatus as any);
    } catch {
      return c.json({ error: 'Order not found' }, 404);
    }
    return c.redirect('/admin/orders');
  });

  // Products list
  app.get('/products', async (c) => {
    const page = parseInt(c.req.query('page') || '1');
    const q = c.req.query('q');
    let result;
    if (q && q.trim()) {
      if (searchService) {
        try {
          const searchResult = await searchService.search(q, { page, perPage: 20 });
          result = searchResult;
        } catch (err) {
          console.error('Admin product search failed:', err);
          result = await db.products.list({ limit: 20, offset: (page - 1) * 20 });
        }
      } else {
        const products = await db.products.search(q);
        result = { items: products, total: products.length, page, perPage: 20 };
      }
    } else {
      result = await db.products.list({ limit: 20, offset: (page - 1) * 20 });
    }
    const content = `
      <div class="topbar">
        <h1>Products</h1>
        <a class="btn" href="/admin/products/new">Create Product</a>
      </div>
      <div class="card">
        <form method="get" class="filters" action="/admin/products" style="margin-bottom:16px;">
          <input type="search" name="q" value="${q || ''}" placeholder="Search products..." />
          <button type="submit" class="btn btn-sm">Search</button>
          ${q ? '<a href="/admin/products" class="btn btn-sm">Clear</a>' : ''}
        </form>
        <table>
          <thead><tr><th>Name</th><th>Slug</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${result.items.map((p: any) => `
              <tr>
                <td><strong>${p.name}</strong></td>
                <td>${p.slug}</td>
                <td>${formatCurrency(p.price || 0)}</td>
                <td><span class="badge badge-${p.status}">${p.status}</span></td>
                <td class="actions">
                  <a class="btn btn-sm" href="/admin/products/${p.id}/edit">Edit</a>
                  <button class="btn btn-sm btn-danger" hx-delete="/admin/products/${p.id}" hx-confirm="Delete ${p.name}?" hx-target="closest tr" hx-swap="outerHTML">Delete</button>
                </td>
              </tr>
            `).join('')}
            ${result.items.length === 0 ? '<tr><td colspan="5" style="color:#999;">No products yet</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    `;
    return c.html(adminLayout('Products', content, 'products'));
  });

  // Product new form
  app.get('/products/new', async (c) => {
    const showVariants = features.variants;
    const showInventory = features.inventoryTracking;
    const content = `
      <div class="topbar">
        <h1>Create Product</h1>
        <a class="btn" href="/admin/products">Back to Products</a>
      </div>
      <form method="post" action="/admin/products" class="card">
        <div class="row">
          <div class="form-group">
            <label>Name</label>
            <input type="text" name="name" placeholder="Product name" required />
          </div>
          <div class="form-group">
            <label>Slug</label>
            <input type="text" name="slug" placeholder="product-slug" required />
          </div>
        </div>
        <div class="row">
          <div class="form-group">
            <label>Price (cents)</label>
            <input type="number" name="price" placeholder="1999" required />
          </div>
          <div class="form-group">
            <label>Status</label>
            <select name="status">
              <option value="draft">Draft</option>
              <option value="active" selected>Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea name="description" placeholder="Product description..."></textarea>
        </div>
        ${showInventory ? `
        <div class="row">
          <div class="form-group">
            <label>Stock Quantity</label>
            <input type="number" name="stock" placeholder="100" />
          </div>
          <div class="form-group">
            <label>Track Inventory</label>
            <select name="trackInventory">
              <option value="true" selected>Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        </div>
        ` : ''}
        ${showVariants ? `
        <div class="card" style="margin-top: 16px;">
          <h3>Variants</h3>
          <p style="color:#666; font-size:0.85rem;">Variants are enabled. Define them after creation.</p>
        </div>
        ` : ''}
        <button type="submit" class="btn">Create Product</button>
      </form>
    `;
    return c.html(adminLayout('Create Product', content, 'products'));
  });

  // Product create
  app.post('/products', async (c) => {
    const body = await c.req.parseBody();
    const data: any = {
      name: body.name,
      slug: body.slug,
      price: parseInt(body.price as string) || 0,
      status: body.status || 'draft',
      description: body.description,
    };
    if (features.inventoryTracking && body.stock) {
      data.inventory = {
        available: parseInt(body.stock as string) || 0,
        quantity: parseInt(body.stock as string) || 0,
        allowOutOfStock: false,
      };
    }
    try {
      const product = await db.products.create(data);
      if (searchService) {
        try { await searchService.sync(product, 'create'); } catch (e) { console.error('Search sync (create) failed:', e); }
      }
      return c.redirect('/admin/products');
    } catch {
      return c.json({ error: 'Failed to create product' }, 500);
    }
  });

  // Product edit form
  app.get('/products/:id/edit', async (c) => {
    const id = c.req.param('id');
    const product = await db.products.get(id);
    if (!product) return c.notFound();
    const showVariants = features.variants;
    const showInventory = features.inventoryTracking;
    const content = `
      <div class="topbar">
        <h1>Edit Product</h1>
        <a class="btn" href="/admin/products">Back to Products</a>
      </div>
      <form method="post" action="/admin/products/${product.id}" class="card">
        <div class="row">
          <div class="form-group">
            <label>Name</label>
            <input type="text" name="name" value="${product.name || ''}" required />
          </div>
          <div class="form-group">
            <label>Slug</label>
            <input type="text" name="slug" value="${product.slug || ''}" required />
          </div>
        </div>
        <div class="row">
          <div class="form-group">
            <label>Price (cents)</label>
            <input type="number" name="price" value="${product.price || 0}" required />
          </div>
          <div class="form-group">
            <label>Status</label>
            <select name="status">
              <option value="draft" ${product.status === 'draft' ? 'selected' : ''}>Draft</option>
              <option value="active" ${product.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="archived" ${product.status === 'archived' ? 'selected' : ''}>Archived</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea name="description">${product.description || ''}</textarea>
        </div>
        ${showInventory ? `
        <div class="form-group">
          <label>Stock Quantity</label>
          <input type="number" name="stock" value="${product.inventory?.available || 0}" />
        </div>
        ` : ''}
        ${showVariants && product.variants?.length ? `
        <div class="card" style="margin-top: 16px;">
          <h3>Variants (${product.variants.length})</h3>
          <table>
            <thead><tr><th>SKU</th><th>Options</th><th>Price</th><th>Stock</th></tr></thead>
            <tbody>
              ${product.variants.map((v: any) => `
                <tr>
                  <td>${v.sku || '-'}</td>
                  <td>${JSON.stringify(v.options)}</td>
                  <td>${formatCurrency(v.price || product.price || 0)}</td>
                  <td>${v.inventory?.available ?? '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}
        ${showVariants && (!product.variants || product.variants.length === 0) ? `
        <div class="card" style="margin-top: 16px;">
          <h3>Variants</h3>
          <p style="color:#666; font-size:0.85rem;">No variants yet. Variants can be added via API.</p>
        </div>
        ` : ''}
        <button type="submit" class="btn">Update Product</button>
      </form>
    `;
    return c.html(adminLayout('Edit Product', content, 'products'));
  });

  // Product update
  app.post('/products/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.parseBody();
    const data: any = {
      name: body.name,
      slug: body.slug,
      price: parseInt(body.price as string) || 0,
      status: body.status || 'draft',
      description: body.description,
    };
    if (features.inventoryTracking && body.stock !== undefined) {
      data.inventory = {
        available: parseInt(body.stock as string) || 0,
        quantity: parseInt(body.stock as string) || 0,
        allowOutOfStock: false,
      };
    }
    try {
      const product = await db.products.update(id, data);
      if (searchService) {
        try { await searchService.sync(product, 'update'); } catch (e) { console.error('Search sync (update) failed:', e); }
      }
      return c.redirect('/admin/products');
    } catch {
      return c.json({ error: 'Failed to update product' }, 500);
    }
  });

  // Product delete (HTMX)
  app.delete('/products/:id', async (c) => {
    const id = c.req.param('id');
    try {
      await db.products.delete(id);
      if (searchService) {
        try { await searchService.sync({ id } as any, 'delete'); } catch (e) { console.error('Search sync (delete) failed:', e); }
      }
      c.header('HX-Redirect', '/admin/products');
      return c.body('');
    } catch {
      return c.json({ error: 'Failed to delete product' }, 500);
    }
  });

  return app;
}
