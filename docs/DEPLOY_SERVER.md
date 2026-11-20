# Deploying the Repwise API (`server/`)

Cloudflare Worker (Hono) + MongoDB Atlas + Anthropic. Nothing deploys automatically: these are the
manual steps. Run commands from the repo root unless noted. Needs the **Workers Paid** plan (the
planner needs more than the free plan's 10 ms CPU; `wrangler.toml` sets `cpu_ms = 30000`).

## 0. Before the first deploy

1. `npm run check -w @repwise/server` is green.
2. `cd server && npx wrangler deploy --dry-run --outdir /tmp/wr` bundles without errors
   (~4.2 MB / ~610 KB gzip, 20 Nov 2026).
3. `npx wrangler login` (once per machine).

## 1. MongoDB Atlas

1. Create an M0 (free) or larger cluster. Create a database user with `readWrite` on `repwise`
   (and `repwise_staging` for staging) only.
2. Network access: Workers have no fixed egress IPs, so allow `0.0.0.0/0` and rely on the user's
   strong password (or use Atlas private endpoints on a paid tier).
3. Create the indexes (idempotent; safe to re-run after every index change):

   ```bash
   npx tsx server/scripts/create-indexes.ts --dry-run          # print the plan
   MONGODB_URI='mongodb+srv://USER:PASS@cluster.x.mongodb.net/?retryWrites=true&w=majority' \
   MONGODB_DB=repwise npx tsx server/scripts/create-indexes.ts
   ```

   It creates 29 indexes (TTL indexes for tokens, codes, rate limits, leases and the AI cache;
   unique partial indexes on `users.email/googleSub/appleSub`; `{userId, syncedAt, _id}` on every
   sync table), then writes `_meta.indexes = 2` so the Worker skips its own lazy pass. A FAIL line
   (e.g. duplicate emails blocking a unique index) leaves the marker unwritten; fix and re-run.
   The index list lives in `server/src/db/indexes.ts`; bump `INDEX_VERSION` when it changes.

## 2. Secrets

Set each with `cd server && npx wrangler secret put NAME` (add `--env staging` for staging).
Never put them in `wrangler.toml`, `.dev.vars` commits, logs or chat.

| Secret | Required | What it is |
|---|---|---|
| `MONGODB_URI` | yes | Atlas connection string (everything except `/health`, `/config`). |
| `JWT_SECRET` | yes | ≥ 32 random chars (`openssl rand -base64 48`). Shorter fails closed (503). Rotating it signs everyone out. |
| `GOOGLE_WEB_CLIENT_ID` | for Google sign-in | The web client id the app passes to Google Sign-In (token audience). |
| `RESEND_API_KEY` | for email codes | `MAIL_PROVIDER=resend` (production default). Without it no email is sent. |
| `ANTHROPIC_API_KEY` | for AI | Without it every AI route is rules-only. Use a key in a workspace with its own spend limit (belt and braces with the $50 guard). |
| `AI_ADMIN_TOKEN` | optional | ≥ 16 chars; enables `GET /ai/usage` (404 without it). |
| `APPLE_ROOT_CA_G3_B64` | when payments on (iOS) | `curl -s https://www.apple.com/certificateauthority/AppleRootCA-G3.cer \| base64 -w0`. Pinned root; without it Apple billing fails closed. |
| `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | optional | App Store Server API key (`.p8` contents) for status lookups. |
| `PLAY_SERVICE_ACCOUNT_JSON` | when payments on (Android) | Service account JSON with Play Console financial access. |
| `PLAY_RTDN_SECRET` | only without OIDC | Shared secret for `/webhooks/play?token=…`. Prefer OIDC (below): a query-string secret can end up in edge request logs. |

Non-secret vars are in `wrangler.toml [vars]` (production) and `[env.staging.vars]`:
`ENVIRONMENT, JWT_ISSUER, JWT_AUDIENCE, MONGODB_DB, APPLE_BUNDLE_ID, PLAY_PACKAGE_NAME,
PAYMENTS_ENABLED, AI_PROVIDER, AI_MODEL, AI_MONTHLY_BUDGET_USD, AI_TIMEOUT_MS, AI_CACHE_TTL,
AI_CATALOGUE, MAIL_PROVIDER, MAIL_FROM, LOG_LEVEL`, plus optional `CORS_ORIGINS,
GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID, APPLE_SERVICES_ID, PLAY_PUBSUB_AUDIENCE,
PLAY_PUBSUB_SERVICE_ACCOUNT, PLANS_JSON, AI_LIMITS_JSON, AI_PRICES_JSON, FEATURE_FLAGS_JSON`.

Check what is set: `npx wrangler secret list` (names only).

## 3. Deploy

```bash
cd server
npx wrangler deploy --env staging      # → https://repwise-api-staging.<account>.workers.dev
npx tsx scripts/smoke.ts https://repwise-api-staging.<account>.workers.dev --write
npx wrangler deploy --env=""           # production (top-level config) → repwise-api
npx tsx scripts/smoke.ts https://repwise-api.<account>.workers.dev
```

`smoke.ts` is read-only by default (health, config, 404s, headers, CORS, 401/400 paths, billing
gate). `--write` also creates one anonymous account (10/hour/IP limit), requests one AI week plan,
checks it validates, and deletes the account. Exit code 0 = all passed.

Rollback: `npx wrangler rollback` (previous version) or `npx wrangler versions list` +
`npx wrangler rollback <version-id>`.

## 4. Store webhooks (only when `PAYMENTS_ENABLED=true`)

- App Store Connect → App → App Store Server Notifications → Version 2 →
  `https://<api>/webhooks/apple` (production and sandbox).
- Play: Pub/Sub topic + push subscription to `https://<api>/webhooks/play` with
  **authentication enabled** (service account), audience = `PLAY_PUBSUB_AUDIENCE`, and
  `PLAY_PUBSUB_SERVICE_ACCOUNT` = that account's email. Then Play Console → Monetization setup →
  Real-time developer notifications → the topic. Use "Send test notification" and look for the
  `request` log line with `route":"/webhooks/play","status":200`.

## 5. Observe

- `npx wrangler tail --format json` (or Workers Logs in the dashboard). Every request logs one JSON
  line: `{msg:"request", reqId, method, route, status, ms}`; AI requests add
  `{msg:"ai", kind, source, fallbackReason}` and `{msg:"ai_usage", costMicros, …tokens}`.
  Secrets, tokens and emails are redacted; raw URLs and query strings are never logged.
- A client can send `x-request-id`; every response echoes it, so a bug report leads to its lines.
- Spend: `curl -H "authorization: Bearer $AI_ADMIN_TOKEN" https://<api>/ai/usage`.
- Alerts to watch for: `ai_cost_over_reservation` (should never happen), `unhandled`,
  `http_error` with status ≥ 500, a rising share of `fallbackReason` other than `daily_limit`.

## 6. Known gaps

- MongoDB over `nodejs_compat` sockets is confirmed only by the bundle; the first `--write` smoke run
  on staging is the real proof.
- `server/package.json` relies on the root workspace's `zod` (^4.6.7, already in the lockfile). Add
  `"zod": "^4.6.7"` to `server/package.json` dependencies on the next `npm install` so the
  dependency is explicit.
