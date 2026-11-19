# Repwise API (`server/`)

Cloudflare Worker (Hono, TypeScript strict, `nodejs_compat`) + MongoDB Atlas. The app is offline-first:
this API is only backup/sync, sign-in, entitlements and the server-side AI planner.

```bash
cd server
npm install
npm run check        # tsc --noEmit + vitest
npm run dev          # wrangler dev (copy .dev.vars.example to .dev.vars first)
```

Deploying is a manual step (`npx wrangler deploy`) after the secrets below are set. Nothing here deploys automatically.

## Routes

All bodies are JSON. Authenticated routes take `Authorization: Bearer <access JWT>`.
Errors are always `{ "error": "<code>" }` with no stack traces.

| Route | Auth | Notes |
|---|---|---|
| `GET /health` | none | Liveness. Does not touch the DB. |
| `GET /config` | none | `{ payments_enabled, ai_provider, plans, features }`. Cached 5 min. |
| `POST /auth/anonymous` | none | Silent account (sheet 15) for AI + purchases before sign-in. Cannot sync. 10/h/IP. |
| `POST /auth/google` | optional anon JWT | `{ idToken, deviceId? }`, verified with Google JWKS (`jose`). |
| `POST /auth/apple` | optional anon JWT | `{ identityToken, nonce?, deviceId? }`, verified with Apple JWKS. Nonce may be raw or sha256-hex. |
| `POST /auth/email/start` | none | `{ email }` → 6-digit code by mail. 3 codes/15 min/email, 10/h/IP. Same reply for every email. |
| `POST /auth/email/verify` | optional anon JWT | `{ email, code, deviceId? }`. 10 min expiry, 5 attempts. |
| `POST /auth/refresh` | none | `{ refreshToken }` → new pair. Rotating; reusing an old token revokes the whole family. |
| `POST /auth/logout` | none | `{ refreshToken }` → revokes the family. |
| `POST /sync/push` | user (not anonymous) | `{ table, rows[] }` → `{ accepted[], conflicts[], rejected[], serverTime }`. ≤500 rows, 2 MB. |
| `GET /sync/pull?since=&tables=&limit=&cursor=` | user (not anonymous) | `{ changes: {table: rows[]}, nextCursor, nextSince, serverTime }`. ≤500 rows/page. |
| `DELETE /account` | user | Deletes ALL server data for the user. Idempotent (204). |
| `POST /billing/verify` | user | iOS `{ platform:"ios", signedTransaction }` or Android `{ platform:"android", purchaseToken, productId }`. Returns the entitlement. |
| `GET /billing/entitlement` | user | `{ pro, plan, source, expiresAt, inTrial, autoRenew, updatedAt }`. |
| `POST /webhooks/apple` | Apple JWS | App Store Server Notifications v2 `{ signedPayload }`. |
| `POST /webhooks/play` | Pub/Sub OIDC or `?token=` | Google Play RTDN push. |
| `POST /ai/plan/week` | user or anon | `{ profile, history? }` → plan response (below). |
| `POST /ai/meals/day` | user or anon | `{ profile, history? }`. |
| `POST /ai/swap` | user or anon | `{ profile, params: { item, ... } }`. |
| `GET /ai/usage?month=YYYY-MM` | `Bearer AI_ADMIN_TOKEN` | Monthly AI spend, tokens, calls, budget level. 404 when no admin token is set. |

Every `/billing/*` and `/webhooks/*` route returns **404 while `PAYMENTS_ENABLED` is not `"true"`**.

### Rules that matter

- **Rows are always written under the token's user.** `user_id` in a pushed row is ignored; Mongo `_id` is `userId:id`, so one user's ids can never collide with or overwrite another's.
- **Sync rows:** plain values only (string, finite number, boolean, null), field names from the allow-list in `src/sync/tables.ts` (sheet 14 + common columns), string ≤ 200 KB, row ≤ 256 KB, `updated_at` at most 24 h in the future. Bad rows are listed in `rejected`, good rows still save. **When the app adds a column, add it to `tables.ts`.**
- **Last-write-wins** on `updated_at`; equal or older pushes come back in `conflicts`. Deletes are soft (`deleted_at`).
- **Pull** pages by the server's write time (`syncedAt`), not client clocks, so late pushes from a phone with a wrong clock are never missed. Loop while `nextCursor` is set, then store `nextSince` (it overlaps by 2 s; rows are idempotent).
- **Access JWT:** HS256, `iss`/`aud` checked, 15 min. Each request looks the user up, so a token issued before account deletion is rejected (401). Garbage tokens are 401, never 500.
- **Refresh tokens:** opaque, 60 days, stored as sha256 only, rotated on every use. The app should run refreshes single-flight: two parallel refreshes with the same token look like theft and sign the device out.
- **Pro comes only from the stored entitlement** (`entitlements` collection), written only by `/billing/verify` and the webhooks. A purchase belongs to the account that last verified it (restore on another account moves it).
- **Security:** CORS `*` with no credentials (no cookies anywhere), body caps with 413, malformed JSON 400, `nosniff`, `no-store`, CSP `default-src 'none'`.

