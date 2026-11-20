# Repwise audit, round 2: speed and gym-floor UX

Scope: `/home/user/repwise` on `main` at `19bbcd0`, after the fix wave (w-perf `9ca01e4`, workout player `025933b`, x-native, w-onb, w-today). Read-only: I changed no code. Paths are relative to the repo root.
Method: static reading only, plus reading the installed `node_modules` sources (expo-sqlite, drizzle, `@expo/metro-config`, expo-notifications) where a finding depends on library behaviour. Every millisecond figure is an **estimate** for a mid-range Android phone (Hermes, Pixel 6a class). Items marked **verify** need one release-build trace or one device check before you trust them.

Severity: P0 = breaks a non-negotiable (< 100 ms core action, screen on in the gym, never lose data) in normal use. P1 = clearly felt. P2 = polish or scale risk.

---

## 1. Round-1 findings: status

| # | Round-1 finding | Status | What is left |
|---|---|---|---|
| A1 | Whole player re-renders 4–5×/s while resting | **Partial** | Fixed: the countdown lives only in leaf components at 1 Hz (`useRestCountdown`), `WorkoutClock` is its own leaf, and `SetRow`, `SetRowFor` and `ExerciseCard` are memoised with stable handlers. Still open: `ExerciseScreen.tsx:47` mounts a second `usePlayer`, so while S14 is open both screens re-query and re-render on every write, because `useWorkout` has no `active` gate. `RestTimerSheet` ticks even when it is closed (N9). |
| A2 | Every set tick re-runs the queries of every mounted tab | **Partial** | Fixed: the 180-query history N+1 is now one aggregate (`workout/repo.ts:152`), `sessionsBetween` is an indexed range, `TODAY_TABLES` no longer contains `sets`, and Today and Train skip refreshes while blurred. Still open: no `freezeOnBlur`, and Progress, Library and Eat use drizzle `useLiveQuery`, which has no focus gate and no coalescing (N4). |
| A3 | The tick is not optimistic | **Fixed** | `optimistic.ts` and `tickSet` paint in the same frame. The write is batched on the next macrotask, PR bests are cached per workout, and `repo.update` is a single `UPDATE … RETURNING`. Residual cost: about 3 full player renders per tick (N18), plus a PR race (N15). |
| A4 | The 1 MB catalogue blocks JS after first paint | **Partial, defeated in practice** | `catalog.ts` now has lazy parts, a sliced warm-up and lazy indexes. But a value import of `@repwise/content` from the startup import chain evaluates all three JSON files and zod before the first frame (N1). Also: the player still shows a skeleton until the exercises part loads in an idle slice (`WorkoutPlayerScreen.tsx:207`, `catalog.ts:209-215,280-289`). Today still waits for the recipes part, the largest one, before it shows meal names (`today/hooks/useToday.ts:59`). The denormalisation was not done. |
| A5 | Missing indexes | **Fixed** | `0002_perf_indexes.sql` adds every index asked for. A new gap: there is no index on `sets(done_at)`, used by the Progress and Library live queries (N4). |
| A6 | Multi-row writes not in a transaction | **Fixed** | `withTransaction` covers start, finish, discard, swap, reorder, create, undo and meal writes, and listeners hear once per table. The coalescing promise does not hold on a device, though (N3). `insertPrefilled` still inserts one row at a time inside the transaction; use `insertMany` (`workout/repo.ts:255-270`, P2). |
| A7 | Fonts gate the first render; migrations on every launch | **Partial** | Fixed: `isSchemaCurrent()` renders the first screen in one pass. Android fonts are set up for embedding in `app.config.ts`, which needs the next native build. iOS still loads fonts at runtime behind the splash (wave note). |
| A8 | Root layout pulls in Skia and sheets; bootstrap is eager | **Partial** | `ToastHost` is now a direct import, and billing, sync and warm-up are deferred `require`s. Still open: Expo 58 Metro runs with `inlineRequires: false` and `experimentalImportSupport: true` (`node_modules/@expo/metro-config/build/ExpoMetroConfig.js:462`), so every static import is evaluated eagerly. `bootstrap.ts:12` statically imports the planner bridge, which loads the engine and all the content (N1). |
| A9 | Rest ring and bar driven from JS state | **Partial** | The pill bar is one UI-thread `withTiming`, but it animates `width`, a layout prop (N8). The hero ring still restarts a `withSpring` every second (`ui/ProgressRing.tsx:45-47`, through `BigTimer`). |
| A10 | Notification and widget rebuild, plus sync push, after every set | **Partial** | Fixed: `IGNORED_WRITE_TABLES` stops the notification and widget rebuild on set writes (`services/notifications.ts:66`). Still open: sync still pushes 2 s after every set (`sync/scheduler.ts:15`). Each push then flips `dirty` row by row, which fires change events back into the player (N3). |
| A11 | Lists | **Partial** | Fixed: the per-card layout animation is gone. Still open: FlashList is still unused anywhere. Library is a tuned `FlatList` (`LibraryScreen.tsx:175`). Train History still renders up to 60 cards with `.map` (`TrainScreen.tsx:230`). |
| A12 | Images | **Partial** | Fixed: `transition={0}`. Still open: no blurhash, and no prefetch of the session's media when a workout starts. In a gym with poor signal, S14 shows the body-map placeholder. |
| A13 | Small re-render items | **Fixed** | Selectors in `app/index.tsx`, a memoised `handlers`, and `useDbSnapshot` deps keyed with a join. No zustand selector returns a fresh object. |
| B1 | Screen sleeps during a workout | **Regressed** | Keep-awake was added, but both player screens share one tag, so leaving or switching S14 turns it off (N2). The `keepAwake` setting is ignored (N6). |
| B2 | Text inputs instead of steppers | **Fixed** | `SetEditorSheet`: 64 dp `Stepper`s with accelerating hold-to-repeat, plate-step chips, "Same as last time", and a 64 dp Log button. |
| B3 | 48 dp targets in the set row | **Fixed** | The tick is a 56 dp box with a 64 dp hit area (`ui/Tick.tsx`, `tickMetrics`), rows are 64 dp, and value cells are 56 dp buttons. The active row is highlighted. Nit: the set-type button is 48 dp wide (`SetRow.tsx:216`). |
| B4 | Rest timer not glanceable | **Partial** | There is a full-width inverse `RestBar` with 56 dp +15 and Skip. But its countdown uses the `display` style (40 pt, `RestTimer.tsx:118`), the same size as the elapsed workout clock (`WorkoutPlayerScreen.tsx:63`). The "Next" line is 14 pt, and −15 is only in the sheet. Asked for: 56–72 pt and an inline −15 (N23). |
| B5 | Weak rest-end cue; notification cancel race | **Mostly fixed** | The store owns the end and fires it once, `haptics.restEnd()` uses a triple waveform, and `presentRestOver` fixes the cancel race. Android delivers on time through a foreground service. New problems: the alert fires twice in the foreground (N5), sound and vibration settings are ignored (N6), and there are no 3-2-1 ticks. |
| B6 | No lock-screen controls | **Open (wiring)** | Native +15 and Skip exist on both platforms (`RestTimerActionReceiver.kt`, `RestTimerIntents.swift`), but JS never subscribes to `onRestAction`, so the buttons are never shown (N7). There is no "Done set" action. |
| B7 | Primary actions in the wrong place | **Partial** | Fixed: the context-aware "Log set N · 80 kg × 8" footer, collapsed finished exercises, and Finish moved to the header. Still open: no auto-scroll to the next set, and no swipe between exercises on S14. Prev/next are 48 dp chevrons right next to the 64 dp Log button (`ExerciseScreen.tsx:136-150`). |
| B8 | No undo on destructive actions | **Fixed** | Undo for delete set, remove exercise, un-tick and discard; "Tick all and finish". |
| B9 | Toasts cover the footer | **Fixed** | Screens register their footer height and the toast sits above it (`ui/Toast.tsx:210`). |
| B10 | Contrast in bright light | **Partial** | "Previous" is now a ghost value inside the cell. The done row is still an `accentSoft` sweep, and there is no high-contrast or dark player mode. |
| B11 | S14 has no demo | **Partial** | `ExerciseHero` is used, but it does not collapse, so on a 6" phone the set rows sit below the hero and cues, with no media prefetch. |
| B12 | Bench mode | **Open** | P2, unchanged. |
| B13 | Haptic mapping and press-in buzz | **Fixed** | Haptics fire on commit (`PressableScale`); the tick uses `success`. |
| B14 | Generic visual identity | **Partial** | There is a hero type token (72 pt) and a bigger player, but the rest bar does not use the hero size (see B4). |

