/// <reference types="node" />
/**
 * Create every MongoDB index the API needs (idempotent: safe to run again at any time).
 *
 *   MONGODB_URI='mongodb+srv://…' MONGODB_DB=repwise npx tsx server/scripts/create-indexes.ts
 *   … --dry-run   prints the plan without connecting
 *
 * The Worker also creates these lazily on first use; running this before the first deploy keeps
 * the first real request fast and makes index problems (e.g. duplicate emails) visible up front.
 * It writes the same `_meta.indexes` version marker, so the Worker then skips its own pass.
 */
import { INDEXES, INDEX_VERSION } from '../src/db/indexes';

const dryRun = process.argv.includes('--dry-run');
const uri = process.env.MONGODB_URI ?? '';
const dbName = process.env.MONGODB_DB || 'repwise';

function describe(i: (typeof INDEXES)[number]): string {
  const opts = i.options ? ` ${JSON.stringify(i.options)}` : '';
  return `${i.collection} ${JSON.stringify(i.key)}${opts}`;
}

async function main(): Promise<number> {
  console.log(`${INDEXES.length} indexes, version ${INDEX_VERSION}, database "${dbName}"`);
  if (dryRun) {
    for (const i of INDEXES) console.log(`  plan  ${describe(i)}`);
    return 0;
  }
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
    console.error('Set MONGODB_URI (mongodb:// or mongodb+srv://). Nothing was changed.');
    return 2;
  }
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  try {
    const db = client.db(dbName);
    let failed = 0;
    for (const i of INDEXES) {
      try {
        const name = await db.collection(i.collection).createIndex(i.key, i.options ?? {});
        console.log(`  ok    ${describe(i)} -> ${name}`);
      } catch (e) {
        failed++;
        // e.g. IndexOptionsConflict (same key, other options) or duplicate values for a unique index.
        console.error(`  FAIL  ${describe(i)}: ${e instanceof Error ? e.message.slice(0, 200) : 'error'}`);
      }
    }
    if (failed > 0) {
      console.error(`${failed} index(es) failed; the version marker was not written.`);
      return 1;
    }
    await db.collection<{ _id: string; v: number }>('_meta').replaceOne({ _id: 'indexes' }, { v: INDEX_VERSION }, { upsert: true });
    console.log(`done; _meta.indexes = ${INDEX_VERSION}`);
    return 0;
  } finally {
    await client.close();
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`error: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`);
    process.exit(1);
  },
);
