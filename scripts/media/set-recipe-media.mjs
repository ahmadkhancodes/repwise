#!/usr/bin/env node
/**
 * Records recipe photos in packages/content/recipes.json: sets `mediaId = repwise/recipes/<id>`
 * for recipes whose photo is live on Cloudinary. Run only after the delivery URL returned HTTP 200.
 *
 *   node scripts/media/set-recipe-media.mjs <recipe-id> [<recipe-id> ...]
 *   node scripts/media/set-recipe-media.mjs --remove <recipe-id> ...
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages/content/recipes.json');
const args = process.argv.slice(2);
const remove = args[0] === '--remove';
const ids = new Set(remove ? args.slice(1) : args);
if (!ids.size) {
  console.error('usage: set-recipe-media.mjs [--remove] <recipe-id> ...');
  process.exit(2);
}
const recipes = JSON.parse(readFileSync(file, 'utf8'));
const known = new Set(recipes.map((r) => r.id));
const unknown = [...ids].filter((id) => !known.has(id));
if (unknown.length) {
  console.error(`unknown recipe id(s): ${unknown.join(', ')}`);
  process.exit(1);
}
const out = recipes.map((r) => {
  if (!ids.has(r.id)) return r;
  const { mediaId: _old, ...rest } = r;
  if (remove) return rest;
  // Keep mediaId where the schema lists it (after steps), so diffs stay small.
  const entries = Object.entries(rest);
  const at = entries.findIndex(([k]) => k === 'steps') + 1;
  entries.splice(at, 0, ['mediaId', `repwise/recipes/${r.id}`]);
  return Object.fromEntries(entries);
});
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(`${remove ? 'removed' : 'set'} mediaId on ${ids.size} recipe(s)`);
