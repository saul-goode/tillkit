import { Hono } from 'hono';
import { createSearchService, type SearchProvider } from '@tillkit/integration-search';
export type { SearchProvider, SearchOptions, SearchResult } from '@tillkit/integration-search';
export { createSearchProvider } from '@tillkit/integration-search';

export interface SearchConfig {
  provider: SearchProvider;
  enabled?: boolean;
}

export function createSearchRoutes(searchConfig: SearchConfig) {
  const search = createSearchService(searchConfig.provider);
  const app = new Hono();

  app.get('/', async (c) => {
    const query = c.req.query('q') || '';
    const page = parseInt(c.req.query('page') || '1', 10);
    const perPage = parseInt(c.req.query('perPage') || '20', 10);
    const status = c.req.query('status') as string | undefined;
    const sort = c.req.query('sort') as string | undefined;

    if (!query.trim()) {
      return c.json({ items: [], total: 0, page, perPage });
    }

    try {
      const result = await search.search(query, {
        page,
        perPage,
        filters: status ? { status } : undefined,
        sort,
      });
      return c.json(result);
    } catch (err: any) {
      console.error('Search error:', err);
      return c.json({ error: 'Search failed', message: err?.message }, 500);
    }
  });

  return app;
}

export { createSearchService };
