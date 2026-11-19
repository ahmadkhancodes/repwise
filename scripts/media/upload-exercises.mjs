#!/usr/bin/env node
/**
 * Uploads the licensed exercise frames in packages/content/media/exercise-media-map.json to
 * Cloudinary by HTTPS URL (Cloudinary fetches the commit-pinned raw GitHub file; nothing is
 * uploaded from this machine), then checks the delivery URLs the app uses.
 *
 *   CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud> node scripts/media/upload-exercises.mjs [--only a,b] [--limit 3] [--dry-run] [--force]
 *
 * - Checks plan usage first and stops above 60 % of the credit limit (override with --force).
 * - public_id `repwise/exercises/<id>` (start) and `repwise/exercises/<id>-end` (end),
 *   overwrite=false, tags repwise, exercise, source:free-exercise-db, licence:unlicense,
 *   context licence / source_url / match confidence.
 * - Pilot first: `--limit 3`, check the printed delivery URLs, then run without --limit.
 * - Exits non-zero if any upload or delivery check fails; fix or set that decision to null in
 *   exercise-match-decisions.json and rebuild the map so the app never requests it.
 * Behind an HTTPS proxy on Node ≥ 24 set NODE_USE_ENV_PROXY=1.
 * The same uploads can be made with the Cloudinary MCP `upload-asset` tool using the map's
 * `url` / `publicId` pairs and the tags/context below.
 */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const m = /^cloudinary:\/\/([^:]+):([^@]+)@([a-z0-9_-]+)$/i.exec(process.env.CLOUDINARY_URL ?? '');
if (!m) {
  console.error('Set CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>');
  process.exit(2);
}
const [, apiKey, apiSecret, cloud] = m;
const auth = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

const map = JSON.parse(readFileSync(join(root, 'packages/content/media/exercise-media-map.json'), 'utf8'));
let entries = Object.entries(map.exercises);
const only = opt('only')?.split(',');
if (only) entries = entries.filter(([id]) => only.includes(id));
const limit = Number(opt('limit') ?? 0);
if (limit > 0) entries = entries.slice(0, limit);

/* ---- usage guard ---- */
const usage = await (await fetch(`https://api.cloudinary.com/v1_1/${cloud}/usage`, { headers: { Authorization: auth } })).json();
if (usage.error) {
  console.error(`usage check failed: ${usage.error.message}`);
  process.exit(1);
}
const pct = usage.credits?.used_percent ?? 0;
console.log(`plan ${usage.plan}: credits ${usage.credits?.usage ?? '?'} / ${usage.credits?.limit ?? '?'} (${pct}%), resources ${usage.resources}`);
if (pct > 60 && !flag('force')) {
  console.error('Credit usage above 60 %: stopping (use --force to override).');
  process.exit(1);
}
console.log(`${entries.length} exercise(s) → ${entries.length * 2} upload(s)${flag('dry-run') ? ' (dry run)' : ''}`);

function sign(params) {
  const s = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1').update(s + apiSecret).digest('hex');
}

async function upload(file, publicId, confidence) {
  const params = {
    context: `licence=Unlicense|source=free-exercise-db|source_url=${file}|match=${confidence}`,
    overwrite: 'false',
    public_id: publicId,
    tags: 'repwise,exercise,source:free-exercise-db,licence:unlicense',
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  const body = new URLSearchParams({ ...params, file, api_key: apiKey, signature: sign(params) });
  const r = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
  return j;
}

async function check(url) {
  const r = await fetch(url);
  const bytes = (await r.arrayBuffer()).byteLength;
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return bytes;
}

const failures = [];
for (const [id, e] of entries) {
  if (flag('dry-run')) {
    console.log(`${id}: ${e.start.url} → ${e.start.publicId}; ${e.end.url} → ${e.end.publicId}`);
    continue;
  }
  try {
    for (const f of [e.start, e.end]) {
      const res = await upload(f.url, f.publicId, e.confidence);
      if (res.existing) console.log(`${f.publicId}: already exists (kept)`);
    }
    const base = `https://res.cloudinary.com/${cloud}/image/upload`;
    const thumb = await check(`${base}/c_fill,g_auto,h_160,w_160,q_auto,f_webp/${e.start.publicId}.webp`);
    const poster = await check(`${base}/c_limit,w_480,q_auto,f_webp/${e.start.publicId}.webp`);
    const end = await check(`${base}/c_limit,w_480,q_auto,f_webp/${e.end.publicId}.webp`);
    console.log(`${id}: ok (thumb ${thumb} B, poster ${poster} B, end ${end} B)`);
  } catch (err) {
    failures.push(id);
    console.error(`${id}: FAILED ${err.message}`);
  }
}
if (failures.length) {
  console.error(`\n${failures.length} failed: ${failures.join(', ')}`);
  process.exit(1);
}
