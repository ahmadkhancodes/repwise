# 14 Data Model

| Repwise · Data Model |  |  |  |  |  |
| Every table and field (local SQLite + MongoDB Atlas via Worker). |  |  |  |  |  |
| ← Back to Start Here |  |  |  |  |  |
| Every table has the common columns: id (TEXT uuid v7, PK), user_id (TEXT, null until signed in), created_at, updated_at (INTEGER ms UTC), deleted_at (INTEGER null), dirty (INTEGER 0/1, local only). MongoDB Atlas mirrors each table as a collection (same field names, userId required) — the Worker is the only client. |  |  |  |  |  |
| Table | Field | Type (SQLite → MongoDB) | Required | Rules / example | Used by |
| profile | goal, sex, birth_year, height_cm, weight_kg, target_kg, experience, days, session_min, equipment[], injuries[], diet_type, allergies[], dislikes[], cuisines[], budget, cook_min, meals_per_day, meal_times[], units, theme | TEXT/JSON… | Yes | one row | S03–S05, S38 |
| plans | type (training/nutrition), block_no, week_start, payload JSON, version, generated_by (rules/ai) | TEXT/INTEGER/JSON | Yes |  | S08, S21 |
| sessions | plan_id, date, status, started_at, ended_at, paused_ms, notes | … | Yes |  | S09, S13 |
| session_exercises | session_id, exercise_id, position, superset_group, target_sets, target_reps, target_load | … | Yes |  | S13 |
| sets | session_exercise_id, idx, type, weight_kg, reps, rpe, duration_s, distance_m, done_at | … | Yes | type: warmup/working/drop/failure/cardio | S14 |
| exercises | name, media_url, primary_muscles[], secondary[], equipment, pattern, difficulty, steps[], tips[], source, licence | … | Yes | read-only catalogue + user custom | S18, S19 |
| routines | name, folder, items JSON | … | Yes |  | S16 |
| meal_plans | date, day_type, kcal_target, macros JSON | … | Yes |  | S21 |
| meals | meal_plan_id, slot, recipe_id, portion, status, swapped_from | … | Yes | status: planned/eaten/skipped/swapped | S21–S23 |
| recipes | title, cuisine, diet_tags[], allergens[], ingredients JSON, steps[], prep_min, cost_level, kcal/protein/carb/fat per portion, image_url | … | Yes | server catalogue, cached | S24 |
| food_logs | date, source (plan/search/quick), name, kcal, p, c, f | … | Yes |  | S26 |
| body_metrics | date, weight_kg, waist_cm, … | … | Yes |  | S30 |
| photos | date, local_uri, cloud_key? | … | No | private | S33 |
| cards | rule_id, date, text, action, state | … | Yes |  | S11 |
| Server collections (MongoDB Atlas, created by the Worker on first run) |  |  |  |  |  |
| Collection | Fields | Indexes / rules |  |  |  |
| users | _id (uuid), email, googleSub?, createdAt, lastSeenAt, country, locale | unique email; unique googleSub (sparse) |  |  |  |
| refresh_tokens | _id, userId, tokenHash (sha256), deviceId, expiresAt | TTL index on expiresAt; rotate on every refresh |  |  |  |
| email_codes | _id, email, codeHash, attempts, expiresAt | TTL 10 min; max 5 attempts; rate-limit 3 codes / 15 min / email |  |  |  |
| entitlements | _id = userId, pro (bool), source (apple / play), plan (weekly/monthly/quarterly), expiresAt, inTrial, autoRenew, updatedAt | Written ONLY by /billing routes and webhooks |  |  |  |
| purchases | _id, userId, source, purchaseToken (Play) / originalTransactionId (Apple), productId, basePlanId, state, raw (last API response), updatedAt | unique purchaseToken; unique originalTransactionId |  |  |  |
| <each app table> | Same fields as the SQLite table + userId | Compound index {userId:1, updatedAt:1} for incremental pull; never return docs of another userId |  |  |  |
| Sync API contract (Worker) |  |  |  |  |  |
| •  POST /sync/push  body {table, rows[]} → upsert by {_id, userId}; server keeps the newer updatedAt (last-write-wins); returns {accepted, conflicts[]}. |  |  |  |  |  |
| •  GET /sync/pull?since=<ms>&tables=a,b → rows with updatedAt > since (max 500 per page + nextCursor). Soft-deleted rows included so deletes sync. |  |  |  |  |  |
| •  DELETE /account → deletes user, tokens, entitlements, purchases and every app collection's docs for that user. Store subscriptions are NOT cancelled automatically — app shows the cancel link first. |  |  |  |  |  |
| •  All routes: Authorization: Bearer <our JWT>; 401 → app calls /auth/refresh once, then signs the user out of sync (local data stays). |  |  |  |  |  |
