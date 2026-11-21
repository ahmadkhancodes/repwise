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

- [ ] (opus) **Merge `feat/tour-video` into main and record the Dark Mode iPhone tour.**
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

- [ ] (sonnet) **Final green run on main and the final report to the owner.**
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

## Owner steps (only what the agent cannot do)
- After the final report: set the repo private at https://github.com/ahmadkhancodes/repwise/settings → Change visibility → Private. Private repos use paid Actions minutes; keep it public until E2E work is finished.
- Later, for launch: Worker secrets (ANTHROPIC_API_KEY etc.), Cloudflare Workers Paid, `eas init` / EAS_PROJECT_ID, `ios.appleTeamId`, store products, the registered business address for the legal pages, and a new Cloudinary account for photos.
