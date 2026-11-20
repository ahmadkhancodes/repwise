# Repwise adversarial correctness audit (read-only), 19 Nov 2026

Scope: `/home/user/repwise` on `main` (b69238a). I traced every finding through the code paths I cite. Anything I could not tie to a concrete path was dropped.
Severity: P0 = data loss, crash or security. P1 = wrong behaviour. P2 = minor.
Confidence: **confirmed** means the code path alone proves it. **plausible** means it also depends on timing or on an attacker.

**Totals:** 18 findings. 1 P0, 7 P1 and 10 P2. 12 are confirmed and 6 are plausible.

| # | Sev | Conf | Area | One-liner |
|---|-----|------|------|-----------|
| 1 | P1 | confirmed | Planner | Training is never planned after the onboarding week(s). The weekly check-in never regenerates anything. |
| 2 | P1 | confirmed | Meals | With 4 to 6 meals a day there are several `snack` meals. Ticking or undoing one deletes the other snack's food log, so intake is under-counted. |
| 3 | P1 | confirmed | Planner / workout | The background AI upgrade (and any regenerate) deletes and recreates planned sessions. User swaps, reorders and added exercises are lost, and an open player shows "Workout not found". |
| 4 | P1 | confirmed | Auth | Refresh-token rotation has no grace period. One lost `/auth/refresh` response revokes the whole family and signs the user out. |
| 5 | P0 | plausible | Auth (security) | The email-code attempt counter is check-then-increment and is not limited per email. Parallel guesses from many IPs bypass the 5-attempt cap. |
| 6 | P1 | plausible | Sync | The pull overlap is 2 s, but `syncedAt` is stamped before the bulk write commits. Slow writes are skipped by a concurrent pull and never reach other devices. |
| 7 | P1 | confirmed | AI budget | The budget check is read-then-call with no reservation. Concurrent calls at the edge all pass and overspend the "hard" $50 cap. |
| 8 | P2 | confirmed | AI cache | The client sends `params.now` (ms) in the AI request, and it is part of the server cache key. `plan_week` never hits the cache. |
| 9 | P2 | confirmed | Auth (Apple) | The Apple nonce check gives no replay protection. It is optional, and it also accepts the hashed nonce taken straight from the token. |
| 10 | P2 | plausible | IAP | `/billing/verify` stamps `lastEventAt = now`. Without App Store API keys, a delayed REFUND or DID_RENEW webhook is then dropped as stale. |
| 11 | P2 | confirmed | IAP | A verified purchase moves to whichever account last posts its JWS or token. Nothing binds it to `appAccountToken` or `obfuscatedAccountId`, so an old JWS can be replayed. |
| 12 | P2 | confirmed | Workout | The player's "Start workout" never checks for a workout already in progress. Two `active` sessions can exist, and the first is orphaned. |
| 13 | P2 | confirmed | Meals | An eaten meal can be swapped. Its status goes back to `planned` but its `plan` food log stays, so the tile and the rings disagree. |
| 14 | P2 | confirmed | Sync | A device clock more than 24 h ahead stamps rows the server rejects (`dirty=2`). `nextUpdatedAt` keeps them future-dated, so they are never backed up. |
| 15 | P2 | plausible | iOS rest timer | When a new rest replaces a running one, `end()` and `update()` reach ActivityKit concurrently. The Live Activity can vanish for the new rest. |
| 16 | P2 | plausible | Sync / planner | Onboarding on a second device and then signing in gives two planned sessions per training day. Nothing de-duplicates by date. |
| 17 | P2 | confirmed | Workout | A double-tap on a set tick re-logs the same set. The PR toast, haptic, `set_logged` analytics and rest restart all fire twice. |
| 18 | P2 | confirmed | Widget / Android timer | A missing snapshot renders widgets as Pro. A paused ongoing rest notification has no timeout and survives an app kill. |

---

## 1. P1 confirmed: training plans stop after onboarding, and the weekly check-in is a no-op

- **Where:**
  - `src/features/planner/planService.ts:387` (`ensureWeekPlanned`) and `:407` (`planToday`) have no callers outside the planner module.
  - `src/features/today/plannerBridge.ts:26-30`: `registerPlanner` is never called anywhere in `src/` or `app/`.
  - `src/features/assistant/screens/CheckinScreen.tsx:145-150`.
