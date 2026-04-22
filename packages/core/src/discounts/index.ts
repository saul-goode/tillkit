// Discounts and Coupons for TillKit
// Promo codes, automatic discounts, and cart-level discounts

import type { Cart } from '../types/index.js';

export type DiscountType = 'percentage' | 'fixed_amount' | 'free_shipping' | 'buy_x_get_y';
export type DiscountTarget = 'order' | 'line_item' | 'shipping';

export interface Discount {
  id: string;
  code?: string; // If empty, automatic discount
  name: string;
  description?: string;
  type: DiscountType;
  target: DiscountTarget;
  amount: number; // Percentage (0-100) or fixed amount in cents
  currency?: string; // For fixed amounts
  minPurchase?: number; // Minimum order amount in cents
  maxDiscount?: number; // Maximum discount amount (for percentages)
  usageLimit?: number; // Total uses allowed
  usageCount: number; // Current uses
  startsAt?: Date;
  expiresAt?: Date;
  appliesTo?: {
    productIds?: string[];
    variantIds?: string[];
    collections?: string[];
    excludedProductIds?: string[];
  };
  // Buy X Get Y specific
  buyXGetY?: {
    buyQuantity: number;
    getQuantity: number;
    getPercentageOff: number; // 100 = free
  };
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppliedDiscount {
  id: string;
  code?: string;
  name: string;
  type: DiscountType;
  target: DiscountTarget;
  amount: number; // Calculated discount amount in cents
  description: string;
}

export interface DiscountResult {
  valid: boolean;
  discount?: AppliedDiscount;
  error?: string;
}

// Discount engine
export class DiscountEngine {
  private discounts: Map<string, Discount> = new Map();
  
  // Add a discount
  addDiscount(discount: Discount): void {
    this.discounts.set(discount.id, discount);
  }
  
  // Remove a discount
  removeDiscount(id: string): boolean {
    return this.discounts.delete(id);
  }
  
  // Get discount by code
  getByCode(code: string): Discount | undefined {
    return Array.from(this.discounts.values()).find(
      d => d.code?.toLowerCase() === code.toLowerCase()
    );
  }
  
  // Validate and apply a discount code to a cart
  applyCode(code: string, cart: Cart): DiscountResult {
    const discount = this.getByCode(code);
    
    if (!discount) {
      return { valid: false, error: 'Invalid discount code' };
    }
    
    return this.validateAndApply(discount, cart);
  }
  
  // Validate and apply a discount to a cart
  validateAndApply(discount: Discount, cart: Cart): DiscountResult {
    // Check enabled
    if (!discount.enabled) {
      return { valid: false, error: 'Discount is not active' };
    }
    
    // Check dates
    const now = new Date();
    if (discount.startsAt && now < discount.startsAt) {
      return { valid: false, error: 'Discount has not started yet' };
    }
    if (discount.expiresAt && now > discount.expiresAt) {
      return { valid: false, error: 'Discount has expired' };
    }
    
    // Check usage limit
    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
      return { valid: false, error: 'Discount usage limit reached' };
    }
    
    // Check minimum purchase
    if (discount.minPurchase && cart.subtotal < discount.minPurchase) {
      return { 
        valid: false, 
        error: `Minimum purchase of $${(discount.minPurchase / 100).toFixed(2)} required` 
      };
    }
    
    // Calculate discount amount
    const amount = this.calculateDiscountAmount(discount, cart);
    