Summary: of 27 findings, 8 are fixed, 15 partial, 1 mostly fixed, 2 open and 1 regressed.

---

## 2. New findings and regressions

### N1. The whole content package (1 MB JSON + zod) is evaluated before the first frame — P0 (verify)
- **Where:**
  - `src/services/bootstrap.ts:12` statically imports `@/features/planner/bridge`, which imports `planService.ts`. `src/features/planner/planService.ts:32` then does `import { toEngineCatalogues } from '@repwise/content'`.
  - That entry is `packages/content/src/index.ts:6-10` (`export * from './schemas' | './data' | './toEngine' …`), and `data.ts:2-4` statically imports `exercises.json`, `recipes.json` and `foods.json`. `toEngine.ts:35` imports `./data` as well.
  - The same barrel is value-imported by `src/features/library/logic/media.ts:29`, which `ExerciseHero` in the player uses, and by `src/features/workout/logic/swap.ts:13`, which `usePlayer` uses.
- **Problem:**
  - Expo 58's Metro config uses `experimentalImportSupport: true, inlineRequires: false`, and there is no `metro.config.js` (D-perf decision), so imports are evaluated eagerly.
  - `app/_layout.tsx` imports `bootstrap`, so the three JSON modules and every zod schema are built while the root layout module loads, on every cold start, before `DatabaseProvider` renders.
  - This undoes A4 and A8. The lazy parts in `catalog.ts` only ever find those JSON modules already evaluated.
  - The comment at `catalog.ts:15` ("zod never reaches the app bundle") is no longer true.
