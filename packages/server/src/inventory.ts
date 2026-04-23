import type { DatabaseAdapter } from '@tillkit/core';
import type { Order } from '@tillkit/core';

export interface InventoryWebhookConfig {
  url: string;
  secret?: string;
  headers?: Record<string, string>;
}

export interface InventoryChangeEvent {
  productId: string;
  variantId?: string;
  sku?: string;
  oldAvailable: number;
  newAvailable: number;
  delta: number;
  reason: 'order_paid' | 'return' | 'restock' | 'adjustment';
  orderId?: string;
  timestamp: string;
}

/** Decrement inventory for each item in a paid order, optionally sending webhooks */
export async function decrementInventoryForOrder(
  db: DatabaseAdapter,
  order: Order,
  webhookConfig?: InventoryWebhookConfig
): Promise<void> {
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
        quantity: product.inventory.quantity ?? oldAvailable,
      },
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
          reason: 'order_paid',
          orderId: order.id,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        console.error('Inventory webhook failed:', e);
      }
    }
  }
}

async function sendInventoryWebhook(
  config: InventoryWebhookConfig,
  event: InventoryChangeEvent
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.headers,
  };
  if (config.secret) {
    headers['X-Inventory-Webhook-Secret'] = config.secret;
  }
  const response = await fetch(config.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(event),
  });
  if (!response.ok) {
    throw new Error(`Inventory webhook returned ${response.status}: ${await response.text()}`);
  }
}
