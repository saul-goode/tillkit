import { pocketbaseAdapter } from '@tillkit/adapter-pocketbase';

const url = process.env.POCKETBASE_URL || 'http://localhost:8090';
const db = pocketbaseAdapter({ url });

async function main() {
  console.log('Setting up PocketBase at', url);

  const setup = await db.setup({
    variants: true,
    collections: false,
    inventoryTracking: true,
    subscriptions: false,
    multiCurrency: false,
  });
  console.log('Setup:', setup.created ? 'Created collections' : 'Collections exist');

  const existing = await db.products.list({ limit: 1 });
  if (existing.total === 0) {
    const products = [
      {
        slug: 'test-shirt',
        name: 'Test Shirt',
        description: 'A comfortable test shirt',
        price: 1999,
        status: 'active',
        images: [{ url: 'https://via.placeholder.com/400x400', alt: 'Test Shirt' }],
        inventory: { quantity: 100, available: 100, allowOutOfStock: false },
      },
      {
        slug: 'test-mug',
        name: 'Test Mug',
        description: 'Ceramic mug for your morning coffee',
        price: 1299,
        status: 'active',
        images: [{ url: 'https://via.placeholder.com/400x400', alt: 'Test Mug' }],
        inventory: { quantity: 50, available: 50, allowOutOfStock: false },
      },
    ];
    for (const p of products) {
      try {
        // @ts-ignore
        await db.products.create(p);
        console.log('Seeded:', p.name);
      } catch (e: any) {
        console.error('Seed error', p.name, ':', e.message);
      }
    }
  } else {
    console.log('Products already exist');
  }

  console.log('Done!');
}

main().catch(console.error);