- **Fix:**
  1. Stop value-importing the barrel:
     - add an `exports` map to `packages/content/package.json` with data-free subpaths (`./toEngine`, `./media`);
     - make `toEngineCatalogues` take its `src` argument with no default that touches `./data`;
     - move `PATTERNS` and the other enums into a zod-free `enums.ts`.
  2. In `bootstrap.ts`, `require('@/features/planner/bridge')` inside `startBackgroundServices`. In `useToday.ts`, keep the bridge import but make sure the bridge has no content import at module scope.
  3. Add an ESLint `no-restricted-imports` rule: `@repwise/content` allows `import type` only.
  4. Add a Jest guard that loads `app/_layout` in `jest.isolateModules` and asserts that `packages/content/src/data.ts` is not in the require cache.
- **Impact:** estimated 80–250 ms off every cold start (about 1 MB of object literals plus schema construction on Hermes). **Verify** with the existing `startupTrace` marks (`layout` against bundle start), before and after.

### N2. Keep-awake is switched off when you leave or switch the exercise screen — P0 (regression of B1)
- **Where:** `src/features/workout/hooks/useWorkoutKeepAwake.ts:4,13,16` (one fixed tag, `'workout'`), used by `WorkoutPlayerScreen.tsx:176` and `ExerciseScreen.tsx:52`. Prev/next on S14 use `router.replace` (`ExerciseScreen.tsx:91`).
- **Problem:**
  - expo-keep-awake keys activations by tag. When S14 unmounts (back to the list, or a prev/next `replace` that unmounts the old S14 after the new one mounted), its cleanup calls `deactivateKeepAwake('workout')`.
  - That drops the activation the list screen underneath still needs.
  - Result: after the first visit to an exercise screen, the phone sleeps between sets for the rest of the workout. That is exactly the B1 problem, and now only on the path most users take.
- **Fix:** give each hook instance a unique tag (`` `workout-${useId()}` ``), or reference-count activations in a module-level counter and deactivate only at zero. Also gate it on `useAppPrefs(s => s.keepAwake)` (N6). Add a test that mounts both screens, unmounts S14, and asserts no `deactivate` call for the still-mounted one.
- **Impact:** restores the single biggest gym-floor fix of round 1. One small JS change, can ship OTA.

