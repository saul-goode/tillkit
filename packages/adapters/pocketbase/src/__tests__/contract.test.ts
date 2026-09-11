import { describe } from 'vitest';
import PocketBase from 'pocketbase';
import { runContractTests } from '../../../__tests__/contract.js';
import { pocketbaseAdapter } from '../index.js';

/**
 * The contract suite must run against a REAL PocketBase: the guarantees under
 * test (unique indexes, concurrent-insert serialization) live in the database,
 * not in adapter code. A mock would pass while proving nothing.
 *
 * Set POCKETBASE_TEST_URL (plus admin credentials) to run these. CI starts a
 * PocketBase binary; see .github/workflows/ci.yml.
 */
const url = process.env.POCKETBASE_TEST_URL;
const adminEmail = process.env.POCKETBASE_TEST_ADMIN_EMAIL ?? 'test@test.com';
const adminPassword = process.env.POCKETBASE_TEST_ADMIN_PASSWORD ?? 'test123456';

const FEATURES = {
  variants: true,
  collections: false,
  inventoryTracking: true,
  subscriptions: false,
  multiCurrency: false,
};

/** Collections the contract suite writes to. Truncated between tests. */
const TRUNCATE = ['processed_webhook_events', 'orders', 'carts'];

if (!url) {
  describe.skip('DatabaseAdapter contract: pocketbase (POCKETBASE_TEST_URL not set)', () => {});
} else {
  runContractTests('pocketbase', async () => {
    const pb = new PocketBase(url);
    await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);
    const adapter = pocketbaseAdapter({ url, adminToken: pb.authStore.token });

    // Provision once. setup() is create-if-missing, so this is a no-op after
    // the first call — which is also what case 8 asserts.
    await adapter.setup(FEATURES);

    return {
      adapter,
      async reset() {
        // Truncate records rather than dropping collections: the schema (and
        // critically, its unique indexes) must survive, since they are what
        // these tests exercise.
        for (const name of TRUNCATE) {
          const records = await pb.collection(name).getFullList({ batch: 200 });
          await Promise.all(records.map((r) => pb.collection(name).delete(r.id)));
        }
      },
    };
  });
}
