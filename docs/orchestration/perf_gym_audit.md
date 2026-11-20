# Repwise audit: speed and gym-floor UX

Scope: `/home/user/repwise` at `b69238a` (main), read-only. Paths are relative to the repo root.
Method: static code reading only. Nothing was run on a device, so every millisecond figure is an **estimate** for a mid-range Android phone (Hermes, about Pixel 6a / Galaxy A54 class), not a measurement. Confirm the P0 items with a release-build trace before and after.

Severity: P0 = breaks a non-negotiable in normal use. P1 = clearly felt. P2 = polish or scale risk.

## What is already right

- The rest timer is timestamp-based (`startedAt`/`endsAt` in MMKV, `src/features/workout/restTimerStore.ts`), so the countdown itself cannot drift and it survives a kill.
- No network or `await` sits on the log-a-set path: `logSetAction` is fully synchronous local SQLite (`src/features/workout/actions.ts:105`).
- The content JSON is not parsed before first paint (`src/services/catalog.ts:99-121`), and zod stays out of the catalogue path.
- WAL is on, updates never block launch (`fallbackToCacheTimeout: 0`), and animations are all Reanimated (no JS-driven `Animated`).
- An Android chronometer notification and an iOS Live Activity exist for the rest timer.

---

## A. Performance

### A1. The whole player re-renders 4 to 5 times a second while resting — P0
- **Where:** `src/features/workout/hooks/useRestTimer.ts:18` (`useNow(250)`), called from `usePlayer.tsx:49`; `WorkoutPlayerScreen.tsx:29` adds `useNow(1000)` for the clock.
- **Problem:** both ticks are state at the top of the screen, so every tick re-renders the screen, every `ExerciseCard` and every `SetRow`. Nothing is memoised (`ExerciseCard.tsx:55`, `SetRow.tsx:50`), and `ExerciseCard.tsx:133,135` passes fresh closures to each row. A 6-exercise workout is about 24 rows with 48 `TextInput`s and 24 animated styles, re-rendered about 5 times a second for the entire rest, which is exactly when the user edits the next set.
- **Second cost:** `ExerciseScreen.tsx:18` calls `usePlayer` again while the list screen is still mounted underneath, so both screens tick and both re-query.
- **Fix:**
  1. Move `useRestTimer()` out of `usePlayer` into `RestTimerPill` and `RestTimerSheet`, so only those leaves tick. Move the workout clock into its own `<WorkoutClock session />` component.
  2. Wrap `SetRow` and `ExerciseCard` in `React.memo`. Pass `item` to `SetRow` and call `onToggle(item, set, patch)` inside it, so the inline closures at `ExerciseCard.tsx:133,135` disappear.
  3. Tick the countdown text at 1 Hz, aligned to the second boundary (`setTimeout(remainingMs % 1000)`), and drive the bar/ring with one UI-thread `withTiming(0, { duration: remainingMs, easing: Easing.linear })` (see A9).
- **Impact:** JS work during rest drops from about 5 full-screen renders a second to 1 small text update a second. Typing and ticking during rest stop competing with the timer. Lower battery and heat.

### A2. Every set tick re-runs the queries of every mounted tab — P0
- **Where:** `src/features/workout/hooks/useTrain.ts:55-71` (`useHistory`), `useTrain.ts:26-50` (`useWeekSessions`), `src/features/workout/repo.ts:78-82` (`sessionsBetween`), `src/features/today/repo.ts:57` (`TODAY_TABLES` includes `sets`), `app/(tabs)/_layout.tsx:30` (tabs stay mounted and are not frozen).
- **Problem:** the player is pushed on top of the tabs, so Today and Train stay mounted and keep their change listeners. One `sets` write triggers, synchronously on the JS thread:
  - `useHistory`: 60 sessions × (`setsForSession` = 2 queries + `exercisesForSession` = 1) ≈ **180 queries** (N+1). `TrainScreen.tsx:139` mounts it even when the History segment is hidden.
  - `useWeekSessions`: `sessionsBetween` loads the **whole sessions table** and filters in JS, then 1 query per session.
  - Today: about 10 queries plus `buildTodayView`, although Today shows nothing that depends on a set.
  - The player itself, twice if the exercise screen is open.