- **Defect:**
  - Sessions are only created by `generateInitialPlan` (onboarding `PlanScreen.tsx:87`, this week plus next week if fewer than 4 days are left) and by ad-hoc `createSession`.
  - Meals keep being planned by `ensureWeekMeals`; training does not.
  - `getPlanner().regenerateWeek` is `undefined`, so an approved check-in is saved with `applied:false` forever.
- **Scenario:** A user onboards on a Tuesday. From the following Monday (or the one after), Train and Today show no planned workout, the week strip shows "rest" every day, and workout reminders stop. The check-in's calorie and volume changes are never applied to any plan.
- **Fix:**
  - Call `ensureWeekPlanned(today)` and the next week's equivalent from Today and Train mount, from app foreground, and from the notification rebuild.
  - Call `registerPlanner({ regenerateWeek: (i) => regenerateWeek({ date: i.weekStart, ... }), requestDeload })` at start-up.
  - Make `regenerateWeek` accept and apply `adjustmentKcal` and `volume`. Its signature does not match `RegenerateInput` today.
- `docs/PROGRESS.md` lists `registerPlanner` as "Next". The missing `ensureWeekPlanned` call is not listed.

## 2. P1 confirmed: several snacks per day share the `snack` slot, so intake is lost

- **Where:**
  - `packages/engine/src/context.ts:92-96`: 4 to 6 meals give 1 to 3 `'snack'` slots.
  - `src/features/meals/service.ts:247-249`, `:257`, `:283` (`planLogsFor(date, slot)` is removed on tick and on undo).
  - `src/features/nutrition/logic/intake.ts:29-31` and `src/widgets/snapshot.ts:100-108`: the fallback for eaten meals is keyed by slot.
- **Scenario:**
  1. `meals_per_day = 5`. The user ticks snack A, which adds a `plan` log for slot `snack`.
  2. The user ticks snack B. `markMealEaten` deletes every `plan` log for `(date, 'snack')`, including A's, then writes B's.
  3. A is still `eaten` but has no log. `dayIntake` skips A because `'snack'` is already in `loggedSlots`. Rings, the widget and `rebalanceDay` under-count by A's kcal and protein.
  4. Undoing A (`setMealOpen`) also deletes B's log. `logOffPlan` with `replaceMealId` hits the same path.
- **Fix:** Key plan logs by meal, not by slot. Add a `meal_id` column to `food_logs` (and the server allow-list), or encode the meal id in `name` or `source`. Make `dayIntake` and `eatenTotals` match logs to meals by id.

## 3. P1 confirmed: regenerating or the AI upgrade wipes edits to planned sessions

- **Where:**
  - `src/features/planner/planService.ts:179-183`: a date is kept only when a session's `status !== 'planned'`.
  - `:215-221`: every other session on dates from `fromDate` onwards is soft-deleted, ad-hoc and edited ones included.
  - `:455-491`: `upgradeWithAi` runs up to 12 s after the rules plan is written. Its guard (`weekVersion`, `:483`) only detects another regenerate, not user edits.
- **Scenario:**
  1. After onboarding the user opens today's workout overview and swaps an exercise (`swapExerciseRow` is allowed while the session is `planned`) or adds or reorders exercises.
  2. The Worker answer arrives and `writeWeek` removes the session and inserts a new one with a new id.
  3. The swap is gone. The open player's live query returns no session and shows "Workout not found: It may have been deleted on another device". The same happens on every future regenerate, such as a check-in once item 1 is wired up.
- **Fix:**
  - Treat a session as touched if any of its `session_exercises` has `updated_at > created_at`, or if it was swapped (add `swapped_from`, or compare against the plan payload), or if it has no `planId`.
  - In `upgradeWithAi`, skip any date edited since `rules` was written (`updatedAt > rules write time`).
  - Prefer updating sessions in place, keyed by `(planId, date)`, over delete and recreate, so open screens keep their id.

## 4. P1 confirmed: one lost refresh response signs the user out (no rotation grace)

- **Where:**
  - `server/src/db/mongo.ts:164-176`: `rotatedAt` is set atomically, and a second use counts as `reused`.
  - `server/src/routes/auth.ts:185-190`: on `reused` the family is revoked and the server answers 401.
  - `src/services/api.ts:194-202`: the client keeps the old token on timeout or offline, and on 401 it calls `expireSession`.
