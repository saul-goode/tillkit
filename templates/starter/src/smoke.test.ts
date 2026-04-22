import { describe, it, expect } from 'vitest';
import { createStarterApp } from './app.js';

function createMockDatabase() {
  return {
    products: {
      list: async () => ({
        items: [
          {
            id: 'p1',
            name: 'Test Product',
            slug: 'test-product',
            description: 'A test product',
            price: 1000,
            currency: 'USD',
            status: 'active',
            inventory: null,
            images: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 1,
        page: 1,
        perPage: 20,
        hasMore: false,
      }),
      search: async () => [],
      get: async () => null,
      getBySlug: async () => null,
      create: async () => {
        throw new Error('not implemented');
      },
      update: async () => {
        throw new Error('not implemented');
      },
      delete: async () => {},
    },
    cart: {
      get: async () => null,
      create: async (sessionId: string) => ({
        id: 'cart_1',
        sessionId,
        items: [],
        subtotal: 0,
        totalTax: 0,
        totalShipping: 0,
        totalDiscount: 0,
        total: 0,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: async () => ({
        id: 'cart_1',
        sessionId: 'test',
        items: [],
        subtotal: 0,
        totalTax: 0,
        totalShipping: 0,
        totalDiscount: 0,
        total: 0,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      addItem: async () => ({
        id: 'cart_1',
        sessionId: 'test',
        items: [],
        subtotal: 0,
        totalTax: 0,
        totalShipping: 0,
        totalDiscount: 0,
        total: 0,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      updateItem: async () => ({
        id: 'cart_1',
        sessionId: 'test',
        items: [],
        subtotal: 0,
        totalTax: 0,
        totalShipping: 0,
        totalDiscount: 0,
        total: 0,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      removeItem: async () => ({
        id: 'cart_1',
        sessionId: 'test',
        items: [],
        subtotal: 0,
        totalTax: 0,
        totalShipping: 0,
        totalDiscount: 0,
        total: 0,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      clear: async () => {},
    },
    orders: {
      list: async () => ({
        items: [],
        total: 0,
        page: 1,
        perPage: 20,
        hasMore: false,
      }),
      get: async () => null,
      getByNumber: async () => null,
      create: async () => {
        throw new Error('not implemented');
      },
      update: async () => {
        throw new Error('not implemented');
      },
      addTransaction: async () => {
        throw new Error('not implemented');
      },
      updateStatus: async () => {
        throw new Error('not implemented');
      },
    },
    customers: {
      get: async () => null,
      getByEmail: async () => null,
      create: async () => ({
        id: '1',
        email: '',
        addresses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: async () => ({
        id: '1',
        email: '',
        addresses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      addAddress: async () => ({
        id: '1',
        email: '',
        addresses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
  };
}

describe('starter runtime smoke test', () => {
  const app = createStarterApp({
    database: createMockDatabase() as any,
    stripe: null,
  });

  it('renders home page with featured products', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Welcome to TillKit');
    expect(text).toContain('Test Product');
  });

  it('renders products page with search', async () => {
    const res = await app.request('/products');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Products');
  });

  it('renders empty cart page', async () => {
    const res = await app.request('/cart');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Cart');
  });

  it('returns cart count as zero', async () => {
    const res = await app.request('/cart/count');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('0');
  });

  it('returns 404 for nonexistent product', async () => {
    const res = await app.request('/products/nonexistent');
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toContain('Not Found');
  });

  it('returns styles.css', async () => {
    const res = await app.request('/styles.css');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/css');
    const text = await res.text();
    expect(text).toContain('--primary');
  });
});
