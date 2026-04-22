import type { Cart } from '../types/index.js';

// Tax calculation (simplified - real world needs taxjar/avalara)
export interface TaxRate {
  country: string;
  province?: string;
  rate: number; // 0.08 for 8%
}

export function calculateTax(
  subtotal: number,
  address: { country: string; province?: string },
  taxRates: TaxRate[]
): number {
  const rate = taxRates.find(
    (r) =>
      r.country === address.country &&
      (r.province === address.province || !r.province)
  );
  
  if (!rate) return 0;
  
  // Round to cents
  return Math.round(subtotal * rate.rate);
}

// Shipping calculation
export interface ShippingRate {
  id: string;
  name: string;
  price: number;
  estimatedDays?: number;
}

export function calculateShipping(
  _cart: Cart,
  rates: ShippingRate[],
  selectedRateId?: string
): { shipping: number; rate?: ShippingRate } {
  if (!selectedRateId) {
    // Return cheapest rate
    const cheapest = rates.reduce((min, rate) =>
      rate.price < min.price ? rate : min
    );
    return { shipping: cheapest.price, rate: cheapest };
  }
  
  const rate = rates.find((r) => r.id === selectedRateId);
  return { shipping: rate?.price || 0, rate };
}

// Discount calculation (future: promo codes, etc.)
export interface Discount {
  type: 'percentage' | 'fixed';
  value: number;
  code?: string;
  applyTo: 'order' | 'product' | 'shipping';
}

export function calculateDiscount(
  subtotal: number,
  discounts: Discount[]
): number {
  return discounts.reduce((total, discount) => {
    if (discount.applyTo !== 'order') return total;
    
    if (discount.type === 'percentage') {
      return total + Math.round(subtotal * (discount.value / 100));
    } else {
      return total + discount.value;
    }
  }, 0);
}

// Order total calculation
export function calculateOrderTotal(
  subtotal: number,
  tax: number,
  shipping: number,
  discounts: number
): number {
  return subtotal + tax + shipping - discounts;
}

// Format cents for display
export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Currency conversion (placeholder - needs real rates)
export function convertCurrency(
  cents: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number {
  if (from === to) return cents;
  const rate = rates[to] / rates[from];
  return Math.round(cents * rate);
}
