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
