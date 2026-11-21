# QA: CI and device testing

Three GitHub Actions workflows. None of them uses EAS, so they never spend Expo build credits, and none needs a secret.

| Workflow | File | Trigger | Runner | Typical time |
|---|---|---|---|---|
| CI | `.github/workflows/ci.yml` | every push and pull request | ubuntu-latest | 5–10 min (30 min cap) |
| E2E Android | `.github/workflows/e2e-android.yml` | manual (`workflow_dispatch`) | ubuntu-latest + API 34 x86_64 emulator | 50–85 min cold, 35–60 min warm (100 min cap) |
| E2E iOS | `.github/workflows/e2e-ios.yml` | manual (`workflow_dispatch`) | macos-latest + iPhone 16-class simulator | 60–100 min (120 min cap) |

## CI (automatic)

`npm ci`, then `npm run test:all`: lint, typecheck and Jest for the app, then `check` in `@repwise/engine`, `@repwise/content` and `@repwise/server`. The npm cache is keyed on `package-lock.json`. A newer push to the same branch or PR cancels the older run.

## Running the device tests

1. GitHub → **Actions** → **E2E Android** or **E2E iOS** → **Run workflow**.
2. Pick the branch, then fill in the inputs:
   - **flows**: `all` (default), or comma-separated parts of paths under `e2e/`. Examples: `today`, `meals/03`, `workout,progress/01_log_weight`.
   - **maestro_version**: leave it empty for the latest version, or pin one (for example `1.41.0`).
   - **simulator** (iOS only): leave it empty for an iPhone 16, or name one (for example `iPhone 16 Pro`).
3. Read the results in the run's **Summary** tab: a table with one row per flow (PASS / FAIL / SKIP, time, notes).

From a terminal: `gh workflow run e2e-android.yml -f flows=today` (or `e2e-ios.yml`), then `gh run watch`.

**Cost.** Linux minutes are free on public repos. macOS minutes are counted at 10× on private repos, which is why `docs/ORCHESTRATION.md` phase 5 makes the repo public for the device QA run. Run iOS only when it's needed.

## What each device job does

**Android**
1. `npx expo prebuild -p android --no-install --clean`. `android/` exists only inside CI and is never committed.
2. `./gradlew assembleRelease -PreactNativeArchitectures=x86_64`. The Expo template signs release builds with the debug key, and the JS is bundled into the APK, so no Metro is needed.
3. Enables KVM and boots an API 34 `google_apis` x86_64 emulator with `reactivecircus/android-emulator-runner@v2`. The AVD snapshot is cached.
4. Installs Maestro and runs `scripts/ci/maestro-run.sh android`.

**iOS**
1. Selects the latest stable Xcode, runs `npx expo prebuild -p ios --no-install --clean`, then `pod install`.
2. `xcodebuild … -configuration Release -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO`, built for the chosen simulator's architecture only.
3. Picks or creates the simulator with `scripts/ci/ios-sim.mjs`, which prefers iPhone 16, then 16 Pro, 17 and 17 Pro, on the newest iOS runtime. It boots the simulator and sets the status bar to 9:41.
4. Installs Maestro (plus `applesimutils` for `launchApp: permissions`) and runs `scripts/ci/maestro-run.sh ios`.

## Flow order (`scripts/ci/maestro-run.sh`)

Each flow runs on its own, with one retry on failure, and a screenshot is taken after it.

The order is fixed:
1. The flows that wipe app state come first: `onboarding/02`, then `notifications/notifications-permission-off`, then `onboarding/03`.
2. `onboarding/01_f1_happy_path` runs next and leaves the app onboarded.
3. Everything else runs after that, alphabetically.

If your filter selects flows that need an onboarded app, `onboarding/01` is added as a setup step. Airplane mode is switched off before every Android flow, so a workout flow can't leave it on.

**Android-only steps.** Flows already gate these with `runFlow: when: platform: Android` (airplane mode). `IOS_SKIP` in the script lists flows that can't run on iOS, each with a reason, and they show up as SKIP in the table. It is empty: every flow runs on both platforms (`today/06` closes the player with its own button, not Maestro `back`).