## AI planner (sheet 28 + owner decision D10)

Pipeline per request: **engine** (`Planner.prepare`) builds targets, candidate pools (IDs only) and the
rules-only plan → **Claude** picks/orders candidate IDs and writes titles + one-line notes as strict JSON
(`output_config.format` JSON schema) → **checks**: shape, copy length, banned medical/dosing words, every ID
from the pools → **engine** `Planner.finalize` validates constraints and adds all maths → on any failure
or the 8 s timeout, the rules-only plan ships with `source: "rules"`.

Response contract (`contractVersion: 1`):

```json
{ "source": "ai" | "rules", "kind": "plan_week", "contractVersion": 1, "engine": "repwise-engine",
  "plan": <see below>, "model": "claude-haiku-5-5", "fallbackReason": "budget_exhausted",
  "cached": false, "generatedAt": 1763553600000 }
```

The planner is `src/ai/enginePlanner.ts`: `@repwise/engine` over the `@repwise/content` catalogues (through the
`toEngine` adapter; the JSON is imported statically and inlined by wrangler). `plan` per route:

| Route | `plan` | Request `params` (all optional unless marked) |
|---|---|---|
| `/ai/plan/week` | `{ week: WeekPlan, notes: { [date]: string } }` | `weekStart`, `now`, `utcOffsetMin`, `noRepeatDays`, `adjustmentKcal` |
| `/ai/meals/day` | `{ date, day: DayMealPlan, notes: string[] }` | `date`, plus the above |
| `/ai/swap` | `{ item, date, index, options: (exerciseId \| PlannedMeal)[], note }` | **`item`** (`exercise` \| `meal`), **`date`**, **`index`**, `currentId` (the item the app shows, if the plan was AI-varied) |

- `profile` must parse with the engine's `ProfileSchema` and `history` with `HistorySchema` (400 `invalid_profile` / `invalid_history`).
- Without `date`/`weekStart` the server uses today at `utcOffsetMin`. Without `now` the engine uses midnight UTC of the week's Monday, so the same request gives the same plan (and cache hit). Send `now` for heatmap-aware rotation.
- **What the LLM sees:** per training day the ordered slots, each naming a pool of ≤ 8 exercise IDs (the rules pick first; main lifts are single-ID pools); per meal a pool of ≤ 10 safe recipe IDs (rules pick first, outside the no-repeat window); for swaps the engine's ≤ 6 options. No profile fields, targets or numbers.
- **What the engine does with the answer:** one ID per slot from that slot's pool, else `validator_rejected`. Sets, reps and rest come from the rules prescription for the slot; portions from the portion solver. The result goes through `planWeekWithVariety`, which accepts it only if it parses and passes `validate` (equipment, injuries, volume, fingerprints, consecutive variants, kcal ±5 %, protein ±10 g, allergens, diet, protein source, no-repeat window).
- **CPU:** a week plan costs ~30–500 ms of CPU on the real catalogue (most for 5–6 meals a day when targets are tight); the AI path runs the engine twice. This needs the Workers Paid (Standard) CPU limit, not the free plan's 10 ms.

Cost controls:

- Model `claude-haiku-5-5` (cheapest capable; `AI_MODEL` to change), `effort: "low"`, `max_tokens` 3000 / 1500 / 600 (week / meals / swap).
- Static system prompt (> 512 tokens) sent with `cache_control`, so repeats within 5 minutes are billed at 0.1×.
- Only compact candidate ID lists are sent. Profile fields never reach the prompt; `name`, `email`, `phone` and similar keys are stripped from every request.
- Results are cached per user by a hash of the request (profile + history + params): 3 days / 1 day / 6 hours.
- **Budget guard:** every call's cost = `usage` tokens × the price table (`DEFAULT_PRICES`, override with `AI_PRICES_JSON`), accumulated per calendar month (UTC) in `ai_spend`. At ≥ 80% of `AI_MONTHLY_BUDGET_USD` free users get rules-only, Pro users still get AI. At ≥ 100% (including the worst case of the next call) everyone gets rules-only until the month changes. Timeouts book their worst case. A model without a price is never called.
- **Daily LLM calls per user** (`AI_LIMITS_JSON`): free 2 / 3 / 10, Pro 6 / 10 / 40 (week / meals / swap). Over the limit → rules-only. Hard abuse cap 200 requests/kind/day → 429.
- `AnthropicProvider.createBatch/getBatch/batchResults` wrap the Message Batches API (50% off) for a future overnight weekly regeneration job; not scheduled yet.

### Cost estimate (Claude Haiku 5.5: $0.10 in / $0.50 out per MTok, cache read $0.01, cache write $0.125)

