import { DatabaseAdapter, Product } from '@tillkit/core';

interface SearchResult {
    items: Product[];
    total: number;
    page: number;
    perPage: number;
}
interface SearchProvider {
    search(query: string, options?: SearchOptions): Promise<SearchResult>;
    index(products: Product[]): Promise<void>;
    add(product: Product): Promise<void>;
    remove(productId: string): Promise<void>;
    update(product: Product): Promise<void>;
}
interface SearchOptions {
    page?: number;
    perPage?: number;
    filters?: Record<string, string | string[]>;
    sort?: string;
}
interface DatabaseSearchConfig {
    provider: 'database';
    database: DatabaseAdapter;
}
declare function databaseSearchProvider(config: DatabaseSearchConfig): SearchProvider;
interface MeilisearchConfig {
    provider: 'meilisearch';
    host: string;
    apiKey: string;
    indexName?: string;
}
declare function meilisearchProvider(config: MeilisearchConfig): SearchProvider;
declare function mockSearchProvider(products?: Product[]): SearchProvider;
interface SearchService {
    provider: SearchProvider;
    search(query: string, options?: SearchOptions): Promise<SearchResult>;
    index(products: Product[]): Promise<void>;
    sync(product: Product, action: 'create' | 'update' | 'delete'): Promise<void>;
}
declare function createSearchService(provider: SearchProvider): SearchService;
type SearchConfig = DatabaseSearchConfig | MeilisearchConfig;
declare function createSearchProvider(config: SearchConfig): SearchProvider;

export { type DatabaseSearchConfig, type MeilisearchConfig, type SearchConfig, type SearchOptions, type SearchProvider, type SearchResult, type SearchService, createSearchProvider, createSearchService, databaseSearchProvider, meilisearchProvider, mockSearchProvider };