- **Estimate:** about 200 synchronous drizzle queries per tick once a user has 60 finished workouts. At 0.2–0.5 ms each that is 40–100 ms of blocked JS **after** the tap handler, on every set. It grows with history.
- **Fix:**
  1. Set `freezeOnBlur: true` on the tabs and stack screen options, and skip refreshes in `useLiveValue`/`useDbSnapshot` while the screen is not focused (`useIsFocused`), with one refresh on focus.
  2. Remove `sets` and `body_metrics` from `TODAY_TABLES` unless a card reads them.
  3. Replace `useHistory` with one aggregate query: `SELECT s.*, COUNT(st.id) FILTER (WHERE st.done_at IS NOT NULL), SUM(st.weight_kg * st.reps), COUNT(DISTINCT se.id) FROM sessions s LEFT JOIN session_exercises se … LEFT JOIN sets st … WHERE s.status='done' GROUP BY s.id ORDER BY s.ended_at DESC LIMIT 60`. Mount it only when the History segment is selected.
  4. `sessionsBetween`: push the range into SQL (`between(sessions.date, from, to)`, uses `sessions_date_idx`) and fetch the week's exercises with one `inArray` query.
- **Impact:** per-tick background work falls from about 200 queries to about 4. This is the largest single win for the "< 100 ms" rule.

### A3. The tick is not optimistic and does about 12 statements before the UI can change — P0
- **Where:** `src/features/workout/actions.ts:105-143`, `src/db/repo.ts:76-91`, `src/features/workout/hooks/useLiveValue.ts:38-45`.
- **Problem:** the checkmark only turns green after: `setDone` (a SELECT plus an UPDATE … RETURNING), `exercisesForSession` ×2, `setsForSession` ×2 (each runs `exercisesForSession` again), `exerciseHistory` (a 3-table join that returns **every set ever logged** for the exercise, unindexed — see A5), `getSession` for the notification title, an MMKV write, analytics, then a native change event, a microtask, a full re-query (3+ statements) and a full-screen render. Then A2 runs.
- **Estimate:** 25–60 ms on a fresh install, over 100 ms with a few months of history. The 100 ms budget is not safe.
- **Fix:**
  1. Optimistic UI in `SetRow`: `const [optimistic, setOptimistic] = useState<boolean | null>(null); const done = optimistic ?? set.doneAt != null;` set it in `toggle()` before calling `onToggle`, clear it when `set.doneAt` changes. The pop animation and tint then start in the same frame as the tap.
  2. In `logSetAction` keep only `setDone` and `restTimer.start` synchronous. Use the `items` already in memory for `nextUp` and same-exercise sets (pass them in from `usePlayer`), which removes 5 queries. Run PR detection and `track` in `setTimeout(0)`.
  3. PR detection: cache per-exercise bests once per workout (`SELECT MAX(weight_kg), MAX(weight_kg * (1 + reps/30.0)) …`) in the same `prevCache` map as `useWorkout.ts:34`, instead of loading the full history on every tick.
  4. `repo.update`: drop the pre-SELECT; do `UPDATE … SET updated_at = MAX(?, updated_at + 1) … RETURNING *`.
- **Impact:** visual response under 16 ms regardless of history size; total JS per tick about 5–10 ms.

### A4. Player and Today wait for the whole 1 MB catalogue, which blocks JS right after first paint — P0
- **Where:** `src/services/catalog.ts:62-83,99-121`; `WorkoutPlayerScreen.tsx:55`; `ExerciseScreen.tsx:26`; `src/features/today/hooks/useToday.ts:57-67`; `src/features/meals/service.ts:66`.
- **Problem:**
  - `getCatalog()` loads all three files (exercises 321 KB, recipes 548 KB, foods 135 KB) and builds three search indexes in one synchronous call. Estimate 120–250 ms of blocked JS on mid-range Android.
  - `warmCatalog` runs "when idle", which is the moment Today has just painted and the user tries to tap. `requestIdleCallback` only delays the start; the block is not chunked.
  - The player shows a skeleton until `catalog` is non-null (`WorkoutPlayerScreen.tsx:55`), although it only needs exercise names. A notification deep link into a workout pays the full parse, including 683 KB of recipes and foods it never uses.
  - Today's meal names are skeletons until the catalogue arrives (`useToday.ts:83`), so Today does **not** fully render from the local cache, which sheet 11 requires (< 300 ms).
  - Right after the catalogue lands, `ensureWeekMeals` runs in `setTimeout(0)` (`useToday.ts:59`): `engineRecipes` converts all 325 recipes and the engine plans the week. Estimate another 50–150 ms in the same window.
  - `src/features/notifications/data.ts:45` calls `getRecipe` (synchronous parse) from the notification rebuild 800 ms after start (`src/services/notifications.ts:411`), so the "lazy" parse can be forced early anyway.
