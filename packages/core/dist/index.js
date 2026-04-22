// src/config.ts
import { z } from "zod";
var ExternalImageConfig = z.object({
  provider: z.literal("external")
});
var SharpImageConfig = z.object({
  provider: z.literal("sharp"),
  storage: z.union([
    z.object({ type: z.literal("filesystem"), path: z.string() }),
    z.object({
      type: z.literal("s3"),
      bucket: z.string(),
      region: z.string(),
      accessKeyId: z.string().optional(),
      secretAccessKey: z.string().optional()
    }),
    z.object({
      type: z.literal("vercel-blob"),
      token: z.string().optional()
    })
  ]),
  sizes: z.array(z.object({
    name: z.string(),
    width: z.number(),
    height: z.number().optional(),
    fit: z.enum(["cover", "contain", "inside", "outside"]).optional()
  })).optional()
});
var CloudinaryImageConfig = z.object({
  provider: z.literal("cloudinary"),
  cloudName: z.string(),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional()
});
var R2ImageConfig = z.object({
  provider: z.literal("r2"),
  accountId: z.string(),
  bucket: z.string(),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  publicUrl: z.string().optional()
});
var ImageConfig = z.union([
  ExternalImageConfig,
  SharpImageConfig,
  CloudinaryImageConfig,
  R2ImageConfig
]);
var DatabaseConfig = z.object({
  type: z.string()
  // Adapter-specific config extends this
});
var StripeConfig = z.object({
  provider: z.literal("stripe"),
  publishableKey: z.string(),
  secretKey: z.string(),
  webhookSecret: z.string().optional()
});
var PaymentConfig = z.union([StripeConfig, z.object({ provider: z.literal("manual") })]);
var ThemeConfig = z.object({
  name: z.string(),
  css: z.string().optional(),
  layout: z.enum(["default", "minimal", "split"]).optional()
});
var ServerConfig = z.object({
  port: z.number().default(3e3),
  host: z.string().default("localhost"),
  dev: z.boolean().default(true),
  session: z.object({
    secret: z.string(),
    ttl: z.number().default(86400)
    // 24 hours
  }).optional()
});
var StoreFeaturesSchema = z.object({
  /** Enable product variants/options/SKU support */
  variants: z.boolean().default(true),
  /** Enable product collections/categories */
  collections: z.boolean().default(false),
  /** Enable inventory tracking */
  inventoryTracking: z.boolean().default(true),
  /** Enable subscription billing (future) */
  subscriptions: z.boolean().default(false),
  /** Enable multi-currency support (future) */
  multiCurrency: z.boolean().default(false)
});
var StoreFeatures = StoreFeaturesSchema.parse;
var TillKitConfigSchema = z.object({
  database: z.record(z.unknown()),
  // Typed at adapter level
  images: ImageConfig.optional(),
  payment: PaymentConfig.optional(),
  server: ServerConfig.optional(),
  theme: ThemeConfig.optional(),
  currency: z.object({
    default: z.string().default("USD"),
    supported: z.array(z.string()).optional()
  }).optional(),
  features: StoreFeaturesSchema.optional()
});
function defineConfig(config) {
  return TillKitConfigSchema.parse(config);
}
function getDefaultFeatures() {
  return {
    variants: true,
    collections: false,
    inventoryTracking: true,
    subscriptions: false,
    multiCurrency: false
  };
}

