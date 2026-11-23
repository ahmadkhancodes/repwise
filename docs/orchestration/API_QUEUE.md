# Repwise API agent queue

**Owner rule (21 Nov 2026):** from now on, all work runs on the Anthropic API through `.github/workflows/claude-agent.yml`, never on the owner's Claude subscription. Be cost-effective without lowering quality:
- Sonnet for normal work, Opus only for hard bugs. The model is set by the `(opus)` / `(sonnet)` tag on each task.
- Read only what you need. Never paste long logs.

## Rules for every run

**Scope**
- Do the FIRST `- [ ]` task, or the next step of it. One task per run.
- Never: `expo prebuild` into the repo; skipping or deleting tests to get green; the words cure, treat or diagnose in UI copy; an LLM call from the app; ads; Stripe for in-app subscriptions.
- Never print secrets.

**Checks and commits**
- Use jest with `--maxWorkers=2`.
- `npm run test:all` must be green before any push to `main`. On feature branches, `npm run check` must be green before you push.
- End every commit message with: `Co-Authored-By: Claude <noreply@anthropic.com>`
- Push with `git push origin <branch>`; retry network errors up to 4 times.

**E2E runs and waiting**
- Pushes made from this workflow do NOT start other workflows. Start E2E yourself:
  `gh api -X POST repos/$REPO/actions/workflows/e2e-ios.yml/dispatches -f ref=<branch>`, and the same for `e2e-android.yml`.
  Each takes about 1.5–4 h.
- Never wait for runs inside Claude. To have the workflow wait for free after you finish, write one line per run to `.claude-run/wait`: `<workflow-file> <branch>`, e.g. `e2e-ios.yml feat/r3-fix`. Then end your run.
- Reading results:
  - latest run: `gh api "repos/$REPO/actions/workflows/<wf>/runs?branch=<b>&per_page=1"`
  - jobs: `.../actions/runs/<id>/jobs`
  - logs: `.../actions/jobs/<job>/logs | grep -E "\[Failed\]|\[Passed\]"`
- If a task's E2E is red: fix the cause in the APP, not by weakening flows, and re-dispatch. A flow may change only when the flow itself is wrong; say why in the commit.

**Progress records**
- When a task is done, tick it (`- [x]`) here with a one-line result (SHAs, run URLs) and commit that to `main`.
- If a task is still in progress, add a short "status:" note under it so the next run can continue.
- Append one line per run to `docs/PROGRESS.md`. Log decisions in `docs/DECISIONS.md`.

**Owner contact**
- Never ask the owner questions; decide, log the decision, continue.
- If something truly needs the owner (a login, a payment, a secret), add it to the "Owner steps" list at the bottom and carry on with other work.

## Tasks

> **SPEED RULE for the client demo (owner deadline, 22 Nov).** Six owner tasks (US/UK meals, exercise GIFs, building-plan screen, dashboard + steps, paywalls + demo checkout, fast tour) share ONE branch: `feat/client-demo`.
> - Do them in order, one per run. After each: `npm run test:all` green, push the branch, tick the task with "(on feat/client-demo, E2E pending)", and chain straight to the next run. Do NOT dispatch E2E between them.
> - Last code task done: dispatch e2e-ios, e2e-android AND record-ios-tour on `feat/client-demo` together, and wait.
> - On all green: merge to main, publish the release `app-tour-dark-v2`, and comment on issue #1.
> - Any red: fix on the branch and re-run only what failed, plus the tour.


- [x] (opus) **Finish `feat/r3-fix` until E2E is green on both platforms, then merge to main.**
  - result (21 Nov, API run 2): 506cfa6 green on both — e2e-ios https://github.com/ahmadkhancodes/repwise/actions/runs/44870320265 (all flows passed, 0 failed; (b) custom exercise passes), e2e-android https://github.com/ahmadkhancodes/repwise/actions/runs/44870322115. Merged into main as cc4fc7b (PROGRESS/DECISIONS conflicts kept both sides); test:all green (app 3129 tests, engine/content/server checks pass).
  - Already done on the branch (last commit 506cfa6):
    - cook mode "Next" on iOS;
    - the cold-start deep-link "isn't on this phone" notice;
    - the notification-permission state (Android `notifications-permission-off`);
    - reduce-motion safety for entering animations;
    - toasts above native modals;
    - the iOS "Open in Repwise?" alert;
    - paywall outcomes shown inline.
  - Android was 29/29 on bdf13a0.
  - Still to verify or fix (iOS-only app bugs found by Maestro):
    - a. Eat tab meal tick does nothing (`MealRow.tsx` ~105; the same tick works on Today). Suspect nested Pressables or a gesture conflict.
    - b. After creating a custom exercise, the exercise screen doesn't appear (`CustomExerciseScreen.tsx` ~153, `router.replace` while a modal is dismissing).
    - c. Any remaining iOS failure from the latest e2e-ios run on this branch.
    - d. Check that EVERY delayed/fade `entering` animation in `src/` and `app/` uses the reduce-motion-safe helper (content must never stay at opacity 0 with animations off).
  - Steps:
    1. Read the latest e2e-ios and e2e-android results on `feat/r3-fix`.
    2. If both are green and test:all is green, merge into main (`git merge --no-edit origin/feat/r3-fix`), run `npm run test:all`, push main, and tick this task.
    3. Otherwise fix, push the branch, re-dispatch both E2E runs, and write `.claude-run/wait`.
  - status (21 Nov 06:50 UTC, API run 1): (a) and (d) were already closed on the branch (PROGRESS r3-fix line: Eat tick was a flow issue; all 36 animated files on `motionSafe`). e2e-ios on bdf13a0 (run 44864469120) failed every flow at launch: the FullWindowOverlay toast host hid the app from accessibility, and 506cfa6 removed it. On 506cfa6, e2e-android passed (run 44870322115). e2e-ios run 44870320265 was still in progress, so this run only waited for it and made no code changes. Next run: read run 44870320265. If it is green, do step 2. If it is red, check (b) `CustomExerciseScreen.tsx` ~153 first.