- **Fix:**
  1. Split the catalogue into three independent lazy stores (`useExercises()`, `useRecipes()`, `useFoods()`), each with its own `require` and index. Build the search index on first search, not on load.
  2. Denormalise what the hot screens show: store `title`, `kcal`, `protein`, `carbs`, `fat` on the `meals` row when it is planned or swapped, and `name` (plus `cardio`) on `session_exercises`. Today, the player, notifications and widgets then need no catalogue at all. This is a migration; log it in `docs/DECISIONS.md`.
  3. Cheaper alternative to 2: generate a tiny `exercise-names.json` (id → name, pattern, primary muscles; about 15 KB) at content build time and let the player use that.
  4. Run `ensureWeekMeals` only when a day in the week is actually missing (one `COUNT` query first), and not within 2 s of launch.
- **Impact:** the player opens from SQLite in one frame; Today is complete on first paint; a 200–400 ms JS stall in the first two seconds of every cold start goes away.

### A5. Missing indexes for the hot queries — P1
- **Where:** `src/db/schema.ts:89,106,123`; queries in `src/features/workout/repo.ts:71-76,85-93,108-126`.
- **Problem and fix (one new migration):**
  - `historyRows` filters on `session_exercises.exercise_id`, which has no index, so the "Previous" column and PR detection scan the table. Add `index('session_exercises_exercise_idx').on(t.exerciseId)`.
  - `activeSession()` and `doneSessions()` filter on `status` and sort by `started_at`/`ended_at`. Add `index('sessions_status_ended_idx').on(t.status, t.endedAt)`.
  - `sets` ordered by `idx` within an exercise: replace the single-column index with `(session_exercise_id, idx)`; same for `session_exercises (session_id, position)`. This removes the sort step.
  - Sync push scans every table for `dirty = 1` after every debounced write. Add a partial index per sync table: `CREATE INDEX … ON sets(dirty) WHERE dirty != 0`.
- **Impact:** history-dependent queries stay flat (about 1 ms) instead of growing with the log. A heavy user reaches about 10,000 set rows in a year.

### A6. Multi-row writes are not in a transaction — P1
- **Where:** `src/features/workout/repo.ts:151-158` (`insertPrefilled`), `181-193` (`startWorkout`), `211-216` (`finishWorkout`), `219-229` (`discardWorkout`), `240-249` (`createSession`), `295-300` (`reorderExercises`), `274-292` (`swapExerciseRow`).
- **Problem:** each row is its own autocommit (one WAL commit each), and `repo.update`/`remove` add a SELECT per row. Starting a 6×4 workout is about 24 inserts plus 6 history joins; finishing with unticked sets is 2 statements per set. Each write also emits a change event, and `useDbSnapshot` (`src/features/today/hooks/useDbSnapshot.ts:18-23`) does not coalesce, so Today can reload once per row.
- **Correctness risk:** a kill between rows leaves a half-started or half-discarded workout. CLAUDE.md says never lose user data.
- **Fix:** wrap each of these in `getDb().transaction(() => { … })` (synchronous in expo-sqlite), use one multi-row `insert().values([...])` and one `UPDATE … WHERE id IN (…)` for the soft deletes, and call `notifyLocalWrite` once. Coalesce `useDbSnapshot` the same way `useLiveValue` already does (`queued` flag plus microtask).
- **Impact:** "Start workout" and "Finish" drop from an estimated 40–120 ms to under 15 ms, and they become atomic.

### A7. Cold start: fonts are loaded at runtime and gate the first render — P1
- **Where:** `app/_layout.tsx:26-32,53`; `app.config.ts:163` (`'expo-font'` plugin with no fonts listed).
- **Problem:** `useFonts` loads four Inter files asynchronously after JS starts, and the layout returns `null` until they resolve. Estimate 50–150 ms added to every cold start, and the migration check cannot start until the tree mounts.
- **Fix:** embed the fonts natively: `['expo-font', { fonts: ['node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf', …500, 600, 700] }]`, then delete `useFonts` and the `ready` gate. On Android reference them by file name. This needs one native build (`mode=release`), so batch it with other native changes.
- **Also:** `DatabaseProvider.tsx:33` runs `useMigrations` (async) on every launch. Store the last applied migration tag in MMKV and render children immediately when it matches the bundled journal; run the migrator only on a mismatch.
- **Impact:** an estimated 80–200 ms off time-to-Today.

