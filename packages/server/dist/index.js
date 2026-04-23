// src/index.ts
import { Hono as Hono8 } from "hono";

// src/routes/products.ts
import { Hono } from "hono";
function createProductRoutes(db, searchService) {
  const app = new Hono();
  app.get("/", async (c) => {
    const query = c.req.query();
    const page = parseInt(query.page || "1");
    const limit = parseInt(query.limit || "20");
    const status = query.status;
    const result = await db.products.list({
      limit,
      offset: (page - 1) * limit,
      filters: status ? { status } : void 0
    });
    return c.json(result);
  });
  app.get("/search", async (c) => {
    const query = c.req.query("q");
    if (!query) {
      return c.json({ items: [] });
    }
    if (searchService) {
      try {
        const result = await searchService.search(query, { page: 1, perPage: 20 });
        return c.json({ items: result.items, total: result.total });
      } catch (err) {
        console.error("Search service error, falling back to DB:", err);
      }
    }
    const products = await db.products.search(query);
    return c.json({ items: products });
  });
  app.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const product = await db.products.getBySlug(slug);
    if (!product) {
      return c.json({ error: "Product not found" }, 404);
    }
    return c.json({ product });
  });
  app.post("/", async (c) => {
    const data = await c.req.json();
    const product = await db.products.create(data);
    if (searchService) {
      try {
        await searchService.sync(product, "create");
      } catch (e) {
        console.error("Search sync (create) failed:", e);
      }
    }
    return c.json({ product }, 201);
  });
  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const data = await c.req.json();
    const product = await db.products.update(id, data);
    if (searchService) {
      try {
        await searchService.sync(product, "update");
      } catch (e) {
        console.error("Search sync (update) failed:", e);
      }
    }
    return c.json({ product });
  });
  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    await db.products.delete(id);
    if (searchService) {
      try {
        await searchService.sync({ id }, "delete");
      } catch (e) {
        console.error("Search sync (delete) failed:", e);
      }
    }
    return c.json({ success: true });
  });
  return app;
}

// src/routes/subscriptions.ts
import { Hono as Hono2 } from "hono";
function createSubscriptionRoutes(config) {
  const { subscriptionProvider: subs } = config;
  const app = new Hono2();
  app.post("/", async (c) => {
    const body = await c.req.json();
    try {
      const result = await subs.createSubscription({
        customerId: body.customerId,
        planId: body.planId,
        trialDays: body.trialDays,
        paymentMethodId: body.paymentMethodId,
        metadata: body.metadata
      });
      return c.json(result);
    } catch (err) {
      console.error("Subscription create error:", err);
      return c.json({ error: err.message }, 400);
    }
  });
  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const sub = await subs.getSubscription(id);
      return c.json(sub);
    } catch (err) {
      return c.json({ error: err.message }, 404);
    }
  });
  app.post("/:id/cancel", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    try {
      const result = await subs.cancelSubscription(id, body.immediately);
      return c.json(result);
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  });
  app.post("/:id/update", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    if (!body.planId) return c.json({ error: "planId required" }, 400);
    try {
      const result = await subs.updateSubscription(id, body.planId);
      return c.json(result);
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  });
  app.post("/webhook", async (c) => {
    const payload = await c.req.text();
    const signature = c.req.header("stripe-signature") || "";
    try {
      const event = subs.handleWebhook(payload, signature);
      const result = await subs.processWebhookEvent(event);
      console.log("Subscription webhook:", result.type, result.subscriptionId);
      return c.json({ received: true, type: result.type, subscriptionId: result.subscriptionId });
    } catch (err) {
      console.error("Subscription webhook error:", err.message);
      return c.json({ error: "Invalid webhook" }, 400);
    }
  });
  return app;
}

// src/routes/admin.ts
import { Hono as Hono3 } from "hono";
function adminLayout(title, content, navActive) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} \u2014 TillKit Admin</title>
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
      <a href="/admin" class="${navActive === "dashboard" ? "active" : ""}">Dashboard</a>
      <a href="/admin/orders" class="${navActive === "orders" ? "active" : ""}">Orders</a>
      <a href="/admin/products" class="${navActive === "products" ? "active" : ""}">Products</a>
    </nav>
    <main class="main">
      ${content}
    </main>
  </div>
