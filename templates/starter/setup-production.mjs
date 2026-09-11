#!/usr/bin/env node
/**
 * One-time production setup for TillKit on pockethost.io.
 * Reads credentials from .env file (ADMIN_EMAIL, ADMIN_PASSWORD).
 */

import PocketBase from 'pocketbase';
import fs from 'node:fs';

// Read .env file
function loadEnv(path) {
  const env = {};
  if (!fs.existsSync(path)) return env;
  const text = fs.readFileSync(path, 'utf-8');
  for (const line of text.split('\n')) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      env[match[1]] = value;
    }
  }
  return env;
}

const env = loadEnv('.env');

const URL = env.POCKETBASE_URL || 'https://tillkit.pockethost.io';
const ADMIN_EMAIL = env.ADMIN_EMAIL;
const ADMIN_PASSWORD = env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('ERROR: Add ADMIN_EMAIL and ADMIN_PASSWORD to .env');
  process.exit(1);
}

const pb = new PocketBase(URL);

// Try both auth methods
console.log(`\n🔗 Logging into ${URL}...\n`);
let loggedIn = false;

try {
  await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  loggedIn = true;
  console.log('✅ Authenticated via /api/admins/auth-with-password\n');
} catch (e) {
  console.log('   /api/admins/auth-with-password failed:', e.message);
}

if (!loggedIn) {
  try {
    await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
    loggedIn = true;
    console.log('✅ Authenticated via /api/collections/_superusers/auth-with-password\n');
  } catch (e) {
    console.log('   /api/collections/_superusers/auth-with-password failed:', e.message);
  }
}

if (!loggedIn) {
  console.error('\n❌ Both auth methods failed. Check email/password.');
  process.exit(1);
}

const ADMIN_TOKEN = pb.authStore.token;

