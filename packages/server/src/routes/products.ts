import { Hono } from 'hono';
import type { DatabaseAdapter } from '@tillkit/core';
import type { SearchService } from '@tillkit/integration-search';

// Create router for products
export function createProductRoutes(db: DatabaseAdapter, searchService?: SearchService) {
  const app = new Hono();
  
  // List products with filtering
  app.get('/', async (c) => {
    const query = c.req.query();
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const status = query.status as string | undefined;
    
    const result = await db.products.list({
      limit,
      offset: (page - 1) * limit,
      filters: status ? { status } : undefined,
    });
    
    return c.json(result);
  });
  
  // Search products via SearchProvider (Meilisearch) if available, else fallback to DB
  app.get('/search', async (c) => {
    const query = c.req.query('q');
    if (!query) {
      return c.json({ items: [] });
    }
    
    // If search service is configured, use it for ranked search
    if (searchService) {
      try {
        const result = await searchService.search(query, { page: 1, perPage: 20 });
        return c.json({ items: result.items, total: result.total });
      } catch (err) {
        console.error('Search service error, falling back to DB:', err);
      }
    }
    
    // Fallback to database search
    const products = await db.products.search(query);
    return c.json({ items: products });
  });
  
  // Get single product by slug
  app.get('/:slug', async (c) => {
    const slug = c.req.param('slug');
    const product = await db.products.getBySlug(slug);
    
    if (!product) {
      return c.json({ error: 'Product not found' }, 404);
    }
    
    return c.json({ product });
  });
  
  // Create product (admin)
  app.post('/', async (c) => {
    const data = await c.req.json();
    const product = await db.products.create(data);
    if (searchService) {
      try { await searchService.sync(product, 'create'); } catch (e) { console.error('Search sync (create) failed:', e); }
    }
    return c.json({ product }, 201);
  });
  
  // Update product (admin)
  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const data = await c.req.json();
    const product = await db.products.update(id, data);
    if (searchService) {
      try { await searchService.sync(product, 'update'); } catch (e) { console.error('Search sync (update) failed:', e); }
    }
    return c.json({ product });
  });
  
  // Delete product (admin)
  app.delete('/:id', async (c) => {
    const id = c.req.param('id');
    await db.products.delete(id);
    if (searchService) {
      try { await searchService.sync({ id } as any, 'delete'); } catch (e) { console.error('Search sync (delete) failed:', e); }
    }
    return c.json({ success: true });
  });
  
  return app;
}