### A8. Root layout pulls Skia, bottom-sheet and the wheel picker into startup — P2
- **Where:** `app/_layout.tsx:20` imports `ToastHost` from the `@/ui` barrel (`src/ui/index.ts`), which evaluates `ProgressRing` (Skia), `Sheet` (gorhom), `WheelPicker`, etc. There is no `metro.config.js`, so nothing sets `inlineRequires` explicitly.
- **Fix:** import `ToastHost` from `@/ui/Toast` in the root layout. Confirm `inlineRequires` is on in the Expo SDK 58 default transformer; if not, add a `metro.config.js` that enables it. `src/services/bootstrap.ts` also loads auth, billing/IAP and sync modules eagerly; start them with `setTimeout(…, 1500)` after first paint.
- **Impact:** estimated 30–80 ms of module evaluation moved off the critical path.

### A9. Rest ring and pill bar are driven from JS state — P2
- **Where:** `src/features/workout/components/RestTimer.tsx:54-60,86-100`; `src/ui/ProgressRing.tsx:45-47`.
- **Problem:** the pill bar width is a percentage recomputed in render 4 times a second (steppy). The Skia ring restarts a `withSpring` on every tick, so it is always chasing a moving target.
- **Fix:** one shared value per rest: `progress.value = withTiming(0, { duration: remainingMs, easing: Easing.linear })`, restarted only on start, ±15 s, pause and resume. Bind it to the Skia `end` prop and to a `scaleX` transform on the pill bar.
- **Impact:** smooth 60/120 fps countdown with zero JS work per frame.

### A10. Notification schedule and widget rebuild after every set — P2
- **Where:** `src/services/notifications.ts:398` (`onLocalWrite` → `requestRebuild`, 1.5 s debounce), `rebuildOnce` at `:205`.
- **Problem:** rests are longer than 1.5 s, so each logged set triggers a rebuild: 8 days of `loadDayPlans` (about 30 queries plus catalogue lookups), `getAllScheduledNotificationsAsync`, a diff, and a widget snapshot write. Sync push fires 2 s after every set as well (`src/sync/scheduler.ts:16`).
- **Fix:** ignore `sets` and `session_exercises` writes while a session is `active`, and rebuild once on finish. Pass the table name through (`onLocalWrite` already provides it). Raise the sync debounce to about 15 s during an active workout and flush on finish or background.
- **Impact:** removes a 20–50 ms JS burst plus bridge traffic in the middle of each rest.

### A11. Lists — P2
- `src/features/library/screens/LibraryScreen.tsx:123`: `FlatList` over 283 rows, each wrapped in an `Animated.View`, `windowSize={11}`. FlashList is in the stack but unused anywhere. Switch to `FlashList` (stable `keyExtractor` already exists; apply the entering animation only to the first screenful, which `STAGGER_ROWS` already does) and add `getItemType` if rows differ. Memoise `ExerciseRow`.
- `src/features/workout/screens/TrainScreen.tsx:229`: up to 60 history cards rendered with `.map` inside a `ScrollView`. Use `FlashList` or cap at 10 with "Show all" linking to `HistoryScreen`.
- `src/features/workout/components/ExerciseCard.tsx:80-82`: `LinearTransition` layout animation plus a staggered `FadeIn` on every card. Adding a set re-lays-out every card below it with a spring. Keep the layout animation only on the card that changed.
- The player list itself is small enough for a `ScrollView` once A1 is fixed.

### A12. Images — P2
- `src/features/library/components/ExerciseMedia.tsx:70-80`: thumbnails use `cachePolicy="memory-disk"` and `recyclingKey` (good) but have no `placeholder` (blurhash) and a 180 ms `transition` on every recycled row, which reads as flicker during fast scroll. Add a blurhash per exercise at content build time (sheet 11 asks for it) and set `transition={0}` when the image is already cached; request thumbnails at 2× the 56 dp box via the Cloudinary URL.
- `src/features/workout/screens/ExerciseScreen.tsx:75-87`: the in-workout exercise screen shows a grey box with a dumbbell icon instead of `ExerciseHero`. See B11.
- Add `Image.prefetch` for today's session thumbnails and loops on Wi-Fi when the workout card renders, so the gym (often poor signal) never shows placeholders.

