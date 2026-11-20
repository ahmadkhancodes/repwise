# Repwise adversarial correctness audit, round 2 (read-only), 20 Nov 2026

Scope: `main` at 5351e80 (HEAD a1e73e5 only adds orchestration docs). The round-1 report (`bug_audit.md`, at b69238a) was re-verified against the current code. The new-bug hunt covered the round-1 fix commits (b69238a..6a64191) and the fix wave (6a64191..5351e80).
Severity: P0 = data loss, crash or security. P1 = wrong behaviour. P2 = minor.
Confidence: **confirmed** means the code path alone proves it. **plausible** means it also depends on timing.

## Round-1 findings: status

| # | Round-1 one-liner | Status | Evidence (current code) |
|---|---|---|---|
| 1 | Training never planned after onboarding; check-in a no-op | **Fixed** | `services/bootstrap.ts:51-53` registers the planner bridge and starts `startPlanKeeper` (start-up, foreground, just after midnight). `planner/bridge.ts:14-35` maps `adjustmentKcal` / `deload` into `regenerateWeek`. |
| 2 | Several snacks share the `snack` slot, so intake is lost | **Fixed** | `food_logs.meal_id` (migration 0001, server allow-list `sync/tables.ts:31`). `meals/service.ts:299-307` `planLogsFor` matches by meal id and claims a legacy log only when its slot is unique. |
| 3 | Regenerate or AI upgrade wipes edited sessions | **Fixed** | `planService.ts:206-209` `isUntouchedSession` compares exercises with the plan payload. `:256-298` updates untouched sessions in place (same ids). `:577` adds a version guard on the AI upgrade. |
| 4 | One lost refresh response signs the user out | **Mostly fixed** (residual: see R2-5) | Server `routes/auth.ts:174-186` has a 60 s grace and a deterministic successor. Client `services/api.ts:198-205` retries once. |
| 5 | Email-code brute force via parallel guesses | **Fixed** | `db/mongo.ts:189-200` claims an attempt atomically before comparing. `routes/auth.ts:149` adds a per-email limit. |
| 6 | Pull cursor can skip slow writes | **Fixed** | Per-user monotonic `sync_seq` plus write leases. `syncHighWater` caps the cursor at the oldest lease's floor (`mongo.ts:229-264`). |
| 7 | AI budget cap not atomic | **Fixed** | `reserveAiSpend` is a conditional `$inc` (`mongo.ts:330-346`). It is called before the LLM call and settled afterwards (`ai/service.ts:140-150`). |
| 8 | AI cache never hits for `plan_week` | **Fixed** | `cacheKeyInput` keeps only the UTC day of `params.now` (`ai/service.ts:98-104`). |
| 9 | Apple nonce gives no replay protection | **Fixed** | The nonce is required by the schema (`schemas.ts:34`), and only `sha256(raw)` is accepted (`idtokens.ts:61-63`). |
| 10 | `/billing/verify` hides later App Store notifications | **Fixed** | `lastEventAt` is the store's `signedDate` (`routes/billing.ts:72`). |
| 11 | A purchase can be moved by replaying its receipt | **Fixed** | `assertBoundTo` returns 409 for a purchase bound to another non-anonymous account (`billing.ts:36-40`). |
| 12 | A second workout can be started while one runs | **Fixed** for the player, Train and deep links. **One path left**: Routine builder, see R2-3. | `actions.ts:59-66` refuses to start; `usePlayer.tsx:220-223` routes to the running workout. |
| 13 | Swapping an eaten meal leaves its intake log | **Fixed** | `meals/service.ts:283-293` `applySwap` removes the meal's plan log in the same transaction. |
| 14 | A clock more than 24 h ahead means rows are never backed up | **Fixed** | `syncEngine.ts:124-158` re-stamps rejected rows with `serverTime` and retries `dirty = 2` rows once per launch. |
| 15 | iOS Live Activity can vanish when one rest replaces another | **Fixed** | Surface updates are serialised and coalesced (`notifications/restTimer.ts:63-89`). |
| 16 | Duplicate planned sessions after signing in on a second device | **Open** | See R2-6. Nothing collapses sessions per date after a pull. `syncEngine.mergeRemoteRows` merges by id only. |
| 17 | A double-tap on a set tick re-logs it | **Fixed** | `actions.ts:252` checks the optimistic state, and `:262` checks fresh DB state inside the batched write. |
| 18 | Widget Pro default; stuck paused rest notification | **Fixed** | `snapshot.ts:179` fails closed (not Pro). `RestTimerNotifier.kt:84` sets `setTimeoutAfter` on a paused rest. |

