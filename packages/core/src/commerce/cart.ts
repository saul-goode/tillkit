import type { Cart, CartItem, Product, ProductVariant } from '../types/index.js';
import { getDisplayPrice } from './product.js';

export interface AddToCartInput {
  productId: string;
  variantId?: string;
  quantity: number;
}

// Calculate cart item line total
export function calculateLineTotal(item: CartItem): number {
  return item.price * item.quantity;
}

// Calculate cart totals
export function calculateCartTotals(cart: Cart): {
  subtotal: number;
  total: number;
} {
  const subtotal = cart.items.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  const total = subtotal + cart.totalTax + cart.totalShipping - cart.totalDiscount;
  
  return {
    subtotal,
    total,
  };
}

// Add item to cart
export function addToCart(
  cart: Cart,
  product: Product,
  quantity: number,
  variant?: ProductVariant
): Cart {
  const existingItem = cart.items.find(
    (item) => 
      item.productId === product.id && 
      item.variantId === variant?.id
  );
  
  if (existingItem) {
    // Update quantity
    const updatedItems = cart.items.map((item) => {
      if (item.id === existingItem.id) {
        const newQuantity = item.quantity + quantity;
        return {
          ...item,
          quantity: newQuantity,
          lineTotal: item.price * newQuantity,
        };
      }
      return item;
    });
    
    return updateCartTotals({ ...cart, items: updatedItems });
  }
  
  // Add new item
  const price = getDisplayPrice(product, variant);
  const newItem: CartItem = {
    id: generateCartItemId(),
    productId: product.id,
    variantId: variant?.id,
    name: product.name,
    sku: variant?.sku || product.slug,
    price,
    quantity,
    lineTotal: price * quantity,
    image: product.images[0],
  };
  
  const updatedCart = {
    ...cart,
    items: [...cart.items, newItem],
  };
  
  return updateCartTotals(updatedCart);
}

// Update cart item quantity
export function updateCartItemQuantity(
  cart: Cart,
  itemId: string,
  quantity: number
): Cart {
  if (quantity <= 0) {
    return removeFromCart(cart, itemId);
  }
  
  const updatedItems = cart.items.map((item) => {
    if (item.id === itemId) {
      return {
        ...item,
        quantity,
        lineTotal: item.price * quantity,
      };
    }
    return item;
  });
  
  return updateCartTotals({ ...cart, items: updatedItems });
}

// Remove item from cart
export function removeFromCart(cart: Cart, itemId: string): Cart {
  const updatedItems = cart.items.filter((item) => item.id !== itemId);
  return updateCartTotals({ ...cart, items: updatedItems });
}

// Clear cart
export function clearCart(cart: Cart): Cart {
  return {
    ...cart,
    items: [],
    subtotal: 0,
    total: 0,
  };
}

// Update cart totals
function updateCartTotals(cart: Cart): Cart {
  const { subtotal, total } = calculateCartTotals(cart);
  return {
    ...cart,
    subtotal,
    total,
    updatedAt: new Date(),
  };
}

// Generate unique cart item ID
function generateCartItemId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get cart item count
export function getCartItemCount(cart: Cart): number {
  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}

// Check if cart is empty
export function isCartEmpty(cart: Cart): boolean {
  return cart.items.length === 0;
}