| Call | Input (uncached) | System prompt | Output (incl. thinking) | Cost/call |
|---|---|---|---|---|
| plan_week | ~1,000 | ~700 (cache write) | ~900 | ≈ $0.00064 |
| meals_day | ~600 | ~700 | ~500 | ≈ $0.00040 |
| swap | ~200 | ~700 | ~250 | ≈ $0.00023 |

- **Typical active user:** 5 weekly plans + 30 meal days + 30 swaps a month ≈ **$0.022/month**.
- **Worst case at the daily caps:** Pro ≈ $0.51/month, free ≈ $0.14/month.
- **$50/month supports ≈ 2,000+ typical active users on full AI** (≈ 1,800 before the 80% line pauses AI for free users). Even if every user maxed out their caps, it covers ~100 Pro users; past the cap the app keeps working on rules-only.
- These are estimates. Check real spend with `GET /ai/usage` and adjust `AI_LIMITS_JSON` or `AI_MONTHLY_BUDGET_USD`. Prices are from the Anthropic price list cached 2026-11-03; confirm before relying on them.

## Configuration

Vars (in `wrangler.toml`, not secret): `ENVIRONMENT`, `JWT_ISSUER`, `JWT_AUDIENCE`, `MONGODB_DB`,
`APPLE_BUNDLE_ID`, `PLAY_PACKAGE_NAME`, `PAYMENTS_ENABLED` (default `false`), `AI_PROVIDER` (`anthropic` | `none`),
`AI_MODEL`, `AI_MONTHLY_BUDGET_USD` (50), `AI_TIMEOUT_MS` (8000), `MAIL_PROVIDER` (`console` | `resend`).
Optional: `MAIL_FROM`, `CORS_ORIGINS`, `PLANS_JSON`, `AI_LIMITS_JSON`, `AI_PRICES_JSON`, `FEATURE_FLAGS_JSON`,
`GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, `APPLE_SERVICES_ID`, `PLAY_PUBSUB_AUDIENCE`, `PLAY_PUBSUB_SERVICE_ACCOUNT`.

Secrets (`npx wrangler secret put <NAME>`):

| Secret | Needed for |
|---|---|
| `MONGODB_URI` | everything except `/health` and `/config` |
| `JWT_SECRET` | all auth (≥ 32 chars; shorter fails closed with 503) |
| `GOOGLE_WEB_CLIENT_ID` | `/auth/google` (the web client id the app passes to Google Sign-In) |
| `RESEND_API_KEY` | email codes when `MAIL_PROVIDER=resend` (console provider sends nothing in production) |
| `ANTHROPIC_API_KEY` | AI; without it the AI routes are rules-only |
| `AI_ADMIN_TOKEN` | `GET /ai/usage` (≥ 16 chars) |
| `APPLE_ROOT_CA_G3_B64` | iOS billing + Apple webhook: base64 DER of Apple Root CA - G3 (`curl -s https://www.apple.com/certificateauthority/AppleRootCA-G3.cer \| base64 -w0`). Pinned; without it Apple routes fail closed. |
| `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | optional: App Store Server API status lookups (PKCS#8 `.p8` contents) |
| `PLAY_SERVICE_ACCOUNT_JSON` | Android billing (service account with Play Console financial access) |
| `PLAY_RTDN_SECRET` | Play webhook shared secret (`…/webhooks/play?token=<secret>`) unless OIDC is configured |

Store-side setup: point App Store Server Notifications v2 at `https://<api>/webhooks/apple`, and the Play RTDN
Pub/Sub push subscription at `https://<api>/webhooks/play` (OIDC with `PLAY_PUBSUB_AUDIENCE` preferred).
The app should set StoreKit `appAccountToken` and Play `obfuscatedAccountId` to the user id so webhook
purchases that arrive before `/billing/verify` still find their owner.

## Code map

- `src/app.ts` routes + middleware; `src/index.ts` production wiring (deps cached per isolate).
- `src/db/` `Db` interface, `MemoryDb` (tests), `MongoDb` (driver loaded with a literal `import('mongodb' as string)` so wrangler bundles it; client cached per isolate, a failed connect drops the cache; indexes created once, versioned in `_meta`).
- `src/auth/` JWT, Google/Apple ID token verifiers, mailers. `src/sync/` allow-list + row validation.
- `src/billing/` App Store JWS chain verification (`x509.ts`, no Node APIs), App Store Server API, Play Developer API, entitlement maths.
- `src/ai/` `Planner` seam and its engine implementation (`enginePlanner.ts`), Anthropic provider (fetch, no SDK), prompts, schemas/validation, cost, pipeline.

Tests run in Node with vitest (`test/`), injecting `MemoryDb`, local JWKS, a generated Apple-like cert chain and
mocked `fetch`. `MONGODB_TEST_URI=... npm test` also runs the Db contract tests against a real database.

Known gap: MongoDB on Workers depends on `nodejs_compat` sockets; confirm on a real deploy (bundle verified with
`wrangler deploy --dry-run`: ~3.1 MB / 456 KB gzip including the catalogues, 19 Nov 2026).