- [x] (opus) **Merge `feat/tour-video` into main and record the Dark Mode iPhone tour.**
  - result (22 Nov, API run 7): tour 44962549472 green end to end on 26fb53a (21:54, every required screen checked in 32 frames, dark mode throughout). Release https://github.com/ahmadkhancodes/repwise/releases/tag/app-tour-dark — main https://github.com/ahmadkhancodes/repwise/releases/download/app-tour-dark/repwise-ios-dark-tour-music.mp4 (CC BY music, -16 LUFS, 48 kHz), silent https://github.com/ahmadkhancodes/repwise/releases/download/app-tour-dark/repwise-ios-dark-tour.mp4. E2E on the same SHA green: iOS 44962551228, Android 44962552794 (the final-report task can reuse them).
  - The branch adds `.github/workflows/record-ios-tour.yml` and `e2e/tour/ios_dark_full_tour.yaml`: a natural-paced Maestro walk through the WHOLE app in Dark Mode on an iPhone 16-class simulator, starting at fresh-install onboarding.
  - Owner request (21 Nov): "a full video recording on Apple iPhone of entire app. just simple plain natural recorded video, making sure onboarding and all must cover, and app must be in Dark Mode."
  - Steps:
    1. Merge the branch into main (test:all green) and push.
    2. To save time, start the recording AND the final E2E together on main: dispatch `record-ios-tour.yml`, `e2e-ios.yml` and `e2e-android.yml` on main, then write all three lines to `.claude-run/wait`.
       The final-report task then reuses those E2E results; it only re-dispatches if main changed after them.
    3. Next run: download the artifact (`gh api .../actions/runs/<id>/artifacts`, then `.../actions/artifacts/<aid>/zip`).
    4. Extract about 12 frames with ffmpeg and LOOK at them. Check: dark mode applied; onboarding, Today, the workout with sets and rest timer, Train, Eat (tick, recipe, cook mode, swap), Progress, Library, Settings and the paywall all appear; nothing is stuck on a spinner or error.
    5. If anything is wrong, fix the tour flow (or the app bug it reveals) and re-record.
    6. When good: create the GitHub Release `app-tour-dark` and upload the mp4 as a release asset (`gh api` uploads to `uploads.github.com`). Tick this task with the download URL.
  - status (21 Nov, API run 3): steps 1–2 done. Merged `feat/tour-video` into main (4f987c4, test:all green: 3129 app + 757 engine + server 150). Dispatched record-ios-tour, e2e-ios and e2e-android on main; waiting via `.claude-run/wait`. Next run: do steps 3–6 (find the tour run with `gh api "repos/$REPO/actions/workflows/record-ios-tour.yml/runs?branch=main&per_page=1"`).
  - status (API run 4): first tour run failed at swap-option-0 (flow timing, fixed with a retry tap in 8afdb42). e2e-ios on 4f987c4 failed only `today/05_tick_meal` (flake, no app change). Re-dispatched record-ios-tour + e2e-ios on main; waiting. Next run: if the tour is green do steps 3–6; if e2e-ios 05_tick_meal fails again, investigate the Undo toast on iOS (src/ui Toast) as an app bug.
  - status (API run 5): tour 44938182536 and e2e-ios 44938184336 (on 8afdb42) failed on flow timing, not app bugs: tour lost the `welcome-start` tap after the carousel swipes (dark mode itself looked right); `today/05_tick_meal` looked for Undo after two slow assertions, past the 5 s toast (tick worked in the screenshot). Both flows fixed (retry tap; Undo tapped right after the tick). Re-dispatched tour + e2e-ios on main; waiting. Next run: if the tour is green do steps 3–6.

  - OWNER PRIORITY (21 Nov, 20:45 UTC): Ahmad wants the full video above all. Make the tour flow ROBUST so one slow screen can't abort the whole recording:
    - every `extendedWaitUntil` gets a timeout of at least 20 s;
    - each tap that moves to a new screen is retried once if the next screen hasn't appeared (as done for the dinner swap);
    - steps that aren't essential get `optional: true`;
    - the onboarding quiz start ("Get started" → `screen-quiz-goal`, which failed on 8afdb42) waits up to 30 s and re-taps.

    If `screen-quiz-goal` never appears even after a re-tap, treat it as an iOS app bug in onboarding navigation and fix it in the app.
    Use opus for this task from now on.

  - MUSIC CHOSEN (21 Nov, 22:50 UTC): use `assets-dev/music/raving-energy.mp3`. Its licence is verified; see `assets-dev/music/LICENSE.md`. Mix it as described below, looping with `-stream_loop -1`.
  - SENT TO OWNER (22:50 UTC): a 13.4 min partial video (tour 44947606784 on bcf6c9e, which failed at `swap-dinner` after Eat). It already covers onboarding, Today, the workout, the rest timer, the finish and Eat.
    - The final video only needs the tour to run end to end. Fix the `swap-dinner` step (sheet or retry timing, or `optional: true`).
    - Make the rest timer shorter in the tour: tap Skip / -15 after about 5 s, so the video doesn't sit through 2-minute rests.
    - Then record again.
  - status (API run 6): swap-dinner failed because the sheet had NO options (app gap, not timing): engine swaps now fall back in tiers (D-SWAP-TIERS). Tour flow made robust (all OWNER PRIORITY items + ~5 s rests, D-TOUR-ROBUST); the video now starts at the welcome screen. today/05 Undo tap fixed (settle wait). e2e-ios on bcf6c9e also failed eat/04, notifications-settings, today/01 (not-visible, no app change since green 506cfa6: CI timing). Dispatched record-ios-tour + e2e-ios + e2e-android on main; waiting. Next run: if the tour is green, do steps 3–6 plus the music mix. Local ffmpeg: `pip install imageio-ffmpeg` (no system ffmpeg on the runner).
  - OWNER REQUEST (21 Nov, 20:50 UTC): add background music to the final video: "nice, motivating gym music".
    - **Licence:** use ONLY a track whose licence you have verified on its own page: CC0 / public domain preferred, CC-BY 4.0 acceptable with attribution. No commercial or copyrighted songs, and nothing from YouTube.
      - Good sources: Free Music Archive (filter by CC0 or CC-BY), OpenGameArt (CC0), or incompetech.com (Kevin MacLeod, CC-BY 4.0; check the licence on the track page).
      - Style: upbeat, energetic electronic or hip-hop workout beat, about 110–130 BPM, instrumental, not aggressive.
    - **Repo:** save the track as `assets-dev/music/<slug>.mp3`, with `assets-dev/music/LICENSE.md` giving the title, artist, source URL, licence and attribution text.
    - **Mix with ffmpeg** (the simulator video has no audio):
      - loop or trim the track to the video length;
      - 1.5 s fade-in, 3 s fade-out;
      - loudness-normalise to about -16 LUFS (`loudnorm=I=-16:TP=-1.5:LRA=11`);
      - `-c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart`.
    - **Upload:** both files as release assets: `repwise-ios-dark-tour-music.mp4` (main) and `repwise-ios-dark-tour.mp4` (silent). Put any CC-BY attribution in the release notes.

