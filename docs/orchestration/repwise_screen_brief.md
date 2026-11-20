# Repwise screen-builder brief (shared by all phase-2 agents)

You build ONE feature slice of **Repwise**: an Expo SDK 58 app (iOS + Android), an AI gym and meal planner. Your worktree, branch and owned paths are in your task message. Work ONLY there.

## Read first (keep reads targeted)
- `CLAUDE.md`, including the Owner overrides.
- `docs/ORCHESTRATION.md`, `docs/DECISIONS.md`.
- `docs/build-bible/`:
  - `10-Screens.md` (your screens);
  - `11-Design-System.md` (MANDATORY);
  - `07-Features.md` (your rows + acceptance criteria);
  - `08-Wow-Factors.md`;
  - `09-User-Flows.md` (your flows);
  - `17-Notifications.md`, `23-KPIs-Events.md` (your events).
- The existing code you build on:
  - `src/ui/*` and `src/theme/*` (the design system; reuse it, don't fork it);
  - `src/features/<domain>/repo.ts` and the db schema;
  - `src/services/api.ts`, `src/services/billing.ts` (`usePro`);
  - the catalogue search service;
  - `packages/engine` (the planner maths; NEVER re-implement maths in the UI).

## UI is NON-NEGOTIABLE (owner's words)
Elegant, beautiful, interactive, calm, Uber-styled: monochrome with one accent (Energy Green), lots of white space, soft cards, big readable tabular numbers.
- **Motion:** spring motion (reanimated, 180–280 ms, damping 18, stiffness 180) on every state change.
- **Haptics:** selection on pickers, light on taps, success on the core action.
- **Skeletons** for loading. Beautiful **empty and error states** (EmptyState).
- **Light AND dark** themes, tokens only (ESLint blocks raw colours).
- **Accessibility:** works at 130% font, 48dp targets, labels on every control, safe areas on iOS (notch / home indicator).
- **One primary action per screen.** Pass the sheet 11 "lightness test".
- **Platform feel:** iOS back swipe and large titles where the spec says so, Android back button, `KeyboardAvoidingView` correct on both platforms.
- Make it feel premium: micro-interactions, animated number changes (BigNumber), ProgressRing, and the sheet 08 wow moments in your slice.

## Functionality is NON-NEGOTIABLE
- Real data from the SQLite repos. Live queries update the UI instantly.
- **Offline-first:** never block the UI on the network; the workout player works fully offline.
- Core actions take 2 taps or fewer, and respond in under 100 ms.
- **Pro gating** via `usePro()`. While payments are off, everyone has everything. Never lock the free core loop.
- **Analytics:** if no analytics service exists yet, create `src/services/analytics.ts` with `track(event, props)` ONLY if it's missing (check first); otherwise use it. No health values in event props.

## Tests (required)
- Unit tests for every piece of logic (pure functions in `src/features/<domain>/logic/`).
- Component tests for the screens: render, empty, loading, error and main interactions.
- Run both `Platform.OS` values (the repo's jest setup already runs each test as iOS and Android; follow the existing pattern).
- Add Maestro flows for your P0 flows in `e2e/` (both platforms; use testIDs and texts that actually render).

## Shared files: be careful
- `node_modules` is a SHARED symlink to `/home/user/repwise/node_modules`. **Don't run `npm install` or `npm ci`.**
- **New dependencies:** if you truly need one, it must be in the CLAUDE.md stack list or sheet 12. Install it with `npx expo install <pkg>` (it writes to the shared `node_modules` and your `package.json`), then name it in your final report.
- **Root and shared files:** don't edit `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `src/ui/*`, `src/theme/*`, the db schema/migrations or `src/services/*` owned by others. Exceptions:
  - you may ADD a new `src/ui` component if it's generic, with tests;
  - you may add exports.
  - If you need a root change (a provider, a tab icon, a route group), make the smallest possible edit and list it in your final report.
- **Schema changes:** if you need one, list it in your report instead. Prefer the existing tables and columns. The server sync allow-list must match.

## Rules
- `npm run check` must pass before each commit. Commit often on your branch. Do NOT push.
- End each commit message with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Mn59CkuctceJ9VsG8XZWj8
  ```
- Never `expo prebuild` into the repo. No medical claims; never the words cure, treat or diagnose.
- **Docs:** add a line to `docs/PROGRESS.md`; add decisions to `docs/DECISIONS.md` with the tag of your slice and NO number (write "D?"; the orchestrator renumbers).

**Final reply (10 lines max):** the screens built, the wow moments delivered, the tests (count) and check status, the SHAs, any root edits/new deps/schema needs, and what's left.