    if (amount <= 0) {
      return { valid: false, error: 'Discount does not apply to any items in your cart' };
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
        description: this.formatDescription(discount, amount),
      },
    };
  }
  
  // Calculate discount amount
  private calculateDiscountAmount(discount: Discount, cart: Cart): number {
    switch (discount.target) {
      case 'order':
        return this.calculateOrderDiscount(discount, cart.subtotal);
      
      case 'line_item':
        return this.calculateLineItemDiscount(discount, cart);
      
      case 'shipping':
        return discount.type === 'free_shipping' 
          ? cart.totalShipping 
          : this.calculateOrderDiscount(discount, cart.totalShipping);
      
      default:
        return 0;
    }
  }
  
  private calculateOrderDiscount(discount: Discount, subtotal: number): number {
    if (discount.type === 'percentage') {
      const discountAmount = Math.round(subtotal * (discount.amount / 100));
      return discount.maxDiscount 
        ? Math.min(discountAmount, discount.maxDiscount) 
        : discountAmount;
    }
    
    if (discount.type === 'fixed_amount') {
      return Math.min(discount.amount, subtotal);
    }
    
    return 0;
  }
  
  private calculateLineItemDiscount(discount: Discount, cart: Cart): number {
    let totalDiscount = 0;
    
    for (const item of cart.items) {
      // Check if item applies
      if (!this.itemApplies(item.productId, item.variantId, discount)) {
        continue;
      }
      
      const itemTotal = item.price * item.quantity;
      
      if (discount.type === 'percentage') {
        const itemDiscount = Math.round(itemTotal * (discount.amount / 100));
        totalDiscount += discount.maxDiscount 
          ? Math.min(itemDiscount, discount.maxDiscount) 
          : itemDiscount;
      } else if (discount.type === 'fixed_amount') {
        totalDiscount += Math.min(discount.amount * item.quantity, itemTotal);
      } else if (discount.type === 'buy_x_get_y' && discount.buyXGetY) {
        const { buyQuantity, getQuantity, getPercentageOff } = discount.buyXGetY;
        const sets = Math.floor(item.quantity / (buyQuantity + getQuantity));
        const freeItems = sets * getQuantity;
        totalDiscount += Math.round(freeItems * item.price * (getPercentageOff / 100));
      }
    }
    
    return totalDiscount;
  }
  
  private itemApplies(productId: string, variantId: string | undefined, discount: Discount): boolean {
    if (!discount.appliesTo) return true;
    
    // Check exclusions first
    if (discount.appliesTo.excludedProductIds?.includes(productId)) {
      return false;
    }
    
    // If specific products listed, item must be one of them
    if (discount.appliesTo.productIds) {
      return discount.appliesTo.productIds.includes(productId);
    }
    
    // If specific variants listed
    if (discount.appliesTo.variantIds && variantId) {
      return discount.appliesTo.variantIds.includes(variantId);
    }
    
    return true;
  }
  
  private formatDescription(discount: Discount, amount: number): string {
    if (discount.type === 'percentage') {
      return `${discount.amount}% off${discount.target === 'shipping' ? ' shipping' : ''}`;
    }
    if (discount.type === 'fixed_amount') {
      return `$${(amount / 100).toFixed(2)} off${discount.target === 'shipping' ? ' shipping' : ''}`;
    }
    if (discount.type === 'free_shipping') {
      return 'Free shipping';
    }
    if (discount.type === 'buy_x_get_y' && discount.buyXGetY) {
      return `Buy ${discount.buyXGetY.buyQuantity}, get ${discount.buyXGetY.getQuantity} ${discount.buyXGetY.getPercentageOff === 100 ? 'free' : `${discount.buyXGetY.getPercentageOff}% off`}`;
    }
    return discount.name;
  }
  
  // Get all active automatic discounts
  getAutomaticDiscounts(cart: Cart): AppliedDiscount[] {
    const automatic = Array.from(this.discounts.values()).filter(
      d => d.enabled && !d.code
    );
    
    const applied: AppliedDiscount[] = [];
    
    for (const discount of automatic) {
      const result = this.validateAndApply(discount, cart);
      if (result.valid && result.discount) {
        applied.push(result.discount);
      }
    }
    
    // Sort by amount (highest first)
    return applied.sort((a, b) => b.amount - a.amount);
  }
  
  // Get best automatic discount for cart
  getBestAutomaticDiscount(cart: Cart): AppliedDiscount | undefined {
    const automatic = this.getAutomaticDiscounts(cart);
    return automatic[0]; // Already sorted by amount
  }
  
  // Increment usage count (call after successful order)
  incrementUsage(discountId: string): void {
    const discount = this.discounts.get(discountId);
    if (discount) {
      discount.usageCount++;
    }
  }
  
  // Get discount stats
  getStats(): Array<Pick<Discount, 'id' | 'code' | 'name' | 'usageLimit' | 'usageCount'>> {
    return Array.from(this.discounts.values()).map(d => ({
      id: d.id,
      code: d.code,
      name: d.name,
      usageLimit: d.usageLimit,
      usageCount: d.usageCount,
    }));
  }
}

// Common discount presets
export const DiscountPresets = {
  // 10% off everything
  percentageOff: (code: string, percentage: number, options: Partial<Omit<Discount, 'id' | 'code' | 'type' | 'amount'>> = {}): Discount => ({
    id: crypto.randomUUID(),
    code,
    name: `${percentage}% Off`,
    type: 'percentage',
    target: 'order',
    amount: percentage,
    currency: 'USD',
    usageCount: 0,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...options,
  }),
  
  // Fixed amount off
  fixedOff: (code: string, amount: number, options: Partial<Omit<Discount, 'id' | 'code' | 'type' | 'amount'>> = {}): Discount => ({
    id: crypto.randomUUID(),
    code,
    name: `$${(amount / 100).toFixed(2)} Off`,
    type: 'fixed_amount',
    target: 'order',
    amount,
    currency: 'USD',
    usageCount: 0,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...options,
  }),
  
  // Free shipping
  freeShipping: (code: string, options: Partial<Omit<Discount, 'id' | 'code' | 'type' | 'amount' | 'target'>> = {}): Discount => ({
    id: crypto.randomUUID(),
    code,
    name: 'Free Shipping',
    type: 'free_shipping',
    target: 'shipping',
    amount: 0,
    currency: 'USD',
    usageCount: 0,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...options,
  }),
  
  // Buy X Get Y
  buyXGetY: (
    code: string,
    buyQty: number,
    getQty: number,
    getPercentOff: number = 100,
    options: Partial<Omit<Discount, 'id' | 'code' | 'type' | 'buyXGetY'>> = {}
  ): Discount => ({
    id: crypto.randomUUID(),
    code,
    name: `Buy ${buyQty} Get ${getQty} ${getPercentOff === 100 ? 'Free' : `${getPercentOff}% Off`}`,
    type: 'buy_x_get_y',
    target: 'line_item',
    amount: 0,
    buyXGetY: {
      buyQuantity: buyQty,
      getQuantity: getQty,
      getPercentageOff: getPercentOff,
    },
    currency: 'USD',
    usageCount: 0,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...options,
  }),
};

// Create discount engine from list
export function createDiscountEngine(discounts: Discount[] = []): DiscountEngine {
  const engine = new DiscountEngine();
  for (const discount of discounts) {
    engine.addDiscount(discount);
  }
  return engine;
}