</body>
</html>`;
}
function formatCurrency(cents) {
  return "$" + (cents / 100).toFixed(2);
}
function createAdminRoutes(config) {
  const { database: db, features = { variants: true, collections: false, inventoryTracking: true, subscriptions: false, multiCurrency: false }, searchService } = config;
  const app = new Hono3();
  app.get("/", async (c) => {
    const [ordersResult, productsResult] = await Promise.all([
      db.orders.list({ limit: 100 }),
      db.products.list({ limit: 1 })
    ]);
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const todaysOrders = ordersResult.items.filter((o) => new Date(o.createdAt) >= today);
    const revenue = todaysOrders.reduce((sum, o) => sum + (o.total || 0), 0);
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
            ${ordersResult.items.slice(0, 5).map((o) => `
              <tr>
                <td><a href="/admin/orders/${o.id}">${o.orderNumber || o.id}</a></td>
                <td>${o.email || "Guest"}</td>
                <td><span class="badge badge-${o.status}">${o.status}</span></td>
                <td>${formatCurrency(o.total || 0)}</td>
                <td>${new Date(o.createdAt).toLocaleDateString()}</td>
              </tr>
            `).join("")}
            ${ordersResult.items.length === 0 ? '<tr><td colspan="5" style="color:#999;">No orders yet</td></tr>' : ""}
          </tbody>
        </table>
      </div>
    `;
    return c.html(adminLayout("Dashboard", content, "dashboard"));
  });
  app.get("/orders", async (c) => {
    const status = c.req.query("status");
    const result = await db.orders.list({
      limit: 50,
      filters: status ? { status } : void 0
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
              <option value="pending" ${status === "pending" ? "selected" : ""}>Pending</option>
              <option value="paid" ${status === "paid" ? "selected" : ""}>Paid</option>
              <option value="fulfilled" ${status === "fulfilled" ? "selected" : ""}>Fulfilled</option>
              <option value="cancelled" ${status === "cancelled" ? "selected" : ""}>Cancelled</option>
            </select>
          </form>
        </div>
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            ${result.items.map((o) => `
              <tr>
                <td>${o.orderNumber || o.id}</td>
                <td>${o.email || "Guest"}</td>
                <td><span class="badge badge-${o.status}">${o.status}</span></td>
                <td>${formatCurrency(o.total || 0)}</td>
                <td>${new Date(o.createdAt).toLocaleDateString()}</td>
                <td><a class="btn btn-sm" href="/admin/orders/${o.id}">View</a></td>
              </tr>
            `).join("")}
            ${result.items.length === 0 ? '<tr><td colspan="6" style="color:#999;">No orders found</td></tr>' : ""}
          </tbody>
        </table>
      </div>
    `;
    return c.html(adminLayout("Orders", content, "orders"));
  });
  app.get("/orders/:id", async (c) => {
    const id = c.req.param("id");
    const order = await db.orders.get(id);
    if (!order) return c.notFound();
    const content = `
      <div class="topbar">
        <h1>Order ${order.orderNumber || order.id}</h1>
        <a class="btn" href="/admin/orders">Back to Orders</a>
      </div>
      <div class="card">
        <p><strong>Customer:</strong> ${order.email || "Guest"}</p>
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
              <option value="pending" ${order.status === "pending" ? "selected" : ""}>Pending</option>
              <option value="paid" ${order.status === "paid" ? "selected" : ""}>Paid</option>
              <option value="fulfilled" ${order.status === "fulfilled" ? "selected" : ""}>Fulfilled</option>
              <option value="cancelled" ${order.status === "cancelled" ? "selected" : ""}>Cancelled</option>
            </select>
          </div>
          <button type="submit" class="btn">Update Status</button>
        </form>
      </div>
    `;
    return c.html(adminLayout("Order Details", content, "orders"));
  });
  app.post("/orders/:id/status", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.parseBody();
    const newStatus = body.status;
    if (!newStatus) return c.json({ error: "Status required" }, 400);
    try {
      await db.orders.updateStatus(id, newStatus);
    } catch {
      return c.json({ error: "Order not found" }, 404);
    }
    return c.redirect("/admin/orders");
  });
  app.get("/products", async (c) => {
    const page = parseInt(c.req.query("page") || "1");
    const q = c.req.query("q");
    let result;
    if (q && q.trim()) {
      if (searchService) {
        try {
          const searchResult = await searchService.search(q, { page, perPage: 20 });
          result = searchResult;
        } catch (err) {
          console.error("Admin product search failed:", err);
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
          <input type="search" name="q" value="${q || ""}" placeholder="Search products..." />
          <button type="submit" class="btn btn-sm">Search</button>
          ${q ? '<a href="/admin/products" class="btn btn-sm">Clear</a>' : ""}
        </form>
        <table>
          <thead><tr><th>Name</th><th>Slug</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${result.items.map((p) => `
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
            `).join("")}
            ${result.items.length === 0 ? '<tr><td colspan="5" style="color:#999;">No products yet</td></tr>' : ""}
          </tbody>
        </table>
      </div>
    `;
    return c.html(adminLayout("Products", content, "products"));
  });
  app.get("/products/new", async (c) => {
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
        ` : ""}
        ${showVariants ? `
        <div class="card" style="margin-top: 16px;">
          <h3>Variants</h3>
          <p style="color:#666; font-size:0.85rem;">Variants are enabled. Define them after creation.</p>
        </div>
        ` : ""}
        <button type="submit" class="btn">Create Product</button>
      </form>
    `;
    return c.html(adminLayout("Create Product", content, "products"));
  });
  app.post("/products", async (c) => {
    const body = await c.req.parseBody();
    const data = {
      name: body.name,
      slug: body.slug,
      price: parseInt(body.price) || 0,
      status: body.status || "draft",
      description: body.description
    };
    if (features.inventoryTracking && body.stock) {
      data.inventory = {
        available: parseInt(body.stock) || 0,
        quantity: parseInt(body.stock) || 0,
        allowOutOfStock: false
      };
    }
    try {
      const product = await db.products.create(data);
      if (searchService) {
        try {
          await searchService.sync(product, "create");
        } catch (e) {
          console.error("Search sync (create) failed:", e);
        }
      }
      return c.redirect("/admin/products");
    } catch {
      return c.json({ error: "Failed to create product" }, 500);
    }
  });
  app.get("/products/:id/edit", async (c) => {
    const id = c.req.param("id");
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
            <input type="text" name="name" value="${product.name || ""}" required />
          </div>
          <div class="form-group">
            <label>Slug</label>
            <input type="text" name="slug" value="${product.slug || ""}" required />
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
              <option value="draft" ${product.status === "draft" ? "selected" : ""}>Draft</option>
              <option value="active" ${product.status === "active" ? "selected" : ""}>Active</option>
              <option value="archived" ${product.status === "archived" ? "selected" : ""}>Archived</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea name="description">${product.description || ""}</textarea>
        </div>
        ${showInventory ? `
        <div class="form-group">
          <label>Stock Quantity</label>
          <input type="number" name="stock" value="${product.inventory?.available || 0}" />
        </div>
        ` : ""}
        ${showVariants && product.variants?.length ? `
        <div class="card" style="margin-top: 16px;">
          <h3>Variants (${product.variants.length})</h3>
          <table>
            <thead><tr><th>SKU</th><th>Options</th><th>Price</th><th>Stock</th></tr></thead>
            <tbody>
              ${product.variants.map((v) => `
                <tr>
                  <td>${v.sku || "-"}</td>
                  <td>${JSON.stringify(v.options)}</td>
                  <td>${formatCurrency(v.price || product.price || 0)}</td>
                  <td>${v.inventory?.available ?? "-"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        ` : ""}
        ${showVariants && (!product.variants || product.variants.length === 0) ? `
        <div class="card" style="margin-top: 16px;">
          <h3>Variants</h3>
          <p style="color:#666; font-size:0.85rem;">No variants yet. Variants can be added via API.</p>
        </div>
        ` : ""}
        <button type="submit" class="btn">Update Product</button>
      </form>
    `;
    return c.html(adminLayout("Edit Product", content, "products"));
  });
  app.post("/products/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.parseBody();
    const data = {
      name: body.name,
      slug: body.slug,
      price: parseInt(body.price) || 0,
      status: body.status || "draft",
      description: body.description
    };
    if (features.inventoryTracking && body.stock !== void 0) {
      data.inventory = {
        available: parseInt(body.stock) || 0,
        quantity: parseInt(body.stock) || 0,
        allowOutOfStock: false
      };
    }
    try {
      const product = await db.products.update(id, data);
      if (searchService) {
        try {
          await searchService.sync(product, "update");
        } catch (e) {
          console.error("Search sync (update) failed:", e);
        }
      }
      return c.redirect("/admin/products");
    } catch {
      return c.json({ error: "Failed to update product" }, 500);
    }
  });
  app.delete("/products/:id", async (c) => {
    const id = c.req.param("id");
    try {
      await db.products.delete(id);
      if (searchService) {
        try {
          await searchService.sync({ id }, "delete");
        } catch (e) {
          console.error("Search sync (delete) failed:", e);
        }
      }
      c.header("HX-Redirect", "/admin/products");
      return c.body("");
    } catch {
      return c.json({ error: "Failed to delete product" }, 500);
    }
  });
  return app;
}

// src/routes/search.ts
import { Hono as Hono4 } from "hono";
import { createSearchService } from "@tillkit/integration-search";
import { createSearchProvider } from "@tillkit/integration-search";
function createSearchRoutes(searchConfig) {
  const search = createSearchService(searchConfig.provider);
  const app = new Hono4();
  app.get("/", async (c) => {
    const query = c.req.query("q") || "";
    const page = parseInt(c.req.query("page") || "1", 10);
    const perPage = parseInt(c.req.query("perPage") || "20", 10);
    const status = c.req.query("status");
    const sort = c.req.query("sort");
    if (!query.trim()) {
      return c.json({ items: [], total: 0, page, perPage });
    }
    try {
      const result = await search.search(query, {
        page,
        perPage,
        filters: status ? { status } : void 0,
        sort
      });
      return c.json(result);
    } catch (err) {
      console.error("Search error:", err);
      return c.json({ error: "Search failed", message: err?.message }, 500);
    }
  });
  return app;
}

// src/index.ts
import { createSearchService as createSearchService2 } from "@tillkit/integration-search";

// src/routes/webhooks.ts
import { Hono as Hono5 } from "hono";

// src/inventory.ts
async function decrementInventoryForOrder(db, order, webhookConfig) {
  if (!order.items || order.items.length === 0) return;
  for (const item of order.items) {
    const product = await db.products.get(item.productId);
    if (!product || !product.inventory) continue;
    const oldAvailable = product.inventory.available ?? product.inventory.quantity ?? 0;
    const newAvailable = Math.max(0, oldAvailable - item.quantity);
    await db.products.update(product.id, {
      inventory: {
        ...product.inventory,
        available: newAvailable,
        quantity: product.inventory.quantity ?? oldAvailable
      }
    });
    if (webhookConfig) {
      try {
        await sendInventoryWebhook(webhookConfig, {
          productId: product.id,
          variantId: item.variantId,
          sku: item.sku || product.slug,
          oldAvailable,
          newAvailable,
          delta: -item.quantity,
          reason: "order_paid",
          orderId: order.id,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      } catch (e) {
        console.error("Inventory webhook failed:", e);
      }
    }
  }
}
async function sendInventoryWebhook(config, event) {
  const headers = {
    "Content-Type": "application/json",
    ...config.headers
  };
  if (config.secret) {
    headers["X-Inventory-Webhook-Secret"] = config.secret;
  }
  const response = await fetch(config.url, {
    method: "POST",
    headers,
    body: JSON.stringify(event)
  });
  if (!response.ok) {
    throw new Error(`Inventory webhook returned ${response.status}: ${await response.text()}`);
  }
}

// src/routes/webhooks.ts
function createWebhookRoutes(config) {
  const router = new Hono5();
  router.post("/stripe", async (c) => {
    const payload = await c.req.text();
    const signature = c.req.header("stripe-signature") || "";
    try {
      const event = config.stripe.handleWebhook(payload, signature);
      const result = await config.stripe.processWebhookEvent(event);
      switch (result.type) {
        case "payment_success": {
          const data = result.data;
          console.log("Payment success:", {
            sessionId: data.sessionId,
            amount: data.amount,
            currency: data.currency
          });
          if (config.onPaymentSuccess) {
            await config.onPaymentSuccess(data);
          }
          break;
        }
        case "payment_failure": {
          const data = result.data;
          console.error("Payment failed:", data);
          if (config.onPaymentFailure) {
            await config.onPaymentFailure({
              sessionId: data.id,
              error: data.last_payment_error
            });
          }
          break;
        }
        case "refund": {
          const data = result.data;
          console.log("Refund processed:", data);
          if (config.onRefund) {
            await config.onRefund(data);
          }
          break;
        }
        default: {
          console.log("Unhandled webhook event:", event.type);
        }
      }
      return c.json({ received: true });
    } catch (err) {
      console.error("Webhook error:", err.message);
      return c.json({ error: "Invalid signature" }, 400);
    }
  });
  return router;
}
async function createOrderFromStripeSession({
  database,
  stripe,
  sessionId,
  cartId,
  getSessionIdFn,
  inventoryWebhook
}) {
  try {
    const session = await stripe.getSession(sessionId);
    if (session.payment_status !== "paid") {
      console.log("Session not paid yet:", session.id);
      return null;
    }
    const actualCartId = cartId || getSessionIdFn();
    const cart = await database.cart.get(actualCartId);
    if (!cart || cart.items.length === 0) {
      console.log("No cart found for session:", sessionId);
      return null;
    }
    const order = await database.orders.create({
      email: session.customer_email || "unknown@example.com",
      status: "paid",
      paymentStatus: "paid",
      items: cart.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        name: item.name,
        sku: item.sku,
        price: item.price,
        quantity: item.quantity,
        total: item.price * item.quantity,
        image: item.image
      })),
      subtotal: cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      total: session.amount_total || 0,
      currency: (session.currency || "USD").toUpperCase(),
      shippingAddress: session.shipping_details ? {
        firstName: session.shipping_details.name?.split(" ")[0] || "",
        lastName: session.shipping_details.name?.split(" ").slice(1).join(" ") || "",
        address1: session.shipping_details.address?.line1 || "",
        address2: session.shipping_details.address?.line2,
        city: session.shipping_details.address?.city || "",
        province: session.shipping_details.address?.state,
        postalCode: session.shipping_details.address?.postal_code || "",
        country: session.shipping_details.address?.country || ""
      } : void 0
    });
    await database.orders.addTransaction(order.id, {
      kind: "sale",
      status: "success",
      amount: session.amount_total || 0,
      currency: (session.currency || "USD").toUpperCase(),
      gateway: "stripe",
      metadata: {
        sessionId: session.id,
        paymentIntentId: session.payment_intent || "",
        customerId: session.customer
      }
    });
    await database.cart.clear(actualCartId);
    await decrementInventoryForOrder(database, order, inventoryWebhook);
    console.log("Order created:", order.orderNumber);
    return order.id;
  } catch (err) {
    console.error("Failed to create order from session:", err);
    return null;
  }
}

// src/routes/paypal-webhooks.ts
import { Hono as Hono6 } from "hono";
function createPayPalWebhookRoutes(config) {
  const router = new Hono6();
  router.post("/paypal", async (c) => {
    const payload = await c.req.text();
    try {
      const event = config.paypal.handleWebhook(payload, Object.fromEntries(c.req.raw.headers.entries()));
      const result = await config.paypal.processWebhookEvent(event);
      if (result.type === "payment_success") {
        const data = result.data;
        if (config.onPaymentSuccess) {
          await config.onPaymentSuccess({
            orderId: data.orderId,
            captureId: data.captureId,
            amount: data.amount,
            currency: data.currency,
            payerEmail: data.payerEmail ?? null,
            payerId: data.payerId ?? null,
            metadata: data.metadata ?? null
          });
        }
        console.log("PayPal payment captured:", {
          captureId: data.captureId,
          amount: data.amount
        });
      }
      if (result.type === "payment_failure" && config.onPaymentFailure) {
        await config.onPaymentFailure({ error: result.data });
      }
      return c.json({ received: true });
    } catch (err) {
      console.error("PayPal webhook error:", err.message);
      return c.json({ error: "Webhook processing failed" }, 400);
    }
  });
  return router;
}
async function createOrderFromPayPalCapture({
  database,
  paypal,
  orderId,
  cartId,
  getSessionIdFn
}) {
  try {
    const paypalOrder = await paypal.getOrder(orderId);
    if (paypalOrder.status !== "COMPLETED" && paypalOrder.status !== "APPROVED") {
      console.log("PayPal order not completed yet:", paypalOrder.status);
      return null;
    }
    const cart = await database.cart.get(cartId);
    if (!cart) {
      console.log("No cart found for session:", cartId);
      return null;
    }
    const existing = await database.orders.getByNumber?.(paypalOrder.id);
    if (existing) return existing.id;
    let capture;
    if (paypalOrder.status === "APPROVED") {
      capture = await paypal.capturePayment(orderId);
    } else {
      capture = { id: paypalOrder.id, status: "COMPLETED", amount: paypalOrder.amount, currency: paypalOrder.currency };
    }
    const order = await database.orders.create({
      email: "",
      // PayPal webhooks provide this
      customerId: getSessionIdFn(),
      status: "paid",
      paymentStatus: "paid",
      items: cart.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        sku: item.sku,
        price: item.price,
        quantity: item.quantity,
        lineTotal: item.lineTotal || item.price * item.quantity
      })),
      subtotal: cart.subtotal || cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      total: capture.amount || cart.subtotal || cart.total || 0,
      currency: capture.currency?.toUpperCase() || "USD",
      // shippingAddress omitted: cart has no shippingAddress
      shippingAddress: { address1: "", city: "", postalCode: "", country: "" },
      // @ts-ignore
      notes: "",
      metadata: { paypalOrderId: orderId }
    });
    const txn = paypal.createTransactionFromCapture(capture);
    await database.orders.addTransaction(order.id, txn);
    console.log("PayPal Order created:", order.orderNumber);
    return order.id;
  } catch (err) {
    console.error("Failed to create order from PayPal capture:", err);
    return null;
  }
}

