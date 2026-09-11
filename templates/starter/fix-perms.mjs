import PocketBase from 'pocketbase';
const url = 'http://localhost:8090';
const pb = new PocketBase(url);
await pb.collection('_superusers').authWithPassword('admin@tillkit.local', 'password123');

// Get existing collection and update rules
const coll = await pb.collections.getOne('products');
await pb.collections.update(coll.id, {
  ...coll,
  listRule: '',
  viewRule: '',
});
console.log('Products collection updated: listRule and viewRule set to public');