### A13. Small re-render items — P2
- `app/index.tsx:9`: `useOnboarding()` with no selector subscribes to the whole store. Select only the fields `resumeHref` needs.
- `src/features/workout/hooks/usePlayer.tsx:251-259`: `handlers` is a new object with two new closures on every render, which defeats memoisation once A1 adds it. Wrap in `useMemo`/`useCallback`.
- `src/features/today/hooks/useDbSnapshot.ts:25`: `JSON.stringify(deps)` on every render; fine for two strings, but use the same explicit deps pattern as `useLiveValue`.
- No zustand selector in the app returns a fresh object or array; no issue found there.

---

## B. Gym-floor UX

### B1. The screen sleeps during a workout — P0
- **Where:** `src/features/workout/screens/WorkoutPlayerScreen.tsx` and `ExerciseScreen.tsx` (no keep-awake). `expo-keep-awake` is installed and used only in `src/features/meals/screens/CookModeScreen.tsx:26`.
- **Problem:** the phone on the bench locks after 30 s. Every set then starts with unlock, with sweaty fingers and a failing fingerprint.
- **Fix:** in both screens: `useKeepAwake('workout')` gated on `status === 'active'` (use `activateKeepAwakeAsync`/`deactivateKeepAwake` in an effect so a paused workout lets the screen sleep). Add a Settings toggle, default on.
- **Impact:** removes the most frequent friction in the product. One line of code.

### B2. Weight and reps are 18 pt text inputs; there are no steppers — P0
- **Where:** `src/features/workout/components/NumberCell.tsx:37-68` (a `TextInput`, 44 dp min height, 18 pt), used at `SetRow.tsx:139-166`.
- **Problem:** changing a weight means hitting a small cell, the system keyboard covering half the screen, typing with wet thumbs, then dismissing the keyboard. That is the opposite of "minimal typing". `src/ui/Stepper.tsx` exists but is not used in the player, and it has 48 dp buttons with no long-press repeat (`Stepper.tsx:64-71,92-99`).
- **Fix:**
  1. Make the cells buttons (not inputs). A tap opens a bottom-sheet "set editor" for that set: weight and reps each as a 64 pt tabular number between 64×64 dp − and + buttons; weight step from the exercise's equipment (2.5 kg / 5 lb barbell, 1 kg / 2.5 lb dumbbell); a row of quick chips (−5, −2.5, +2.5, +5, "same as last"); a "keypad" affordance that opens an in-sheet numeric pad for big jumps; a full-width 64 dp "Log set" button at the bottom.
  2. Add press-and-hold repeat to `Stepper`: `onLongPress` starts an interval (400 ms delay, then every 80 ms, accelerating), `onPressOut` clears it, with a selection haptic per step.
  3. Keep the 1-tap tick for "same as planned"; the editor is only for changes.
- **Impact:** most sets stay one tap; a change is 2–3 large taps in the thumb zone with no keyboard.

### B3. Tap targets in the set row are 48 dp, with a 32 dp visual check — P0
- **Where:** `SetRow.tsx:176` (check hit box `sizes.touch` = 48), `SetRow.tsx:181-182` (visible circle `spacing.xxl` = 32), `tokens.ts:123`.
- **Problem:** the brief needs 56–64 dp for set logging. The check sits on the far right edge next to the reps input (8 dp gap, `SetRow.tsx:81`), so a miss opens the keyboard. The set-type button on the left is also 48 dp and opens a sheet containing "Delete set".
- **Fix:** add `sizes.touchGym: 64` to the tokens. Make the check a 56 dp filled circle in a 64×64 hit box with `hitSlop={8}`, raise the row to 64 dp, and make the whole row (outside the cells) tick the set. Give the active (next undone) set a stronger treatment: `surface2` background and a 2 dp accent left rule, so the eye lands on it.
- **Impact:** far fewer mis-taps; the next action is visible from standing height.

