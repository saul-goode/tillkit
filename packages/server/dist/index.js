// src/index.ts
import { Hono as Hono5 } from "hono";

// src/routes/products.ts
import { Hono } from "hono";
function createProductRoutes(db) {
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
    return c.json({ product }, 201);
  });
  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const data = await c.req.json();
    const product = await db.products.update(id, data);
    return c.json({ product });
  });
  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    await db.products.delete(id);
    return c.json({ success: true });
  });
  return app;
}

// src/routes/admin.ts
import { Hono as Hono2 } from "hono";
import { formatPrice } from "@tillkit/core";
var adminLayout = (title, content) => `<!DOCTYPE html>
<html data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title} - TillKit Admin</title>
  <link rel="stylesheet" href="https://unpkg.com/@picocss/pico@2/css/pico.min.css">
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <style>
    :root { --pico-font-family-sans-serif: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    aside nav a { text-decoration:none; }
    .status-badge { display:inline-block; padding:.25rem .5rem; border-radius:4px; font-size:.75rem; font-weight:500; text-transform:uppercase; }
    .status-pending,.status-draft { background:var(--pico-background-color); color:var(--pico-muted-color); }
    .status-active,.status-paid,.status-success { background:#e6f4ea; color:#1e8e3e; }
    .status-shipped,.status-confirmed { background:#e8f0fe; color:#1967d2; }
    .status-delivered,.status-fulfilled { background:#fce8e6; color:#c5221f; }
    .status-cancelled,.status-archived,.status-failure { background:var(--pico-contrast); color:var(--pico-background-color); }
    .admin-table th,.admin-table td{ padding:.75rem 1rem; }
    .admin-table tbody tr:hover{ background:var(--pico-muted-border-color); }
    .inline-edit{ border:none; background:transparent; width:100%; padding:.5rem; }
    .inline-edit:focus{ outline:2px solid var(--pico-primary-focus); }
  </style>
</head>
<body>
<div class="container-fluid">
  <nav style="margin-bottom:2rem;">
    <ul><li><strong>TillKit</strong></li></ul>
    <ul><li><a href="/">Store</a></li></ul>
  </nav>
  <div class="grid">
    <aside style="min-width:200px;max-width:240px; padding-right:2rem;">
      <details open>
        <summary style="font-weight:600;margin-bottom:.5rem;list-style:none;">Menu</summary>
        <nav>
          <ul>
            <li><a href="/admin">Dashboard</a></li>
            <li><details><summary>Products</summary>
              <ul><li><a href="/admin/products">All Products</a></li><li><a href="/admin/products/new">Add Product</a></li></ul>
            </details></li>
            <li><a href="/admin/orders">Orders</a></li>
            <li><details><summary>Design</summary>
              <ul><li><a href="/admin/settings">Settings</a></li></ul>
            </details></li>
          </ul>
        </nav>
      </details>
    </aside>
    <main>${content}</main>
  </div>
</div>
</body>
</html>`;
function priceInput(val) {
  if (!val) return "";
  return (val / 100).toFixed(2);
}
function priceCents(raw) {
  return Math.round(parseFloat(raw) * 100);
}
function createAdminRoutes(config) {
  const { database, basePath = "/admin", features } = config;
  const router = new Hono2();
  router.get("/", async (c) => {
    const orders = await database.orders.list({ limit: 100 });
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = orders.items.filter((o) => new Date(o.createdAt) >= today);
    const totalRevenue = orders.items.reduce((sum, o) => sum + (o.status === "cancelled" ? 0 : o.total), 0);
    const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.status === "cancelled" ? 0 : o.total), 0);
    return c.html(adminLayout("Dashboard", `
      <h1>Dashboard</h1>
      <div class="grid" style="margin-bottom:2rem;">
        <article><h6 class="muted">Today's Revenue</h6><h2>${formatPrice(todayRevenue, "USD")}</h2></article>
        <article><h6 class="muted">Today's Orders</h6><h2>${todayOrders.length}</h2></article>
        <article><h6 class="muted">Total Revenue</h6><h2>${formatPrice(totalRevenue, "USD")}</h2></article>
        <article><h6 class="muted">Total Orders</h6><h2>${orders.total}</h2></article>
      </div>
      <div class="grid">
        <a href="${basePath}/orders" role="button" class="outline">
          <h4>\u{1F4CB} Orders</h4><p class="muted">${orders.total} total</p>
        </a>
        <a href="${basePath}/products" role="button" class="outline">
          <h4>\u{1F6CD}\uFE0F Products</h4><p class="muted">Manage products</p>
        </a>
      </div>
    `));
  });
  router.get("/products", async (c) => {
    const page = parseInt(c.req.query("page") || "1", 10);
    const status = c.req.query("status");
    const perPage = 20;
    const result = await database.products.list({
      limit: perPage,
      offset: (page - 1) * perPage,
      filters: status ? { status } : void 0
    });
    return c.html(adminLayout("Products", `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h1>Products</h1>
        <a href="${basePath}/products/new" role="button">+ Add Product</a>
      </div>
      <div style="display:flex;gap:.5rem;margin:1rem 0;">
        <a href="${basePath}/products" class="${!status ? "contrast" : ""}" style="text-decoration:none;">All</a>
        <a href="${basePath}/products?status=draft" class="${status === "draft" ? "contrast" : ""}" style="text-decoration:none;">Draft</a>
        <a href="${basePath}/products?status=active" class="${status === "active" ? "contrast" : ""}" style="text-decoration:none;">Active</a>
        <a href="${basePath}/products?status=archived" class="${status === "archived" ? "contrast" : ""}" style="text-decoration:none;">Archived</a>
      </div>
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Slug</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${result.items.map((p) => `
            <tr>
              <td><a href="${basePath}/products/${p.id}">${p.name}</a></td>
              <td>${p.slug}</td>
              <td>${formatPrice(p.price, "USD")}</td>
              <td><span class="status-badge status-${p.status}">${p.status}</span></td>
              <td>
                <a href="${basePath}/products/${p.id}" role="button" class="outline secondary" style="padding:.25rem .5rem;font-size:.75rem;">Edit</a>
                <button hx-delete="${basePath}/products/${p.id}" hx-confirm="Delete this product?" hx-target="closest tr" hx-swap="outerHTML" class="outline" style="padding:.25rem .5rem;font-size:.75rem;">Delete</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div style="display:flex;justify-content:center;gap:1rem;margin-top:1rem;">
        ${page > 1 ? `<a href="${basePath}/products?page=${page - 1}${status ? `&status=${status}` : ""}">\u2190 Previous</a>` : ""}
        ${result.hasMore ? `<a href="${basePath}/products?page=${page + 1}${status ? `&status=${status}` : ""}">Next \u2192</a>` : ""}
      </div>
    `));
  });
  router.get("/products/new", async (c) => {
    return c.html(adminLayout("New Product", productForm({ basePath, product: null, features })));
  });
  router.post("/products", async (c) => {
    const body = await c.req.parseBody();
    const data = buildProductInput(body, features);
    try {
      const product = await database.products.create(data);
      return c.redirect(`${basePath}/products/${product.id}`);
    } catch (err) {
      console.error("Failed to create product:", err);
      return c.html(adminLayout("Error", `<p class="text-red">Failed to create product.</p>`), 500);
    }
  });
  router.get("/products/:id", async (c) => {
    const id = c.req.param("id");
    const product = await database.products.get(id);
    if (!product) return c.notFound();
    return c.html(adminLayout(product.name, productForm({ basePath, product, features })));
  });
  router.post("/products/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.parseBody();
    const data = buildProductInput(body, features);
    try {
      await database.products.update(id, data);
      return c.redirect(`${basePath}/products/${id}`);
    } catch (err) {
      console.error("Failed to update product:", err);
      return c.html(adminLayout("Error", `<p class="text-red">Failed to update product.</p>`), 500);
    }
  });
  router.delete("/products/:id", async (c) => {
    const id = c.req.param("id");
    try {
      await database.products.delete(id);
      return c.body("");
    } catch (err) {
      console.error("Failed to delete product:", err);
      return c.html('<p class="text-red">Delete failed</p>', 500);
    }
  });
  router.get("/orders", async (c) => {
    const page = parseInt(c.req.query("page") || "1", 10);
    const status = c.req.query("status");
    const perPage = 20;
    const result = await database.orders.list({
      limit: perPage,
      offset: (page - 1) * perPage,
      filters: status ? { status } : void 0
    });
    return c.html(adminLayout("Orders", `
      <h1>Orders</h1>
      <div style="display:flex;gap:.5rem;margin:1rem 0;">
        <a href="${basePath}/orders" class="${!status ? "contrast" : ""}" style="text-decoration:none;">All</a>
        <a href="${basePath}/orders?status=pending" class="${status === "pending" ? "contrast" : ""}" style="text-decoration:none;">Pending</a>
        <a href="${basePath}/orders?status=paid" class="${status === "paid" ? "contrast" : ""}" style="text-decoration:none;">Paid</a>
        <a href="${basePath}/orders?status=shipped" class="${status === "shipped" ? "contrast" : ""}" style="text-decoration:none;">Shipped</a>
        <a href="${basePath}/orders?status=delivered" class="${status === "delivered" ? "contrast" : ""}" style="text-decoration:none;">Delivered</a>
      </div>
      <table class="admin-table">
        <thead><tr><th>Order #</th><th>Date</th><th>Email</th><th>Status</th><th>Total</th></tr></thead>
        <tbody>
          ${result.items.map((o) => `
            <tr>
              <td><a href="${basePath}/orders/${o.id}">${o.orderNumber}</a></td>
              <td>${new Date(o.createdAt).toLocaleDateString()}</td>
              <td>${o.email}</td>
              <td><span class="status-badge status-${o.status}">${o.status}</span></td>
              <td>${formatPrice(o.total, o.currency)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div style="display:flex;justify-content:center;gap:1rem;margin-top:1rem;">
        ${page > 1 ? `<a href="${basePath}/orders?page=${page - 1}${status ? `&status=${status}` : ""}">\u2190 Previous</a>` : ""}
        ${result.hasMore ? `<a href="${basePath}/orders?page=${page + 1}${status ? `&status=${status}` : ""}">Next \u2192</a>` : ""}
      </div>
    `));
  });
  router.get("/orders/:id", async (c) => {
    const id = c.req.param("id");
    const order = await database.orders.get(id);
    if (!order) return c.html(adminLayout("Not Found", `<p>Order not found.</p>`), 404);
    return c.html(adminLayout(`Order ${order.orderNumber}`, `
      <div style="display:flex;justify-content:space-between;align-items:center; margin-bottom:1rem;">
        <h1>Order ${order.orderNumber}</h1>
        <a href="${basePath}/orders" role="button" class="outline">\u2190 Back</a>
      </div>
      <article>
        <h4>Order Status</h4>
        <form method="post" action="${basePath}/orders/${order.id}/status">
          <select name="status" style="display:inline-block;width:auto;margin-right:.5rem;">
            <option value="pending" ${order.status === "pending" ? "selected" : ""}>Pending</option>
            <option value="confirmed" ${order.status === "confirmed" ? "selected" : ""}>Confirmed</option>
            <option value="paid" ${order.status === "paid" ? "selected" : ""}>Paid</option>
            <option value="fulfilled" ${order.status === "fulfilled" ? "selected" : ""}>Fulfilled</option>
            <option value="shipped" ${order.status === "shipped" ? "selected" : ""}>Shipped</option>
            <option value="delivered" ${order.status === "delivered" ? "selected" : ""}>Delivered</option>
            <option value="cancelled" ${order.status === "cancelled" ? "selected" : ""}>Cancelled</option>
            <option value="refunded" ${order.status === "refunded" ? "selected" : ""}>Refunded</option>
          </select>
          <button type="submit">Update</button>
        </form>
      </article>
      <article style="margin-top:1rem;">
        <h4>Customer</h4>
        <p><strong>Email:</strong> ${order.email}</p>
        ${order.customerId ? `<p><strong>Customer:</strong> ${order.customerId}</p>` : ""}
      </article>
      ${order.shippingAddress ? `
      <article style="margin-top:1rem;">
        <h4>Shipping Address</h4>
        <p>${order.shippingAddress.address1}</p>
        <p>${order.shippingAddress.city}, ${order.shippingAddress.province || ""} ${order.shippingAddress.postalCode}</p>
        <p>${order.shippingAddress.country}</p>
      </article>` : ""}
      <article style="margin-top:1rem;">
        <h4>Items</h4>
        <table class="admin-table">
          <thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody>
            ${order.items.map((i) => `
              <tr><td>${i.name}</td><td>${i.sku}</td><td>${formatPrice(i.price, order.currency)}</td><td>${i.quantity}</td><td>${formatPrice(i.total, order.currency)}</td></tr>
            `).join("")}
          </tbody>
        </table>
      </article>
      <article style="margin-top:1rem;">
        <h4>Totals</h4>
        <p><strong>Subtotal:</strong> ${formatPrice(order.subtotal, order.currency)}</p>
        <p><strong>Tax:</strong> ${formatPrice(order.totalTax, order.currency)}</p>
        <p><strong>Shipping:</strong> ${formatPrice(order.totalShipping, order.currency)}</p>
        ${order.totalDiscount ? `<p><strong>Discount:</strong> -${formatPrice(order.totalDiscount, order.currency)}</p>` : ""}
        <p><strong>Total:</strong> ${formatPrice(order.total, order.currency)}</p>
      </article>
    `));
  });
  router.post("/orders/:id/status", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.parseBody();
    const status = body.status;
    try {
      await database.orders.updateStatus(id, status);
    } catch (err) {
      console.error("Status update failed", err);
    }
    return c.redirect(`${basePath}/orders/${id}`);
  });
  return router;
}
function productForm(opts) {
  const { product, features, basePath } = opts;
  const isNew = !product;
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h1>${isNew ? "New Product" : product.name}</h1>
      <a href="${basePath}/products" role="button" class="outline">Cancel</a>
    </div>
    <form method="post" action="${basePath}/products${!isNew ? "/" + product.id : ""}" style="margin-top:1rem;">
      <fieldset>
        <label>
          Name
          <input name="name" type="text" value="${escapeHtml(product?.name || "")}" required
                 onchange="if(!this.form.slug.value){this.form.slug.value=slugify(this.value);}">
        </label>
        <label>
          Slug
          <input name="slug" type="text" value="${escapeHtml(product?.slug || "")}" required>
        </label>
        <label>
          Description
          <textarea name="description" rows="4">${escapeHtml(product?.description || "")}</textarea>
        </label>
        <div class="grid">
          <label>
            Price ($)
            <input name="price_dollars" type="number" step="0.01" min="0" required
                   value="${priceInput(product?.price)}">
          </label>
          <label>
            Compare-at Price ($)
            <input name="compare_at_price_dollars" type="number" step="0.01" min="0"
                   value="${priceInput(product?.compareAtPrice)}">
          </label>
          <label>
            Status
            <select name="status">
              <option value="draft" ${product?.status === "draft" ? "selected" : ""}>Draft</option>
              <option value="active" ${product?.status === "active" ? "selected" : ""}>Active</option>
              <option value="archived" ${product?.status === "archived" ? "selected" : ""}>Archived</option>
            </select>
          </label>
        </div>
      </fieldset>

      ${features.inventoryTracking ? `
        <fieldset>
          <legend>Inventory</legend>
          <div class="grid">
            <label>
              Quantity
              <input name="inventory_quantity" type="number" min="0" value="${product?.inventory?.quantity ?? 0}">
            </label>
            <label>
              Allow out of stock?
              <select name="inventory_allow_oos">
                <option value="false" ${!product?.inventory?.allowOutOfStock && product?.inventory ? "selected" : ""}>No</option>
                <option value="true" ${product?.inventory?.allowOutOfStock ? "selected" : ""}>Yes</option>
              </select>
            </label>
          </div>
        </fieldset>
      ` : ""}

      ${features.variants ? `
        <fieldset>
          <legend>Variants</legend>
          <p class="muted">Enter variant options as JSON (e.g. [{"name":"Size","values":["S","M","L"]}])</p>
          <label>
            Options
            <textarea name="options_json" rows="3">${escapeHtml(JSON.stringify(product?.options || []))}</textarea>
          </label>
          <p class="muted">Enter variants as JSON (e.g. [{"sku":"SHIRT-RED-S","name":"Red / S","price":null,"options":{"Color":"Red","Size":"S"}}])</p>
          <label>
            Variants
            <textarea name="variants_json" rows="6">${escapeHtml(JSON.stringify(product?.variants || []))}</textarea>
          </label>
        </fieldset>
      ` : ""}

      <fieldset>
        <legend>Images</legend>
        <p class="muted">Enter image URLs as JSON (e.g. [{"url":"https://cdn.example.com/img.jpg","alt":"Photo"}])</p>
        <label>
          Images
          <textarea name="images_json" rows="3">${escapeHtml(JSON.stringify(product?.images || []))}</textarea>
        </label>
      </fieldset>

      <fieldset>
        <legend>SEO</legend>
        <label>Title <input name="seo_title" type="text" value="${escapeHtml(product?.seo?.title || "")}"></label>
        <label>Description <textarea name="seo_description" rows="2">${escapeHtml(product?.seo?.description || "")}</textarea></label>
        <label>Keywords (comma separated)
          <input name="seo_keywords" type="text" value="${escapeHtml((product?.seo?.keywords || []).join(", "))}">
        </label>
      </fieldset>

      <div style="display:flex;gap:1rem;margin-top:1rem;">
        <button type="submit">${isNew ? "Create Product" : "Save Changes"}</button>
        ${!isNew ? `<button type="button" hx-delete="${basePath}/products/${product.id}" hx-confirm="Delete this product?" hx-redirect="${basePath}/products" class="outline secondary">Delete</button>` : ""}
      </div>
    </form>
    ${isNew ? '<script>function slugify(t){return t.toLowerCase().trim().replace(/[^\\w\\s-]/g,"").replace(/[\\s_-]+/g,"-").replace(/^-+|-+$/g,"");}</script>' : ""}
  `;
}
function buildProductInput(body, features) {
  const images = safeJsonParse(body.images_json, []);
  const seo = {};
  if (body.seo_title) seo.title = body.seo_title;
  if (body.seo_description) seo.description = body.seo_description;
  if (body.seo_keywords) seo.keywords = body.seo_keywords.split(",").map((s) => s.trim()).filter(Boolean);
  const data = {
    slug: body.slug,
    name: body.name,
    description: body.description || void 0,
    price: priceCents(body.price_dollars),
    compareAtPrice: body.compare_at_price_dollars ? priceCents(body.compare_at_price_dollars) : void 0,
    images,
    status: body.status,
    seo: Object.keys(seo).length ? seo : void 0
  };
  if (features.inventoryTracking) {
    data.inventory = {
      quantity: parseInt(body.inventory_quantity || "0", 10),
      available: parseInt(body.inventory_quantity || "0", 10),
      allowOutOfStock: body.inventory_allow_oos === "true"
    };
  }
  if (features.variants) {
    data.options = safeJsonParse(body.options_json, []);
    data.variants = safeJsonParse(body.variants_json, []);
  }
  return data;
}
function safeJsonParse(str, fallback) {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch {
    return fallback;
  }
}
function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// src/routes/webhooks.ts
import { Hono as Hono3 } from "hono";
function createWebhookRoutes(config) {
  const router = new Hono3();
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
  getSessionIdFn
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
    console.log("Order created:", order.orderNumber);
    return order.id;
  } catch (err) {
    console.error("Failed to create order from session:", err);
    return null;
  }
}

// src/routes/auth.ts
import { Hono as Hono4 } from "hono";
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
  const router = new Hono4();
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
  const app = new Hono5();
  const features = config.features || {
    variants: true,
    collections: false,
    inventoryTracking: true,
    subscriptions: false,
    multiCurrency: false
  };
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    console.log(`${c.req.method} ${c.req.url} - ${c.res.status} - ${duration}ms`);
  });
  app.get("/health", (c) => c.json({
    status: "ok",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    features
  }));
  app.route("/api/products", createProductRoutes(config.database));
  if (config.enableAdmin !== false) {
    const adminPath = config.adminPath || "/admin";
    app.route(adminPath, createAdminRoutes({
      database: config.database,
      basePath: adminPath,
      features
    }));
  }
  return app;
}
export {
  Hono5 as Hono,
  ThemeManager,
  boutiqueTheme,
  createAdminRoutes,
  createAuthRoutes,
  createHonoApp,
  createOrderFromStripeSession,
  createProductRoutes,
  createSessionMiddleware,
  createTheme,
  createWebhookRoutes,
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