// src/commerce/product.ts
function getAvailableInventory(product, variant) {
  if (variant?.inventory) {
    return variant.inventory.available;
  }
  if (product.inventory) {
    return product.inventory.available;
  }
  return Infinity;
}
function isVariantAvailable(product, variant) {
  const inventory = variant?.inventory || product.inventory;
  if (!inventory) return true;
  if (inventory.allowOutOfStock) return true;
  return inventory.available > 0;
}
function getDisplayPrice(product, variant) {
  return variant?.price ?? product.price;
}
function getCompareAtPrice(product, variant) {
  return variant?.compareAtPrice ?? product.compareAtPrice;
}
function isOnSale(product, variant) {
  const price = getDisplayPrice(product, variant);
  const compareAt = getCompareAtPrice(product, variant);
  return compareAt !== void 0 && compareAt > price;
}
function getDiscountPercentage(product, variant) {
  const price = getDisplayPrice(product, variant);
  const compareAt = getCompareAtPrice(product, variant);
  if (!compareAt || compareAt <= price) return 0;
  return Math.round((compareAt - price) / compareAt * 100);
}
function formatPrice(cents, currency = "USD", locale = "en-US") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency
  }).format(cents / 100);
}
function findVariantByOptions(product, options) {
  return product.variants?.find((variant) => {
    return Object.entries(options).every(
      ([key, value]) => variant.options[key] === value
    );
  });
}
function getOptionAvailability(product, selectedOptions) {
  const available = {};
  product.options?.forEach((option) => {
    available[option.name] = /* @__PURE__ */ new Set();
  });
  product.variants?.forEach((variant) => {
    const matches = Object.entries(selectedOptions).every(
      ([key, value]) => variant.options[key] === value
    );
    if (matches || Object.keys(selectedOptions).length === 0) {
      if (isVariantAvailable(product, variant)) {
        Object.entries(variant.options).forEach(([key, value]) => {
          available[key]?.add(value);
        });
      }
    }
  });
  return Object.fromEntries(
    Object.entries(available).map(([key, values]) => [key, Array.from(values)])
  );
}

