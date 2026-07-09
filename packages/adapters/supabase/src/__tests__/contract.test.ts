import { describe } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { runContractTests } from '../../../__tests__/contract.js';
import { supabaseAdapter } from '../index.js';

/**
 * Same contract, same assertions as the PocketBase suite (constitution II).
 *
 * Requires a live Supabase project whose schema has been provisioned with the
 * SQL from `setup().requiredSql` — this adapter cannot execute DDL over
 * PostgREST, so the unique indexes must already exist. Without them the
 * idempotency tests would pass vacuously.
 *
 * Set SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_KEY to run.
 */
const url = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_KEY;

const TRUNCATE = ['processed_webhook_events', 'orders'];

if (!url || !serviceKey) {
  // Not silently absent: an explicitly skipped suite is visible in test output.
  describe.skip(
    'DatabaseAdapter contract: supabase (SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_KEY not set)',
    () => {},
  );
} else {
  runContractTests('supabase', async () => {
    const client = createClient(url, serviceKey);
    return {
      adapter: supabaseAdapter({ url, serviceKey }),
      async reset() {
        for (const table of TRUNCATE) {
          // Delete-all; the schema and its unique indexes must survive.
          await client.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        }
      },
    };
  });
}