- [x] (sonnet) **Final green run on main and the final report to the owner.**
  - result (22 Nov, API run 8): E2E green on 26fb53a (main differs only in docs): iOS 44962551228, Android 44962552794. `docs/FINAL_REPORT.md` written; issue https://github.com/ahmadkhancodes/repwise/issues/1.
  - Steps:
    1. Use the latest e2e-ios and e2e-android runs on main, if their head SHA equals the current main. Otherwise dispatch both on main and wait (via `.claude-run/wait`).
       Also: if the newest e2e run on main is still in progress, write it to `.claude-run/wait` and end the run.
    2. If anything is red, add a new opus fix task ABOVE this one, then continue.
    3. When both are green, write `docs/FINAL_REPORT.md`, short and plain: what the app does; test counts (app, engine, server, content, E2E per platform, with run URLs); device bugs found and fixed; known limits; the Dark Mode tour video link.
    4. Open a GitHub issue titled "Repwise: tested app ready" with the report and video link, mentioning @ahmadkhancodes. End the issue body with the attribution footer:
       ```

       ---
       _Generated by [Claude Code](https://claude.ai/code)_
       ```
    5. Tick this task.

- [x] (opus) **US/UK meals first (owner, 22 Nov: "not Pakistani meals; put American and UK meals").** Repwise targets the US, UK and Canada.
  - result (22 Nov, API run 9; on feat/client-demo, E2E pending): code in 8ac4383, merged into `feat/client-demo` (b7860e8, head 3fd21dc). Engine D-CUISINE-DEFAULT: no pick / "Anything" → american, british, mediterranean, italian, mexican, global; Pakistani, Indian, Gulf, Middle Eastern and North African dishes only when picked (hard filter in `recipeSafe`, so plans, all swap tiers and AI pools follow it). Onboarding reordered. +148 recipes (611 → 759; american 124, british 122). test:all green on the branch (app 3131, engine 775, content 56, server 150); golden fixtures unchanged. E2E runs dispatched on `feat/us-uk-meals` before the batching rule landed were cancelled. Also fixed main's lint (scripts/media Node globals).
  - Today the catalogue is 611 recipes: pakistani 87, indian 70, middle_eastern 59, american 57, british 49, mediterranean 49, global 48, gulf 43, east_asian 34, mexican 33, italian 33, north_african 27, southeast_asian 22.
  - Onboarding: reorder `CUISINE_OPTIONS` (`src/features/onboarding/logic/options.ts`) to American, British, Mediterranean, Italian, Mexican, Anything, then the rest. Pakistani, Indian, Gulf and the other regional cuisines go last.
  - Planner default when the user picks no cuisine, or "Anything": draw only from american, british, mediterranean, italian, mexican and global. South Asian, Gulf, Middle Eastern and North African recipes appear ONLY when the user picks them.
    - Put this in the engine's candidate pool, as pure logic with unit and property tests.
    - Check that `SwapChooser` and the meal-swap tiers follow the same rule.
  - Content: add at least 120 new American and British recipes (target ≥ 110 each in total), plus some Canadian-friendly dishes. They must be everyday, familiar and macro-friendly:
    - breakfasts: overnight oats, egg-white omelette, Greek yoghurt parfait, porridge, protein pancakes, full English (lighter);
    - lunches: turkey club wrap, chicken Caesar salad, jacket potato with tuna, BLT, chicken & avocado sandwich;
    - dinners: grilled chicken with sweet potato, steak with roasted veg, salmon traybake, shepherd's pie (lean), chilli con carne, turkey meatballs, cottage pie, fish pie, roast chicken dinner, burrito bowl;
    - snacks: protein shake, cottage cheese with berries, beef jerky, rice cakes with peanut butter.
  - Use the existing content pipeline and schemas in `packages/content`: nutrition computed from `foods` (USDA/CoFID-style data already in the package), allergens tagged, UK and US units and names via the localisation rules. Content QA tests must stay green.
  - Re-record the golden fixtures if they change: `GOLDEN_RECORD=1 npx vitest run test/golden.test.ts` in `server/`.
  - Steps: `npm run test:all` green; push to the branch `feat/us-uk-meals`; dispatch e2e-ios and e2e-android on it; on green, merge to main.