### N3. Write coalescing does not work on a device: one change event per row, each in its own JS task — P1 (verify)
- **Where:**
  - `src/features/workout/hooks/useLiveValue.ts:57` (`Promise.resolve().then`) and `src/features/today/hooks/useDbSnapshot.ts:52` (`queueMicrotask`).
  - The event source is `node_modules/expo-sqlite/android/src/main/java/expo/modules/sqlite/SQLiteModule.kt:219`: the update hook fires once per changed row, and each event is posted through a single-thread executor. iOS is the same (`ios/SQLiteModule.swift:311`).
  - The Jest mock emits once per statement, synchronously (`test/mocks/expoSqlite.ts:58-67`), so the tests cannot see this.
- **Problem:**
  - Every row changed in a transaction becomes its own async event, so its own JS task, and microtasks drain between tasks. The "queued" flag therefore almost never merges anything.
  - Examples of one write turning into N refreshes:
    - "Start workout" inserts about 24 sets, which means about 24 full `useWorkout` recomputes and renders.
    - "Tick all and finish" and finish soft-delete N rows, which means N refreshes.
    - Every sync settle flips `dirty` per row, which means N refreshes on each screen watching those tables.
    - On Today, `markMealEaten` writes two tables, which means 2–3 full Today reloads.
  - The "listeners hear once per table" guarantee of `withTransaction` holds only for `onLocalWrite` (sync and notifications), not for the screens.
- **Fix:** coalesce across tasks, not microtasks. Use one `setTimeout(refresh, 0)` per hook (or `requestAnimationFrame`, so it is at most once per frame), cleared on unmount. Put it in one shared `subscribeTables(tables, cb)` helper that both hooks use, and that a drizzle replacement can use too (N4). Change the Jest mock to emit one event per affected row, asynchronously, so a test can assert "24 inserts → 1 refresh".
- **Impact:** "Start workout" stalls go from an estimated 50–150 ms to under 10 ms. No per-row refresh storms after sync.

### N4. Progress, Library and Eat run uncoalesced, full-table live queries on every set write, even in the background — P0 (with history)
- **Where:**
  - Progress: `src/features/progress/repo.ts:97` (`useLiveRows` → drizzle `useLiveQuery`). Through `useTraining()` and `useNutrition()` (`progress/hooks/useProgress.ts:51-58,85-95`), `ProgressScreen.tsx:65-68` subscribes to the whole `sessions`, `session_exercises`, `sets` (all done sets, ordered by `done_at`, no index), `food_logs`, `meal_plans`, `meals`, `exercises`, `body_metrics` and `photos` tables.
  - Library: `library/repo.ts:130` (`useRecentlyLogged`, a `GROUP BY` over all done sets), used by `library/hooks/useLibrary.ts:59`.
  - Generic `repo.useLive` (`db/repo.ts:178`) for meals, plans and profile.
  - drizzle's `useLiveQuery` (`node_modules/drizzle-orm/expo-sqlite/query.js`) re-runs the query on **every** change event for its table, with no focus check and no coalescing.
- **Problem:**
  - Tabs stay mounted, and nothing sets `freezeOnBlur`. Once the user has opened Progress in this app session, every set tick re-reads **all** done sets (about 10k rows after a year) and re-runs `flattenSets` plus the Progress derivations. The settle 2 s later does it again. Estimate: 30–120 ms of JS per tick for a heavy user, during the rest.
  - A sync pull that restores history (sign-in on a new phone) upserts row by row (`sync/syncEngine.ts:212-236`). That gives N events, each re-reading the growing table: O(n²). With Progress mounted, this can freeze the app for seconds or minutes.
- **Fix:**
  1. Replace `useLiveRows` and the library live hooks with `useLiveValue`, which then coalesces across tasks (N3) and accepts `{ active: useIsFocused() }`.
  2. Precompute what Progress shows with aggregate SQL (per-day volume, per-exercise best) instead of loading every set.
  3. Add a partial index on done sets, `sets(done_at) WHERE deleted_at IS NULL AND done_at IS NOT NULL`.
  4. Set `freezeOnBlur: true` on the tab and stack screen options as a backstop.
  5. During a pull, suspend live refreshes (a module flag the coalescer checks) and refresh once at the end.
