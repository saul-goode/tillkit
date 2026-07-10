import PocketBase from 'pocketbase';
import { pocketbaseAdapter, type PocketbaseAdapterConfig } from '@tillkit/adapter-pocketbase';
import { getDefaultFeatures } from '@tillkit/core';

const url = process.env.POCKETBASE_URL || 'http://localhost:8090';
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

/**
 * Collection creation requires superuser auth. Accept either a token or the
 * credentials, matching `migrate.ts` — asking for a token is a poor first-run
 * experience when the user just created a superuser on the command line.
 */
async function resolveAdminToken(): Promise<string | undefined> {
  if (process.env.POCKETBASE_ADMIN_TOKEN) return process.env.POCKETBASE_ADMIN_TOKEN;
  if (adminEmail && adminPassword) {
    const pb = new PocketBase(url);
    // `_superusers` is an ordinary auth collection since PocketBase v0.23.
    await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);
    return pb.authStore.token;
  }
  return undefined;
}

const adminToken = await resolveAdminToken();

const config: PocketbaseAdapterConfig = { url };
if (adminToken) config.adminToken = adminToken;

const db = pocketbaseAdapter(config);

const seedProducts = [
  {
    slug: 'test-shirt',
    name: 'Test Shirt',
    description: 'A comfortable test shirt',
    price: 1999,
    status: 'active' as const,
    images: [{ url: 'https://via.placeholder.com/400x400', alt: 'Test Shirt' }],
    inventory: { quantity: 100, available: 100, allowOutOfStock: false },
  },
  {
    slug: 'test-mug',
    name: 'Test Mug',
    description: 'Ceramic mug for your morning coffee',
    price: 1299,
    status: 'active' as const,
    images: [{ url: 'https://via.placeholder.com/400x400', alt: 'Test Mug' }],
    inventory: { quantity: 50, available: 50, allowOutOfStock: false },
  },
];

async function main() {
  console.log('Setting up PocketBase at', url);
  if (!adminToken) {
    console.log(
      'No superuser auth. Set POCKETBASE_ADMIN_TOKEN, or ' +
        'POCKETBASE_ADMIN_EMAIL + POCKETBASE_ADMIN_PASSWORD. Collection creation will likely fail.',
    );
  }

  const setup = await db.setup(getDefaultFeatures());
  console.log(
    setup.created
      ? `Created collections: ${setup.createdCollections.join(', ')}`
      : 'Collections already exist',
  );

  const existing = await db.products.list({ limit: 1 });
  if (existing.total > 0) {
    console.log('Products already exist — skipping seed');
    console.log('Done!');
    return;
  }

  for (const product of seedProducts) {
    await db.products.create(product);
    console.log('Seeded:', product.name);
  }

  console.log('Done!');
}

main().catch((err) => {
  console.error('Setup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
