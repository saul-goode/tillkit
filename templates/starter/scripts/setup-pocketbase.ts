import { pocketbaseAdapter, type PocketbaseAdapterConfig } from '@tillkit/adapter-pocketbase';
import { getDefaultFeatures } from '@tillkit/core';

const url = process.env.POCKETBASE_URL || 'http://localhost:8090';
const adminToken = process.env.POCKETBASE_ADMIN_TOKEN;

// Collection creation requires superuser auth on any non-fresh instance.
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
    console.log('No POCKETBASE_ADMIN_TOKEN set — this only works on a fresh, unsecured instance.');
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
