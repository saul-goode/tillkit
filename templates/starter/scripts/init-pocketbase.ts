import PocketBase from 'pocketbase';

const URL = 'http://127.0.0.1:8090';
const pb = new PocketBase(URL);

async function init() {
  // Create first admin
  try {
    await pb.admins.create({
      email: 'test@test.com',
      password: 'test123456',
      passwordConfirm: 'test123456',
    });
    console.log('Admin created: test@test.com / test123456');
  } catch (e: any) {
    console.log('Admin result:', e.message || 'OK');
  }

  // Authenticate as admin
  await pb.admins.authWithPassword('test@test.com', 'test123456');
  console.log('Admin authenticated');

  // Create collections if they don't exist
  const collections = ['products', 'orders', 'customers', 'carts'];
  for (const name of collections) {
    try {
      await pb.collections.create({
        name,
        type: 'base',
        schema: [
          { name: 'slug', type: 'text', required: true },
          { name: 'name', type: 'text', required: true },
          { name: 'description', type: 'text' },
          { name: 'price', type: 'number', required: false },
          { name: 'status', type: 'select', options: { values: ['draft','active','archived'] } },
          { name: 'images', type: 'json' },
          { name: 'variants', type: 'json' },
          { name: 'options', type: 'json' },
          { name: 'inventory', type: 'json' },
          { name: 'seo', type: 'json' },
          { name: 'metadata', type: 'json' },
          { name: 'subscription', type: 'json' },
        ],
      });
      console.log(`Created collection: ${name}`);
    } catch (e: any) {
      if (e.response?.message?.includes('already exists') || e.status === 400) {
        console.log(`Collection ${name} already exists`);
      } else {
        console.error(`Error creating ${name}:`, e.message);
      }
    }
  }

  // Seed products
  const existing = await pb.collection('products').getList(1, 1);
  if (existing.totalItems === 0) {
    await pb.collection('products').create({
      slug: 'test-shirt',
      name: 'Test Shirt',
      description: 'A comfortable test shirt',
      price: 19.99,
      status: 'active',
      images: [{ url: 'https://via.placeholder.com/400x400', alt: 'Test Shirt' }],
      inventory: { quantity: 100, available: 100, allowOutOfStock: false },
    });
    await pb.collection('products').create({
      slug: 'test-mug',
      name: 'Test Mug',
      description: 'Ceramic mug',
      price: 12.99,
      status: 'active',
      images: [{ url: 'https://via.placeholder.com/400x400', alt: 'Test Mug' }],
      inventory: { quantity: 50, available: 50, allowOutOfStock: false },
    });
    console.log('Seeded 2 products');
  } else {
    console.log('Products already exist');
  }
}

init().catch(console.error);