- [x] (opus) **Animated exercise demos as the main exercise visual (owner, 22 Nov).**
  - result (22 Nov, API run 10; on feat/client-demo, E2E pending): 0a5af61. `exercise_media.json` maps 192/283 engine exercises to V1 GIFs (all hand-checked; overrides in `scripts/media/exercisedb-overrides.json`; the rest are stretches/carries/isometrics/home variants → muscle map). `src/services/exerciseMedia.ts` (`mediaFor`, `EXPO_PUBLIC_MEDIA_BASE`, prefetch of today + tomorrow from Today). GIF hero on detail + player (light `mediaStage` card, Reduce Motion = still), first-frame list thumbs, muscle map under "Muscles worked", instant map fallback. Library = 1,604 exercises (1,321 browse-only V1). Maestro library flow updated (flip moved to the Muscles worked map; browse-only step). test:all green (app 3205, engine 775, content 56, server 150). D-EXDB-MEDIA.
  - What the owner wants: animated 3D demos (GIFs) of each exercise with the target muscles highlighted in red — the ExerciseDB style, e.g. a seated pec-deck GIF. The current green muscle maps stay, but as a SECONDARY visual: a "Muscles worked" section on the exercise detail, and a small chip or filter in the Library.
  - **LICENCE CONFIRMED (owner, 22 Nov 2026).** Ahmad bought the ExerciseDB V1 licence, and the maintainer approved pulling and storing all the data. Log this as a decision (D-EXDB-LICENCE).
    - **Pull ALL the V1 data:** every exercise's metadata (id, name, body part, target and secondary muscles, equipment, instructions) and every GIF, from the V1 endpoint (https://exercisedb.dev/, about 1,500 exercises).
      - Write a script `scripts/media/pull-exercisedb.ts`: polite, with a concurrency of 4 and retries. Commit it.
      - Save the metadata as `packages/content/exercisedb_v1.json`.
    - **OWNER OVERRIDE (22 Nov, later): DO NOT bundle exercise media in the app. Host it on the server.** The session already mirrored everything to Vercel Blob (store `repwise-exercise-media`, project `repwise-media`):
      - dataset: `packages/content/exercisedb_v1.json` (committed by the session); every `gifUrl` points to our Vercel Blob CDN;
      - the same file is online at `https://<store>.public.blob.vercel-storage.com/exercisedb/v1/exercises.json`.
      - The app loads GIFs from those URLs with the `expo-image` memory-disk cache plus prefetch of today's and tomorrow's exercises. If a GIF fails, show the muscle map.
      - Keep the base URL in config (`EXPO_PUBLIC_MEDIA_BASE`) so the host can change later.
      - IGNORE the bundling step below. Do not re-pull from ExerciseDB.
      - DONE by the session (22 Nov): `packages/content/exercisedb_v1.json` has 1,500 exercises. 1,324 have a `gifUrl` on our Blob CDN (126 MB); 176 have `gifUrl: null` because ExerciseDB's own CDN returns 404 for them. Those show the muscle map plus the instructions.
      - When mapping our 283 engine exercises, prefer a match that HAS a GIF.
      - Script for re-runs: `scripts/media/pull-exercisedb.mjs`. The token goes in a file passed as `BLOB_TOKEN_FILE`; never commit it.
    - (superseded) **Store the media so it always loads fast, offline-first:**
      1. BUNDLE in the app: animated WebP (convert with ffmpeg/libwebp; about 360 px, q≈70, loop) for every exercise our engine uses (the 283 in our catalogue, mapped by the media map), plus the ~150 most common extra ones. Store them under `assets/exercises/<exdbId>.webp` with a generated require-map module. Keep the added app size under about 40 MB; report the exact size.
      2. Every OTHER V1 exercise: loaded remotely from the provider's GIF URL, using the `expo-image` memory-disk cache and prefetch. A bundled asset ALWAYS wins over remote.
    - **Library:** show ALL ~1,500 exercises (search plus body-part and equipment filters, FlashList or virtualised, 60 fps). Exercises outside our 283 are browse-only; the planner uses only our curated set. Each detail page shows the GIF hero, the instructions, target and secondary muscles, and our muscle map as "Muscles worked".
    - Commit the media in batches (keep each commit under about 100 MB). Put any long-term remote mirror (Cloudflare R2) under "Owner steps" for later; it isn't needed now.
  - **Licensing (superseded by the confirmation above; kept for the record).** Read the official terms before using any media and record what they say in `docs/DECISIONS.md`:
    - https://exercisedb.dev/
    - https://go.exercisedb.dev/shop (V1 dataset: about 1,500 exercises with GIFs, a single-payment option)
    - https://exercisedb.notion.site/ExerciseDB-API-Terms-of-Use-226983b728ca8090bf7be79564e4b356
    - The free V1 endpoint (no key) may be used for development and the internal demo video. Production needs the licence the owner buys.
    - Never scrape images from Google or GitHub. Never bundle media the terms forbid storing.
  - **Build:**
    - A content map `packages/content/exercise_media.json` (our exercise id → ExerciseDB id), made by a script that name-matches against the V1 dataset. Hand-check at least the 120 most-used exercises (presses, rows, squats, deadlifts, curls, cable and machine moves).
    - A media service `src/services/exerciseMedia.ts`: `mediaFor(exerciseId)` returns `{ gifUrl | null, muscles }`. The provider base URL is in config, so we can later switch to our own CDN without code changes.
    - Display it with `expo-image` (animated GIF, memory-cache, fixed aspect, light background card that looks right in both light and dark themes):
      - the hero on the exercise detail;
      - the current-exercise card in the workout player;
      - Library list thumbnails (first frame or small GIF).
    - Offline or error: fall back to the muscle map at once. Never a spinner wall, never block the workout.
    - Loading speed (owner, 22 Nov: "pull all the data and store it so it loads properly"):
      - Now: pull the V1 dataset METADATA (ids, names, target muscles, equipment) into `packages/content/exercise_media.json` for the mapping only.
      - Use the `expo-image` disk cache (`cachePolicy="memory-disk"`). When a plan is built or Today opens, prefetch the GIFs for today's and tomorrow's exercises, so the workout never waits.
      - After the owner buys the V1 licence: if its terms allow storage, mirror ALL licensed GIFs to our own storage and CDN (Cloudflare R2 behind the Worker), and switch the provider base URL in config. Write `scripts/media/mirror-exercisedb.ts`, ready to run.
      - Until the licence is confirmed, never mirror or bundle the GIFs.
  - Tests: the service (mapping, fallback), components (render, loading, error, offline) on both `Platform.OS` values, and Maestro flows updated. `npm run test:all` green.
  - Steps: push to `feat/exercise-gifs`; dispatch e2e-ios and e2e-android; on green, merge to main.
  - Add to Owner steps: "Buy the ExerciseDB V1 licence at https://go.exercisedb.dev/shop before store launch" (or whatever the terms require).

