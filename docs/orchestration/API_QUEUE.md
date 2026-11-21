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

- [ ] (opus) **Finish `feat/r3-fix` until E2E is green on both platforms, then merge to main.**
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

- [ ] (sonnet) **Merge `feat/tour-video` into main and record the Dark Mode iPhone tour.**
  - The branch adds `.github/workflows/record-ios-tour.yml` and `e2e/tour/ios_dark_full_tour.yaml`: a natural-paced Maestro walk through the WHOLE app in Dark Mode on an iPhone 16-class simulator, starting at fresh-install onboarding.
  - Owner request (21 Nov): "a full video recording on Apple iPhone of entire app. just simple plain natural recorded video, making sure onboarding and all must cover, and app must be in Dark Mode."
  - Steps:
    1. Merge the branch into main (test:all green) and push.
    2. Dispatch `record-ios-tour.yml` on main and write `.claude-run/wait` with `record-ios-tour.yml main`.
    3. Next run: download the artifact (`gh api .../actions/runs/<id>/artifacts`, then `.../actions/artifacts/<aid>/zip`).
    4. Extract about 12 frames with ffmpeg and LOOK at them. Check: dark mode applied; onboarding, Today, the workout with sets and rest timer, Train, Eat (tick, recipe, cook mode, swap), Progress, Library, Settings and the paywall all appear; nothing is stuck on a spinner or error.
    5. If anything is wrong, fix the tour flow (or the app bug it reveals) and re-record.
    6. When good: create the GitHub Release `app-tour-dark` and upload the mp4 as a release asset (`gh api` uploads to `uploads.github.com`). Tick this task with the download URL.

- [ ] (sonnet) **Final green run on main and the final report to the owner.**
  - Steps:
    1. Dispatch e2e-ios and e2e-android on main and wait (via `.claude-run/wait`).
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
