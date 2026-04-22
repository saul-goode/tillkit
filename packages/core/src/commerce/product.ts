import type { Product, ProductVariant } from '../types/index.js';

// Calculate inventory availability
export function getAvailableInventory(
  product: Product,
  variant?: ProductVariant
): number {
  if (variant?.inventory) {
    return variant.inventory.available;
  }
  if (product.inventory) {
    return product.inventory.available;
  }
  return Infinity; // No inventory tracking = unlimited
}

// Check if a variant is available
export function isVariantAvailable(
  product: Product,
  variant?: ProductVariant
): boolean {
  const inventory = variant?.inventory || product.inventory;
  if (!inventory) return true; // No tracking
  
  if (inventory.allowOutOfStock) return true;
  return inventory.available > 0;
}

// Get display price (with variant override)
export function getDisplayPrice(
  product: Product,
  variant?: ProductVariant
): number {
  return variant?.price ?? product.price;
}

// Get display compare-at price
export function getCompareAtPrice(
  product: Product,
  variant?: ProductVariant
): number | undefined {
  return variant?.compareAtPrice ?? product.compareAtPrice;
}

// Check if on sale
export function isOnSale(product: Product, variant?: ProductVariant): boolean {
  const price = getDisplayPrice(product, variant);
  const compareAt = getCompareAtPrice(product, variant);
  return compareAt !== undefined && compareAt > price;
}

// Calculate discount percentage
export function getDiscountPercentage(
  product: Product,
  variant?: ProductVariant
): number {
  const price = getDisplayPrice(product, variant);
  const compareAt = getCompareAtPrice(product, variant);
  if (!compareAt || compareAt <= price) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

// Format currency
export function formatPrice(
  cents: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

// Find variant by options
export function findVariantByOptions(
  product: Product,
  options: Record<string, string>
): ProductVariant | undefined {
  return product.variants?.find((variant) => {
    return Object.entries(options).every(
      ([key, value]) => variant.options[key] === value
    );
  });
}

// Get option availability (for UI)
export function getOptionAvailability(
  product: Product,
  selectedOptions: Record<string, string>
): Record<string, string[]> {
  const available: Record<string, Set<string>> = {};
  
  // Initialize all options
  product.options?.forEach((option) => {
    available[option.name] = new Set();
  });
  
  // Find variants that match current selections
  product.variants?.forEach((variant) => {
    // Check if this variant matches current selections (excluding partial)
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
  
  // Convert Sets to arrays
  return Object.fromEntries(
    Object.entries(available).map(([key, values]) => [key, Array.from(values)])
  );
}