// src/routes/auth.ts
import { Hono as Hono7 } from "hono";
function createSessionMiddleware(_secret) {
  return async (c, next) => {
    const cookie = c.req.header("cookie") || "";
    const sessionMatch = cookie.match(/session=([^;]+)/);
    if (sessionMatch) {
      try {
        const sessionData = JSON.parse(Buffer.from(sessionMatch[1], "base64").toString());
        c.set("customerId", sessionData.customerId);
        c.set("customerEmail", sessionData.email);
      } catch {
      }
    }
    await next();
  };
}
function requireAuth() {
  return async (c, next) => {
    const customerId = c.get("customerId");
    if (!customerId) {
      return c.redirect("/auth/login?redirect=" + encodeURIComponent(c.req.url));
    }
    await next();
  };
}
var authLayout = (title, content, error) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 0;
      background: #f5f5f5;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .auth-container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      width: 100%;
      max-width: 400px;
    }
    h1 {
      margin: 0 0 24px 0;
      font-size: 1.5rem;
    }
    .form-group {
      margin-bottom: 16px;
    }
    label {
      display: block;
      margin-bottom: 4px;
      font-weight: 500;
    }
    input {
      width: 100%;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 16px;
    }
    button {
      width: 100%;
      padding: 12px;
      background: #000;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 16px;
      cursor: pointer;
    }
    button:hover {
      background: #333;
    }
    .error {
      background: #fee;
      color: #c00;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 16px;
    }
    .links {
      margin-top: 16px;
      text-align: center;
    }
    .links a {
      color: #666;
      text-decoration: none;
    }
    .links a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="auth-container">
    ${error ? `<div class="error">${error}</div>` : ""}
    ${content}
  </div>
