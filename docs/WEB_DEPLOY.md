# Repwise website: deploy notes

The site lives in `web/`. Plain HTML + CSS, no JavaScript, no build step, no frameworks. It deploys to any static host. Default: Cloudflare Pages.

## What is in `web/`

| Path | Purpose |
|---|---|
| `index.html` | Landing page |
| `privacy/`, `terms/`, `delete-account/` | Store-required legal pages, generated from `docs/legal/*.md` |
| `support/` | FAQ and contact (store "support URL") |
| `404.html`, `robots.txt`, `sitemap.xml`, `_headers` | Meta. `_headers` sets security headers and a strict CSP on Cloudflare Pages |
| `assets/site.css`, `assets/og.svg`, `assets/og.png`, `assets/apple-touch-icon.png`, `favicon.svg`, `favicon.png` | Styles and images |
| `_tools/`, `_screenshots/` | Dev only. **Not for deploy** (see below) |

## Deploy to Cloudflare Pages

### Option A: Git integration (recommended)
1. Cloudflare dashboard > Workers & Pages > Create > Pages > Connect to Git, pick the repo.
2. Settings:
   - Framework preset: **None**
   - Root directory: `web`
   - Build command: `rm -rf _screenshots _tools .cfignore .assetsignore`
   - Build output directory: `.` (i.e. `web`)
3. Deploy. Every push to the production branch redeploys.

Cloudflare Pages has no native ignore file, so the build command is what keeps `_screenshots/` and `_tools/` off the public site. `.cfignore` / `.assetsignore` list the same paths for tools that honour them (for example Workers static assets), and `robots.txt` plus `_headers` mark both paths noindex as a backstop.

### Option B: direct upload with Wrangler
```sh
rm -rf /tmp/repwise-web && cp -r web /tmp/repwise-web
rm -rf /tmp/repwise-web/_screenshots /tmp/repwise-web/_tools
npx wrangler pages deploy /tmp/repwise-web --project-name repwise-web
```

### Custom domain
Pages project > Custom domains > add the domain (the pages assume `https://repwise.app`). Pages serves `404.html` for unknown paths and `/privacy/` style clean URLs automatically.

## Once the domain is known

The site and the legal drafts assume **`https://repwise.app`**. If the final domain is different:

1. Replace `https://repwise.app` in `web/index.html` (canonical, `og:url`, `og:image`, `twitter:image`), `web/robots.txt`, `web/sitemap.xml`, and the `SITE` constant in `web/_tools/build-pages.mjs`.
2. Replace it in `docs/legal/*.md`, then regenerate: `node web/_tools/build-pages.mjs`.
3. **Update the store-pack URLs** so the consoles match the live pages:
   - `docs/store/play-listing.md` and `docs/store/play-listing.json` (privacy policy URL, website)
   - `docs/store/PLAY_CONSOLE_SUBMISSION.md` and `docs/store/DATA_SAFETY.md` (privacy policy URL, **data deletion URL** = `/delete-account/`)
   - `docs/store/app-store.md`, `docs/store/APP_STORE_SUBMISSION.md`, `docs/store/PRIVACY_LABELS.md` (privacy URL, support URL = `/support/`, marketing URL = `/`)
   - Any in-app links to terms, privacy and delete-account (paywall and Settings).
4. Check that `/privacy`, `/terms`, `/delete-account` and `/support` load without signing in, on a phone, before submitting to either store.

## Before going live (owner TODOs)

- **Store badges:** both badges are placeholders with `href="#"` and a `TODO(store links)` comment in `web/index.html` (hero and final CTA). Add the live store URLs, swap in the official Apple / Google badge artwork under their brand guidelines, and remove the "Coming soon" lines. If iOS is not published, remove the App Store badge.
- **Company details:** `docs/legal` says to confirm the registered company name and address before publishing. That editorial note and the "Draft for ..." note are stripped from the rendered pages by the generator; the pages currently say "BufferSol Technologies LLC". Update the markdown and regenerate once confirmed.
- **Prices:** the pricing section shows the USD ladder from `CLAUDE.md` (weekly $4.99, monthly $12.99, 3-month $24.99, yearly $59.99 with the 7-day trial). Change it in `web/index.html` (and the JSON-LD block) if the ladder changes.

## Editing

- Landing page: edit `web/index.html` and `web/assets/site.css` directly. Colours are CSS variables at the top of `site.css`, mirroring `docs/build-bible/11-Design-System.md`; light and dark follow `prefers-color-scheme`.
- Legal pages: edit `docs/legal/*.md`, then run `node web/_tools/build-pages.mjs` (no dependencies) and commit the regenerated HTML. Support FAQ and the 404 page are also defined in that script.
- Screenshots and PNG assets: `NODE_PATH=/opt/node-tools/node_modules node web/_tools/shots.mjs` (screenshots at 390 and 1440, light and dark, into `web/_screenshots/`) or `node web/_tools/shots.mjs assets` (re-renders `og.png`, `apple-touch-icon.png`, `favicon.png` from the SVGs). Needs Playwright; dev machines only.