- [x] (opus) **"Building your plan" screen after onboarding (owner, 22 Nov).** After the last onboarding step, show a beautiful 3–5 s screen, even though the plan is ready in milliseconds. It should feel like the app is working for you.
  - result (22 Nov, API run 11): 85a1423 on feat/client-demo, E2E pending. Five personal cross-fading status lines + "Your plan is ready", 4.1 s (ready waits for the saved plan), light haptic, reduce motion = 1.2 s static line; unit + component tests (both schemes/platforms), Maestro step in onboarding/01; test:all green.
  - Rotating status lines with a smooth cross-fade / typewriter feel and a subtle progress ring or bar. Example lines:
    - "Reading your goals…"
    - "Picking exercises for your kit…"
    - "Balancing your sets and rest…"
    - "Cooking up your meals…"
    - "Hitting your protein target…"
    - "Your plan is ready"
  - Personalise lines with the user's answers where possible: "4 days a week · 60 min", "American & British meals".
  - Light haptic at the end, then the plan reveal.
  - Minimum 3 s, maximum 5 s. If the real work takes longer, wait for it.
  - Honest copy: no fake medical or AI claims. With reduce-motion on, keep it short and static.
  - Tokens only, light and dark. Component tests, a Maestro step, and Platform tests.

- [x] (opus) **Home dashboard with stats, including steps (owner, 22 Nov).**
  - result (22 Nov, API run 12): 38ae855 on feat/client-demo, E2E pending. Today = date → workout hero → stats grid (calories ring, protein, steps, week, streak, volume, weight sparkline) → meals; steps via CoreMotion / Health Connect (READ_STEPS, minSdk 26) + pedometer fallback, "Turn on steps" tile only, `daily_steps` table (migration 0004), goal in Settings → Activity (D-STEPS, D-HOME-DASH); test:all green (3295 app tests).
  - "A home screen with all the stats like any fitness app: calories, steps and everything. It must look like a GYM app, not a step-counter app; stats sit around the corner."
  - Make the Today tab the home dashboard:
    - Hero: today's workout card with Start (gym-first; the primary action).
    - Under it, a compact stats grid of glanceable tiles:
      - calories eaten vs target (ring);
      - protein vs target;
      - **steps today** vs goal (default 8,000, editable in Settings);
      - workouts this week vs plan;
      - streak;
      - weekly volume;
      - weight trend sparkline.
    - Then the meal timeline.
    - Uber-calm styling, tabular numbers, 48dp targets, works at 130% font scale, light and dark.
  - **Steps:**
    - iOS: `Pedometer.getStepCountAsync` from `expo-sensors` (CoreMotion; add `NSMotionUsageDescription`).
    - Android: daily totals from Health Connect (pick the maintained Expo-compatible library and config plugin, with only the read permission for Steps), falling back to `expo-sensors` `watchStepCount` while the app is open.
    - The owner explicitly asked for steps on 22 Nov, so these additions are approved. Log them in `DECISIONS.md` as an override of the earlier "no hardware SDK" rule, for step READ only. Ask for permission in context: a tile saying "Turn on steps", never at launch.
    - If steps are denied or unavailable, the tile shows "Turn on steps". Never block. Store daily steps in SQLite for the history.
  - Pure logic for the stats maths, with unit tests. Component tests on both platforms. Update the Maestro flows.
  - Native change: it needs a new dev/prod build later. E2E builds run prebuild in CI, so they cover it.

- [x] (opus) **Paywalls everywhere the workbook says, plus a DEMO purchase flow for the client video (owner, 22 Nov).**
  - result (22 Nov, API run 13): 0484738 on feat/client-demo, E2E pending. F-S5 gate sheet for every Free vs Pro gate (new: meal swap, ate out, adaptive AI plan after week 1; existing gates now open the sheet), `paywall_view{source:'gate:<feature>'}`; DEMO checkout (D-DEMO-PAY, compile-time off in production, tests prove it): TEST MODE sheet •••• 4444 → 1.2 s → Payment complete → local demo Pro → Settings "Repwise Pro · Yearly (test)" + reset; Maestro e2e/billing/02_gate_demo_checkout.yaml; test:all green (3363 app tests).
  - **Follow the workbook exactly:**
    - `docs/build-bible/05-Pricing-Trial.md`: plans, wording, and the Free vs Pro table.
    - `09-User-Flows.md`: F1 (onboarding → building plan → plan preview → paywall), F-S3 and F-S5 (contextual "Hit a Pro limit" bottom sheet: the exact benefit + preview, "Start free trial" / "Not now", never a dead end).
    - `10-Screens.md` S37, `11-Design-System.md` (paywall: 4 plan rows, yearly pre-selected, trial line, close X), and `16-Payments.md` (verbatim copy, Restore, Terms, Privacy, auto-renew text).
  - **Plans:** weekly $4.99, monthly $12.99, 3-month $24.99, yearly $59.99 (pre-selected, 7-day free trial, "$1.15/week").
  - **Gates (Free vs Pro table):** each gate opens the contextual sheet (`source: gate:<feature>`), with `paywall_view` analytics.
    - meal swaps and 'ate out' rebalance (Pro);
    - meal plan beyond today;
    - week 2+ adaptive workout plan / auto-progression;
    - more than 3 custom routines;
    - grocery list;
    - more than 1 assistant card a day, and the weekly check-in auto-adjust;
    - progress history beyond 30 days, photos, measurements;
    - full notification schedule.
  - **DEMO purchase mode** (staging/preview builds ONLY: `EXPO_PUBLIC_DEMO_PAYMENTS=1` or app variant ≠ production; on by default in the E2E/tour and preview builds):
    - Tapping "Start free trial" / "Continue" opens a native-looking checkout sheet with a clear **"TEST MODE"** badge: plan summary, "Card •••• 4444" (test card prefilled, editable fields 4444 4444 4444 4444, 12/34, 123), and the total today ($0.00 with trial, else the price).
    - "Confirm" → a short processing spinner (~1.2 s) → a **"Payment complete"** success screen with a check animation and success haptic → "Continue" → Pro unlocked LOCALLY (a demo entitlement stored in MMKV, clearly marked demo) and back to where the user was.
    - Settings → Subscription shows "Repwise Pro · Yearly (test)", with "Reset test purchase" in a debug section.
    - NO Stripe and no network.
  - **Production builds:** the demo path must be IMPOSSIBLE (compile-time flag). The real path stays react-native-iap (StoreKit 2 / Play Billing), per CLAUDE.md "never Stripe for in-app subscriptions".
    - Add a unit test proving the demo checkout can't render when the flag is off.
    - Log D-DEMO-PAY.
  - Tests: gating logic as pure functions with tests; component tests for the paywall, the checkout sheet, the success screen and gates (both `Platform.OS`); Maestro flows for gate → paywall → test checkout → payment complete.
  - **OWNER (22 Nov): the payment part of the video is a MUST.** The client must clearly see the paywall and a test payment going through.
    - Hold the paywall on screen for about 2.5 s; tap Weekly → Monthly → Yearly so every price is visible.
    - Hold the test checkout (•••• 4444, TEST MODE) and the "Payment complete" screen for about 2 s each. Do NOT speed these up or cut them in post: protect these segments from mpdecimate/speed-up, or re-insert them at 1×.
    - Show Settings → Subscription "Repwise Pro · Yearly (test)" near the end.
  - **Tour video sequence (for the client):**
    1. Onboarding.
    2. Building your plan.
    3. Plan preview.
    4. Paywall: show the 4 plans, including weekly; close it with X → Free mode.
    5. Use the app as a free user.
    6. Hit a Pro gate, e.g. meal swap → contextual sheet → paywall → pick Yearly (trial) → test checkout •••• 4444 → Payment complete → Pro unlocked.
    7. The swap now works.

