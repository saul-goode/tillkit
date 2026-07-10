/**
 * `tillkit migrate` — additive, idempotent schema migration.
 *
 * `setup()` is create-if-missing per collection, so an existing store receives
 * nothing when the schema changes. Without this script, spec 018's unique
 * indexes never appear on installed stores and idempotency fails open: every
 * insert succeeds, duplicate orders are created, and nothing looks wrong.
 *
 * Re-running is a clean no-op.
 */
import PocketBase from 'pocketbase';
import {
  ORDER_INDEXES,
  PRODUCT_INDEXES,
  WEBHOOK_EVENT_INDEXES,
  TIMESTAMP_FIELDS,
  assertSupportedVersion,
  pbField,
} from '@tillkit/adapter-pocketbase';

const url = process.env.POCKETBASE_URL || 'http://localhost:8090';
const adminToken = process.env.POCKETBASE_ADMIN_TOKEN;
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

// Field shape is the adapter's business; a second copy here would drift.
const { text, select } = pbField;

type Change = { description: string; applied: boolean };
const changes: Change[] = [];

function record(description: string, applied: boolean) {
  changes.push({ description, applied });
  console.log(`  ${applied ? '+' : '·'} ${description}${applied ? '' : ' (already present)'}`);
}

async function authenticate(pb: PocketBase) {
  if (adminToken) {
    pb.authStore.save(adminToken, null);
    return;
  }
  if (adminEmail && adminPassword) {
    // `_superusers` is an ordinary auth collection since v0.23; the old
    // `/api/admins` routes are gone. `pb.admins` is a deprecated alias.
    await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);
    return;
  }
  throw new Error(
    'Set POCKETBASE_ADMIN_TOKEN, or POCKETBASE_ADMIN_EMAIL + POCKETBASE_ADMIN_PASSWORD. ' +
      'Schema changes require superuser auth.',
  );
}

const indexName = (sql: string) => sql.match(/INDEX\s+`?(\w+)`?/i)?.[1] ?? sql;

/**
 * Add missing fields and indexes in a SINGLE update.
 *
 * `collections.update()` replaces whatever keys you send, so sending `indexes`
 * alone drops the schema and PocketBase rejects the collection. Both must go
 * together — and the new index may reference a column being added in the same
 * call, so they cannot be split into two updates either.
 */
async function ensureCollection(
  pb: PocketBase,
  collectionName: string,
  opts: { fields?: any[]; indexes?: string[] },
) {
  const collection = await pb.collections.getOne(collectionName);
  const existing: any[] = (collection as unknown as { fields?: any[] }).fields ?? [];
  const existingIndexes: string[] = (collection as unknown as { indexes?: string[] }).indexes ?? [];

  // Includes system fields (id, created, ...); they must survive the update.
  const haveFields = new Set(existing.map((f) => f.name));
  const missingFields = (opts.fields ?? []).filter((f) => !haveFields.has(f.name));
  for (const field of opts.fields ?? []) {
    record(`${collectionName}.${field.name}`, missingFields.includes(field));
  }

  const haveIndexes = new Set(existingIndexes.map(indexName));
  const missingIndexes = (opts.indexes ?? []).filter((sql) => !haveIndexes.has(indexName(sql)));
  for (const sql of opts.indexes ?? []) {
    record(`${collectionName}: index ${indexName(sql)}`, missingIndexes.includes(sql));
  }

  if (missingFields.length === 0 && missingIndexes.length === 0) return;

  await pb.collections.update(collection.id, {
    fields: [...existing, ...missingFields],
    indexes: [...existingIndexes, ...missingIndexes],
  });
}

async function collectionExists(pb: PocketBase, name: string): Promise<boolean> {
  try {
    await pb.collections.getOne(name);
    return true;
  } catch {
    return false;
  }
}

async function migratePocketBase() {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  // Refuse before touching anything: a pre-0.23 server silently accepts a
  // collection update that drops every field.
  await assertSupportedVersion(url);
  await authenticate(pb);

  console.log(`Migrating PocketBase at ${url}\n`);

  // orders gains the gateway reference (the idempotency key) and the unique
  // indexes. `unique: true` on a field is a no-op in PocketBase (removed in
  // v0.14), so stores created before this migration have NO uniqueness on
  // orderNumber or products.slug either — this repairs that too.
  await ensureCollection(pb, 'orders', {
    fields: [text('gateway'), text('gatewayRef')],
    indexes: [ORDER_INDEXES.orderNumber, ORDER_INDEXES.gatewayRef],
  });
  await ensureCollection(pb, 'products', { indexes: [PRODUCT_INDEXES.slug] });

  // The webhook ledger.
  if (await collectionExists(pb, 'processed_webhook_events')) {
    await ensureCollection(pb, 'processed_webhook_events', {
      indexes: [WEBHOOK_EVENT_INDEXES.gatewayEventId],
    });
  } else {
    await pb.collections.create({
      name: 'processed_webhook_events',
      type: 'base',
      fields: [
        text('gateway', true),
        text('eventId', true),
        text('eventType', true),
        select('outcome', ['processed', 'ignored', 'failed'], true),
        text('orderId'),
        text('processedAt'),
        ...TIMESTAMP_FIELDS,
      ],
      indexes: [WEBHOOK_EVENT_INDEXES.gatewayEventId],
    });
    record('processed_webhook_events collection', true);
  }
}

async function main() {
  await migratePocketBase();

  const applied = changes.filter((c) => c.applied).length;
  console.log(
    `\n${applied === 0 ? 'Already up to date.' : `Applied ${applied} change(s).`} ` +
      `${changes.length - applied} already present.`,
  );

  if (process.env.SUPABASE_URL) {
    console.log(
      '\nSUPABASE_URL is set. The Supabase adapter cannot execute DDL over PostgREST,\n' +
        'so apply this SQL yourself (it is idempotent):\n',
    );
    console.log(
      [
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway text;',
        'ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway_ref text;',
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_gateway_ref',
        '  ON orders (gateway, gateway_ref) WHERE gateway_ref IS NOT NULL;',
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_number ON orders (order_number);',
        '',
        'CREATE TABLE IF NOT EXISTS processed_webhook_events (',
        '  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),',
        '  gateway      text NOT NULL,',
        '  event_id     text NOT NULL,',
        '  event_type   text NOT NULL,',
        '  outcome      text NOT NULL,',
        '  order_id     uuid REFERENCES orders(id),',
        '  processed_at timestamptz NOT NULL DEFAULT now()',
        ');',
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events',
        '  ON processed_webhook_events (gateway, event_id);',
      ].join('\n'),
    );
  }
}

main().catch((err) => {
  console.error('\nMigration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