### B4. The rest timer is not glanceable — P0
- **Where:** `RestTimer.tsx:42` (pill countdown is `headline`, 18 pt), `RestTimer.tsx:92` (sheet countdown is `display`, 40 pt, and only after a tap), `tokens.ts:86`.
- **Problem:** at 1 m, 18 pt is unreadable and 40 pt is marginal. The countdown is the single most-watched number in the app and it is the smallest element in the footer.
- **Fix:**
  1. Add a `timer` type token: Inter Bold 72/76, tabular, `maxFontSizeMultiplier: 1.1`; and `hero` at 96 for the sheet.
  2. When a rest starts, replace the footer with a full-width rest bar (about 96 dp tall, `inverse` background): 56–64 pt countdown on the left, "Next: Bench press · set 3 · 80 kg × 8" as one line, and 56 dp "−15", "+15" and "Skip" buttons on the right. No tap needed to reach the controls.
  3. In the last 5 s switch the number to `accent`; at zero flash the bar once (respect Reduce Motion).
  4. Show the current exercise's next set target in the same large style when no rest is running ("80 kg × 8", 40 pt).
- **Impact:** the user can leave the phone on the bench and read it between breaths.

### B5. Rest end has one weak haptic and no reliable sound — P0
- **Where:** `useRestTimer.ts:19-21`, `src/services/haptics.ts:32-38`, `src/features/notifications/restTimer.ts:44-60,68-74`.
- **Problem:**
  - The in-app cue is a single `Confirm` tick. It is not felt with the phone on a bench or in a pocket.
  - It only fires if a screen that calls `useRestTimer` is mounted **and** focused in JS; with two player screens stacked it fires twice (see A1).
  - The audible cue relies on the scheduled "Rest over" notification. In the foreground `restTimer.check()` ends the rest within 250 ms of `endsAt`, which calls `updateRestTimerSurface(null)` → `setAlert(null)` → `cancelScheduledNotificationAsync`. Android delivers inexact alarms late, so the cancel usually wins and **no sound plays**. This is a race read from the code, not observed on a device; verify it.
- **Fix:**
  1. Play the end cue in-app from the store (`restTimerStore.end('done')`), not from a hook: a short bundled sound that mixes with the user's music (ducking, not pausing) plus a long vibration pattern (`Vibration.vibrate([0, 250, 120, 250, 120, 400])` on Android; three `notificationAsync(Success)` 150 ms apart on iOS). An audio library is not in the stack list (`expo-audio`); ask the owner before adding it. Until then the vibration pattern alone needs no new dependency.
  2. Add optional 3-2-1 ticks (light haptic each second), default on.
  3. Use exact alarms for the background alert on Android (`SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM` via the timer module) so "Rest over" is not up to a minute late with the screen off.
  4. Settings: sound on/off, vibration on/off.
- **Impact:** the user stops watching the clock. This is the core job of a rest timer.

### B6. No controls on the lock screen or notification — P1
- **Where:** `modules/repwise-timer/android/…/RepwiseTimerModule.kt:75-106` (content intent only, no `addAction`); the iOS Live Activity has no `AppIntent` buttons.
- **Fix:** Android: add "+15 s", "Skip" and "Done set" actions with a `BroadcastReceiver` that writes the same MMKV key the JS store reads (`workout.restTimer.v1`), then updates the chronometer natively so it works with JS asleep. iOS 17+: `Button(intent:)` with `LiveActivityIntent` for the same three actions. Show the next set ("Bench · set 3 · 80 × 8") in the expanded layout.
- **Impact:** a full workout can be run without unlocking. This is table stakes among the best lifting apps.

### B7. Primary actions sit at the wrong ends of the screen — P1
- **Where:** `WorkoutPlayerScreen.tsx:84-101,117`; `ExerciseScreen.tsx:52-57`.
- **Problem:**
  - The pinned bottom button is "Finish workout", used once per session, in the best thumb position. Logging the next set, used 20+ times, is a small target wherever the list happens to be scrolled.
  - Pause, the plate calculator, and previous/next exercise are 48 dp icons in the top-right corner, the hardest one-handed reach. In the exercise screen the back chevron and the "previous exercise" chevron are the same icon, 48 dp apart (`ExerciseScreen.tsx:24,54`).
  - The player does not scroll to the current exercise, so after exercise 3 the active set is off-screen behind completed cards.
- **Fix:** make the pinned footer context-aware: "Log set 3 · 80 kg × 8" (64 dp, accent) while sets remain, turning into "Finish workout" when all are done; move Finish to the header overflow otherwise. Auto-scroll to the next undone set after each tick and collapse completed exercises to a one-line summary. Move pause and tools into a bottom row or the overflow sheet. Add horizontal swipe between exercises on S14 and remove the duplicate chevron.
- **Impact:** the whole loop (log, rest, log) happens in the bottom third with one thumb.

