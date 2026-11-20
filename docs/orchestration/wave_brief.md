# Repwise fix wave: shared brief

The owner's bar is NON-NEGOTIABLE:
- **UI:** elegant, Uber-styled, calm but energetic, premium. It must not look like a template.
- **Speed:** lightning fast. Core actions under 100 ms with optimistic UI. Lists stay at 60 fps.
- **Gym-ready feel:** sweaty hands, one-handed use, glanceable from 1 m, thumb zone.

Cost is no issue. Quality is the only goal.

## Inputs (scratchpad = /tmp/claude-0/-home-user/a3889261-765b-591c-b037-dd8098fb4cf7/scratchpad)
- `ui_audit.md`: 116 findings by feature area. Fix ALL the P0 and P1 findings in your area, plus every P2 that's cheap.
- `perf_gym_audit.md`: performance and gym-UX findings. Fix every one in your area.
- `bug_audit.md`: most items are already fixed on main. Re-check the ones in your area and fix anything that's still open.
- `ds_migration.md`: a map of each forked component to the new shared `src/ui` component. Replace EVERY fork in your area with the shared component, then delete the fork.
- `wave_notes.md`: cross-cutting follow-ups. Do the ones in your area.
- Repo docs: `docs/build-bible/11-Design-System.md`, `08-Wow-Factors.md`, `10-Screens.md`, `07-Features.md`; also `CLAUDE.md`.

## Rules
- Work ONLY in your worktree, on your own paths (listed in your task) plus `e2e/<your area>/`.
- `src/ui` and `src/theme` are now the shared design system:
  - use them, don't fork them;
  - you may ADD a small generic component there with tests, if it's truly needed and no one else would add the same thing;
  - don't change existing APIs.
- **Shared node_modules:** it's a symlink. Never run `npm install`. No new dependencies.
- **Haptics:**
  - fire on commit, never on press-in or scroll;
  - success toasts get `silent: true` wherever the action already buzzes;
  - the rest end uses `haptics.restEnd()`.
- **Tests:** every change has tests (logic as unit tests; screens as component tests covering render, empty, loading, error and interactions), on both `Platform.OS` values. Keep the Maestro flows in `e2e/<area>/` accurate (testIDs and texts that actually render).
- **Checks:**
  - `npm run check` must be green before each commit; commit often;
  - do NOT push;
  - end each commit message with:
    ```
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01Mn59CkuctceJ9VsG8XZWj8
    ```
- **Docs:**
  - add one line to `docs/PROGRESS.md`;
  - add decisions to `docs/DECISIONS.md` as "D?" with your area tag.
- **Never:**
  - `expo prebuild` into the repo;
  - the words cure, treat or diagnose;
  - an LLM call from the app.
- **Finally, self-review before your final commit.** Open each screen file you own and compare it to sheet 10/11 one more time. Ask: "would this look at home in a top-5 grossing fitness app?" If not, improve it.

**Final reply:** 10 lines max. Cover the findings fixed (counts per audit), the findings skipped (with reasons), forks removed, tests and check status, SHAs, any edits outside your paths, and what's left.
