import { DatabaseAdapter } from '@tillkit/core';

interface PocketbaseAdapterConfig {
    url: string;
    adminEmail?: string;
    adminPassword?: string;
    adminToken?: string;
}
declare function pocketbaseAdapter(config: PocketbaseAdapterConfig): DatabaseAdapter;
type PocketbaseAdapter = ReturnType<typeof pocketbaseAdapter>;

export { type PocketbaseAdapter, type PocketbaseAdapterConfig, pocketbaseAdapter };