- **Scenario:**
  1. `/auth/refresh` succeeds on the server, but the response is lost: iOS suspends the app mid-request, the network drops, or the 15 s client timeout fires. Alternatively the app is killed before `saveSession` runs.
  2. The next request refreshes with the old token. The server sees `reused`, revokes the family and returns 401. The client emits `signedOut('expired')`, which triggers `localSignOut` and `detachLocalRows`.
  3. The user is silently signed out of backup.
- **Fix:**
  - Allow a short reuse grace (for example 60 s after `rotatedAt`, same `deviceId`). Within it, return the already-issued successor, or issue a new child, instead of revoking.
  - Revoke only on reuse outside that window.

## 5. P0 plausible (security): email-code brute force via parallel requests

- **Where:** `server/src/routes/auth.ts:157-175`. The flow is `getEmailCode`, then check `attempts >= 5`, then compare, then `incrementEmailCodeAttempts`. These are separate, non-atomic operations. Limits are per IP only (20 per 15 min plus 30 per min). There is no limit per email on `/verify`.
- **Scenario:**
  1. The attacker triggers `/email/start` for a victim's email (3 per 15 min per email).
  2. The attacker fires N guesses at once from many IPs. All N read `attempts=0` before any increment lands, so all N are compared.
  3. With N = 5,000 that is a 0.5% chance per code. Over 12 codes an hour that is about 6% an hour of taking over the account and its synced backup.
- **Fix:** Do one atomic `findOneAndUpdate({ email, attempts: { $lt: 5 }, expiresAt > now }, { $inc: { attempts: 1 } })` before comparing, and reject when it returns null. Add a rate limit keyed by the email hash on `/email/verify`.

## 6. P1 plausible: pull cursor can permanently skip rows (2 s overlap vs write latency)

- **Where:**
  - `server/src/routes/sync.ts:60`: `now` is taken before validation and the bulk write.
  - `server/src/db/mongo.ts:222`: `syncedAt: now`.
  - `sync.ts:10` and `:124`: `nextSince = t0 - 2000`.
- **Defect:** A row becomes visible at commit time but is stamped with the earlier `now`.
- **Scenario:**
  1. Device A pushes 500 sets. On M0, `bulkWrite` (with `retryWrites`) takes 3 s: stamped at T, committed at T+3 s.
  2. Device B's pull starts at T+2.5 s with `t0 = T+2.5 s`. It does not see the uncommitted rows and stores `since = T+0.5 s`.
  3. Every later pull asks for `syncedAt > T+0.5 s`, so those rows (stamped T) never reach B until a full re-pull at sign-in.
  4. If B then edits one of those rows from its stale copy, B's newer `updated_at` overwrites A's change.
- **Fix:**
  - Make the overlap larger than the longest write (for example 60 s, or socket timeout plus margin). Merges are LWW-idempotent, so the cost is a few re-sent rows.
  - Better: stamp `syncedAt` from a per-user monotonic counter (`findOneAndUpdate $inc`) after the write.

## 7. P1 confirmed: the AI budget "hard cap" is not atomic

- **Where:** `server/src/ai/service.ts:108-123`. The comment says "so concurrent calls cannot push the month past 100%", but the code reads `getAiSpend`, checks `spent + worstCase < budget`, calls the LLM and only adds the spend afterwards (`:132`, `:148`). Nothing is reserved.
- **Scenario:** At $49.99 spent, 200 concurrent `/ai/plan/week` calls (any users, including freshly created anonymous accounts) all read 49.99 and all pass. The month closes above $50, overspending by up to N × worst case. The 80% "free → rules-only" switch is raced the same way.
- **Fix:** Before calling, reserve `worstCase` atomically: `findOneAndUpdate({ _id: month, usdMicros: { $lte: budget - worstCase } }, { $inc: { usdMicros: worstCase, reservedMicros: worstCase } }, { upsert })`. After the call, adjust by `actual - worstCase`.

## 8. P2 confirmed: AI cache never hits for `plan_week`

- **Where:** `src/features/planner/planService.ts:469` sends `params.now` (ms). `server/src/ai/service.ts:87` hashes the whole `req`, `params` included.
- **Scenario:** Every regenerate or onboarding retry for the same week is a cache miss and a paid call, up to the daily limit. The "cache" cost control in CLAUDE.md does nothing for weekly plans.
- **Fix:** Drop `now` from the request, or truncate it to the day, or exclude it from the hash. Hash only the planning-relevant inputs.

## 9. P2 confirmed: Apple Sign-In nonce gives no replay protection