</body>
</html>`;
function createAuthRoutes(config) {
  const router = new Hono7();
  router.use("*", createSessionMiddleware(config.sessionSecret));
  router.get("/login", async (c) => {
    const redirect = c.req.query("redirect") || "/";
    const error = c.req.query("error");
    const html = authLayout(
      "Sign In",
      `
        <h1>Sign In</h1>
        <form method="post" action="/auth/login">
          <input type="hidden" name="redirect" value="${redirect}">
          <div class="form-group">
            <label>Email</label>
            <input type="email" name="email" required>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" name="password" required>
          </div>
          <button type="submit">Sign In</button>
        </form>
        <div class="links">
          <a href="/auth/register?redirect=${encodeURIComponent(redirect)}">Create account</a>
        </div>
      `,
      error
    );
    return c.html(html);
  });
  router.post("/login", async (c) => {
    const body = await c.req.parseBody();
    const email = body.email;
    const redirect = body.redirect || "/";
    try {
      const customer = await config.database.customers.getByEmail(email);
      if (!customer) {
        return c.redirect(`/auth/login?error=${encodeURIComponent("Invalid email or password")}&redirect=${encodeURIComponent(redirect)}`);
      }
      const sessionData = JSON.stringify({ customerId: customer.id, email: customer.email });
      const sessionCookie = Buffer.from(sessionData).toString("base64");
      c.header("Set-Cookie", `session=${sessionCookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      return c.redirect(redirect);
    } catch (err) {
      console.error("Login error:", err);
      return c.redirect(`/auth/login?error=${encodeURIComponent("Login failed")}&redirect=${encodeURIComponent(redirect)}`);
    }
  });
  router.get("/register", async (c) => {
    const redirect = c.req.query("redirect") || "/";
    const error = c.req.query("error");
    const html = authLayout(
      "Create Account",
      `
        <h1>Create Account</h1>
        <form method="post" action="/auth/register">
          <input type="hidden" name="redirect" value="${redirect}">
          <div class="form-group">
            <label>First Name</label>
            <input type="text" name="firstName">
          </div>
          <div class="form-group">
            <label>Last Name</label>
            <input type="text" name="lastName">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" name="email" required>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" name="password" required minlength="8">
          </div>
          <button type="submit">Create Account</button>
        </form>
        <div class="links">
          <a href="/auth/login?redirect=${encodeURIComponent(redirect)}">Already have an account?</a>
        </div>
      `,
      error
    );
    return c.html(html);
  });
  router.post("/register", async (c) => {
    const body = await c.req.parseBody();
    const email = body.email;
    const firstName = body.firstName;
    const lastName = body.lastName;
    const redirect = body.redirect || "/";
    try {
      const existing = await config.database.customers.getByEmail(email);
      if (existing) {
        return c.redirect(`/auth/register?error=${encodeURIComponent("Email already registered")}&redirect=${encodeURIComponent(redirect)}`);
      }
      const customer = await config.database.customers.create({
        email,
        firstName,
        lastName,
        addresses: [],
        metadata: {
          // In production, store password hash here
          passwordHash: "placeholder"
        }
      });
      const sessionData = JSON.stringify({ customerId: customer.id, email: customer.email });
      const sessionCookie = Buffer.from(sessionData).toString("base64");
      c.header("Set-Cookie", `session=${sessionCookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      return c.redirect(redirect);
    } catch (err) {
      console.error("Registration error:", err);
      return c.redirect(`/auth/register?error=${encodeURIComponent("Registration failed")}&redirect=${encodeURIComponent(redirect)}`);
    }
  });
  router.get("/logout", async (c) => {
    c.header("Set-Cookie", "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return c.redirect("/");
  });
  router.get("/account", requireAuth(), async (c) => {
    const customerId = c.get("customerId");
    const customer = await config.database.customers.get(customerId);
    if (!customer) {
      return c.redirect("/auth/logout");
    }
    const orders = await config.database.orders.list({
      filters: { customerId },
      limit: 20
    });
    const html = authLayout(
      "My Account",
      `
        <h1>My Account</h1>
        <p><strong>${customer.firstName || ""} ${customer.lastName || ""}</strong></p>
        <p>${customer.email}</p>
        
        <h2>Order History</h2>
        ${orders.items.length === 0 ? "<p>No orders yet.</p>" : `
          <div style="margin-top: 16px;">
            ${orders.items.map((order) => `
              <div style="padding: 16px; border: 1px solid #eee; margin-bottom: 12px; border-radius: 4px;">
                <strong>${order.orderNumber}</strong> - ${order.status}
                <br>
                <small>${new Date(order.createdAt).toLocaleDateString()} - $${(order.total / 100).toFixed(2)}</small>
              </div>
            `).join("")}
          </div>
        `}
        
        <div class="links" style="margin-top: 24px;">
          <a href="/auth/logout">Sign Out</a>
        </div>
      `
    );
    return c.html(html);
  });
  return router;
}

// src/themes/index.ts
var defaultTypography = {
  "font-sans": 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  "font-serif": 'Georgia, Cambria, "Times New Roman", Times, serif',
  "font-mono": 'Menlo, Monaco, "Consolas", "Liberation Mono", monospace',
  "font-heading": "var(--font-sans)",
  "text-xs": "0.75rem",
  "text-sm": "0.875rem",
  "text-base": "1rem",
  "text-lg": "1.125rem",
  "text-xl": "1.25rem",
  "text-2xl": "1.5rem",
  "text-3xl": "1.875rem",
  "text-4xl": "2.25rem",
  "text-5xl": "3rem"
};
var defaultSpacing = {
  "space-1": "0.25rem",
  "space-2": "0.5rem",
  "space-3": "0.75rem",
  "space-4": "1rem",
  "space-5": "1.25rem",
  "space-6": "1.5rem",
  "space-8": "2rem",
  "space-10": "2.5rem",
  "space-12": "3rem",
  "space-16": "4rem",
  "space-20": "5rem",
  "space-24": "6rem"
};
var defaultRadii = {
  none: "0",
  sm: "0.125rem",
  DEFAULT: "0.25rem",
  md: "0.375rem",
  lg: "0.5rem",
  xl: "0.75rem",
  "2xl": "1rem",
  "3xl": "1.5rem",
  full: "9999px"
};
var defaultShadows = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)",
  inner: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
  none: "none"
};
var minimalTheme = {
  name: "minimal",
  description: "Clean, minimal design with neutral colors",
  colors: {
    primary: "#18181b",
    "primary-foreground": "#fafafa",
    secondary: "#f4f4f5",
    "secondary-foreground": "#18181b",
    accent: "#f4f4f5",
    "accent-foreground": "#18181b",
    background: "#ffffff",
    foreground: "#18181b",
    muted: "#f4f4f5",
    "muted-foreground": "#71717a",
    card: "#ffffff",
    "card-foreground": "#18181b",
    popover: "#ffffff",
    "popover-foreground": "#18181b",
    border: "#e4e4e7",
    input: "#e4e4e7",
    ring: "#18181b",
    destructive: "#ef4444",
    "destructive-foreground": "#fafafa",
    success: "#22c55e",
    "success-foreground": "#fafafa",
    warning: "#f59e0b",
    "warning-foreground": "#18181b",
    info: "#3b82f6",
    "info-foreground": "#fafafa"
  },
  dark: {
    background: "#09090b",
    foreground: "#fafafa",
    muted: "#27272a",
    "muted-foreground": "#a1a1aa",
    card: "#18181b",
    "card-foreground": "#fafafa",
    popover: "#18181b",
    "popover-foreground": "#fafafa",
    border: "#27272a",
    input: "#27272a",
    ring: "#d4d4d8",
    secondary: "#27272a",
    "secondary-foreground": "#fafafa",
    accent: "#27272a",
    "accent-foreground": "#fafafa",
    primary: "#fafafa",
    "primary-foreground": "#18181b"
  }
};
var modernTheme = {
  name: "modern",
  description: "Vibrant design with blue accents",
  colors: {
    primary: "#2563eb",
    "primary-foreground": "#ffffff",
    secondary: "#f1f5f9",
    "secondary-foreground": "#0f172a",
    accent: "#3b82f6",
    "accent-foreground": "#ffffff",
    background: "#ffffff",
    foreground: "#0f172a",
    muted: "#f1f5f9",
    "muted-foreground": "#64748b",
    card: "#ffffff",
    "card-foreground": "#0f172a",
    popover: "#ffffff",
    "popover-foreground": "#0f172a",
    border: "#e2e8f0",
    input: "#e2e8f0",
    ring: "#2563eb",
    destructive: "#ef4444",
    "destructive-foreground": "#ffffff",
    success: "#10b981",
    "success-foreground": "#ffffff",
    warning: "#f59e0b",
    "warning-foreground": "#0f172a",
    info: "#06b6d4",
    "info-foreground": "#ffffff"
  },
  dark: {
    background: "#020617",
    foreground: "#f8fafc",
    muted: "#1e293b",
    "muted-foreground": "#94a3b8",
    card: "#0f172a",
    "card-foreground": "#f8fafc",
    popover: "#0f172a",
    "popover-foreground": "#f8fafc",
    border: "#1e293b",
    input: "#1e293b",
    ring: "#60a5fa",
    secondary: "#1e293b",
    "secondary-foreground": "#f8fafc",
    accent: "#1d4ed8",
    "accent-foreground": "#ffffff",
    primary: "#60a5fa",
    "primary-foreground": "#020617"
  }
};
var boutiqueTheme = {
  name: "boutique",
  description: "Elegant design with warm tones",
  colors: {
    primary: "#7c2d12",
    "primary-foreground": "#fff7ed",
    secondary: "#fff7ed",
    "secondary-foreground": "#7c2d12",
    accent: "#c2410c",
    "accent-foreground": "#ffffff",
    background: "#fafaf9",
    foreground: "#292524",
    muted: "#f5f5f4",
    "muted-foreground": "#78716c",
    card: "#ffffff",
    "card-foreground": "#292524",
    popover: "#ffffff",
    "popover-foreground": "#292524",
    border: "#e7e5e4",
    input: "#e7e5e4",
    ring: "#7c2d12",
    destructive: "#dc2626",
    "destructive-foreground": "#fff7ed",
    success: "#16a34a",
    "success-foreground": "#fff7ed",
    warning: "#d97706",
    "warning-foreground": "#292524",
    info: "#0891b2",
    "info-foreground": "#fff7ed"
  },
  dark: {
    background: "#1c1917",
    foreground: "#fafaf9",
    muted: "#44403c",
    "muted-foreground": "#a8a29e",
    card: "#292524",
    "card-foreground": "#fafaf9",
    popover: "#292524",
    "popover-foreground": "#fafaf9",
    border: "#44403c",
    input: "#44403c",
    ring: "#c2410c",
    secondary: "#44403c",
    "secondary-foreground": "#fafaf9",
    accent: "#9a3412",
    "accent-foreground": "#ffffff",
    primary: "#c2410c",
    "primary-foreground": "#fff7ed"
  }
};
var themes = {
  minimal: minimalTheme,
  modern: modernTheme,
  boutique: boutiqueTheme
};
function generateCSSVariables(theme, mode = "light") {
  const colors = mode === "dark" && theme.dark ? { ...theme.colors, ...theme.dark } : theme.colors;
  const typography = { ...defaultTypography, ...theme.typography };
  const spacing = { ...defaultSpacing, ...theme.spacing };
  const radii = { ...defaultRadii, ...theme.radii };
  const shadows = { ...defaultShadows, ...theme.shadows };
  const lines = [];
  lines.push("  /* Colors */");
  for (const [key, value] of Object.entries(colors)) {
    lines.push(`  --${key}: ${value};`);
  }
  lines.push("\n  /* Typography */");
  for (const [key, value] of Object.entries(typography)) {
    lines.push(`  --${key}: ${value};`);
  }
  lines.push("\n  /* Spacing */");
  for (const [key, value] of Object.entries(spacing)) {
    lines.push(`  --${key}: ${value};`);
  }
  lines.push("\n  /* Border Radius */");
  for (const [key, value] of Object.entries(radii)) {
    lines.push(`  --radius-${key}: ${value};`);
  }
  lines.push("\n  /* Shadows */");
  for (const [key, value] of Object.entries(shadows)) {
    lines.push(`  --shadow-${key}: ${value};`);
  }
  return lines.join("\n");
}
function generateThemeCSS(theme) {
  const lightVars = generateCSSVariables(theme, "light");
  const darkVars = theme.dark ? generateCSSVariables(theme, "dark") : null;
  let css = `:root {
${lightVars}
}`;
  if (darkVars) {
    css += `

[data-theme="dark"] {
${darkVars}
}

@media (prefers-color-scheme: dark) {
  :root[data-theme="auto"] {
${darkVars}
  }
}`;
  }
  return css;
}
function generateInlineThemeCSS(theme, mode = "light") {
  return generateCSSVariables(theme, mode).replace(/\n  /g, "; ").replace(/^  /, "");
}
var ThemeManager = class {
  currentTheme = "minimal";
  currentMode = "auto";
  listeners = /* @__PURE__ */ new Set();
  get theme() {
    return this.currentTheme;
  }
  get mode() {
    return this.currentMode;
  }
  setTheme(name) {
    if (themes[name]) {
      this.currentTheme = name;
      this.notify();
    }
  }
  setMode(mode) {
    this.currentMode = mode;
    this.notify();
  }
  toggleDarkMode() {
    if (this.currentMode === "dark") {
      this.currentMode = "light";
    } else if (this.currentMode === "light") {
      this.currentMode = "dark";
    } else {
      this.currentMode = "dark";
    }
    this.notify();
  }
  getCurrentTheme() {
    return themes[this.currentTheme] || minimalTheme;
  }
  getEffectiveMode() {
    if (this.currentMode === "auto") {
      return "light";
    }
    return this.currentMode;
  }
  // Server-side: get data-theme attribute value
  getThemeAttribute() {
    if (this.currentMode === "dark") return "dark";
    if (this.currentMode === "light") return "light";
    return "auto";
  }
  // Subscribe to theme changes
  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  notify() {
    for (const listener of this.listeners) {
      listener(this.currentTheme, this.getThemeAttribute());
    }
  }
};
var themeManager = new ThemeManager();
function getThemeStyles(themeName = "minimal") {
  const theme = themes[themeName] || minimalTheme;
  return generateThemeCSS(theme);
}
function createTheme(name, baseTheme, overrides) {
  return {
    ...baseTheme,
    ...overrides,
    name,
    colors: { ...baseTheme.colors, ...overrides.colors },
    dark: overrides.dark ? { ...baseTheme.dark, ...overrides.dark } : baseTheme.dark
  };
}

// src/index.ts
function createHonoApp(config) {
  const app = new Hono8();
  const features = config.features || {
    variants: true,
    collections: false,
    inventoryTracking: true,
    subscriptions: false,
    multiCurrency: false
  };
  const searchService = config.search?.provider ? createSearchService2(config.search.provider) : void 0;
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    console.log(`${c.req.method} ${c.req.url} - ${c.res.status} - ${duration}ms`);
  });
  app.get("/health", (c) => c.json({
    status: "ok",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    features,
    search: config.search?.enabled ?? !!searchService
  }));
  if (config.subscriptionProvider) {
    app.route("/api/subscriptions", createSubscriptionRoutes({
      database: config.database,
      subscriptionProvider: config.subscriptionProvider
    }));
  }
  if (searchService) {
    app.route("/api/search", createSearchRoutes(config.search));
  }
  app.route("/api/products", createProductRoutes(config.database, searchService));
  if (config.enableAdmin !== false) {
    const adminPath = config.adminPath || "/admin";
    app.route(adminPath, createAdminRoutes({
      database: config.database,
      basePath: adminPath,
      features,
      searchService
    }));
  }
  return app;
}
export {
  Hono8 as Hono,
  ThemeManager,
  boutiqueTheme,
  createAdminRoutes,
  createAuthRoutes,
  createHonoApp,
  createOrderFromPayPalCapture,
  createOrderFromStripeSession,
  createPayPalWebhookRoutes,
  createProductRoutes,
  createSearchProvider,
  createSessionMiddleware,
  createSubscriptionRoutes,
  createTheme,
  createWebhookRoutes,
  decrementInventoryForOrder,
  defaultRadii,
  defaultShadows,
  defaultSpacing,
  defaultTypography,
  generateCSSVariables,
  generateInlineThemeCSS,
  generateThemeCSS,
  getThemeStyles,
  minimalTheme,
  modernTheme,
  requireAuth,
  themeManager,
  themes
};
