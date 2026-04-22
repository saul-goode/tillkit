// src/index.ts
import PocketBase from "pocketbase";
function pocketbaseAdapter(config) {
  const pb = new PocketBase(config.url);
  if (config.adminToken) {
    pb.authStore.save(config.adminToken, null);
  }
  return {
    // Products
    products: {
      async list(options) {
        const page = Math.floor((options?.offset || 0) / (options?.limit || 50)) + 1;
        const result = await pb.collection("products").getList(page, options?.limit || 50, {
          sort: options?.sort ? `${options.order === "desc" ? "-" : ""}${options.sort}` : "-created",
          filter: options?.filters ? buildFilter(options.filters) : void 0
        });
        return {
          items: result.items,
          total: result.totalItems,
          page: result.page,
          perPage: result.perPage,
          hasMore: result.page < result.totalPages
        };
      },
      async get(id) {
        try {
          const record = await pb.collection("products").getOne(id);
          return record;
        } catch {
          return null;
        }
      },
      async getBySlug(slug) {
        try {
          const records = await pb.collection("products").getFullList({
            filter: `slug="${escapeFilter(slug)}"`,
            limit: 1
          });
          return records[0];
        } catch {
          return null;
        }
      },
      async create(data) {
        const record = await pb.collection("products").create(data);
        return record;
      },
      async update(id, data) {
        const record = await pb.collection("products").update(id, data);
        return record;
      },
      async delete(id) {
        await pb.collection("products").delete(id);
      },
      async search(query) {
        const results = await pb.collection("products").getFullList({
          filter: `name~"${escapeFilter(query)}" || description~"${escapeFilter(query)}"`
        });
        return results;
      }
    },
    // Cart
    cart: {
      async get(sessionId) {
        try {
          const records = await pb.collection("carts").getFullList({
            filter: `sessionId="${escapeFilter(sessionId)}"`,
            expand: "items",
            limit: 1
          });
          return records[0];
        } catch {
          return null;
        }
      },
      async create(sessionId) {
        const record = await pb.collection("carts").create({
          sessionId,
          items: [],
          subtotal: 0,
          totalTax: 0,
          totalShipping: 0,
          total: 0,
          currency: "USD"
        });
        return record;
      },
      async update(sessionId, updates) {
        const cart = await this.get(sessionId);
        if (!cart) throw new Error("Cart not found");
        const record = await pb.collection("carts").update(cart.id, updates);
        return record;
      },
      async addItem(sessionId, item) {
        const cart = await this.get(sessionId);
        if (!cart) throw new Error("Cart not found");
        await pb.collection("cart_items").create({
          cart: cart.id,
          ...item
        });
        return this.get(sessionId);
      },
      async updateItem(sessionId, itemId, quantity) {
        const cart = await this.get(sessionId);
        if (!cart) throw new Error("Cart not found");
        if (quantity <= 0) {
          await pb.collection("cart_items").delete(itemId);
        } else {
          await pb.collection("cart_items").update(itemId, { quantity });
        }
        return this.get(sessionId);
      },
      async removeItem(sessionId, itemId) {
        const cart = await this.get(sessionId);
        if (!cart) throw new Error("Cart not found");
        await pb.collection("cart_items").delete(itemId);
        return this.get(sessionId);
      },
      async clear(sessionId) {
        const cart = await this.get(sessionId);
        if (!cart) return;
        const items = await pb.collection("cart_items").getFullList({
          filter: `cart="${cart.id}"`
        });
        await Promise.all(items.map((item) => pb.collection("cart_items").delete(item.id)));
      }
    },
    // Orders
    orders: {
      async list(options) {
        const page = Math.floor((options?.offset || 0) / (options?.limit || 50)) + 1;
        const result = await pb.collection("orders").getList(page, options?.limit || 50, {
          sort: options?.sort ? `${options.order === "desc" ? "-" : ""}${options.sort}` : "-created",
          expand: "items,transactions"
        });
        return {
          items: result.items,
          total: result.totalItems,
          page: result.page,
          perPage: result.perPage,
          hasMore: result.page < result.totalPages
        };
      },
      async get(id) {
        try {
          const record = await pb.collection("orders").getOne(id, {
            expand: "items,transactions"
          });
          return record;
        } catch {
          return null;
        }
      },
      async getByNumber(orderNumber) {
        try {
          const records = await pb.collection("orders").getFullList({
            filter: `orderNumber="${escapeFilter(orderNumber)}"`,
            expand: "items,transactions",
            limit: 1
          });
          return records[0];
        } catch {
          return null;
        }
      },
      async create(data) {
        const date = /* @__PURE__ */ new Date();
        const orderNumber = `TK-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const record = await pb.collection("orders").create({
          ...data,
          orderNumber,
          status: data.status || "pending",
          paymentStatus: data.paymentStatus || "pending",
          fulfillmentStatus: data.fulfillmentStatus || "unfulfilled"
        });
        return record;
      },
      async update(id, data) {
        const record = await pb.collection("orders").update(id, data);
        return record;
      },
      async addTransaction(orderId, transaction) {
        await pb.collection("transactions").create({
          ...transaction,
          order: orderId
        });
        return this.get(orderId);
      },
      async updateStatus(id, status) {
        const record = await pb.collection("orders").update(id, { status });
        return record;
      }
    },
    // Customers
    customers: {
      async get(id) {
        try {
          const record = await pb.collection("customers").getOne(id, {
            expand: "addresses"
          });
          return record;
        } catch {
          return null;
        }
      },
      async getByEmail(email) {
        try {
          const records = await pb.collection("customers").getFullList({
            filter: `email="${escapeFilter(email)}"`,
            expand: "addresses",
            limit: 1
          });
          return records[0];
        } catch {
          return null;
        }
      },
      async create(data) {
        const record = await pb.collection("customers").create(data);
        return record;
      },
      async update(id, data) {
        const record = await pb.collection("customers").update(id, data);
        return record;
      },
      async addAddress(customerId, address) {
        await pb.collection("addresses").create({
          ...address,
          customer: customerId
        });
        const customer = await this.get(customerId);
        if (!customer) throw new Error("Customer not found");
        return customer;
      }
    },
    // Setup — create collections based on enabled features
    async setup(features) {
      const createdCollections = [];
      let created = false;
      async function collectionExists(name) {
        try {
          await pb.collections.getOne(name);
          return true;
        } catch {
          return false;
        }
      }
      if (!await collectionExists("products")) {
        const fields = [
          { name: "slug", type: "text", required: true, unique: true },
          { name: "name", type: "text", required: true },
          { name: "description", type: "text" },
          { name: "price", type: "number", required: true },
          { name: "compareAtPrice", type: "number" },
          { name: "images", type: "json" },
          { name: "inventory", type: "json" },
          { name: "seo", type: "json" },
          { name: "metadata", type: "json" },
          { name: "status", type: "select", required: true, values: ["draft", "active", "archived"] }
        ];
        if (features.variants) {
          fields.push({ name: "variants", type: "json" });
          fields.push({ name: "options", type: "json" });
        }
        await pb.collections.create({ name: "products", type: "base", schema: fields });
        createdCollections.push("products");
        created = true;
      }
      if (features.collections && !await collectionExists("collections")) {
        await pb.collections.create({
          name: "collections",
          type: "base",
          schema: [
            { name: "slug", type: "text", required: true, unique: true },
            { name: "name", type: "text", required: true },
            { name: "description", type: "text" },
            { name: "image", type: "json" },
            { name: "seo", type: "json" },
            { name: "sortOrder", type: "number", required: true }
          ]
        });
        createdCollections.push("collections");
        created = true;
      }
      if (!await collectionExists("carts")) {
        await pb.collections.create({
          name: "carts",
          type: "base",
          schema: [
            { name: "sessionId", type: "text", required: true },
            { name: "customerId", type: "text" },
            { name: "items", type: "json" },
            { name: "subtotal", type: "number" },
            { name: "totalTax", type: "number" },
            { name: "totalShipping", type: "number" },
            { name: "totalDiscount", type: "number" },
            { name: "total", type: "number" },
            { name: "currency", type: "text" }
          ]
        });
        createdCollections.push("carts");
        created = true;
      }
      if (!await collectionExists("orders")) {
        await pb.collections.create({
          name: "orders",
          type: "base",
          schema: [
            { name: "orderNumber", type: "text", required: true, unique: true },
            { name: "customerId", type: "text" },
            { name: "email", type: "text", required: true },
            { name: "status", type: "select", required: true, values: ["pending", "confirmed", "paid", "fulfilled", "shipped", "delivered", "cancelled", "refunded"] },
            { name: "paymentStatus", type: "select", required: true, values: ["pending", "authorized", "paid", "partially_refunded", "refunded", "failed"] },
            { name: "fulfillmentStatus", type: "select", required: true, values: ["unfulfilled", "partially_fulfilled", "fulfilled", "returned"] },
            { name: "items", type: "json" },
            { name: "subtotal", type: "number" },
            { name: "totalTax", type: "number" },
            { name: "totalShipping", type: "number" },
            { name: "totalDiscount", type: "number" },
            { name: "total", type: "number" },
            { name: "currency", type: "text" },
            { name: "shippingAddress", type: "json" },
            { name: "billingAddress", type: "json" },
            { name: "transactions", type: "json" },
            { name: "notes", type: "text" },
            { name: "metadata", type: "json" }
          ]
        });
        createdCollections.push("orders");
        created = true;
      }
      if (!await collectionExists("customers")) {
        await pb.collections.create({
          name: "customers",
          type: "base",
          schema: [
            { name: "email", type: "email", required: true },
            { name: "firstName", type: "text" },
            { name: "lastName", type: "text" },
            { name: "phone", type: "text" },
            { name: "addresses", type: "json" },
            { name: "defaultAddressId", type: "text" },
            { name: "metadata", type: "json" }
          ]
        });
        createdCollections.push("customers");
        created = true;
      }
      return { created, createdCollections };
    }
  };
}
function buildFilter(filters) {
  return Object.entries(filters).map(([key, value]) => {
    if (typeof value === "string") {
      return `${key}="${escapeFilter(value)}"`;
    }
    return `${key}=${value}`;
  }).join(" && ");
}
function escapeFilter(value) {
  return value.replace(/"/g, '\\"');
}
export {
  pocketbaseAdapter
};