- **Impact:** removes the largest history-dependent cost on the tick path, and the restore freeze.

### N5. "Rest over" fires twice in the foreground — P1 (verify)
- **Where:**
  - `src/features/workout/restNotifier.ts:41-54` (`presentRestOver`: an immediate notification with `sound: 'default'`).
  - `modules/repwise-timer/android/.../RestTimerService.kt:81` (`ExpoRestAlert.fireNow` at `endsAt`; the service also runs while the app is in the foreground, because `show()` starts it for any running rest).
  - iOS: the scheduled `rw:rest` request with its DATE trigger.
  - Foreground handler: `src/services/notifications.ts:375-381` (banner and sound for everything).
- **Problem:**
  - At `endsAt`, the service (Android) or the scheduled request (iOS) presents "Rest over" with sound.
  - About 16 ms later, the JS store's own end timer runs `end('done')`. That clears the surfaces (too late to cancel) and then presents a second "Rest over" with the same id but a new alert.
  - So the user gets two banners, two sounds and two vibration patterns, on top of `haptics.restEnd()`.
- **Fix:** keep one source of the foreground cue.
  - Option A: in `setNotificationHandler`, return no banner and no sound for `data.kind === 'rest'` while `AppState` is active, and let the in-app cue (haptic + `presentRestOver`) be the only one.
  - Option B: stop the service's `fireNow` when the app is in the foreground (a flag JS sets on AppState change), and skip `presentRestOver` when the scheduled request already fired (check `getPresentedNotificationsAsync` for `rw:rest`).
- **Impact:** one clean, strong cue per rest. Two sounds read as a bug.

### N6. Player settings are not honoured: keep screen on, rest sound, rest vibration — P1
- **Where:** `src/features/settings/prefs.ts:13-23` (`keepAwake`, `restSound` and `restVibration`, all default on; the Settings screen shows the toggles). DECISIONS (w-onb, 20 Nov) says "The workout player should read `keepAwake` and `restVibration`". Neither is read anywhere outside settings. `restSound` is read only by the scheduled alert (`notifications/restTimer.ts:56`), not by `presentRestOver` (`restNotifier.ts:49`). On Android the alert channel `timer` always has sound, because sound is fixed per channel (`services/notifications.ts:74`).
- **Problem:** three visible toggles do nothing, or only half of what they say. Switching off rest sound still plays it in the foreground on both platforms, and always on Android. In a quiet gym, this is a reason to uninstall.
- **Fix:**
  - Gate `useWorkoutKeepAwake` on `keepAwake`.
  - Gate `haptics.restEnd()` in `restTimerStore.end` on `restVibration`.
  - In `presentRestOver`, set `sound: getAppPrefs().restSound ? 'default' : false`.
  - On Android, add a second channel `timer-silent` (no sound, keep the vibration according to the setting) and pick the channel from the setting when scheduling.
  - Add a test per setting.
- **Impact:** settings that work. Cheap, and can ship OTA.

### N7. Lock-screen and Live Activity +15 / Skip buttons are never shown — P1
- **Where:**
  - Android: `modules/repwise-timer/android/.../RepwiseTimerModule.kt:65-68` enables actions only in `OnStartObserving`. `RestTimerNotifier.kt:93-96` adds them only when enabled.
  - iOS: `RepwiseTimerModule.swift:138-142,157` (`actionsEnabled`).
  - No JS code calls `addListener('onRestAction')` or `consumeRestActions()`; a search over `src` finds nothing.
- **Problem:** the native half of B6 is built and tested, but it is switched off. Even if the buttons were shown, a native Skip would not reach the JS store, so the next JS publish would bring the countdown back.
- **Fix:**
  - In `installRestNotifier`, subscribe to the module's `onRestAction` and apply each action to `restTimer`: `add15` → `restTimer.add(15)` (or set `endsAt` from the event), `skip` → `restTimer.skip()`.
  - Call `consumeRestActions()` on launch and on AppState `active`.
  - Add a "Done set" action, which needs a native build, using the same queue plus `tickSet` on drain.
  - Check that the binary on Play already contains this module version. If so, everything except "Done set" can ship OTA.