- **Where:**
  - `server/src/auth/idtokens.ts:262-265` accepts `payload.nonce === opts.nonce` (the raw value) as well as `=== sha256(opts.nonce)`.
  - `server/src/routes/auth.ts:126`: the nonce is optional.
- **Scenario:** Anyone holding a captured identity token posts `{ identityToken, nonce: <payload.nonce> }`, read straight from the JWT, or omits the nonce. Either way the check passes, so the nonce never binds the token to the client that started the flow.
- **Fix:** Require `nonce` and accept only `payload.nonce === sha256hex(rawNonce)`. The client already sends the raw value.

## 10. P2 plausible: `/billing/verify` hides later App Store notifications

- **Where:** `server/src/routes/billing.ts:53` (`lastEventAt: now`) and `server/src/routes/webhooks.ts:29` (`existing.lastEventAt > eventAt` → stale).
- **Scenario:**
  1. The App Store Server API keys are not configured, so `getSubscriptionStatus` returns null.
  2. A refund is signed at T0, but the webhook is delayed or retried. The app runs restore at T1 > T0 with its old JWS (still "active"), which stores `lastEventAt = T1`.
  3. The REFUND webhook signed at T0 is ignored as stale, and Pro stays until `expiresAt`. A delayed DID_RENEW is dropped the same way, so the user is wrongly downgraded at the old expiry.