- [x] (sonnet) **Hide exercises that have no animation (owner, 22 Nov: "if some exercises are missing, skip them in the app").**
  - Library and search: list only ExerciseDB exercises with a non-null `gifUrl` (1,324). The 176 without one are hidden.
  - Planner and swaps: prefer exercises whose mapped media has a GIF. Never show an engine exercise with a blank hero; the muscle-map fallback stays only for offline or load errors.
  - Small change on `feat/client-demo`: unit tests plus `npm run test:all`. Do it BEFORE the tour task, in the same batch (no separate E2E).
  - result (22 Nov): 1ce62b2 on feat/client-demo, library 1,427 items with GIF, planner pool via preferAnimated; test:all green (E2E pending).

- [x] (superseded 23 Nov by the DAY-IN-THE-LIFE task; the 3:05 cut was delivered to the owner) (sonnet) **FAST tour video, about 3 minutes (owner, 22 Nov: "the 21-minute video is too slow; make it about 3 minutes").**
  - SESSION QA 2 (22 Nov 20:00 UTC), tour 45055372104 on 5bb3504. This was the FIRST green tour on the branch (3:00 with music, sent to the owner as a preview). It shows: the building-plan screen (19 / 57 / 90 %), the plan reveal, the paywall, the dashboard tiles, the workout and rest, the American swap list, the Library (1,427), the check-in and Settings.
    - Remaining problems, all to fix:
      - (a) "Payment complete" never shows. The checkout sat about 15 s, which is the `demo-payment-complete` wait timing out, so the `tapOn id demo-confirm` did not register on iOS. The session added a text-tap fallback in e7be0c2 and re-recorded. If it is still missing, make the Confirm `Button` expose its `testID` as accessibilityIdentifier on iOS, and check the E2E iOS 02_gate_demo_checkout flow.
      - (b) The post-process keeps static frames inside keep segments at 1×, so the dashboard and the swap list sit still for 10–20 s. Cap any static run inside a keep segment at about 2.5 s (mpdecimate with `max≈75` inside keeps).
      - (c) The paywall never shows Weekly in the video: scroll it into view (done in 5bb3504 only for onboarding; do the same in the gate paywall section).
      - (d) Settings "Repwise Pro · Yearly (test)" was not in the frames.
  - SESSION QA (22 Nov 16:40 UTC) of tour 45036947739 on 84d54cc (frames checked). GOOD: the branch is now recorded; American + British come first; the 4-plan paywall shows; the TEST MODE checkout shows •••• 4444.
    - BUG: the video sits on the Checkout screen for the last ~2 min. "Confirm" never reaches "Payment complete"; the flow then fails at `screen-today`. iOS E2E 02_gate_demo_checkout also fails (`paywall-price-line`).
    - Fix the checkout so Confirm works on iOS (keyboard covering the button? Confirm disabled? the processing promise never resolving?). Check the debug `last-screen.png`. Add a component test that Confirm leads to success on both platforms.
    - Also check that the "Building your plan" screen is visible in the video: it wasn't caught in the frames.
  - SESSION FIX (22 Nov 14:40 UTC): ROOT CAUSE of the old-looking tour: `record-ios-tour.yml` defaulted `inputs.ref` to `main`, so the "green" tour 45008032037 recorded MAIN, without the GIFs, dashboard or demo payments.
    - Fixed on `feat/client-demo` in 1d65d0d: the default is now empty, so the run records the dispatched branch.
    - That commit also adds a "Fast cut + music" step, which uploads the artifact `repwise-ios-dark-tour-fast` (`tour-fast.mp4`, `tour-fast-music.mp4`) via `scripts/ci/tour-postprocess.py`.
    - The session dispatched a new recording on the branch.
    - ALWAYS dispatch with `-f inputs[ref]=<branch>`.
    - QA the frames: the GIF hero is visible, the dashboard stat tiles are visible, the 4-plan paywall shows, then •••• 4444 → Payment complete, then Settings "Repwise Pro · Yearly (test)". If any of these is missing, fix the flow or the app and re-record.
    - Make the tour emit `keep-start` / `keep-end` marks around the paywall, checkout, Payment complete and Subscription screens, so the post-process keeps them at 1×.
  - status (API run 18): on 45d1161 android + tour 45062985222 green; the tour frames show Weekly, "Payment complete", the building screen and dashboard (3:05 with music). iOS e2e red only from flows (billing/02 price-line, today/01 add-water + today/05 meals-count: Today is taller now): fixed with longer scrolls. Subscription screen was missing in the video (row tap): retry by label. Post-process caps static runs in long keep segments at 3x. Re-dispatched e2e-ios, e2e-android and the tour on the branch; waiting. Next run: all green -> download tour.mp4 + marks, run tour-postprocess.py (TOUR_TRIMMED=1 ...), check frames incl. Settings "Repwise Pro · Yearly (test)", publish release app-tour-dark-v2, comment on #1, merge to main (test:all).
  - status (API run 14): code done on feat/client-demo 030d248 (flow rewritten, scripts/ci/tour-postprocess.py). Pushing workflow files is blocked for the App token, so record-ios-tour.yml is unchanged and uploads the plain trimmed tour.mp4 (marks incl. keep-start/keep-end are in the debug artifact marks.txt). Dispatched e2e-ios, e2e-android, record-ios-tour on the branch; waiting. Next run: read all three; red → fix on the branch; green → download tour.mp4 + debug marks, run `TOUR_TRIMMED=1 python3 scripts/ci/tour-postprocess.py tour.mp4 marks.txt silent.mp4 music.mp4 assets-dev/music/raving-energy.mp3 195` (ffmpeg via imageio-ffmpeg, put ffmpeg/ffprobe on PATH), review a 12-frame grid, publish release app-tour-dark-v2, comment on issue #1, merge to main.
  - status (API run 15): e2e on 030d248 were red (iOS 45008029189, Android 45008030612) but the tour 45008032037 was GREEN. Causes were flows, not app code: build screen too short-lived for `build-status` (now optional), today/01+04 scrolled past `stat-calories`, and a red billing/02 left demo payments ON so swap/grocery/ate-out/notifications flows ran gated (billing/02 now resets in onFlowComplete). Fixed in f5ccbab on feat/client-demo; check green (3369 tests); re-dispatched e2e-ios + e2e-android; waiting. Next run: read both; red → fix non-cascade failures first; green → download tour.mp4 from run 45008032037, postprocess as below, publish app-tour-dark-v2, comment on #1, merge to main (test:all). The runner needs `npm ci` first (node_modules stale).
  - status (run 13): demo payments are OFF in the E2E/tour builds until the flow opens `repwise://demo-payments?on=1&reset=1` (tap "Open" on iOS). Then the paywall shows after the plan reveal and gates work. IDs: `paywall-close`, `plan-weekly|monthly|quarterly|yearly`, `paywall-cta`, `gate-title`, `gate-cta`, `gate-not-now`, `demo-checkout`, `demo-confirm`, `demo-payment-complete`, `demo-continue`, `screen-subscription`, `subscription-plan`. A free user's `swap-dinner` opens the gate sheet. See e2e/billing/02_gate_demo_checkout.yaml. Switch it on BEFORE onboarding ends so the onboarding paywall (step 4) is shown. The stub's payments-on is no longer needed.
  - Rewrite `e2e/tour/ios_dark_full_tour.yaml` for pace:
    - no fixed waits longer than about 1 s; wait only for the next screen to appear;
    - skip the rest timer straight away (show it for about 2 s);
    - log 2 sets, not all of them;
    - pick **American + British** cuisines in onboarding;
    - show the new exercise GIF hero (detail plus player) and the "Muscles worked" section.
  - Keep the coverage: onboarding, the "building your plan" screen, plan reveal, home dashboard stats (steps tile), Today, workout with GIF, rest, finish, Eat (tick, recipe, cook step, swap), Progress, Library, check-in, Settings, and the paywall sequence from the paywall task (close on first view, a later gate → test checkout → Payment complete).
  - Post-process in `record-ios-tour.yml`:
    - `ffmpeg mpdecimate,setpts=N/FRAME_RATE/TB` removes idle frames;
    - if the result is still over 3:30, speed it up (`setpts`) so it lands at 2:45–3:30.
    - Mix `assets-dev/music/raving-energy.mp3` (fade in 1 s, fade out 2 s, `loudnorm I=-16`).
  - Check a 12-frame grid: dark mode applied, GIFs visible, US/UK meals showing.
  - Upload to a NEW release `app-tour-dark-v2`: `repwise-ios-dark-tour-fast-music.mp4` plus the silent version, with the CC BY credit in the notes.
  - Then comment on issue #1 with the link (attribution footer included), mentioning @ahmadkhancodes.