### B8. Destructive actions have no undo — P1
- **Where:** `WorkoutPlayerScreen.tsx:201` ("Discard workout", one tap, directly below "Keep going", deletes every logged set via `repo.ts:219`); `usePlayer.tsx:168-172` (Delete set, no toast); `usePlayer.tsx:221-225` (Remove exercise, toast with no Undo); `SetRow.tsx:96-97` (tapping a done set un-ticks it silently, with no way to tell it happened except the colour).
- **Fix:** rows are soft-deleted already, so undo is cheap: return the affected ids from `removeSet`/`removeExercise`/`discardWorkout`, show `showToast({ actionLabel: 'Undo', durationMs: 5000 })` and clear `deleted_at` on undo (Today already uses this pattern, `TodayScreen.tsx:92-100`). For Discard, require a press-and-hold (about 800 ms with a fill animation) and move it out of the Finish sheet into the overflow menu. For un-tick, show "Set 3 un-ticked · Undo" and keep the rest timer running.
- **Also:** the Finish sheet says unticked sets "won't be saved" (`WorkoutPlayerScreen.tsx:190`). Offer "Mark remaining as done" there, so nobody loses a set they did but forgot to tick.
- **Impact:** removes the one path where a sweaty mis-tap destroys a session. CLAUDE.md: never lose user data.

### B9. Toasts cover the footer — P1
- **Where:** `src/ui/Toast.tsx:140` (fixed `bottom: insets.bottom + 72`).
- **Problem:** in the player the footer is the rest pill plus a 56 dp button (about 130 dp), so the "New PR" toast lands on top of the rest timer and the primary button for 3 s, right after a tick. Its Undo/action text is 14 pt underlined (`Toast.tsx:104-107`), too small to hit.
- **Fix:** let screens register their footer height (context or a store value) and position the toast above it; make the toast action a 48 dp pill button. Show PRs inline on the row (the trophy already exists at `SetRow.tsx:113-115`) with a brief accent flash instead of a blocking toast.