**Permissions.** A bare `launchApp` applies Maestro's default `permissions: { all: allow }`. A flow that needs notifications denied must deny them on every `launchApp` (onboarding/01 does, on its relaunch too); otherwise Android grants POST_NOTIFICATIONS again.

**iOS accessibility labels.** A pressable row with an `accessibilityLabel` is one element on iOS, named by the whole label, so its inner texts are not separate elements. Tap rows by id or by a regex on the start of the label (`"Maestro landmine row.*"`).

**"Open in Repwise?"** On iOS a custom-scheme link asks for confirmation. Flows tap "Open" (optional), but the alert can appear after that lookup gives up and then blocks every later flow. The runner runs `scripts/ci/ios-dismiss-open-alert.yaml` (taps Cancel if the alert is there) after every failed attempt and after every passing flow that opens a link.

**On failure** the runner saves `debug/<flow>.tryN.hierarchy.json` (`maestro hierarchy`: ids, labels, bounds) next to the screenshot.

## Artifacts

Download them from the run page, under **Artifacts** (kept for 14 days):

| Artifact | Contents |
|---|---|
| `e2e-android-results` / `e2e-ios-results` | `screenshots/<area>__<flow>.png` (the last screen of every flow) · `junit.xml` (merged) and `junit/` (one file per flow) · `results.tsv` · `logs/logcat.txt` (Android) or `logs/ios-device.log` and `logs/xcodebuild.log` (iOS) · `logs/<flow>.maestro.log` · `debug/` (Maestro failure screenshots, command traces and `~/.maestro/tests`) |
| `repwise-android-release-apk` | The tested APK, which you can sideload. Kept for 7 days. |
| `repwise-ios-simulator-app` | The tested `Repwise.app`. Drag it onto a simulator. Kept for 7 days. |

## Building without secrets

The workflows set `EAS_PROJECT_ID`, `GOOGLE_IOS_URL_SCHEME` and `EXPO_PUBLIC_API_URL` to empty strings. No other `EXPO_PUBLIC_*` value is set. Here is what that means:

- `app.config.ts` leaves out `updates.url` and `extra.eas`, so expo-updates runs the embedded bundle.
- The Google Sign-In config plugin is skipped. Sign-in isn't part of any P0 flow.
- With no API URL, `src/services/api.ts` returns `kind: 'config'`. Callers treat that as offline, so the planner falls back to rules-only and everything runs from local SQLite.
- `@bacons/apple-targets` warns that `ios.appleTeamId` is missing. That doesn't matter for unsigned simulator builds. It's needed only for device or App Store builds through EAS.

## Validated locally (19 Nov 2026)

- `actionlint` 1.7.7 passes on all three workflows.
- A dry run of `maestro-run.sh` with stub `maestro`, `adb` and `xcrun` checked the order, the filter, the setup step, retries, the iOS skip, the merged JUnit report and the summary table.
- `npx expo config --type public` and `npx expo prebuild --no-install` pass for both `-p android` and `-p ios` with no secrets. The release build type uses `signingConfigs.debug`.
- Gradle `assembleRelease` (x86_64, Android SDK 37 and NDK 27.1 installed in a scratch dir) didn't finish within the 25-minute cap on a 4-core / 15 GB sandbox, so no APK was produced. Here is how far it got:
  - Configuration and dependency resolution passed. Maven Central returned 429 to the sandbox proxy, so a scratch-only Gradle init script used Google's Maven Central mirror. CI isn't affected.
  - The C++ builds for Skia, Reanimated, Worklets and MMKV compiled for x86_64 after a retry. On the first try, parallel CMake jobs were OOM-killed. That is why the workflow adds 10 GB of swap and uses `--max-workers=2`.
  - The run hit the cap while compiling Kotlin and Java modules. There was no compile error.
  - The first real proof of a complete APK is the first **E2E Android** run.

## Known flow issues (for the e2e owners)

- `notifications/notifications-permission-off.yaml` uses `clearState: true` and then taps `open-settings`. After a state wipe the app opens on Welcome, so this flow fails until it onboards first (or drops `clearState` and keeps `permissions: notifications: deny`).
- (fixed) `today/06_start_workout.yaml` uses the player's close button and runs on iOS.
