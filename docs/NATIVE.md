# Native surfaces

What runs outside the React Native screen, how it gets its data, and what each platform allows.
Last updated 20 Nov 2026 (branch `feat/x-native`).

## Data flow

- **Widgets** read one JSON snapshot (`src/widgets/snapshot.ts`, `v: 1`). It is built by `loadSnapshot()` in `src/features/notifications/data.ts` and written by `writeWidgetSnapshot()` (`src/widgets/writer.ts`) after every local change:
  - **Android:** the snapshot goes to MMKV `widget.snapshot.v1`. `requestWidgetUpdate` then re-renders each placed widget at its own size. The headless task (`widgetTaskHandler`) renders from MMKV even when the app is killed.
  - **iOS:** the snapshot goes to App Group `group.com.client.repwise`, key `repwise.widget.snapshot.v1`, through `ExtensionStorage`, followed by `reloadWidget()`. The Swift decoder is `targets/widget/Snapshot.swift`; keep it in sync with the TS type. Its timeline refreshes just after midnight.
- **A snapshot from an earlier day** keeps only the streak. **A missing snapshot** shows the Pro lock on every size, so both platforms fail closed.
- **Colours** come from the design tokens:
  - Android: the `palette()` mirror of `src/theme`;
  - iOS: `expo-target.config.js` generates colour sets from `src/theme/colors.json`, light and dark.

## Widgets

| Widget | Android | iOS | Shows | Taps (deep links) |
|---|---|---|---|---|
| WG-1 Today | 4×2; shrinks to a compact 2×2 below 200 dp width | systemSmall, systemMedium, accessoryRectangular, accessoryInline | Workout title and meta, Start or Resume, next meal with Ate it, kcal ring (outer) and protein ring (inner), + Log | Start/Resume `repwise://train?sessionId=…&start=1` · card `repwise://train?sessionId=…` · Ate it `repwise://eat?mealId=…&tick=1` · ring `repwise://eat` · + Log `repwise://eat?log=1` |
| WG-2 Macros | 2×2; protein only below 150 dp height | systemSmall, accessoryCircular (kcal gauge) | kcal left, kcal/protein ring, P/C/F | `repwise://eat` |
| WG-3 Streak | 1×1 | systemSmall, accessoryCircular | Weeks in a row | `repwise://progress` |

- **Start** shows for a `planned` session, and **Resume** for `active` or `paused`. A finished, skipped or rest day shows no button.
- **Limits:**
  - iOS systemSmall allows one tap target only, so the whole card is the Start link.
  - Widgets cannot write SQLite, so every action is a deep link and the app does the work (≤ 2 taps).
  - Android pills are about 40 dp tall, because widgets have no hit slop.

## Rest timer (W5, RW-23, N-5)

The workout player publishes its state to `src/features/notifications/restTimer.ts`. That file schedules the expo-notifications "Rest over" alert (`rw:rest`, `timer` channel) and calls the native module `modules/repwise-timer`.

### iOS: Live Activity

- **Countdown:** the big countdown uses `Text(timerInterval:)`, and the progress uses `ProgressView(timerInterval:)`. The system draws both, so there are no JS ticks. They appear on the Lock Screen and in the Dynamic Island.
- **When the rest ends:** `staleDate = endsAt`, so the activity shows "Rest over" instead of 0:00.
- **+15 s / Skip:** iOS 17 `LiveActivityIntent`s in `targets/widget/_shared/RestTimerIntents.swift`. `_shared` is compiled into the app and the extension.
  - The intent runs in the app process and calls `RepwiseRestActions.apply`. That updates or ends the activity and moves or removes the pending `rw:rest` request (same identifier, so the request is replaced).
  - It works with the JS runtime asleep.
- **Availability:**
  - The pod floor is iOS 15.1. Every ActivityKit call sits behind `#available(iOS 16.1/16.2)`.
  - ActivityKit and AppIntents are weak-linked. The app target is 16.4 and the extension 17.0.
- **End-of-rest alert:** a time-sensitive local notification (entitlement set in app.config.ts). It fires while the app is suspended.

### Android: ongoing notification

- **Countdown:** the notification uses a count-down chronometer (`setWhen(endsAt)`), drawn by the system. It is silent, on the low-importance `timer-ongoing` channel, and removes itself 60 s after the end.
- **`RestTimerService`:** a foreground service that owns the notification while a rest runs. It holds a partial wake lock (at most 10 min) until `endsAt`. At `endsAt` it delivers the expo `rw:rest` request through expo's own trigger intent (`ExpoRestAlert.fireNow`), so the alert is on time and is never shown twice.
  - **Why the service:** without SCHEDULE_EXACT_ALARM, which Android 14+ denies by default, expo's alarm is inexact and can fire about 75% of the rest late.
  - **Android 14+:** the service type is `shortService`. It needs no extra permission and, as far as we know, no Play Console foreground-service declaration; recheck that at release. The system gives it about 3 minutes. On `onTimeout` the service detaches (the countdown stays) and stops, and expo's alarm covers longer rests.
  - **Starting:** the service is started with `startService()` only when the app may start services. If that is refused (`ForegroundServiceStartNotAllowedException` or a type error), the app falls back to a plain notification.
- **Notification permission (Android 13+):** if POST_NOTIFICATIONS is not granted, `showOngoing` returns false and nothing is started.
- **+15 s / Skip:** notification actions handled by `RestTimerActionReceiver` (explicit, not exported). It updates the stored state and the service or notification, moves or removes the expo alarm, and queues the tap.
- **Manifest (module):** `FOREGROUND_SERVICE`, `WAKE_LOCK`, the service and the receiver.

### Buttons and the workout player (additive JS API)

- **Event `onRestAction`:** `{ id, action: 'add15' | 'skip', at, endsAt?, remainingMs?, sessionId? }`.
- **`consumeRestActions()`:** returns the taps queued while JS was not listening, oldest first, and clears the queue.
- **When the buttons appear:** only after JS first listens for `onRestAction`. A button must never move the lock screen without the player knowing; otherwise the player would end the rest at the old time and cancel the alert.
- **Player job (done, r2-bug: `src/features/workout/restNotifier.ts` `installRestNotifier` / `applyRestAction`):**
  1. Subscribe to `onRestAction`.
  2. On start or resume, also drain `consumeRestActions()`.
  3. Apply +15 s or skip to its rest state.
  4. Republish the state as usual.

## Follow-ups for other owners

1. Done (r2-bug): `loadSnapshot` carries `nextMeal.id`.
2. Done (r2-bug): Eat handles `/eat?mealId=…&tick=1` (`tickMealFromLink`).
3. Done (r2-bug): the player listens to `onRestAction` and drains `consumeRestActions()`.
4. Set `ios.appleTeamId` for signing the extension. Device-test the widgets, the Live Activity buttons (iOS 17+), and the Android countdown with the screen off on Android 14+.