// src/commerce/cart.ts
function calculateLineTotal(item) {
  return item.price * item.quantity;
}
function calculateCartTotals(cart) {
  const subtotal = cart.items.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  const total = subtotal + cart.totalTax + cart.totalShipping - cart.totalDiscount;
  return {
    subtotal,
    total
  };
}
function addToCart(cart, product, quantity, variant) {
  const existingItem = cart.items.find(
    (item) => item.productId === product.id && item.variantId === variant?.id
  );
  if (existingItem) {
    const updatedItems = cart.items.map((item) => {
      if (item.id === existingItem.id) {
        const newQuantity = item.quantity + quantity;
        return {
          ...item,
          quantity: newQuantity,
          lineTotal: item.price * newQuantity
        };
      }
      return item;
    });
    return updateCartTotals({ ...cart, items: updatedItems });
  }
  const price = getDisplayPrice(product, variant);
  const newItem = {
    id: generateCartItemId(),
    productId: product.id,
    variantId: variant?.id,
    name: product.name,
    sku: variant?.sku || product.slug,
    price,
    quantity,
    lineTotal: price * quantity,
    image: product.images[0]
  };
  const updatedCart = {
    ...cart,
    items: [...cart.items, newItem]
  };
  return updateCartTotals(updatedCart);
}
function updateCartItemQuantity(cart, itemId, quantity) {
  if (quantity <= 0) {
    return removeFromCart(cart, itemId);
  }
  const updatedItems = cart.items.map((item) => {
    if (item.id === itemId) {
      return {
        ...item,
        quantity,
        lineTotal: item.price * quantity
      };
    }
    return item;
  });
  return updateCartTotals({ ...cart, items: updatedItems });
}
function removeFromCart(cart, itemId) {
  const updatedItems = cart.items.filter((item) => item.id !== itemId);
  return updateCartTotals({ ...cart, items: updatedItems });
}
function clearCart(cart) {
  return {
    ...cart,
    items: [],
    subtotal: 0,
    total: 0
  };
}
function updateCartTotals(cart) {
  const { subtotal, total } = calculateCartTotals(cart);
  return {
    ...cart,
    subtotal,
    total,
    updatedAt: /* @__PURE__ */ new Date()
  };
}
function generateCartItemId() {
  return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
function getCartItemCount(cart) {
  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}
function isCartEmpty(cart) {
  return cart.items.length === 0;
}

// src/commerce/pricing.ts
function calculateTax(subtotal, address, taxRates) {
  const rate = taxRates.find(
    (r) => r.country === address.country && (r.province === address.province || !r.province)
  );
  if (!rate) return 0;
  return Math.round(subtotal * rate.rate);
}
function calculateShipping(_cart, rates, selectedRateId) {
  if (!selectedRateId) {
    const cheapest = rates.reduce(
      (min, rate2) => rate2.price < min.price ? rate2 : min
    );
    return { shipping: cheapest.price, rate: cheapest };
  }
  const rate = rates.find((r) => r.id === selectedRateId);
  return { shipping: rate?.price || 0, rate };
}
function calculateDiscount(subtotal, discounts) {
  return discounts.reduce((total, discount) => {
    if (discount.applyTo !== "order") return total;
    if (discount.type === "percentage") {
      return total + Math.round(subtotal * (discount.value / 100));
    } else {
      return total + discount.value;
    }
  }, 0);
}
function calculateOrderTotal(subtotal, tax, shipping, discounts) {
  return subtotal + tax + shipping - discounts;
}
function formatCents(cents) {
  return (cents / 100).toFixed(2);
}
function convertCurrency(cents, from, to, rates) {
  if (from === to) return cents;
  const rate = rates[to] / rates[from];
  return Math.round(cents * rate);
}

// src/inventory/index.ts
var InventoryManager = class {
  // key: productId:variantId or productId
  constructor(config = {}) {
    this.config = config;
    this.config = {
      enableReservations: true,
      reservationDurationMinutes: 30,
      lowStockThreshold: 5,
      allowBackorders: false,
      ...config
    };
    if (this.config.enableReservations) {
      setInterval(() => this.cleanupExpiredReservations(), 6e4);
    }
  }
  config;
  reservations = /* @__PURE__ */ new Map();
  stockLevels = /* @__PURE__ */ new Map();
  // Initialize stock level for a product/variant
  initializeStock(productId, sku, totalQuantity, variantId, threshold) {
    const key = this.getKey(productId, variantId);
    const level = {
      productId,
      variantId,
      sku,
      totalQuantity,
      availableQuantity: totalQuantity,
      reservedQuantity: 0,
      threshold: threshold || this.config.lowStockThreshold || 5,
      status: this.calculateStatus(totalQuantity, threshold || this.config.lowStockThreshold || 5)
    };
    this.stockLevels.set(key, level);
    return level;
  }
  // Get current stock level
  getStock(productId, variantId) {
    const key = this.getKey(productId, variantId);
    return this.stockLevels.get(key);
  }
  // Check if quantity is available
  isAvailable(productId, quantity, variantId) {
    const level = this.getStock(productId, variantId);
    if (!level) {
      return true;
    }
    if (this.config.allowBackorders) {
      return true;
    }
    return level.availableQuantity >= quantity;
  }
  // Reserve stock for a cart session
  reserveStock(sessionId, productId, quantity, variantId) {
    if (!this.config.enableReservations) {
      return { success: true };
    }
    const level = this.getStock(productId, variantId);
    if (!level) {
      return { success: true };
    }
    if (!this.config.allowBackorders && level.availableQuantity < quantity) {
      return {
        success: false,
        error: `Only ${level.availableQuantity} available`
      };
    }
    level.reservedQuantity += quantity;
    level.availableQuantity -= quantity;
    level.status = this.calculateStatus(level.availableQuantity, level.threshold);
    const reservation = {
      id: crypto.randomUUID(),
      sessionId,
      productId,
      variantId,
      quantity,
      expiresAt: new Date(Date.now() + (this.config.reservationDurationMinutes || 30) * 6e4),
      createdAt: /* @__PURE__ */ new Date()
    };
    this.reservations.set(reservation.id, reservation);
    return { success: true, reservation };
  }
  // Release reserved stock (when removed from cart)
  releaseStock(reservationId) {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      return false;
    }
    const level = this.getStock(reservation.productId, reservation.variantId);
    if (level) {
      level.reservedQuantity -= reservation.quantity;
      level.availableQuantity += reservation.quantity;
      level.status = this.calculateStatus(level.availableQuantity, level.threshold);
    }
    this.reservations.delete(reservationId);
    return true;
  }
  // Commit stock (convert reservation to sale)
  commitStock(reservationId) {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      return false;
    }
    const level = this.getStock(reservation.productId, reservation.variantId);
    if (level) {
      level.totalQuantity -= reservation.quantity;
      level.reservedQuantity -= reservation.quantity;
      level.status = this.calculateStatus(level.availableQuantity, level.threshold);
    }
    this.reservations.delete(reservationId);
    return true;
  }
  // Direct stock adjustment (no reservation)
  adjustStock(update) {
    const level = this.getStock(update.productId, update.variantId);
    if (!level) {
      return void 0;
    }
    level.totalQuantity += update.delta;
    level.availableQuantity += update.delta;
    level.status = this.calculateStatus(level.availableQuantity, level.threshold);
    return level;
  }
  // Get low stock items
  getLowStock() {
    return Array.from(this.stockLevels.values()).filter(
      (level) => level.status === "low_stock" || level.status === "out_of_stock"
    );
  }
  // Get reservations for a session
  getSessionReservations(sessionId) {
    return Array.from(this.reservations.values()).filter(
      (r) => r.sessionId === sessionId
    );
  }
  // Release all reservations for a session
  releaseSessionReservations(sessionId) {
    const sessionReservations = this.getSessionReservations(sessionId);
    let released = 0;
    for (const reservation of sessionReservations) {
      if (this.releaseStock(reservation.id)) {
        released++;
      }
    }
    return released;
  }
  // Cleanup expired reservations
  cleanupExpiredReservations() {
    const now = /* @__PURE__ */ new Date();
    let cleaned = 0;
    for (const [id, reservation] of Array.from(this.reservations.entries())) {
      if (reservation.expiresAt < now) {
        this.releaseStock(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} expired stock reservations`);
    }
  }
  getKey(productId, variantId) {
    return variantId ? `${productId}:${variantId}` : productId;
  }
  calculateStatus(available, threshold) {
    if (available <= 0) return "out_of_stock";
    if (available <= threshold) return "low_stock";
    return "in_stock";
  }
};
function inventoryFromProducts(products, config = {}) {
  const manager = new InventoryManager(config);
  for (const product of products) {
    if (product.inventory) {
      manager.initializeStock(
        product.id,
        product.variants?.[0]?.sku || product.slug,
        product.inventory.available,
        void 0,
        product.inventory.allowOutOfStock ? 0 : void 0
      );
    }
    for (const variant of product.variants || []) {
      if (variant.inventory) {
        manager.initializeStock(
          product.id,
          variant.sku,
          variant.inventory.available,
          variant.id,
          variant.inventory.allowOutOfStock ? 0 : void 0
        );
      }
    }
  }
  return manager;
}

// src/discounts/index.ts
var DiscountEngine = class {
  discounts = /* @__PURE__ */ new Map();
  // Add a discount
  addDiscount(discount) {
    this.discounts.set(discount.id, discount);
  }
  // Remove a discount
  removeDiscount(id) {
    return this.discounts.delete(id);
  }
  // Get discount by code
  getByCode(code) {
    return Array.from(this.discounts.values()).find(
      (d) => d.code?.toLowerCase() === code.toLowerCase()
    );
  }
  // Validate and apply a discount code to a cart
  applyCode(code, cart) {
    const discount = this.getByCode(code);
    if (!discount) {
      return { valid: false, error: "Invalid discount code" };
    }
    return this.validateAndApply(discount, cart);
  }
  // Validate and apply a discount to a cart
  validateAndApply(discount, cart) {
    if (!discount.enabled) {
      return { valid: false, error: "Discount is not active" };
    }
    const now = /* @__PURE__ */ new Date();
    if (discount.startsAt && now < discount.startsAt) {
      return { valid: false, error: "Discount has not started yet" };
    }
    if (discount.expiresAt && now > discount.expiresAt) {
      return { valid: false, error: "Discount has expired" };
    }
    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
      return { valid: false, error: "Discount usage limit reached" };
    }
    if (discount.minPurchase && cart.subtotal < discount.minPurchase) {
      return {
        valid: false,
        error: `Minimum purchase of $${(discount.minPurchase / 100).toFixed(2)} required`
      };
    }
    const amount = this.calculateDiscountAmount(discount, cart);
    if (amount <= 0) {
      return { valid: false, error: "Discount does not apply to any items in your cart" };
    }
    return {
      valid: true,
      discount: {
        id: discount.id,
        code: discount.code,
        name: discount.name,
        type: discount.type,
        target: discount.target,
        amount,
        description: this.formatDescription(discount, amount)
      }
    };
  }
  // Calculate discount amount
  calculateDiscountAmount(discount, cart) {
    switch (discount.target) {
      case "order":
        return this.calculateOrderDiscount(discount, cart.subtotal);
      case "line_item":
        return this.calculateLineItemDiscount(discount, cart);
      case "shipping":
        return discount.type === "free_shipping" ? cart.totalShipping : this.calculateOrderDiscount(discount, cart.totalShipping);
      default:
        return 0;
    }
  }
  calculateOrderDiscount(discount, subtotal) {
    if (discount.type === "percentage") {
      const discountAmount = Math.round(subtotal * (discount.amount / 100));
      return discount.maxDiscount ? Math.min(discountAmount, discount.maxDiscount) : discountAmount;
    }
    if (discount.type === "fixed_amount") {
      return Math.min(discount.amount, subtotal);
    }
    return 0;
  }
  calculateLineItemDiscount(discount, cart) {
    let totalDiscount = 0;
    for (const item of cart.items) {
      if (!this.itemApplies(item.productId, item.variantId, discount)) {
        continue;
      }
      const itemTotal = item.price * item.quantity;
      if (discount.type === "percentage") {
        const itemDiscount = Math.round(itemTotal * (discount.amount / 100));
        totalDiscount += discount.maxDiscount ? Math.min(itemDiscount, discount.maxDiscount) : itemDiscount;
      } else if (discount.type === "fixed_amount") {
        totalDiscount += Math.min(discount.amount * item.quantity, itemTotal);
      } else if (discount.type === "buy_x_get_y" && discount.buyXGetY) {
        const { buyQuantity, getQuantity, getPercentageOff } = discount.buyXGetY;
        const sets = Math.floor(item.quantity / (buyQuantity + getQuantity));
        const freeItems = sets * getQuantity;
        totalDiscount += Math.round(freeItems * item.price * (getPercentageOff / 100));
      }
    }
    return totalDiscount;
  }
  itemApplies(productId, variantId, discount) {
    if (!discount.appliesTo) return true;
    if (discount.appliesTo.excludedProductIds?.includes(productId)) {
      return false;
    }
    if (discount.appliesTo.productIds) {
      return discount.appliesTo.productIds.includes(productId);
    }
    if (discount.appliesTo.variantIds && variantId) {
      return discount.appliesTo.variantIds.includes(variantId);
    }
    return true;
  }
  formatDescription(discount, amount) {
    if (discount.type === "percentage") {
      return `${discount.amount}% off${discount.target === "shipping" ? " shipping" : ""}`;
    }
    if (discount.type === "fixed_amount") {
      return `$${(amount / 100).toFixed(2)} off${discount.target === "shipping" ? " shipping" : ""}`;
    }
    if (discount.type === "free_shipping") {
      return "Free shipping";
    }
    if (discount.type === "buy_x_get_y" && discount.buyXGetY) {
      return `Buy ${discount.buyXGetY.buyQuantity}, get ${discount.buyXGetY.getQuantity} ${discount.buyXGetY.getPercentageOff === 100 ? "free" : `${discount.buyXGetY.getPercentageOff}% off`}`;
    }
    return discount.name;
  }
  // Get all active automatic discounts
  getAutomaticDiscounts(cart) {
    const automatic = Array.from(this.discounts.values()).filter(
      (d) => d.enabled && !d.code
    );
    const applied = [];
    for (const discount of automatic) {
      const result = this.validateAndApply(discount, cart);
      if (result.valid && result.discount) {
        applied.push(result.discount);
      }
    }
    return applied.sort((a, b) => b.amount - a.amount);
  }
  // Get best automatic discount for cart
  getBestAutomaticDiscount(cart) {
    const automatic = this.getAutomaticDiscounts(cart);
    return automatic[0];
  }
  // Increment usage count (call after successful order)
  incrementUsage(discountId) {
    const discount = this.discounts.get(discountId);
    if (discount) {
      discount.usageCount++;
    }
  }
  // Get discount stats
  getStats() {
    return Array.from(this.discounts.values()).map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      usageLimit: d.usageLimit,
      usageCount: d.usageCount
    }));
  }
};
var DiscountPresets = {
  // 10% off everything
  percentageOff: (code, percentage, options = {}) => ({
    id: crypto.randomUUID(),
    code,
    name: `${percentage}% Off`,
    type: "percentage",
    target: "order",
    amount: percentage,
    currency: "USD",
    usageCount: 0,
    enabled: true,
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date(),
    ...options
  }),
  // Fixed amount off
  fixedOff: (code, amount, options = {}) => ({
    id: crypto.randomUUID(),
    code,
    name: `$${(amount / 100).toFixed(2)} Off`,
    type: "fixed_amount",
    target: "order",
    amount,
    currency: "USD",
    usageCount: 0,
    enabled: true,
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date(),
    ...options
  }),
  // Free shipping
  freeShipping: (code, options = {}) => ({
    id: crypto.randomUUID(),
    code,
    name: "Free Shipping",
    type: "free_shipping",
    target: "shipping",
    amount: 0,
    currency: "USD",
    usageCount: 0,
    enabled: true,
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date(),
    ...options
  }),
  // Buy X Get Y
  buyXGetY: (code, buyQty, getQty, getPercentOff = 100, options = {}) => ({
    id: crypto.randomUUID(),
    code,
    name: `Buy ${buyQty} Get ${getQty} ${getPercentOff === 100 ? "Free" : `${getPercentOff}% Off`}`,
    type: "buy_x_get_y",
    target: "line_item",
    amount: 0,
    buyXGetY: {
      buyQuantity: buyQty,
      getQuantity: getQty,
      getPercentageOff: getPercentOff
    },
    currency: "USD",
    usageCount: 0,
    enabled: true,
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date(),
    ...options
  })
};
function createDiscountEngine(discounts = []) {
  const engine = new DiscountEngine();
  for (const discount of discounts) {
    engine.addDiscount(discount);
  }
  return engine;
}
export {
  CloudinaryImageConfig,
  DatabaseConfig,
  DiscountEngine,
  DiscountPresets,
  ExternalImageConfig,
  ImageConfig,
  InventoryManager,
  PaymentConfig,
  R2ImageConfig,
  ServerConfig,
  SharpImageConfig,
  StoreFeatures,
  StoreFeaturesSchema,
  StripeConfig,
  ThemeConfig,
  TillKitConfigSchema,
  addToCart,
  calculateCartTotals,
  calculateDiscount,
  calculateLineTotal,
  calculateOrderTotal,
  calculateShipping,
  calculateTax,
  clearCart,
  convertCurrency,
  createDiscountEngine,
  defineConfig,
  findVariantByOptions,
  formatCents,
  formatPrice,
  getAvailableInventory,
  getCartItemCount,
  getCompareAtPrice,
  getDefaultFeatures,
  getDiscountPercentage,
  getDisplayPrice,
  getOptionAvailability,
  inventoryFromProducts,
  isCartEmpty,
  isOnSale,
  isVariantAvailable,
  removeFromCart,
  updateCartItemQuantity
};
