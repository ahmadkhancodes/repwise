# Repwise build orchestration (resume from here)

**Owner goal:** finish by 20 Nov 2026 (evening): tested on iOS + Android, with UI exactly per bible sheet 11 (Uber style: elegant, calm, monochrome + Energy Green, motion, haptics, light/dark).

**How we work:**
- The orchestrator (this Claude Code session, Opus) runs parallel agents in git worktrees `../repwise-<feature>` on branches `feat/<feature>`, then merges into `main` and pushes.
- If the session limit hits, resume by reading this file and `docs/PROGRESS.md`.

## Phases

| Phase | Work | Status |
|---|---|---|
| 1 | app-shell, engine, server, content | MERGED |
| 2a | data layer (SQLite/drizzle, repos, sync, api, auth UI) | MERGED |
| 2b | billing (react-native-iap, usePro, paywall, subscription screen) | MERGED |
| 2c | onboarding quiz + plan reveal (S02–S07); wire engine → server Planner | after engine + data |
| 2d | Today + assistant + weekly check-in (S11, S12, S28) | after data |
| 2e | workout player (S13–S17), rest timer, iOS Live Activity / Android ongoing notification | after data |
| 2f | library + media (S18–S19) | after data |
| 2g | meals (S20–S27): targets, plan, swap, recipe + cook mode, grocery, logging, water | after data + engine |
| 2h | progress (S29–S36): charts, heatmap, photos, Wrapped | after data |
| 2i | notifications (P-N1) + widgets (P-N2: Android widget, iOS WidgetKit + Live Activity) | after 2d/2e |
| 3 | polish (P-POL): lightness + accessibility audit, analytics (PostHog), Sentry, store review prompts | after phase 2 |
| 4 | bug review per area; Maestro E2E (both platforms) | |
| 5 | device QA: Android emulator + iOS simulator via GitHub Actions; needs the repo public for the run | |
| 6 | store packs: Play + App Store listing, screenshots, privacy labels; final report to Ahmad | |

## Contracts to keep in sync
- The server sync allow-list (`server/src/sync/tables.ts`) must equal the app schema columns.
- The `BillingApi` interface is implemented by `src/services/api.ts`.
- The server `Planner` interface (`server/src/ai/planner.ts`) is implemented by `@repwise/engine`.

## Status, 19 Nov ~08:00 UTC
- **In progress:** `feat/integrate` (engine/content adapter, real-data acceptance, server Planner wiring) and the 7 screen builders: `feat/onboarding`, `feat/today`, `feat/workout`, `feat/library`, `feat/meals`, `feat/progress`, `feat/notify`.
- **Worktrees** share `node_modules` via a symlink to `/home/user/repwise/node_modules`.
- **Shared brief** for the screen builders: the scratchpad `repwise_screen_brief.md`, summarised as "UI and functionality non-negotiable, tokens, motion, haptics, light/dark, a11y, tests for both platforms".

## PAUSED 19 Nov 08:30 UTC (owner): resume after 3:15 PM PKT (10:15 UTC)
`main` is green: 1,201 app tests plus engine, content and server tests. Merged so far: app-shell, engine, server, content (+ gaps), integrate, data, billing, library, meals, notify.

Each paused slice has a WIP commit on its branch and a "Paused: next steps" list in its `docs/PROGRESS.md`:
- **`feat/onboarding`** (`/home/user/repwise-onboarding`, WIP d520301):
  1. Run check.
  2. Replace `src/features/planner/engine.ts` with `export * from '@repwise/engine'`.
  3. Add the Maestro F1 flows and decisions.
- **`feat/today`** (WIP 8f281e1):
  1. Merge `main`, taking main's `analytics.ts`.
  2. Use the `@/features/meals` functions for ticks, water and swaps.
  3. Run check, add decisions.
- **`feat/workout`** (WIP 92ce404):
  1. Re-run check.
  2. Add the `/train?sessionId=…&start=1` deep link.
  3. Add the Maestro flows and decisions.
- **`feat/progress`** (WIP 19e9ac8):
  1. Fix the screen tests: they stay on the skeleton when the whole file runs (state leak).
  2. Run check, add the Maestro flows and decisions.

**After those merge:**
1. P-POL polish: PostHog + Sentry, review prompts, the lightness/accessibility audit, renumbering the "D?" decisions, replacing the library's `require` workaround with a normal engine import.
2. A bug review per area.
3. Device QA on an Android emulator + iOS simulator via GitHub Actions; the repo must be public for that run.
4. Store packs.

## Status 19 Nov 2026, 18:50 UTC (auto-resume reads this)
- **On main (8ae43a3), all green:** app 2469, engine 690, content 43, server 100. Merged so far:
  - onboarding, today, workout, progress;
  - glue: deep links, route audit, planner bridge, week rollover, edits survive regenerate;
  - obs: PostHog, Sentry, review prompt, privacy manifest;
  - ci: GitHub Actions for checks and E2E on Android and iOS;
  - store packs;
  - design-system v2: shared components, gym Stepper/BigTimer, contrast test;
  - media groundwork: Cloudinary DISABLED, and the open-dataset images are on hold for the owner's licence check;
  - srvfix: auth brute force, refresh grace, sync cursor, AI budget reservation, snack meal_id.
- **Fix wave in progress.** Worktrees `/home/user/repwise-w-*`, branches `feat/w-*`:
  - w-onb (onboarding, settings, billing, notifications);
  - w-today (today, meals, nutrition);
  - w-train (workout player: gym UX + perf);
  - w-libprog (library + progress + muscle-map exercise hero);
  - w-perf (catalogue lazy-load, fonts, DB indexes 0002, startup).
  - Brief: scratchpad `wave_brief.md`.
- **Next after the wave:**
  1. Merge the wave branches and renumber the D? entries.
  2. Re-audit: UI + perf/gym + bugs, read-only, then fix.
  3. Device QA through the workflows; the repo must be public temporarily, which is the owner's call.
  4. Final tested-app report to Ahmad.
- **Extra parallel lane (18:55 UTC).** Worktrees `/home/user/repwise-x-*`, branches `feat/x-*`:
  - x-server: AI quality, security, deploy scripts;
  - x-engine: property-based plan QA;
  - x-content: recipes up to about 600, plus an exercise muscle audit;
  - x-native: widgets, Live Activity, the timer module's native side;
  - x-web: landing page plus the legal/support site.
  - Merge each when it reports, with `npm run test:all` green.

## Status 20 Nov 2026, ~07:00 UTC
- All fix-wave lanes and the x-* lanes are merged into main (5351e80), except x-engine, which is still running. Green: 2,815 app tests, lint and tsc.
- Round-2 audits are running (UI, perf/gym, bugs) → `docs/orchestration/*_r2.md`.
- **Next:**
  1. Fix round 2: one agent per area from the r2 reports.
  2. Device QA via `.github/workflows/e2e-android.yml` and `e2e-ios.yml`; the repo must be public temporarily, which is the owner's step.
  3. Final report.

## Model rule (Ahmad, 20 Nov 2026), overrides anything above
- Never use Fable.
- Use Opus for build, fix and audit work. Use Sonnet only for docs and simple tasks.
- Quality must not drop.
- The paused perf/gym r2 auditor (Fable) gets relaunched fresh on Opus.
- Paused at 11:05 PKT. The resume is scheduled for 3:35 PM PKT (10:35 UTC). The hourly auto-resume is disabled until then.