### B10. Contrast and legibility in bright light — P1
- **Where:** `SetRow.tsx:116-125` ("Previous" is `callout` 14 pt in `textTertiary` #6B6B6B); `ExerciseCard.tsx:38-49` (column headers 12 pt tertiary); `SetRow.tsx:192-196` (unticked check is a `textTertiary` icon on `surface2`, about 3.9:1); `SetRow.tsx:84` (done row tint `accentSoft` #E3F7EC on a #F3F3F3 card, nearly invisible in glare).
- **Fix:** in the player use `textSecondary` at 16 pt minimum for "Previous" (it is the number the user copies). Make the done state unmistakable: solid accent check, primary-weight numbers, and a strikethrough or dimmed row. Put the unit next to the number ("80 kg") instead of only in a 12 pt header. Consider defaulting the player to the dark theme (pure black OLED, white 700-weight numbers) regardless of the app theme, with a Settings toggle; it reads better under gym lighting and saves battery with keep-awake on.

### B11. The in-workout exercise screen has no demo — P1
- **Where:** `ExerciseScreen.tsx:74-87` (placeholder box), while `ExerciseHero` (`src/features/library/components/ExerciseMedia.tsx:91`) already implements poster-then-loop.
- **Problem:** sheet 10 specifies "GIF, set rows, previous, timer" for S14. The ICP ("knows exactly what to lift without a coach") needs the form demo most at this moment. The media box plus cues also push the set rows below the fold.
- **Fix:** use `ExerciseHero` in a collapsible 16:9 header (collapsed to a 56 dp thumbnail after the first set is logged), and prefetch the session's loops when the workout starts.

### B12. Landscape and bench use — P2
- **Where:** `app.config.ts:70` (`orientation: 'portrait'`).
- **Fix:** keep the app portrait, but add a "bench mode" for the rest timer: a full-screen view (tap the rest bar) with the countdown at about 30% of screen height, the next set below it, and tap-anywhere-to-skip-with-undo. Unlock orientation for that one screen (`expo-screen-orientation` is not in the stack list; ask first) or simply render it rotated. Low priority next to B1–B5.

### B13. Haptics mapping — P2
- **Where:** `SetRow.tsx:170` (`feedback="light"` on the tick), `PressableScale.tsx:52` (fires on press-in).
- **Problem:** CLAUDE.md says "success on core action"; sheet 11 says "light on set tick". The code follows sheet 11. A light key-tick is hard to feel mid-set. Because the haptic fires on press-in, a scroll that starts on a check also buzzes.
- **Fix:** fire the tick haptic in `onPress` (after the tap is confirmed) and use a firmer pattern for the tick (Android `Confirm`, iOS `impactAsync(Medium)`); reserve the triple pattern for rest end and PRs. Log the decision in `docs/DECISIONS.md`.

### B14. Visual identity: accurate to the brief, but generic — P1
What it feels like now: a clean monochrome list app. It matches sheet 11 on tokens, but the player looks like a settings form (grey cards, 18 pt rows, small inputs) and nothing in it says "gym".

Where it reads as a template:
- **Type scale tops out at 40 pt** (`tokens.ts:86`). Premium fitness apps lead with one enormous number per screen. Sheet 11 itself asks for "big bold totals" and a "big countdown".
- **Plain Inter.** Sheet 11 asks for a UberMove-like geometric display face ("Inter Tight / Satoshi-style"). Inter at 700 for titles is the default look of every Expo starter. Use a condensed or tight display face for numbers and titles only (needs owner approval as a new font package).
- **The accent is used timidly.** Green appears on a 32 dp check and a 4 dp bar. The moments that should feel like a win (set logged, PR, workout complete) get a 1.18 scale pop and a toast. Give the tick a full-row accent sweep, give a PR a row-level celebration, and lead the summary with one huge number (volume or PRs) as sheet 11 specifies.
- **No media in the workout.** Grey boxes with a dumbbell icon appear on the player's exercise screen (B11), which is where imagery would do the most to make the app feel alive.
- **No sense of session progress.** A 1-line segmented bar is the only indicator. Add "Exercise 3 of 6 · Set 2 of 4" in large type and collapse finished work, so the screen always shows where you are.
- **Uniform density.** Today, Train and the player all use the same 16 pt card rhythm. The player should be deliberately bigger and sparser than the rest of the app: fewer things, each twice the size.
- **Staggered fade-ins on every list** (`ExerciseCard.tsx:81`, Today cards) cost time on every open and read as a UI-kit default. Sheet 11 asks for shared-element transitions card → detail; keep motion for state changes (tick, rest start, PR), not for list entry.

Direction, without copying anyone: black and white, one loud green, huge tabular numerals, controls sized for a fist, and motion reserved for moments of achievement.

---

## Top 15, ranked by what the user feels

| # | Finding | Sev | Effort |
|---|---|---|---|
| 1 | B1 — keep the screen awake during a workout | P0 | 1 line + setting |
| 2 | B2 — replace text inputs with big steppers / set editor, long-press repeat | P0 | Medium |
| 3 | B4 — glanceable rest bar (56–72 pt) with inline −15 / +15 / Skip | P0 | Medium |
| 4 | B5 — strong vibration + sound at rest end; fix the cancel race; exact alarm | P0 | Small–medium (sound needs owner approval for a library) |
| 5 | A1 — stop re-rendering the whole player 4–5×/s; memoise rows | P0 | Small |
| 6 | A3 — optimistic tick; trim `logSetAction` from ~12 statements to 2 | P0 | Small |
| 7 | A2 — freeze background tabs; kill the 180-query history N+1 | P0 | Small–medium |
| 8 | B3 — 64 dp check and rows; whole row ticks; highlight the active set | P0 | Small |
| 9 | A4 — split the catalogue; denormalise names so player and Today need no JSON | P0 | Medium (migration) |
| 10 | B7 — context-aware bottom button ("Log set"), auto-scroll, thumb-zone controls | P1 | Medium |
| 11 | B8 — undo for delete set / remove exercise / un-tick; hold-to-discard | P1 | Small |
| 12 | B6 — +15 / Skip / Done on the notification and Live Activity | P1 | Medium (native build) |
| 13 | A5 + A6 — indexes and transactions (speed that holds as history grows, atomic start/finish) | P1 | Small (one migration) |
| 14 | A7 — embed fonts natively, skip the migration check when up to date | P1 | Small (native build) |
| 15 | B14 + B10 — display type scale, bolder accent moments, real exercise media, high-contrast player | P1 | Medium–large |

Items 1, 5, 6, 7, 8, 11 and 13 are JS-only and can ship together as one OTA. Items 12 and 14 need a native build; batch them into a single build.

Not verified: all timings (static estimates), the rest-end notification race in B5, and whether the Expo SDK 58 default Metro config already enables `inlineRequires` (A8).