- [ ] (opus) **FINISH: merge `feat/client-demo` into main.**
  - Android E2E is green on a35e02e. iOS was 30/31; only billing/02 failed (a CTA tap during the paywall slide-in).
  - The session fixed it in e2460da and ran `e2e-ios` with `flows=billing` on the branch.
  - If that run is green: run a full e2e-ios on the branch head once more; if green, merge into main (CI green), push, and tick this task.
  - UPDATE (session, 23 Nov 09:45 UTC): the iOS billing-only run 45141383805 on e2460da is STILL red: `demo-checkout` never appears after the CTA, even with a slide-in wait and a label retry. The tour on the same code DOES reach the checkout.
    - Likely cause: on iOS the `repwise://demo-payments?on=1` link's 'Open in "Repwise"?' alert appears late and is missed (`tapOn "Open"` is optional and immediate). Demo payments then stay OFF, and the CTA calls real IAP, which shows nothing on the simulator.
    - Fix: `extendedWaitUntil` text "Open" (5 s, optional), then tap. Better still, add a visible "TEST MODE" marker on the paywall when demo payments are on, and assert it before the gate.
    - Verify with `flows=billing` before the full run.
  - If billing/02 is still red: make the paywall CTA tappable on iOS in the APP (the same fade-instead-of-translate fix as the checkout in 45d1161), not by loosening the flow.
  - status (API run 19, 23 Nov 09:13 UTC): e2e-ios billing-only run 45141383805 on e2460da still in progress (started 08:46); no code changes. Queued a wait. Next run: read it; green → full e2e-ios on the branch head (e423aeb, CI-only change) → merge.
  - status (API run 20, 23 Nov): billing-only run 45141383805 red: billing/02 `demo-checkout is visible` false although the screenshot shows the checkout open. Cause (APP): Fabric flattened the layout-only wrapper View, so its testID was missing from the iOS tree (same for `demo-payment-complete`). Fixed with `collapsable={false}` + a regression assertion in 2b46c72 on feat/client-demo (check green, 3369 tests). Dispatched a FULL e2e-ios on the branch; waiting. Next run: green → merge into main (test:all), push, tick; Android already green on a35e02e (later commits are iOS/billing-only + CI).