const TIMESTAMPS = [
  { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
  { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
];

const text = (name, required = false) => ({ name, type: 'text', required });
const number = (name, required = false) => ({ name, type: 'number', required });
const json = (name, required = false) => ({ name, type: 'json', required, maxSize: 2_000_000 });
const select = (name, values, required = false) => ({ name, type: 'select', required, maxSelect: 1, values });
const email = (name, required = false) => ({ name, type: 'email', required });

async function collectionExists(name) {
  try {
    await pb.collections.getOne(name);
    return true;
  } catch {
    return false;
  }
}

const COLLECTIONS = [
  {
    name: 'products',
    fields: [
      text('slug', true), text('name', true), text('description'),
      number('price', true), number('compareAtPrice'),
      json('images'), json('inventory'), json('seo'), json('metadata'),
      select('status', ['draft', 'active', 'archived'], true),
      ...TIMESTAMPS,
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_products_slug` ON `products` (`slug`)'],
    listRule: '', viewRule: '',
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
  },
  {
    name: 'carts',
    fields: [
      text('sessionId', true), text('customerId'), json('items'),
      number('subtotal'), number('totalTax'), number('totalShipping'),
      number('totalDiscount'), number('total'), text('currency'),
      ...TIMESTAMPS,
    ],
    listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '',
  },
  {
    name: 'orders',
    fields: [
      text('orderNumber', true), text('customerId'), text('email', true),
      select('status', ['pending', 'confirmed', 'paid', 'fulfilled', 'shipped', 'delivered', 'cancelled', 'refunded'], true),
      select('paymentStatus', ['pending', 'authorized', 'paid', 'partially_refunded', 'refunded', 'failed'], true),
      select('fulfillmentStatus', ['unfulfilled', 'partially_fulfilled', 'fulfilled', 'returned'], true),
      json('items'), number('subtotal'), number('totalTax'), number('totalShipping'),
      number('totalDiscount'), number('total'), text('currency'),
      json('shippingAddress'), json('billingAddress'), json('transactions'),
      text('notes'), json('metadata'), text('gateway'), text('gatewayRef'),
      ...TIMESTAMPS,
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_orders_number` ON `orders` (`orderNumber`)',
      "CREATE UNIQUE INDEX `idx_orders_gateway_ref` ON `orders` (`gateway`, `gatewayRef`) WHERE `gatewayRef` != ''",
    ],
    listRule: "@request.auth.id != ''", viewRule: "@request.auth.id != ''",
    createRule: '', updateRule: "@request.auth.id != ''", deleteRule: "@request.auth.id != ''",
  },
  {
    name: 'processed_webhook_events',
    fields: [
      text('gateway', true), text('eventId', true), text('eventType', true),
      select('outcome', ['processed', 'ignored', 'failed'], true),
      text('orderId'), text('processedAt'),
      ...TIMESTAMPS,
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_webhook_events` ON `processed_webhook_events` (`gateway`, `eventId`)'],
    listRule: "@request.auth.id != ''", viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''", updateRule: "@request.auth.id != ''", deleteRule: "@request.auth.id != ''",
  },
  {
    name: 'customers',
    fields: [
      email('email', true), text('firstName'), text('lastName'), text('phone'),
      json('addresses'), text('defaultAddressId'), json('metadata'),
      ...TIMESTAMPS,
    ],
    listRule: "@request.auth.id != ''", viewRule: "@request.auth.id != ''",
    createRule: '', updateRule: "@request.auth.id != ''", deleteRule: "@request.auth.id != ''",
  },
];

const DEMO_PRODUCTS = [
  {
    slug: 'tillkit-sticker-pack', name: 'TillKit Sticker Pack',
    description: 'A pack of 5 vinyl stickers featuring the TillKit logo, e-commerce icons, and developer humor. Waterproof and laptop-friendly.',
    price: 999, status: 'active',
    images: [{ url: 'https://placehold.co/600x600/111/FFF?text=Sticker+Pack', alt: 'TillKit Sticker Pack' }],
    inventory: { quantity: 100, available: 100, allowOutOfStock: false },
  },
  {
    slug: 'tillkit-mug', name: 'TillKit Ceramic Mug',
    description: 'A premium ceramic mug for your morning coffee or late-night debugging sessions. Features the TillKit wordmark on both sides.',
    price: 1899, status: 'active',
    images: [{ url: 'https://placehold.co/600x600/222/FFF?text=Ceramic+Mug', alt: 'TillKit Ceramic Mug' }],
    inventory: { quantity: 50, available: 50, allowOutOfStock: false },
  },
  {
    slug: 'tillkit-tote', name: 'TillKit Canvas Tote',
    description: 'Heavy-duty canvas tote bag with a minimalist TillKit logo. Perfect for carrying your laptop, notebooks, and side-project ambitions.',
    price: 2499, status: 'active',
    images: [{ url: 'https://placehold.co/600x600/333/FFF?text=Canvas+Tote', alt: 'TillKit Canvas Tote' }],
    inventory: { quantity: 40, available: 40, allowOutOfStock: false },
  },
  {
    slug: 'tillkit-hoodie', name: 'TillKit Hoodie',
    description: 'Soft, heavyweight hoodie with a small chest logo and full-back TillKit wordmark. Because debugging is colder than it looks.',
    price: 4999, status: 'active',
    images: [{ url: 'https://placehold.co/600x600/444/FFF?text=Hoodie', alt: 'TillKit Hoodie' }],
    inventory: { quantity: 25, available: 25, allowOutOfStock: false },
  },
];

console.log('═'.repeat(60));
console.log('  TillKit Production Setup');
console.log('═'.repeat(60) + '\n');

for (const col of COLLECTIONS) {
  const exists = await collectionExists(col.name);
  if (exists) {
    console.log(`📦 ${col.name}: updating rules...`);
    const existing = await pb.collections.getOne(col.name);
    await pb.collections.update(existing.id, {
      ...existing,
      listRule: col.listRule, viewRule: col.viewRule,
      createRule: col.createRule, updateRule: col.updateRule, deleteRule: col.deleteRule,
    });
    console.log(`   ✅ Rules updated\n`);
  } else {
    console.log(`📦 ${col.name}: creating...`);
    await pb.collections.create({
      name: col.name, type: 'base', fields: col.fields, indexes: col.indexes || [],
      listRule: col.listRule, viewRule: col.viewRule,
      createRule: col.createRule, updateRule: col.updateRule, deleteRule: col.deleteRule,
    });
    console.log(`   ✅ Created\n`);
  }
}

console.log('🌱 Seeding demo products...\n');
for (const product of DEMO_PRODUCTS) {
  try {
    await pb.collection('products').getFirstListItem(`slug="${product.slug}"`);
    console.log(`   ${product.name}: already exists (skipping)`);
  } catch {
    await pb.collection('products').create(product);
    console.log(`   ✅ ${product.name}`);
  }
}

console.log('\n' + '═'.repeat(60));
console.log('  SETUP COMPLETE');
console.log('═'.repeat(60));
console.log(`\n🔑 Admin Token: ${ADMIN_TOKEN.slice(0, 20)}...`);
console.log(`   (Save this for TillKit dashboard access)\n`);
console.log('📋 ENV VARS FOR DEPLOYMENT:');
console.log(`   POCKETBASE_URL=${URL}`);
console.log(`   APP_URL=https://tillkit.dev`);
console.log(`   ADMIN_TOKEN=<your-secure-token>`);
console.log('\n✅ No admin token needed for the public app.\n');
