// Screenshots + PNG assets. Usage: node web/_tools/shots.mjs [assets]
// Needs Playwright (dev machine only): NODE_PATH=/opt/node-tools/node_modules
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'text/xml', '.txt': 'text/plain' };
const srv = createServer((q, s) => {
  let p = join(web, decodeURIComponent(q.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { s.writeHead(404, { 'content-type': 'text/html' }); return s.end(readFileSync(join(web, '404.html'))); }
  s.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); s.end(readFileSync(p));
}).listen(4173);
const b = await chromium.launch();
const base = 'http://localhost:4173';
if (process.argv[2] === 'assets') {
  const pg = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await pg.goto(base + '/assets/og.svg'); await pg.screenshot({ path: join(web, 'assets/og.png') });
  for (const [f, n] of [['assets/apple-touch-icon.png', 180], ['favicon.png', 48]]) {
    await pg.setViewportSize({ width: n, height: n });
    await pg.goto("about:blank"); await pg.setContent(`<body style="margin:0;background:#000"><img src="${base}/favicon.svg" width="${n}" height="${n}" style="display:block">`);
    await pg.waitForLoadState('networkidle'); await pg.screenshot({ path: join(web, f) });
  }
} else {
  const pages = (process.argv[2] || 'home:/,privacy:/privacy/,terms:/terms/,delete-account:/delete-account/,support:/support/,404:/nope').split(',').map((x) => x.split(':'));
  for (const scheme of ['light', 'dark']) for (const w of [390, 1440]) {
    const ctx = await b.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, colorScheme: scheme, deviceScaleFactor: 1 });
    const pg = await ctx.newPage();
    for (const [name, path] of pages) {
      await pg.goto(base + path, { waitUntil: 'load' });
      const ov = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (ov > 0) console.log('OVERFLOW', name, w, ov);
      await pg.screenshot({ path: join(web, `_screenshots/${name}-${w}-${scheme}.png`), fullPage: true });
    }
    await ctx.close();
  }
}
await b.close(); srv.close();
