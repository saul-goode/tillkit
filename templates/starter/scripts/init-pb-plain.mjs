// Plain Node.js script (no deps) — setup PocketBase for local testing
const API = 'http://127.0.0.1:8090/api';

async function api(path, opts) {
  const res = await fetch(`${API}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = {}; }
  return { status: res.status, json };
}

async function init() {
  // 1. Auth as admin
  const auth = await api('/admins/auth-with-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'test@test.com', password: 'test123456' }),
  });
  if (auth.status !== 200) {
    console.error('Auth failed:', auth.json);
    process.exit(1);
  }
  const token = auth.json.token;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': token,
  };
  console.log('Admin authenticated');

  // 2. Create collections if missing
  const collections = ['products', 'orders', 'customers', 'carts'];
  for (const name of collections) {
    const existing = await api(`/collections/${name}`, { headers });
    if (existing.status === 404) {
      console.log(`Creating collection: ${name}`);
      await api('/collections', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name,
          type: 'base',
          schema: [
            { name: 'slug', type: 'text', required: true, options: { min: 1 } },
            { name: 'name', type: 'text', required: true },
            { name: 'description', type: 'text' },
            { name: 'price', type: 'number' },
            { name: 'compareAtPrice', type: 'number' },
            { name: 'images', type: 'json' },
            { name: 'variants', type: 'json' },
            { name: 'options', type: 'json' },
            { name: 'inventory', type: 'json' },
            { name: 'seo', type: 'json' },
            { name: 'metadata', type: 'json' },
            { name: 'subscription', type: 'json' },
            { name: 'status', type: 'select', options: { values: ['draft','active','archived'] } },
          ],
        }),
      });
      console.log(`Created: ${name}`);
    } else {
      console.log(`Collection ${name} already exists`);
    }
  }

  // 3. Seed products
  const list = await api('/collections/products/records?page=1&perPage=1', { headers });
  if (list.json.totalItems === 0) {
    console.log('Seeding products...');
    await api('/collections/products/records', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        slug: 'test-shirt',
        name: 'Test Shirt',
        description: 'A comfortable test shirt',
        price: 1999,
        status: 'active',
        images: [{ url: 'https://via.placeholder.com/400x400', alt: 'Test Shirt' }],
        inventory: { quantity: 100, available: 100, allowOutOfStock: false },
      }),
    });
    await api('/collections/products/records', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        slug: 'test-mug',
        name: 'Test Mug',
        description: 'Ceramic mug',
        price: 1299,
        status: 'active',
        images: [{ url: 'https://via.placeholder.com/400x400', alt: 'Test Mug' }],
        inventory: { quantity: 50, available: 50, allowOutOfStock: false },
      }),
    });
    console.log('Seeded 2 products');
  } else {
    console.log('Products already exist');
  }

  // 4. Seed orders
  const olist = await api('/collections/orders/records?page=1&perPage=1', { headers });
  if (olist.json.totalItems === 0) {
    console.log('Seeding demo order...');
    await api('/collections/orders/records', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: 'test@example.com',
        status: 'paid',
        paymentStatus: 'paid',
        fulfillmentStatus: 'unfulfilled',
        items: [
          { productId: ' shirt', name: 'Test Shirt', sku: 'test-shirt', price: 1999, quantity: 1, total: 1999 },
        ],
        subtotal: 1999,
        totalTax: 0,
        totalShipping: 0,
        totalDiscount: 0,
        total: 1999,
        currency: 'USD',
        transactions: [],
        notes: '',
      }),
    });
    console.log('Seeded demo order');
  }

  console.log('\n✅ PocketBase ready at http://127.0.0.1:8090/_');
  console.log('   login: test@test.com / test123456');
}

init().catch(err => {
  console.error(err);
  process.exit(1);
});
