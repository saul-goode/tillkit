import { DatabaseAdapter } from '@tillkit/core';

interface SupabaseAdapterConfig {
    url: string;
    serviceKey: string;
}
declare function supabaseAdapter(config: SupabaseAdapterConfig): DatabaseAdapter;
type SupabaseAdapter = ReturnType<typeof supabaseAdapter>;

export { type SupabaseAdapter, type SupabaseAdapterConfig, supabaseAdapter };
