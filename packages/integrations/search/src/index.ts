// Search Integration for TillKit
// Supports: Database FTS (MVP) → Meilisearch (production)

import type { Product } from '@tillkit/core';
import type { DatabaseAdapter } from '@tillkit/core';

export interface SearchResult {
  items: Product[];
  total: number;
  page: number;
  perPage: number;
}

export interface SearchProvider {
  search(query: string, options?: SearchOptions): Promise<SearchResult>;
  index(products: Product[]): Promise<void>;
  add(product: Product): Promise<void>;
  remove(productId: string): Promise<void>;
  update(product: Product): Promise<void>;
}

export interface SearchOptions {
  page?: number;
  perPage?: number;
  filters?: Record<string, string | string[]>;
  sort?: string;
}

// Database FTS adapter (uses adapter's built-in search)
export interface DatabaseSearchConfig {
  provider: 'database';
  database: DatabaseAdapter;
}

export function databaseSearchProvider(config: DatabaseSearchConfig): SearchProvider {
  return {
    async search(query, options = {}) {
      const page = options.page || 1;
      const perPage = options.perPage || 20;
      
      const products = await config.database.products.search(query);
      const total = products.length;
      const start = (page - 1) * perPage;
      const items = products.slice(start, start + perPage);
      
      return { items, total, page, perPage };
    },
    
    async index() {
      // No-op - database handles indexing
      console.log('Database search: products indexed by database adapter');
    },
    
    async add() {
      // No-op
    },
    
    async remove() {
      // No-op
    },
    
    async update() {
      // No-op
    },
  };
}

// Meilisearch adapter (production scale)
export interface MeilisearchConfig {
  provider: 'meilisearch';
  host: string;
  apiKey: string;
  indexName?: string;
}

export function meilisearchProvider(config: MeilisearchConfig): SearchProvider {
  const indexName = config.indexName || 'products';
  
  async function fetchMeilisearch(path: string, options: RequestInit = {}) {
    const response = await fetch(`${config.host}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Meilisearch error: ${error}`);
    }
    
    return response.json();
  }
  
  return {
    async search(query, options = {}) {
      const page = options.page || 1;
      const perPage = options.perPage || 20;
      
      const filters: string[] = [];
      if (options.filters) {
        for (const [key, value] of Object.entries(options.filters)) {
          if (Array.isArray(value)) {
            filters.push(`${key} IN [${value.map(v => `"${v}"`).join(',')}]`);
          } else {
            filters.push(`${key} = "${value}"`);
          }
        }
      }
      
      const result = await fetchMeilisearch(`/indexes/${indexName}/search`, {
        method: 'POST',
        body: JSON.stringify({
          q: query,
          offset: (page - 1) * perPage,
          limit: perPage,
          filter: filters.length > 0 ? filters.join(' AND ') : undefined,
          sort: options.sort ? [options.sort] : undefined,
        }),
      }) as { hits: Product[]; totalHits?: number; estimatedTotalHits?: number };
      
      return {
        items: result.hits,
        total: result.totalHits || result.estimatedTotalHits || 0,
        page,
        perPage,
      };
    },
    
    async index(products) {
      // Configure index settings
      await fetchMeilisearch(`/indexes/${indexName}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          searchableAttributes: ['name', 'description', 'slug', 'tags'],
          filterableAttributes: ['status', 'price', 'category', 'tags'],
          sortableAttributes: ['price', 'createdAt', 'name'],
          rankingRules: [
            'words',
            'typo',
            'proximity',
            'attribute',
            'sort',
            'exactness',
          ],
        }),
      });
      
      // Add documents
      await fetchMeilisearch(`/indexes/${indexName}/documents`, {
        method: 'POST',
        body: JSON.stringify(products.map(p => ({
          ...p,
          // Flatten for search
          _searchable: `${p.name} ${p.description || ''} ${p.slug}`,
        }))),
      });
    },
    
    async add(product) {
      await fetchMeilisearch(`/indexes/${indexName}/documents`, {
        method: 'POST',
        body: JSON.stringify([{
          ...product,
        }]),
      });
    },
    
    async remove(productId) {
      await fetchMeilisearch(`/indexes/${indexName}/documents/${productId}`, {
        method: 'DELETE',
      });
    },
    
    async update(product) {
      await fetchMeilisearch(`/indexes/${indexName}/documents`, {
        method: "POST",
        body: JSON.stringify([product]),
      });
    },
  };
}

// Mock search provider (for testing)
export function mockSearchProvider(products: Product[] = []): SearchProvider {
  let indexedProducts = [...products];
  
  return {
    async search(query, options = {}) {
      const page = options.page || 1;
      const perPage = options.perPage || 20;
      
      const q = query.toLowerCase();
      const results = indexedProducts.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q)
      );
      
      const start = (page - 1) * perPage;
      const items = results.slice(start, start + perPage);
      
      return { items, total: results.length, page, perPage };
    },
    
    async index(products) {
      indexedProducts = [...products];
    },
    
    async add(product) {
      const idx = indexedProducts.findIndex(p => p.id === product.id);
      if (idx >= 0) {
        indexedProducts[idx] = product;
      } else {
        indexedProducts.push(product);
      }
    },
    
    async remove(productId) {
      indexedProducts = indexedProducts.filter(p => p.id !== productId);
    },
    
    async update(product) {
      await this.add(product);
    },
  };
}

// Search service with fallbacks
export interface SearchService {
  provider: SearchProvider;
  search(query: string, options?: SearchOptions): Promise<SearchResult>;
  index(products: Product[]): Promise<void>;
  sync(product: Product, action: 'create' | 'update' | 'delete'): Promise<void>;
}

export function createSearchService(provider: SearchProvider): SearchService {
  return {
    provider,
    
    async search(query, options) {
      if (!query || query.trim() === '') {
        return { items: [], total: 0, page: 1, perPage: options?.perPage || 20 };
      }
      return provider.search(query, options);
    },
    
    async index(products) {
      await provider.index(products);
    },
    
    async sync(product, action) {
      switch (action) {
        case 'create':
          await provider.add(product);
          break;
        case 'update':
          await provider.update(product);
          break;
        case 'delete':
          await provider.remove(product.id);
          break;
      }
    },
  };
}

// Factory to create provider based on config
export type SearchConfig = DatabaseSearchConfig | MeilisearchConfig;

export function createSearchProvider(config: SearchConfig): SearchProvider {
  switch (config.provider) {
    case 'database':
      return databaseSearchProvider(config);
    case 'meilisearch':
      return meilisearchProvider(config);
    default:
      throw new Error(`Unknown search provider: ${(config as any).provider}`);
  }
}