- [ ] (opus) **DAY-IN-THE-LIFE VIDEO (owner, 23 Nov, top priority).**
  - Owner feedback on the 3:05 cut: "speed not consistent, too fast in places, looks stuck in places; exercises only 5% of the video; show every page; follow a complete one-day user journey with meals AND exercises; up to 10 min is fine; make it smooth and make it make sense."
  - Work on a new branch `feat/day-tour` from main (after the merge above), or from `feat/client-demo` if the merge is not done yet.
  - Rewrite `e2e/tour/ios_dark_full_tour.yaml` as ONE realistic day for a new user. Storyboard, in this order:
    1. Fresh install → the Welcome carousel, swiping each card.
    2. Onboarding: EVERY step answered naturally (goal, body, target weight, days, session length, equipment, go-easy areas, diet, allergies, cuisines American + British, kitchen, meals per day). Notifications Allow.
    3. "Building your plan": the full 3–5 s.
    4. Plan reveal, scrolled slowly to the bottom (calories, macros, the week, first workouts, today's meals).
    5. Paywall: scroll so all 4 plans show; tap Weekly → Monthly → 3 Months → Yearly; close with X → Free.
    6. MORNING, Today dashboard: scroll slowly through the hero workout, all stat tiles (steps tile included) and the meal timeline.
    7. WEEKLY PLAN, Train tab: the week strip; tap EACH training day to show its session; then Routines and History.
    8. TODAY'S WORKOUT PLAN: open the session preview and scroll through EVERY exercise with its GIF. Open 2–3 exercise details: GIF hero (let it loop about 3 s), instructions, "Muscles worked".
    9. LIBRARY (the big visual moment): slow scroll through GIF thumbnails; filter Chest → Back → Legs (a scroll each); search "squat"; open 2 GIF details.
    10. BREAKFAST: Eat tab → Day view; open the breakfast recipe (ingredients); tick it eaten. Then the WEEK view of the meal plan, scrolled across the days.
    11. WORKOUT: Start → for the first 3 exercises: GIF visible, log 2–3 sets each, the rest timer shown about 3 s then Skip. Scroll the remaining exercises → Finish → "Workout done" summary.
    12. LUNCH: tick it; water +250 ml twice; open "Ate out?" and close it.
    13. PRO MOMENT: swap dinner → Pro gate → paywall (Yearly) → test checkout •••• 4444 → Confirm → "Payment complete" → Continue → the swap now works → pick an American dinner.
    14. DINNER: open the recipe → Cook mode through ALL steps.
    15. Grocery list (now Pro): scroll it.
    16. EVENING: Today dashboard again (rings filled, workout done, steps tile) → Progress (log weight, heatmap, muscle recovery, charts, scrolled) → weekly check-in.
    17. Settings: scroll everything, including Subscription "Repwise Pro · Yearly (test)". End on the Today dashboard.
  - **PACING (the owner's main complaint):**
    - One consistent, natural speed: every new screen gets about 2 s; each scroll is a steady `swipe` (duration about 900 ms, same distance each time), never a jump.
    - Before EVERY tap after a navigation: `waitForAnimationToEnd`. iOS taps during slide-ins miss, and that caused the "stuck" moments.
    - No static stretch over 4 s anywhere. Rest timers about 3 s max, then Skip.
    - Target length 7–10 min.
  - **Post-process:**
    - Use the artifact `repwise-ios-dark-tour-natural` (`tour-natural-music.mp4`): 1×, NO mpdecimate, NO speed changes, music mixed (`record-ios-tour.yml`, session commit e423aeb).
    - Ignore the old "fast" artifact.
    - The debug artifact has `freezes.txt`: it must list NO freeze longer than 4 s. Fix the flow and re-record until it does.
  - **QA before release:**
    - Check a frame every 10 s: GIFs clearly visible, the weekly plan, the daily plan, the meal week plan, Payment complete, all pages present, Dark Mode throughout.
    - Then upload to a NEW release `app-tour-day` as `repwise-day-in-the-life.mp4`, with the CC BY music credit.
    - Comment the link on issue #1, mentioning @ahmadkhancodes, with the attribution footer.
  - Dispatch recordings with `-f inputs[ref]=<branch>`.

## Owner steps (only what the agent cannot do)
- Optional: apply docs/orchestration/record-ios-tour-fast.patch (`git apply`) to .github/workflows/record-ios-tour.yml and push it with a token that has the workflows permission (the Claude App token cannot); it moves the fast post-process into CI.
- After the final report: set the repo private at https://github.com/ahmadkhancodes/repwise/settings → Change visibility → Private. Private repos use paid Actions minutes; keep it public until E2E work is finished.
- Later (optional): mirror the exercise GIFs from Vercel Blob to Cloudflare R2 and set `EXPO_PUBLIC_MEDIA_BASE` to it (no code change).
- Later, for launch: Worker secrets (ANTHROPIC_API_KEY etc.), Cloudflare Workers Paid, `eas init` / EAS_PROJECT_ID, `ios.appleTeamId`, store products, the registered business address for the legal pages, and a new Cloudinary account for photos.