- **Impact:** a whole workout can be run without unlocking (round-1 B6).

### N8. Rest drain bar and set-done sweep animate `width`, a layout prop — P1
- **Where:** `src/features/workout/components/RestTimer.tsx:56` (`DrainBar`: `width: '…%'` for the whole rest); `SetRow.tsx:134` (sweep).
- **Problem:** under Fabric, Reanimated cannot apply layout props directly. Each frame needs a shadow-tree commit, a Yoga layout pass and a mount, and those compete with React commits from JS. The drain bar does this at 60 or 120 fps for the whole rest, which is also when the user opens the editor and when the 1 Hz countdown renders.
- **Fix:** a full-width child with `transform: [{ scaleX: fill.value }]` and `transformOrigin: 'left'`; the same for the sweep. Both stay exactly as they look now.
- **Impact:** zero layout work per frame during rest; less UI-thread load and battery use with keep-awake on.

### N9. The closed rest sheet ticks every second — P2
- **Where:** `RestTimer.tsx:170-172`: `RestTimerSheet` calls `useRestCountdown()` before it checks `open`, and it is always mounted through `usePlayer().sheets`. With S14 open there are two player instances, so 2 rest bars and 2 sheets tick.
- **Fix:** move the hook into an inner `<RestSheetBody/>` that renders only while `open`.
- **Impact:** 2–3 fewer component renders per second during rest; with gorhom, each costs more than it looks.

### N10. Finish computes the summary twice, with full history — P2
- **Where:** `src/features/workout/actions.ts:324-361` (`finishWorkoutAction`: `buildSummary` with `exerciseHistory` per exercise, synchronous in the Finish tap, used only for one analytics event); `hooks/useSummary.ts:10-32` (the same work again on Summary mount and on every `sessions` or `sets` write, including the sync settle).
- **Fix:** move the analytics summary to `setTimeout(…, 0)` after navigation, or fire the event from Summary. Reuse `bestCache` for history.
- **Also:** `logSetAction`, `undoSetAction` and `nextUp` (`actions.ts:102-125,277-321`) have no caller outside tests. Delete them; `logSetAction` loads full history on every call.
- **Impact:** Finish moves to Summary about 20–60 ms sooner, more with long history.

### N11. "Previous" loads an exercise's whole history, again on every S14 swap — P2
- **Where:** `workout/repo.ts:209-234` (`historyRows`: every done set ever for the exercise, sorted, then `previousSets` keeps only the newest session). `hooks/useWorkout.ts:34-37`: `prevCache` belongs to one hook instance, and S14 prev/next do `router.replace` (`ExerciseScreen.tsx:91`), so each move remounts `usePlayer` and re-reads the history of every exercise. `startWorkout` does the same per exercise inside its transaction (`repo.ts:283`).
- **Fix:** select the latest done `session_id` for the exercise first (`ORDER BY ended_at DESC LIMIT 1`, using `sessions_status_ended_idx`), then that session's sets only. Make `prevCache` a module map keyed by `sessionId`. Switch S14 to an in-screen pager (horizontal swipe, B7) instead of `replace`; that also keeps `ExerciseHero` mounted.
- **Impact:** stays flat as history grows; S14 moves are a frame instead of an estimated 10–30 ms.

### N12. Exercise notes can be lost — P2
- **Where:** `ExerciseScreen.tsx:221-229`: notes save only in `onEndEditing`. Going back, or prev/next, while the keyboard is open unmounts the field; Android does not reliably fire `onEndEditing` then.
- **Fix:** save on unmount (a ref holding the draft, like `SetEditorSheet` does) plus a 600 ms debounced save on change.
- **Impact:** CLAUDE.md "never lose user data".

