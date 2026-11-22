// Pull the full ExerciseDB V1 dataset (licensed by the owner, 22 Nov 2026) and mirror the GIFs to Vercel Blob.
import { put } from '@vercel/blob';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const token = fs.readFileSync(process.env.BLOB_TOKEN_FILE, 'utf8').trim();
const API = 'https://oss.exercisedb.dev/api/v1/exercises';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      throw new Error(`${r.status} ${url}`);
    } catch (e) { if (i === tries - 1) throw e; await sleep(2000 * (i + 1)); }
  }
}

// 1. Metadata, cursor-paginated.
const metaFile = path.join(OUT, 'exercises_raw.json');
let all = [];
if (fs.existsSync(metaFile)) all = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
else {
  let cursor = null;
  do {
    const u = `${API}?limit=100${cursor ? `&after=${cursor}` : ''}`;
    const j = await getJson(u);
    all.push(...j.data);
    cursor = j.meta?.hasNextPage ? j.meta.nextCursor : null;
    console.log('meta', all.length, '/', j.meta?.total);
    await sleep(300);
  } while (cursor);
  const seen = new Set(); all = all.filter((e) => !seen.has(e.exerciseId) && seen.add(e.exerciseId));
  fs.writeFileSync(metaFile, JSON.stringify(all));
}
console.log('exercises', all.length);

// 2. GIFs → local → Vercel Blob (resumable via manifest).
const manFile = path.join(OUT, 'manifest.json');
const manifest = fs.existsSync(manFile) ? JSON.parse(fs.readFileSync(manFile, 'utf8')) : {};
let done = Object.keys(manifest).length, failed = [];
async function one(e) {
  if (manifest[e.exerciseId]) return;
  const local = path.join(OUT, 'gifs', `${e.exerciseId}.gif`);
  for (let i = 0; i < 5; i++) {
    try {
      if (!fs.existsSync(local)) {
        const r = await fetch(e.gifUrl);
        if (!r.ok) throw new Error(`gif ${r.status}`);
        fs.writeFileSync(local, Buffer.from(await r.arrayBuffer()));
      }
      const res = await put(`exercisedb/v1/gifs/${e.exerciseId}.gif`, fs.readFileSync(local), {
        access: 'public', token, contentType: 'image/gif', addRandomSuffix: false, allowOverwrite: true,
        cacheControlMaxAge: 31536000,
      });
      manifest[e.exerciseId] = res.url; done++;
      if (done % 50 === 0) { fs.writeFileSync(manFile, JSON.stringify(manifest)); console.log('uploaded', done); }
      return;
    } catch (err) { await sleep(1500 * (i + 1)); if (i === 4) failed.push([e.exerciseId, String(err)]); }
  }
}
const queue = [...all];
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await one(queue.shift()); }));
fs.writeFileSync(manFile, JSON.stringify(manifest));
console.log('uploaded total', Object.keys(manifest).length, 'failed', failed.length, JSON.stringify(failed.slice(0, 5)));

// 3. Final dataset with our CDN URLs, uploaded alongside.
const final = all.map((e) => ({ ...e, gifUrl: manifest[e.exerciseId] ?? null, sourceGifUrl: e.gifUrl }));
fs.writeFileSync(path.join(OUT, 'exercisedb_v1.json'), JSON.stringify(final, null, 0));
const r = await put('exercisedb/v1/exercises.json', JSON.stringify(final), {
  access: 'public', token, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 3600,
});
console.log('dataset url', r.url);
