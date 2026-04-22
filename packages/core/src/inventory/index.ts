// Inventory Management for TillKit
// Stock tracking, reservations, and low stock alerts

import type { Product } from '../types/index.js';

export interface InventoryConfig {
  enableReservations?: boolean; // Reserve stock when added to cart
  reservationDurationMinutes?: number; // How long to hold reserved stock
  lowStockThreshold?: number; // Default threshold for low stock alerts
  allowBackorders?: boolean; // Allow selling below zero
}

export interface StockLevel {
  productId: string;
  variantId?: string;
  sku: string;
  totalQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  threshold: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface StockReservation {
  id: string;
  sessionId: string;
  productId: string;
  variantId?: string;
  quantity: number;
  expiresAt: Date;
  createdAt: Date;
}

export interface InventoryUpdate {
  productId: string;
  variantId?: string;
  delta: number; // Positive to add, negative to remove
  reason: 'sale' | 'return' | 'restock' | 'adjustment' | 'reservation' | 'release';
  orderId?: string;
  notes?: string;
}

// In-memory inventory store (use database adapter in production)
export class InventoryManager {
  private reservations: Map<string, StockReservation> = new Map();
  private stockLevels: Map<string, StockLevel> = new Map(); // key: productId:variantId or productId
  
  constructor(private config: InventoryConfig = {}) {
    this.config = {
      enableReservations: true,
      reservationDurationMinutes: 30,
      lowStockThreshold: 5,
      allowBackorders: false,
      ...config,
    };
    
    // Start cleanup interval for expired reservations
    if (this.config.enableReservations) {
      setInterval(() => this.cleanupExpiredReservations(), 60000); // Every minute
    }
  }
  
  // Initialize stock level for a product/variant
  initializeStock(
    productId: string,
    sku: string,
    totalQuantity: number,
    variantId?: string,
    threshold?: number
  ): StockLevel {
    const key = this.getKey(productId, variantId);
    
    const level: StockLevel = {
      productId,
      variantId,
      sku,
      totalQuantity,
      availableQuantity: totalQuantity,
      reservedQuantity: 0,
      threshold: threshold || this.config.lowStockThreshold || 5,
      status: this.calculateStatus(totalQuantity, threshold || this.config.lowStockThreshold || 5),
    };
    
    this.stockLevels.set(key, level);
    return level;
  }
  
  // Get current stock level
  getStock(productId: string, variantId?: string): StockLevel | undefined {
    const key = this.getKey(productId, variantId);
    return this.stockLevels.get(key);
  }
  
  // Check if quantity is available
  isAvailable(productId: string, quantity: number, variantId?: string): boolean {
    const level = this.getStock(productId, variantId);
    
    if (!level) {
      // No inventory tracking = unlimited stock
      return true;
    }
    
    if (this.config.allowBackorders) {
      return true;
    }
    
    return level.availableQuantity >= quantity;
  }
  
  // Reserve stock for a cart session
  reserveStock(
    sessionId: string,
    productId: string,
    quantity: number,
    variantId?: string
  ): { success: boolean; reservation?: StockReservation; error?: string } {
    if (!this.config.enableReservations) {
      return { success: true }; // Reservations disabled
    }
    
    const level = this.getStock(productId, variantId);
    if (!level) {
      return { success: true }; // No inventory tracking
    }
    
    // Check availability
    if (!this.config.allowBackorders && level.availableQuantity < quantity) {
      return { 
        success: false, 
        error: `Only ${level.availableQuantity} available` 
      };
    }
    
    // Update stock level
    level.reservedQuantity += quantity;
    level.availableQuantity -= quantity;
    level.status = this.calculateStatus(level.availableQuantity, level.threshold);
    
    // Create reservation record
    const reservation: StockReservation = {
      id: crypto.randomUUID(),
      sessionId,
      productId,
      variantId,
      quantity,
      expiresAt: new Date(Date.now() + (this.config.reservationDurationMinutes || 30) * 60000),
      createdAt: new Date(),
    };
    
    this.reservations.set(reservation.id, reservation);
    
    return { success: true, reservation };
  }
  
  // Release reserved stock (when removed from cart)
  releaseStock(reservationId: string): boolean {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      return false;
    }
    
    // Restore stock
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
  commitStock(reservationId: string): boolean {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      return false;
    }
    
    // Reduce total quantity (stock is actually sold)
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
  adjustStock(update: InventoryUpdate): StockLevel | undefined {
    const level = this.getStock(update.productId, update.variantId);
    if (!level) {
      return undefined;
    }
    
    level.totalQuantity += update.delta;
    level.availableQuantity += update.delta;
    level.status = this.calculateStatus(level.availableQuantity, level.threshold);
    
    return level;
  }
  
  // Get low stock items
  getLowStock(): StockLevel[] {
    return Array.from(this.stockLevels.values()).filter(
      level => level.status === 'low_stock' || level.status === 'out_of_stock'
    );
  }
  
  // Get reservations for a session
  getSessionReservations(sessionId: string): StockReservation[] {
    return Array.from(this.reservations.values()).filter(
      r => r.sessionId === sessionId
    );
  }
  
  // Release all reservations for a session
  releaseSessionReservations(sessionId: string): number {
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
  private cleanupExpiredReservations(): void {
    const now = new Date();
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
  
  private getKey(productId: string, variantId?: string): string {
    return variantId ? `${productId}:${variantId}` : productId;
  }
  
  private calculateStatus(available: number, threshold: number): StockLevel['status'] {
    if (available <= 0) return 'out_of_stock';
    if (available <= threshold) return 'low_stock';
    return 'in_stock';
  }
}

// Helper to sync inventory from database products
export function inventoryFromProducts(
  products: Product[],
  config: InventoryConfig = {}
): InventoryManager {
  const manager = new InventoryManager(config);
  
  for (const product of products) {
    if (product.inventory) {
      manager.initializeStock(
        product.id,
        product.variants?.[0]?.sku || product.slug,
        product.inventory.available,
        undefined,
        product.inventory.allowOutOfStock ? 0 : undefined
      );
    }
    
    // Initialize variant stock
    for (const variant of product.variants || []) {
      if (variant.inventory) {
        manager.initializeStock(
          product.id,
          variant.sku,
          variant.inventory.available,
          variant.id,
          variant.inventory.allowOutOfStock ? 0 : undefined
        );
      }
    }
  }
  
  return manager;
}