**Totals:** 15 fixed, 2 partly fixed (#4 and #12), 1 open (#16).

---

## New findings (round 2)

**Totals:** 7 findings: 1 P1 and 6 P2. 4 are confirmed and 3 are plausible.

| # | Sev | Conf | Area | One-liner |
|---|-----|------|------|-----------|
| R2-1 | P1 | confirmed | Widgets / deep links | The widget's "Ate it" button never marks the meal eaten. The snapshot drops the meal id, and Eat ignores `tick=1`. |
| R2-2 | P2 | plausible | Workout / lazy catalogue | Train's "Start workout" can run before the exercises part loads, so cardio exercises get strength set rows. |
| R2-3 | P2 | confirmed | Workout | Routine "Start" while another workout runs creates an orphan ad-hoc session and opens it. |
| R2-4 | P2 | confirmed | Settings | "Delete all data" leaves the export JSON in the cache and keeps a running rest timer and its "Rest over" alert. |
| R2-5 | P2 | plausible | Auth | Residual of #4: if the app is suspended or killed for more than 60 s after the server rotated the token, the user is still signed out. |
| R2-6 | P2 | plausible | Sync / planner | #16 is still open, and the plan keeper now makes it the default path on a second device. |
| R2-7 | P2 | confirmed | Dates / tests | Clock injection leaks. The AI upgrade write and Today's planning effect read the real clock instead of the injected `now`. |

### R2-1. P1 confirmed: the widget's "Ate it" button does not eat the meal

- **Where:**
  - `src/features/notifications/data.ts:128` builds `snap.nextMeal` without `id`, although `meals[]` carries it (`:115`).
  - `src/widgets/snapshot.ts:48-49`: `tickMeal(undefined)` falls back to `repwise://eat`.
  - Android: `src/widgets/android/widgets.tsx:123,216`. iOS: `targets/widget/Widgets.swift:219` (`Links.tickMeal(m.id)`).
  - `src/features/meals/screens/EatScreen.tsx:49-57` reads only `log`, `mealId` and `swap`. Nothing handles `tick=1`, so even a link with an id would not tick. This was never implemented: `git log -S"tick=1"` shows only the widget commit 0d3071a.
- **Scenario:** The user taps the "Ate it" pill (labelled "Mark <meal> as eaten") on the home-screen widget. The app opens Eat, and nothing is logged. The user believes lunch is recorded, but the rings, the widget and `rebalanceDay` all miss it. The widget tests only check the URL string (`widgets.test.tsx:114`).
- **Fix:**
  - Add `id: next.id` to `snap.nextMeal` in `data.ts:128`.
  - In `EatScreen`, handle `tick === '1' && mealId` once (a ref guard like `handledLog`): call `markMealEaten(mealId)` if the meal is still `planned`, show the undo toast, then `router.setParams({ tick: undefined, mealId: undefined })`.

### R2-2. P2 plausible: "Start workout" before the exercises part loads pre-fills cardio as strength sets

- **Where:**
  - `src/features/workout/screens/TrainScreen.tsx:260`: `catalog = useCatalogFor('exercises')` is null until an idle slice parses the part.
  - `:280-288`: the footer Start is rendered regardless of the catalogue and calls `startWorkoutAction(id, catalog)`.
  - `actions.ts:70` → `exerciseMeta(id, null).cardio` is `false` (`exerciseMeta.ts:53-62`).
  - `repo.ts:270-284` `ensurePlannedSets` then writes weight and reps rows. They are never re-filled, because rows now exist.
- **Defect:** The lazy-catalogue change made `catalog` nullable on Train. The deep-link path waits for the part (`TrainScreen.tsx:181-186`), but the button path does not.
- **Scenario:** Cold start, open Train and tap "Start workout" within the first idle slice (up to about 2 s on a busy start). A planned rower or bike exercise gets weight and reps set rows instead of duration and distance rows for that whole workout.
- **Fix:** In `startWorkoutAction`, use `catalog ?? lazyCatalog()`. Its getters parse the exercises part synchronously, so it is always correct. Alternatively, disable Start until `catalog` is non-null.

### R2-3. P2 confirmed: Routine "Start" during a running workout leaves an orphan session

- **Where:** `src/features/workout/screens/RoutineBuilderScreen.tsx:83-95`. `createSession(...)` runs first. Then `startWorkoutAction` refuses with the toast, its `{ started: false }` result is ignored, and `router.replace('/workout/<new id>')` follows.
- **Scenario:**
  1. A workout is paused, and the user opens a routine and taps Start.
  2. A new ad-hoc `planned` session dated today is created and opened as an overview. The running workout is not shown.
  3. The orphan has no `planId`, so `isUntouchedSession` treats it as touched and no regenerate ever removes it.
  4. Train shows two sessions today. `planToday` and the widget may pick either one, because they choose by `createdAt`.
- **Fix:** Check `activeSession()` before `createSession`, or use the result: if `!res.started`, soft-delete the new session and `router.replace('/workout/' + res.activeSessionId)`.

### R2-4. P2 confirmed: "Delete all data" leaves personal data and live surfaces behind

- **Where:** `src/features/settings/data.ts:125-148` (`wipeLocalData`) and `:102-121` (`exportAllData`).
- **Defect:** The wipe deletes the SQLite tables, the photos folder and the listed MMKV keys. It misses two things:
  - The export file `Paths.cache/repwise-export-YYYY-MM-DD.json` (one per day of export), which holds the full dataset.
  - The in-memory rest timer (`restTimerStore`). Its Android ongoing notification or iOS Live Activity and the scheduled `rw:rest` alert keep going. The timer also re-persists `workout.restTimer.v1` on its next change (`restTimerStore.ts:101`).
- **Scenario:**
  1. The user exports, then deletes everything, which the UI describes as "starts fresh, like a new install".
  2. The JSON with workouts, body metrics and meals stays in the app cache.
  3. If a rest was running, "Rest over" still fires, and its tap opens `/train` for a session that no longer exists.
- **Fix:** In `wipeLocalData`, delete `repwise-export-*.json` from `Paths.cache`. Call `restTimer.clear()` (or `clearFor` the active session), then `updateRestTimerSurface(null)`.

### R2-5. P2 plausible: residual of #4, a refresh lost for more than 60 s still signs the user out

- **Where:** Server `server/src/routes/auth.ts:179-185`: `reused` (outside the 60 s grace) always revokes. Client `src/services/api.ts:198-207`: the one retry is immediate, but only within the same call.
- **Scenario:**
  1. iOS suspends the app while `/auth/refresh` is in flight, and the server rotates the token.
  2. The app resumes 5 minutes later. The fetch errors and the retry presents the old token. That is beyond the grace window, so the server answers `reused`, revokes the family and returns 401. The client calls `expireSession`, and the user is signed out of backup.
  3. The same happens if the app is killed between the server's rotation and `saveSession`.
- **Fix:** When the successor exists and was never used (`next && !next.rotatedAt`), treat late reuse as a lost response: return the successor, possibly with a longer cap such as 24 h. Revoke only when the successor has itself been rotated, which is the theft signal the code already checks.

### R2-6. P2 plausible: #16 is still open, and the plan keeper makes it routine

- **Where:**
  - `src/features/planner/bridge.ts:50-62` plans the current week at start-up and on foreground whenever a profile exists and no training plan is stored for that week.
  - `src/sync/syncEngine.ts:203-246` merges by id only.
  - `planService.ts:500` `planToday` takes the oldest session per date.
- **Scenario:**
  1. The user onboards on a new phone, so this week is planned locally, then signs in.
  2. The full pull (`scheduler.ts:54`) brings the old phone's sessions and plan rows for the same week. Every training day now has two planned sessions: the week count doubles, Train shows two cards, and workout reminders and the widget may follow a different session from Today.
  3. The next `writeWeek` for that week would collapse the untouched duplicates (`reusable` leftovers are removed). Nothing triggers one, though, because `ensureWeekPlanned` sees an existing plan.
- **Fix:** After a pull that changed `sessions`, run a de-dupe per date: keep the newest-`planId` untouched session and soft-delete the other untouched planned ones. Alternatively, call `regenerateWeek({ ai: false })` for any week holding more than one untouched session per date.

### R2-7. P2 confirmed: the clock is read directly where `now` is injected (test-determinism smell)

- **Where:**
  - `src/features/planner/planService.ts:585`: `upgradeWithAi` computes `today` and `fromDate` from the injected `opts.now`, but `writeWeek` stamps rows with `Date.now()`.
  - `src/features/today/hooks/useToday.ts:75-76`: `ensurePlannedAhead(Date.now())` and `ensureWeekMeals(date, Date.now())` ignore the hook's `now` / `nowOverride`.
  - `planService.ts:476`: `ensureWeekPlanned(date = localToday(), now)`. The default date ignores the `now` passed in.
- **Scenario:** A test that injects `now` for a fixed week (as the Today and planner tests do) gets rows stamped with, and weeks planned for, the real current date. Results then vary with the day the suite runs. Commit 691da11 ("plan picks vary with content and date") is a symptom. In production, a Today rendered with `nowOverride` (screenshots, Maestro) plans the wrong week.
- **Fix:** Thread `now` through: `now: opts.now ?? Date.now()` in `upgradeWithAi`'s `writeWeek` call; `ensurePlannedAhead(now)` and `ensureWeekMeals(date, now)` in `useToday`; and `date = localToday(now)` as the default in `ensureWeekPlanned`.

---

### Checked and found sound (not reported)

- **`withTransaction`:**
  - It is synchronous, and a thenable result is rolled back.
  - Nested calls use savepoints, and rollback undoes only the inner writes.
  - Write signals are coalesced on commit.
  - No path nests it inside expo's `withTransactionSync`, which `writeWeek` and `wipeLocalData` use, or inside drizzle `db.transaction`, which sync uses. Either nesting would issue `BEGIN` inside an open transaction.
- **Optimistic set logging:**
  - The batched flush runs in one transaction with per-job error isolation.
  - The double-tap guard uses both the optimistic state and fresh DB state.
  - Finish and Discard flush pending ticks first.
  - Overlay entries clear once the live rows agree.
- **Lazy catalogue:**
  - Every getter parses its part synchronously on first read, so no reader can see a "not loaded" catalogue (only `peek*` returns null).
  - `useCatalogFor` returns a stable snapshot, and `part()` is idempotent.
  - The only race found is R2-2.
- **Migrations:**
  - 0001 adds a nullable column with a local backfill.
  - 0002 drops only indexes that exist in 0000.
  - `isSchemaCurrent` uses the same check as drizzle's migrator.
- **Profile edit:** It replans from today only. Started, swapped or edited sessions are kept (content comparison with the plan payload). Eaten or swapped meal days are kept.
- **Delete with undo:** The 5 s timer is held in a ref that survives leaving Settings, and Undo cancels it. A signed-in delete stops if the server delete fails.
- **Notifications:**
  - `rebuildSchedule` is single-flight with a rerun.
  - Set writes are ignored for rebuilds (A10).
  - The launch rebuild is deferred 2.5 s. A local write inside that window can move it to 1.5 s after the write, which is a perf nuance, not a bug.
  - Cold-start responses are de-duplicated by key.
- **Train deep link:**
  - It waits for the exercises part before starting.
  - It never starts a second workout.
  - Params are cleared after handling.
- **Rest-timer native bridge:**
  - Android shortService FGS with a timeout detach.
  - The alert is delivered through expo's own request id, so it is not duplicated.
  - Updates are serialised in JS.
  - The +15 s / Skip buttons are inert until JS subscribes to `onRestAction`, which is documented as pending in `docs/NATIVE.md:59-72`. That is not a correctness bug: the buttons never appear.
- **Server AI:**
  - Output schema checks are strict: exact keys, copy filter, per-slot pool membership, and `day` order.
  - The reservation is settled on the daily-limit, timeout and error paths.
  - The free tier is capped at 80% through the reservation cap.
- **Auth:**
  - Refresh rotation is idempotent within the grace window, and a duplicate insert of the successor is tolerated.
  - Single-flight refresh on the client.
  - Sign-in resets the pull cursor.
- **Sync of `meal_id`:** Mappers are derived from the schema, the server allow-list includes `meal_id`, and the legacy `NULL` falls back to the slot only when that slot is unambiguous.
