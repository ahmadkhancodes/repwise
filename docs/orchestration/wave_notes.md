# Notes for the fix wave
- e2e notifications/notifications-permission-off.yaml: wipes state then taps open-settings (only on Today); app opens on Welcome -> must onboard first (runFlow onboarding/01) . Owner: today/settings agent.
- e2e today/06_start_workout.yaml uses `back` (no-op on iOS) -> use in-app close button. Owner: today agent.
- obs: wire Settings Privacy row to useShareUsageData(); call maybeAskForReview('streak_milestone'|'week_complete'|'meals_day_complete') at those moments.
- store: dark-mode screenshot frame has no flow.
- ds_migration.md (from feat/ds) maps forks -> src/ui components.
- From x-server: send `deload` from `upgradeWithAi` in `src/features/planner/planService.ts`; add `"zod": "^4.6.7"` to `server/package.json` (and refresh the lockfile).
- From w-perf: iOS fonts are still loaded at runtime (token names vs Inter-Regular). Map them in `src/theme` (design-system owner). Android embedded fonts need the next native build.
- Planner: use `lazyCatalog()`.