### N13. Unit flash on first render for lb users — P2
- **Where:** `hooks/useUnits.ts` → `settings/repo.ts:22` (`useProfile` is a drizzle `useLiveQuery`, which returns `[]` on the first render).
- **Problem:** the player, rest bar and editor paint in `kg` for one frame, then switch to `lb`. Every screen that uses `useProfile` renders twice on mount.
- **Fix:** read the profile synchronously in the first render (`useLiveValue(() => getProfile(), ['profile'], [])`).
- **Impact:** a correct first frame; one render fewer per screen mount.

### N14. No rest starts when sets are ticked out of order — P2
- **Where:** `logic/player.ts:50-77` (`nextAfter` only looks forward from the ticked set).
- **Problem:** if you tick the last set while an earlier one is still open (a common superset or skip pattern), `next` is null and no rest starts.
- **Fix:** if nothing is found after the set, wrap around to the first open set; start the rest whenever any set remains open.

### N15. A PR can be detected twice on rapid ticks — P2
- **Where:** `actions.ts:233-238`: `sameExercise` comes from the render's `items`. A set that was ticked optimistically but not yet re-queried is missing, so two quick heavy sets can both count as a PR (double celebration).
- **Fix:** inside the flush job, compare against fresh rows (`setsFor(seId)`, one indexed query), or fold `optimisticSets` entries into `sameExercise`.

### N16. The native alert relies on expo-notifications internals — P2 (build risk)
- **Where:** `modules/repwise-timer/android/.../ExpoRestAlert.kt` uses `SharedPreferencesNotificationsStore`, `NotificationsService.createNotificationTrigger`, `.schedule` and `.removeScheduledNotification`, and the `DateTrigger(channelId, timestamp, alarmClock)` constructor. I checked the installed `expo-notifications` 58.x: all of them exist and are public, so it compiles today.
- **Risk:** any bump of expo-notifications can break the native build, which is expensive with limited EAS builds.
- **Fix:** pin `expo-notifications` to an exact version. Add a CI job that prebuilds into a temp directory (never into the repo) and compiles `:repwise-timer` only.
- **iOS nit:** `RepwiseRestActions.enqueue/drain` (`RepwiseTimerModule.swift:93-108`) read-modify-write `UserDefaults` from the intent and the module with no lock, so a tap can be lost; it cannot crash. A serial `DispatchQueue` fixes it.
- **No other crash risks found:**
  - the service catches start-not-allowed and handles `onTimeout` on Android 14 and 15;
  - widget `ClosedRange`s are guarded with `max` and `min`;
  - the Kotlin payload fields match the JS payload, and `remainingMs` is never null;
  - `VIBRATE` comes from expo-haptics.

### N17. Long rests on Android 14+ with the screen off — P2
- **Where:** `RestTimerService.kt`. The `shortService` type allows about 3 minutes. Past that, the alert falls back to expo's inexact alarm, which can be a minute or more late. Heavy compound lifts often rest 3–5 minutes.
- **Fix:** offer a Settings row "Exact rest alerts" that opens the system screen for the exact-alarm permission (`SCHEDULE_EXACT_ALARM`). When it is granted, schedule with `alarmClock: true`. This needs a native build; batch it with N7's "Done set".

### N18. About three full player renders per tick, and each card subscribes to every pending tick — P2
- **Where:** `WorkoutPlayerScreen.tsx:177` and `ExerciseCard.tsx:70` (`useOptimisticVersion()` in every card); `usePlayer.tsx:161-167` (pending ticks cleared in an effect after the re-query).
- **Problem:** each tick renders the screen and **every** card three times: the optimistic set, the DB re-query, and the optimistic clear. Rows hold thanks to memo, but cards, footer, header and about 8 sheet hosts do not.
- **Fix:**
  - Give each card a derived snapshot, `useSyncExternalStore(subscribe, () => doneCountFor(item))`, so it re-renders only when its own count changes.
  - Clear matching optimistic entries inside the `useWorkout` compute (same batch as the new rows) instead of in an effect.
  - Drop the screen-level `useOptimisticVersion` by computing `activeSetId` and `pendingSets` in a small subscriber.
- **Impact:** estimated 3–8 ms less JS per tick on a 6-exercise workout.

