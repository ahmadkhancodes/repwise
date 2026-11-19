# Decisions

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 19 Nov 2026 | iOS + Android from day 1; iOS ready and tested (simulator + Maestro), App Store publish decided later | Owner request |
| D2 | 19 Nov 2026 | Rules-first AI planner; Worker /ai routes with AI_PROVIDER=none by default | Bible conflict: "no LLM costs" vs "LLM via Worker"; rules engine satisfies both |
| D3 | 19 Nov 2026 | Store subscriptions via react-native-iap (StoreKit 2 + Play Billing), verified by the Worker | Store policy for digital subscriptions; bible sheet 16 |
| D4 | 19 Nov 2026 | content: exercise `pattern` is a fine-grained rotation group (23 values, e.g. `core_anti_rotation`, `isolation_biceps`), plus `patternFamily` holding the bible's coarse value | Sheet 28 needs 6–20 variants per pattern; a single `isolation` pattern would hold 60+ |
| D5 | 19 Nov 2026 | content: recipe `perServing`, `allergens`, `dietTags` and `mainProtein` are computed by `packages/content/scripts/build.ts`; `npm run verify` fails if they are stale | Sheet 29: nutrition never typed by hand; tags cannot drift from ingredients |
| D6 | 19 Nov 2026 | content: foods use USDA FDC SR Legacy (271) + FNDDS 2019–20 (4: paneer, ghee, naan, hummus), each with `fdcId`; allergen flags are our own EU-14 mapping | Public domain (CC0), traceable per item |
| D7 | 19 Nov 2026 | content: recipes use `slots[]` (not one `slot`); diet tags mean "suitable for" (a vegetarian dish is also pescatarian); `halal_friendly` = no pork or alcohol, meat bought halal | Lunch/dinner overlap; simpler filters for the planner |
| D8 | 19 Nov 2026 | content: package uses zod + tsx + node:test only (no jest) and keeps its own package.json | Minimal deps; runs standalone until the root workspace exists |