- **Fix:** Use `tx.signedDate` (or the status response's `signedDate`) for `lastEventAt` on verify, never the server's `now`.

## 11. P2 confirmed: purchases can be moved to another account by replaying them

- **Where:** `server/src/routes/billing.ts:52-56` and `:63-68`. The purchase's `userId` becomes the caller. `tx.appAccountToken` and Play's `obfuscatedExternalAccountId` are never compared with `userId`, although the app sets them (`accountId` in `purchase()`).
- **Scenario:** A signed transaction JWS that leaks (from logs or a shared device) can be posted by any account to take Pro. The real owner loses Pro until they press Restore, and the two can ping-pong.
- **Fix:** When `appAccountToken` or `obfuscatedExternalAccountId` is present and belongs to a different existing user, refuse, or require a restore from that account. Allow a transfer only when the token is absent (an old purchase).

## 12. P2 confirmed: a second workout can be started while one is running

- **Where:**
  - `src/features/workout/hooks/usePlayer.tsx:135` and `WorkoutPlayerScreen.tsx:107-113`: Start is shown for any `planned` session with no check of `activeSession()`.
  - `TrainScreen.tsx:147-156` and `RoutineBuilderScreen.tsx:55-63` are the same.
  - Only the deep-link resolver guards against it (`logic/deepLink.ts:48-51`).
- **Scenario:**
  1. Workout A is paused or active. The user opens tomorrow's session from the week strip and taps Start. Both are now `active`.
  2. `activeSession()` returns the newest. After B is finished, the resume banner brings back A with a clock of several hours, and A's day shows "active" in the strip until it is finished or discarded.
- **Fix:** Before `startWorkoutAction`, if `activeSession()` is a different session, prompt the user to resume it, or finish or discard it first.

## 13. P2 confirmed: swapping an eaten meal leaves its intake log

- **Where:** `src/features/meals/repo.ts:38-57` (`swapMeal` sets `status:'planned'`, `eatenAt:null`) and `components/MealTile.tsx:80-88` (the swap button shows for eaten meals too).
- **Scenario:** The user ticks lunch (a `plan` log is written), then swaps it. The tile shows the new recipe as not eaten, but the rings still include the old lunch. Ticking the new recipe replaces the log; undoing the tick (`setMealOpen`) removes it. The UI and intake disagree until then.
- **Fix:** Either hide or disable swap when `status === 'eaten'`, or have `applySwap` remove the meal's plan log (or keep the status `eaten` and rewrite the log).

## 14. P2 confirmed: a device clock more than 24 h ahead means rows are never backed up

- **Where:**
  - `server/src/sync/validate.ts:42` rejects `updated_at > now + 24h`.
  - `src/sync/syncEngine.ts:141-144` sets `dirty = 2` and does not retry until the row is edited.
  - `src/db/repo.ts:29-31` (`nextUpdatedAt`) keeps a future `updated_at` and only adds 1, so later edits are still future-dated even after the clock is fixed.
- **Scenario:** A user sets the phone clock forward (a common game cheat) and logs a week of workouts. Every row is rejected, and edits made after the clock is fixed are still in the future, so they are rejected too. On reinstall the data is gone.
- **Fix:**
  - On push, compare against the server's `serverTime`. Rewrite skewed local `updated_at` values to `serverTime` and re-push, or have the server clamp to `now` instead of rejecting.
  - Retry `dirty = 2` rows whose reason is `updated_at_in_future` on later syncs.

## 15. P2 plausible: iOS Live Activity can vanish when one rest replaces another

- **Where:**
  - `src/features/workout/restTimerStore.ts:90-95`: `end('replaced')` and then `start` each fire an un-awaited `updateRestTimerSurface`.
  - `src/features/notifications/restTimer.ts:62-84`.
  - `modules/repwise-timer/ios/RepwiseTimerModule.swift:56-86`: `endAll` and `upsert` are concurrent Swift tasks.
- **Scenario:** The user ticks the next set during a rest, which is the normal flow. `mod.end()` (end all activities) and `mod.update()` run at the same time. `upsert` finds the activity that is still ending, with the same `sessionId`, and updates it. `endAll` then ends it, so the new rest has no Live Activity. On the JS side, `showing` may also be left false.
- **Fix:** Serialise surface updates in JS through a promise chain. For `replaced`, skip the `end` and just `update` with the new state.

## 16. P2 plausible: duplicate planned sessions after signing in on a second device

- **Where:** `planService.ts` `generateInitialPlan` and `writeWeek` insert sessions with fresh uuids. `src/sync/syncEngine.ts:157-196` merges by id only.
- **Scenario:** The user onboards on a new phone, which plans this week, then signs in. The pull brings the old phone's sessions for the same dates, so every training day has two planned sessions (Train cards and the week count double, and Today picks the oldest). Meal plans are de-duplicated by "newest per date"; sessions are not.
- **Fix:** After a pull, collapse planned, untouched sessions per date, keeping the newest `planId` version. Alternatively derive deterministic ids from `(user, weekStart, date, version)`.

## 17. P2 confirmed: a double-tap on a set tick re-logs it

- **Where:** `src/features/workout/hooks/usePlayer.tsx:66-79`. `set.doneAt` comes from the last render, so a second tap before the live query re-renders runs `logSetAction` again.
- **Scenario:** A fast double-tap moves `doneAt` forward and restarts the rest timer (the old rest is "replaced"). The PR toast and haptic fire twice, and `set_logged` is counted twice in analytics.
- **Fix:** Guard on fresh state (`setsRepo.get(set.id)?.doneAt`) inside the handler, or debounce per set id.

## 18. P2 confirmed: widget Pro default and a stuck paused rest notification

- **Pro default:** `src/widgets/snapshot.ts:136-137`. `forDate(null, ...)` returns `pro: true`, so a widget added before the app has ever written a snapshot shows Pro content to free users. Fix: default to `false`, or to the cached `isProNow()`.
- **Stuck paused rest:** `modules/repwise-timer/android/.../RepwiseTimerModule.kt:103-104`. A paused rest posts an ongoing notification with no `setTimeoutAfter`. If the app is killed while paused, the notification stays until the player is opened again (`installRestNotifier` only runs from the player). Fix: add a long timeout, for example 2 h, when paused, and install the surface bridge at app start.

---

### Checked and found sound (not reported)

- **Client sync:**
  - The in-flight edit guard (`settle` matches the exact `updated_at`).
  - The account-switch guard during pull.
  - LWW merge inside one transaction.
  - Soft deletes.
  - Single-flight `syncNow`.
- **Server sync:**
  - `user_id` always comes from the token, and `_id` is namespaced `userId:rowId`.
  - Field allow-list, primitive-only values and table allow-list on push and pull.
  - No NoSQL operator injection.
  - Delete-account race cleanup.
- **JWT:** HS256 with issuer and audience pinned, a 32-character minimum secret, and a user-exists check on every request.
- **AI:**
  - Schema plus ID-pool validation with fallback to the rules plan.
  - Timeouts are booked at worst case.
  - Rules fallbacks are not cached.
- **Rest timer:** derived from timestamps and persisted to MMKV, so there is no drift and it survives the app being killed.
- **Dates:**
  - Engine date maths uses day numbers and is DST-safe.
  - Local "today" uses the current offset.
  - The streak keeps the current week open.
  - The notification schedule uses Intl zoned wall time, with a diff against OS-pending ids.
- **Billing client:** transactions are finished only after the Worker verifies them, the Android recovery handles unacknowledged purchases, and the entitlement cache has an offline grace and an age cap.
