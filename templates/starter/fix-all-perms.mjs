import PocketBase from 'pocketbase';

const url = 'http://localhost:8090';
const pb = new PocketBase(url);
await pb.collection('_superusers').authWithPassword('admin@tillkit.local', 'password123');

const collections = ['orders', 'carts', 'customers', 'processed_webhook_events'];
for (const name of collections) {
  try {
    const coll = await pb.collections.getOne(name);
    await pb.collections.update(coll.id, {
      ...coll,
      listRule: '',
      viewRule: '',
    });
    console.log(`Updated ${name}: listRule/viewRule set to public`);
  } catch (e) {
    console.log(`Skipping ${name}: ${e.message}`);
  }
}
