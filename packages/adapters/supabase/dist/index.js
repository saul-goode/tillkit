// src/index.ts
import { createClient } from "@supabase/supabase-js";
function supabaseAdapter(config) {
  const supabase = createClient(config.url, config.serviceKey);
  return {
    // Products
    products: {
      async list(options) {
        let query = supabase.from("products").select("*", { count: "exact" });
        if (options?.filters) {
          Object.entries(options.filters).forEach(([key, value]) => {
            query = query.eq(key, value);
          });
        }
        if (options?.sort) {
          query = query.order(options.sort, {
            ascending: options.order !== "desc"
          });
        } else {
          query = query.order("created_at", { ascending: false });
        }
        const { data, error, count } = await query.range(options?.offset || 0, (options?.offset || 0) + (options?.limit || 50) - 1);
        if (error) throw error;
        return {
          items: (data || []).map(transformProduct),
          total: count || 0,
          page: Math.floor((options?.offset || 0) / (options?.limit || 50)) + 1,
          perPage: options?.limit || 50,
          hasMore: (data?.length || 0) === (options?.limit || 50)
        };
      },
      async get(id) {
        const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
        if (error || !data) return null;
        return transformProduct(data);
      },
      async getBySlug(slug) {
        const { data, error } = await supabase.from("products").select("*").eq("slug", slug).single();
        if (error || !data) return null;
        return transformProduct(data);
      },
      async create(data) {
        const { data: record, error } = await supabase.from("products").insert(supabaseProductInput(data)).select().single();
        if (error) throw error;
        return transformProduct(record);
      },
      async update(id, data) {
        const { data: record, error } = await supabase.from("products").update(supabaseProductInput(data)).eq("id", id).select().single();
        if (error) throw error;
        return transformProduct(record);
      },
      async delete(id) {
        const { error } = await supabase.from("products").delete().eq("id", id);
        if (error) throw error;
      },
      async search(query) {
        const { data, error } = await supabase.from("products").select("*").or(`name.ilike.%${query}%,description.ilike.%${query}%`);
        if (error) throw error;
        return (data || []).map(transformProduct);
      }
    },
    // Cart
    cart: {
      async get(sessionId) {
        const { data: cart, error } = await supabase.from("carts").select("*,cart_items(*)").eq("session_id", sessionId).single();
        if (error || !cart) return null;
        return {
          ...cart,
          items: cart.cart_items || [],
          id: cart.id,
          sessionId: cart.session_id,
          currency: cart.currency || "USD",
          subtotal: cart.subtotal || 0,
          totalTax: cart.total_tax || 0,
          totalShipping: cart.total_shipping || 0,
          total: cart.total || 0,
          createdAt: new Date(cart.created_at),
          updatedAt: new Date(cart.updated_at)
        };
      },
      async create(sessionId) {
        const { data, error } = await supabase.from("carts").insert({
          session_id: sessionId,
          currency: "USD",
          subtotal: 0,
          total: 0
        }).select().single();
        if (error) throw error;
        return {
          ...data,
          items: [],
          id: data.id,
          sessionId: data.session_id,
          currency: data.currency || "USD",
          subtotal: data.subtotal || 0,
          totalTax: data.total_tax || 0,
          totalShipping: data.total_shipping || 0,
          total: data.total || 0,
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at)
        };
      },
      async update(sessionId, updates) {
        const { data, error } = await supabase.from("carts").update({
          ...updates,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }).eq("session_id", sessionId).select().single();
        if (error) throw error;
        return data;
      },
      async addItem(sessionId, item) {
        const cart = await this.get(sessionId);
        if (!cart) throw new Error("Cart not found");
        const { error } = await supabase.from("cart_items").insert({
          cart_id: cart.id,
          product_id: item.productId,
          name: item.name,
          sku: item.sku,
          price: item.price,
          quantity: item.quantity,
          image: item.image,
          line_total: item.price * item.quantity
        });
        if (error) throw error;
        return this.get(sessionId);
      },
      async updateItem(sessionId, itemId, quantity) {
        const cart = await this.get(sessionId);
        if (!cart) throw new Error("Cart not found");
        if (quantity === 0) {
          return this.removeItem(sessionId, itemId);
        }
        const { error } = await supabase.from("cart_items").update({ quantity, line_total: quantity * 100 }).eq("id", itemId);
        if (error) throw error;
        return this.get(sessionId);
      },
      async removeItem(sessionId, itemId) {
        const { error } = await supabase.from("cart_items").delete().eq("id", itemId);
        if (error) throw error;
        return this.get(sessionId);
      },
      async clear(sessionId) {
        const cart = await this.get(sessionId);
        if (!cart) return;
        await supabase.from("cart_items").delete().eq("cart_id", cart.id);
      }
    },
    // Orders
    orders: {
      async list(options) {
        let query = supabase.from("orders").select("*, order_items(*), transactions(*)", { count: "exact" });
        if (options?.filters) {
          Object.entries(options.filters).forEach(([key, value]) => {
            query = query.eq(key, value);
          });
        }
        const { data, error, count } = await query.order("created_at", { ascending: false }).range(options?.offset || 0, (options?.offset || 0) + (options?.limit || 50) - 1);
        if (error) throw error;
        return {
          items: (data || []).map(transformOrder),
          total: count || 0,
          page: Math.floor((options?.offset || 0) / (options?.limit || 50)) + 1,
          perPage: options?.limit || 50,
          hasMore: (data?.length || 0) === (options?.limit || 50)
        };
      },
      async get(id) {
        const { data, error } = await supabase.from("orders").select("*, order_items(*), transactions(*)").eq("id", id).single();
        if (error || !data) return null;
        return transformOrder(data);
      },
      async getByNumber(orderNumber) {
        const { data, error } = await supabase.from("orders").select("*, order_items(*), transactions(*)").eq("order_number", orderNumber).single();
        if (error || !data) return null;
        return transformOrder(data);
      },
      async create(data) {
        const date = /* @__PURE__ */ new Date();
        const orderNumber = `TK-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const { data: record, error } = await supabase.from("orders").insert({
          order_number: orderNumber,
          email: data.email,
          status: data.status || "pending",
          payment_status: data.paymentStatus || "pending",
          fulfillment_status: data.fulfillmentStatus || "unfulfilled",
          subtotal: data.subtotal || 0,
          total_tax: data.totalTax || 0,
          total_shipping: data.totalShipping || 0,
          total_discount: data.totalDiscount || 0,
          total: data.total || 0,
          currency: data.currency || "USD",
          shipping_address: data.shippingAddress,
          billing_address: data.billingAddress,
          notes: data.notes,
          metadata: data.metadata
        }).select().single();
        if (error) throw error;
        if (data.items?.length) {
          await supabase.from("order_items").insert(data.items.map((item) => ({
            order_id: record.id,
            product_id: item.productId,
            name: item.name,
            sku: item.sku,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
            line_total: item.price * item.quantity
          })));
        }
        return this.get(record.id);
      },
      async update(id, data) {
        const { data: record, error } = await supabase.from("orders").update({
          ...data,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }).eq("id", id).select().single();
        if (error) throw error;
        return transformOrder(record);
      },
      async addTransaction(orderId, transaction) {
        const { error } = await supabase.from("transactions").insert({
          order_id: orderId,
          kind: transaction.kind,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency,
          gateway: transaction.gateway,
          parent_id: transaction.parentId,
          processed_at: transaction.processedAt?.toISOString() || (/* @__PURE__ */ new Date()).toISOString(),
          metadata: transaction.metadata
        });
        if (error) throw error;
        return this.get(orderId);
      },
      async updateStatus(id, status) {
        const { data: record, error } = await supabase.from("orders").update({ status, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).select().single();
        if (error) throw error;
        return transformOrder(record);
      }
    },
    // Customers
    customers: {
      async get(id) {
        const { data, error } = await supabase.from("customers").select("*, addresses(*)").eq("id", id).single();
        if (error || !data) return null;
        return transformCustomer(data);
      },
      async getByEmail(email) {
        const { data, error } = await supabase.from("customers").select("*, addresses(*)").eq("email", email).single();
        if (error || !data) return null;
        return transformCustomer(data);
      },
      async create(data) {
        const { data: record, error } = await supabase.from("customers").insert({
          email: data.email,
          first_name: data.firstName,
          last_name: data.lastName,
          phone: data.phone,
          metadata: data.metadata
        }).select().single();
        if (error) throw error;
        return transformCustomer(record);
      },
      async update(id, data) {
        const { data: record, error } = await supabase.from("customers").update({
          email: data.email,
          first_name: data.firstName,
          last_name: data.lastName,
          phone: data.phone,
          metadata: data.metadata,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }).eq("id", id).select().single();
        if (error) throw error;
        return transformCustomer(record);
      },
      async addAddress(customerId, address) {
        await supabase.from("addresses").insert({
          customer_id: customerId,
          ...address
        });
        return this.get(customerId);
      }
    },
    // Setup — create tables based on enabled features
    async setup(features) {
      const createdCollections = [];
      let created = false;
      const tables = [
        {
          name: "products",
          condition: true,
          // always
          sql: `
            CREATE TABLE IF NOT EXISTS products (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              slug text NOT NULL UNIQUE,
              name text NOT NULL,
              description text,
              price integer NOT NULL,
              compare_at_price integer,
              images jsonb DEFAULT '[]'::jsonb,
              inventory jsonb,
              seo jsonb,
              metadata jsonb,
              status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
              created_at timestamptz DEFAULT now(),
              updated_at timestamptz DEFAULT now()
              ${features.variants ? ", variants jsonb DEFAULT '[]'::jsonb, options jsonb DEFAULT '[]'::jsonb" : ""}
            );
          `
        },
        {
          name: "collections",
          condition: features.collections,
          sql: `
            CREATE TABLE IF NOT EXISTS collections (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              slug text NOT NULL UNIQUE,
              name text NOT NULL,
              description text,
              image jsonb,
              seo jsonb,
              sort_order integer NOT NULL DEFAULT 0,
              created_at timestamptz DEFAULT now(),
              updated_at timestamptz DEFAULT now()
            );
          `
        },
        {
          name: "carts",
          condition: true,
          sql: `
            CREATE TABLE IF NOT EXISTS carts (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              session_id text NOT NULL,
              customer_id text,
              items jsonb DEFAULT '[]'::jsonb,
              subtotal integer DEFAULT 0,
              total_tax integer DEFAULT 0,
              total_shipping integer DEFAULT 0,
              total_discount integer DEFAULT 0,
              total integer DEFAULT 0,
              currency text DEFAULT 'USD',
              created_at timestamptz DEFAULT now(),
              updated_at timestamptz DEFAULT now()
            );
          `
        },
        {
          name: "orders",
          condition: true,
          sql: `
            CREATE TABLE IF NOT EXISTS orders (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              order_number text NOT NULL UNIQUE,
              customer_id text,
              email text NOT NULL,
              status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','paid','fulfilled','shipped','delivered','cancelled','refunded')),
              payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','authorized','paid','partially_refunded','refunded','failed')),
              fulfillment_status text NOT NULL DEFAULT 'unfulfilled' CHECK (fulfillment_status IN ('unfulfilled','partially_fulfilled','fulfilled','returned')),
              items jsonb DEFAULT '[]'::jsonb,
              subtotal integer DEFAULT 0,
              total_tax integer DEFAULT 0,
              total_shipping integer DEFAULT 0,
              total_discount integer DEFAULT 0,
              total integer DEFAULT 0,
              currency text DEFAULT 'USD',
              shipping_address jsonb,
              billing_address jsonb,
              transactions jsonb DEFAULT '[]'::jsonb,
              notes text,
              metadata jsonb,
              created_at timestamptz DEFAULT now(),
              updated_at timestamptz DEFAULT now()
            );
          `
        },
        {
          name: "customers",
          condition: true,
          sql: `
            CREATE TABLE IF NOT EXISTS customers (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              email text NOT NULL UNIQUE,
              first_name text,
              last_name text,
              phone text,
              addresses jsonb DEFAULT '[]'::jsonb,
              default_address_id text,
              metadata jsonb,
              created_at timestamptz DEFAULT now(),
              updated_at timestamptz DEFAULT now()
            );
          `
        }
      ];
      for (const table of tables) {
        if (table.condition) {
          try {
            createdCollections.push(table.name);
            created = true;
          } catch {
          }
        }
      }
      return { created, createdCollections };
    }
  };
}
function transformProduct(data) {
  return {
    ...data,
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description,
    price: data.price,
    compareAtPrice: data.compare_at_price,
    images: data.images || [],
    variants: data.variants || [],
    options: data.options || [],
    inventory: data.inventory,
    seo: data.seo,
    metadata: data.metadata,
    status: data.status,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at)
  };
}
function supabaseProductInput(data) {
  return {
    slug: data.slug,
    name: data.name,
    description: data.description,
    price: data.price,
    compare_at_price: data.compareAtPrice,
    images: data.images,
    variants: data.variants,
    options: data.options,
    inventory: data.inventory,
    seo: data.seo,
    metadata: data.metadata,
    status: data.status
  };
}
function transformOrder(data) {
  return {
    ...data,
    id: data.id,
    orderNumber: data.order_number,
    customerId: data.customer_id,
    email: data.email,
    status: data.status,
    paymentStatus: data.payment_status,
    fulfillmentStatus: data.fulfillment_status,
    items: (data.order_items || []).map((item) => ({
      id: item.id,
      orderId: item.order_id,
      productId: item.product_id,
      name: item.name,
      sku: item.sku,
      price: item.price,
      quantity: item.quantity,
      image: item.image,
      lineTotal: item.line_total
    })),
    subtotal: data.subtotal || 0,
    totalTax: data.total_tax || 0,
    totalShipping: data.total_shipping || 0,
    totalDiscount: data.total_discount || 0,
    total: data.total || 0,
    currency: data.currency,
    shippingAddress: data.shipping_address,
    billingAddress: data.billing_address,
    transactions: (data.transactions || []).map((tx) => ({
      id: tx.id,
      orderId: tx.order_id,
      kind: tx.kind,
      status: tx.status,
      amount: tx.amount,
      currency: tx.currency,
      gateway: tx.gateway,
      parentId: tx.parent_id,
      processedAt: tx.processed_at ? new Date(tx.processed_at) : void 0,
      metadata: tx.metadata
    })),
    notes: data.notes,
    metadata: data.metadata,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at)
  };
}
function transformCustomer(data) {
  return {
    ...data,
    id: data.id,
    email: data.email,
    firstName: data.first_name,
    lastName: data.last_name,
    phone: data.phone,
    addresses: (data.addresses || []).map((addr) => ({
      id: addr.id,
      customerId: addr.customer_id,
      name: addr.name,
      line1: addr.line1,
      line2: addr.line2,
      city: addr.city,
      province: addr.province,
      postalCode: addr.postal_code,
      country: addr.country,
      isDefault: addr.is_default
    })),
    defaultAddressId: data.default_address_id,
    metadata: data.metadata,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at)
  };
}
export {
  supabaseAdapter
};