### N19. The player shows a skeleton on a cold open — P2 (A4 residual)
- **Where:** `WorkoutPlayerScreen.tsx:207` and `ExerciseScreen.tsx:64` wait for `useCatalogFor('exercises')`, which loads the part only in a `requestIdleCallback` slice (`catalog.ts:209-215`, timeout 2 s). Startup is busy, so a notification or deep link into the workout can show the skeleton for hundreds of ms.
- **Fix:** the player cannot render without names, so load the exercises part synchronously on mount (`lazyCatalog().exerciseById`, an estimated 10–30 ms once N1 is fixed). Better, store `name` and `cardio` on `session_exercises` when a session is planned or swapped (the original A4.2).

### N20. The sync push during a workout echoes back into the player — P2 (A10 residual)
- **Where:** `sync/scheduler.ts:15` (`PUSH_DEBOUNCE_MS = 2000`).
- **Problem:** each logged set is pushed 2 s later, mid-rest. The settle `UPDATE dirty` then fires change events into the player, Today and Progress (N3, N4).
- **Fix:** while a session is `active`, raise the debounce to about 30 s. Flush on finish, on background and on discard.

### N21. Gym-floor glanceability gaps that remain — P1 (B4/B7 residual)
- **Rest number:**
  - `RestTimer.tsx:117-125`: the countdown should use the `hero` style (72 pt, or at least 56 pt with `fitFontSize`), not `display` (40 pt).
  - While resting, shrink the `WorkoutClock` (`WorkoutPlayerScreen.tsx:52-71`) to `headline` so the rest is clearly the main number.
  - Make the "Next" line `headline` instead of `callout`.
- **Rest controls:** add −15 next to +15 in `RestBar` (`RestTimer.tsx:130-162`); add 3-2-1 light haptics in the last 3 s (gated by `restVibration`).
- **S14 footer:** replace the 48 dp prev/next chevrons beside the 64 dp Log button (`ExerciseScreen.tsx:136-150`) with a horizontal swipe, or make them 56 dp with a gap of at least 12 dp. Collapse `ExerciseHero` to a 56 dp thumbnail after the first logged set, so the rows sit in the thumb zone.
- **Auto-scroll:** after each tick, scroll the list to the next open set (not implemented).

---

## 3. Top 10, ranked by what the user feels

| # | Finding | Sev | Effort | Ship |
|---|---|---|---|---|
| 1 | N2: keep-awake shared tag, so the screen sleeps after visiting S14 (plus the `keepAwake` setting) | P0 | Tiny | OTA |
| 2 | N4: Progress, Library and Eat full-table live queries on every set write; O(n²) restore freeze | P0 | Medium | OTA (+ index migration) |
| 3 | N1: `@repwise/content` barrel (1 MB JSON + zod) evaluated before first frame | P0 | Small | OTA |
| 4 | N3: change-event coalescing is per microtask, but events arrive one per row in separate tasks | P1 | Small | OTA |
| 5 | N5: double "Rest over" (sound, banner, buzz) in the foreground | P1 | Small | OTA |
| 6 | N6: sound, vibration and keep-awake settings ignored (Android: silent channel) | P1 | Small | OTA |
| 7 | N21: rest countdown at hero size, inline −15, 3-2-1 ticks, S14 swipe instead of 48 dp chevrons | P1 | Small–medium | OTA |
| 8 | N7: wire `onRestAction` so the lock-screen and Live Activity +15 / Skip appear (Done set later) | P1 | Small (JS) | OTA if the binary has the module; Done set needs a native build |
| 9 | N8: drain bar and done sweep as `scaleX` transforms instead of `width` | P1 | Tiny | OTA |
| 10 | N19 + N20 + A4: player opens without a skeleton (sync names or denormalise); sync push quiet during a workout | P2 | Small–medium | OTA (denormalise = migration) |

Items 1–7 and 9 are JS-only and can ship as one OTA (`mode=ota`). N7's "Done set", N16's CI compile guard target, N17 and the A7 Android font embedding need a native build; batch them into one `mode=release`.

**Verify before or after shipping:**
- N1: startup trace before and after.
- N3: count `useWorkout` refreshes on "Start workout" with a dev counter; expected about 24, should be 1 after the fix.
- N5: a device check in the foreground on both platforms.
- N4: a restore test with about 5k sets while Progress is mounted.
