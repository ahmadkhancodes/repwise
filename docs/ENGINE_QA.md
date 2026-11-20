# Engine QA: battle-hardening pass (20 Nov 2026, branch `feat/x-engine`)

Scope: `packages/engine` (`@repwise/engine`): nutrition, split, progression, variety, candidates,
portions, validation. All runs use the **real catalogues** (`@repwise/content` → `engineCatalogues()`,
283 exercises, 325 recipes). The public API changed additively only.

## How to run

`npm run check -w @repwise/engine` runs everything (tsc + jest, about 3–5 min, 757 tests).
`ENGINE_PROPERTY_SHARD=50 npx jest test/property` gives a quick local loop. CI and commits use the
default of 500 per shard.

| File | What it covers |
|---|---|
| `test/support/gen.ts` | Seeded profile generator (mulberry32; fast-check is not installed). It covers every schema field: age 10–120, sex, height 120–230 cm, weight 30–300 kg (a plausible BMI 15–50, plus 10 % fully independent extremes), 4 goals, 4 lifestyles, 3 experience levels, **1–7 training days**, chosen weekdays, 20–180 min sessions, split preference, presets, random and empty kits, injuries, 6 diets, any of 13 allergens, dislikes, cuisines, budget, cook time, 2–6 meals, pregnancy. |
| `test/support/invariants.ts` | Independent checks, written against the profile and the catalogues, not the planner's context. |
| `test/property/plan-shard-{1..4}.test.ts` | 4 × 500 = **2,000 profiles per property**, each run through `planWeekWithVariety`. |
| `test/property/repeats.test.ts` | **2,000 profiles × 4 weeks**, sessions only, with history fed back like the app does. |
| `test/progression-sim.test.ts` | 16-week simulations of logged sets: hits, misses, stalls, random mixes, metric and imperial. |
| `test/edge-cases.test.ts` | Named edge cases (listed below). |

## Properties (2,000 profiles each, 0 violations)

| Property | Rule |
|---|---|
| no_throw | `planWeekWithVariety` never throws for any schema-valid profile. |
| finite | No NaN, ±Infinity or negative number anywhere in the plan object. |
| nutrition | Base, training and rest kcal are ≥ the floor recomputed from the bible (max(BMR × 1.1, 1,200 ♀ / 1,500 ♂)) and ≤ `KCAL_CEILING` (5,000). 4P + 4C + 9F is within 10 kcal of kcal. Macros are whole grams. Training protein equals base protein. |
| meals | No allergen, diet, dislike, never-show or pork-on-halal violation. Every recipe sits in a valid slot, with portions inside `scalable`. Meal kcal = perServing × servings, and day totals add up. No recipe appears twice in a day. Every empty day carries a warning. |
| sessions | Equipment, injuries, level and no-cardio rules hold. Prescriptions are valid (sets 1–8, reps inside the range, load 0–500 kg). Fingerprints are fresh. ≤ 20 weekly sets per group. No repeated session in the week. Session-side `validate` errors: none. |
| coverage | Every muscle group that this week's templates can train with the user's kit gets weekly sets. This is asserted for sessions over 30 min; 4-exercise sessions cannot always reach all 8 groups. |
| deterministic | The same input gives an identical result. Sessions are re-derived for all 2,000 profiles; the whole plan, meals included, is re-planned for every 10th profile (200). |
| repeats (8,000 profile-weeks, 32,493 sessions) | No session repeats one of the previous 10 (`FINGERPRINT_WINDOW`), and no accessory repeats its pattern's previous variant. The only exemption is the content gap below. |

Reported, not asserted, because content limits feasibility:

- Days on target (kcal ±5 % and protein ±10 g): **80.6 %** of 14,000 random-profile days. Misses come from extreme bodies (30 kg at 230 cm), 2 meals a day on 4,000+ kcal, and stacked allergen lists. The bible profiles in `real-catalogue.test.ts` stay at 100 %.
- Days with no meals: 143 of 14,000 (1 %). All come from stacked allergens or dislikes, and every one carries a `no_candidates` or `slot_skipped` warning.
- Bodyweight-only kits (only bodyweight or mat) on 4+ days a week: 44 of 32,493 sessions repeat one of the last 10 sessions. The pool is too small to avoid it. The validator reports these as `fingerprint_repeat`. Content fix: more bar-free variants.

## Runtime (2,000 random profiles, one week each, tsx, shared 4-core container)

| | before | after |
|---|---|---|
| mean | 295 ms | **54 ms** |
| p50 | 42 ms | 13 ms |
| p95 | 1,314 ms | 240 ms |
| max | 6,545 ms | 646 ms |

The "before" figures come from the first 400 profiles of the same generator, before any fix. The mean is close to the 50 ms target but slightly over it. The tail is entirely meal search on infeasible days (for example, 2 meals a day on 4,500 kcal). Typical profiles (p50) take 13 ms. A loose guard (mean < 400 ms inside jest) catches regressions.

## Bugs found and fixed (each has a regression test)

1. **Meal search took up to 6.5 s per week on infeasible profiles.** Per-day state (the no-repeat window, slot pools, weight factors) was recomputed for every attempt. Each added snack also got 30 attempts, across 3 windows × 7 protein steps. Fixes:
   - per-day caches (`DaySearch`);
   - cuisine preference resolved once per pool (`relaxPool`);
   - O(1) move scoring in `solvePortions`;
   - 10 attempts per extra snack;
   - stop adding snacks once every menu overshoots;
   - branch-and-bound: window and protein-step re-plans stop once they cannot beat the best plan.

   The result is about 5× faster on the mean and 10× on the max. Tests: the property runtime guard, plus the unchanged `real-catalogue` acceptance.
2. **Empty or corrupt inputs.**
   - An empty exercise pool produced `empty_session` "workouts" and repeated empty fingerprints.
   - Days with no recipes had no warning.
   - `adjustmentKcal: NaN` gave NaN kcal and invalid portions.
   - `adjustmentKcal: 1e6` gave 1,003,020 kcal.
   - A 300 kg, 230 cm man got 8,280 kcal.

   Fixes:
   - empty sessions are dropped;
   - a new warning code, `no_candidates`, gives the reason;
   - every main meal on an empty day is warned;
   - non-finite deltas are ignored;
   - `KCAL_CEILING` = 5,000 (new safety flag `ceiling_applied`; `GoalCalories.ceilingApplied`; `dayTypeMacros` takes an optional ceiling).

   Tests: `edge-cases.test.ts`.
3. **Weekly volume above the 20-set cap.** Six 20-minute sessions gave 21 shoulder sets, because every item was already at its minimum sets and no accessory could be dropped (sessions had ≤ 3 items). A last-resort pass now takes single sets off the biggest contributor, never below 1 set.
4. **A muscle group could get no work all week** (biceps, hamstrings or quads on 1-day and short weeks). Fixes:
   - a 1-day week uses a new all-groups `full_1` template (`rotationFor`);
   - a week-level `coverGroups` pass swaps a late accessory for an exercise from an unused slot, or adds a second exercise to a used slot, for any trainable group that has 0 sets.
5. **Duplicate sessions.** The post-passes (coverage, over-volume drops, variant repair) could leave a session identical to one of the last 10. High-frequency full-body weeks rotate few accessories. A new `repairFingerprints` pass re-orders the non-main tail, then swaps a non-main item. A swap never uses an exercise from a later session in the week, so the consecutive-variant rule holds.
6. **Loads not on real plates.** A logged 61.3 kg came back as 63.8 kg, and imperial users got kg steps (+2.5 kg is 5.51 lb). Progression now runs in the user's unit (+5/+10 lb) and lands on 2.5 kg or 5 lb steps (`plateLoadKg`, `PLATE_STEP`). Held loads round down; new loads round to the nearest step.
7. **The week after a deload restarted from the deload load (−10 %).** `lastWorkingSets` now skips deload sessions while a normal session exists.
8. **Back-to-back deloads.** A block-end deload was followed by a stall deload the next week, because the new block forgot the last deload and the light deload sessions counted as stalls. Stall detection now ignores deload days, and `lastDeloadWeekStart` carries across blocks.

## Edge cases (`edge-cases.test.ts`, 21 tests)

- Extreme bodies:
  - 120 cm / 30 kg woman;
  - 230 cm / 300 kg man;
  - 230 cm / 30 kg;
  - 120 cm / 300 kg;
  - aged 100;
  - aged 13 (general plan + `safety_general_plan`).
- Check-in deltas NaN, ±Infinity and ±1e6.
- 1 day (`full_1`, all groups).
- 7 days (PPL ×7, distinct sessions, ≤ 20 sets).
- Six 20-minute sessions.
- Empty kit.
- Vegan + nuts + peanut + gluten.
- Keto with pork disliked (the profile has one `dietType`, so "keto + halal" is approximated: halal is not enforced for keto users; this is a product gap and needs a multi-diet profile).
- 6 meals a day.
- Empty catalogues, all 13 allergens + vegan, never-show everything, `planDay` on an empty catalogue.

## 16-week progression (`progression-sim.test.ts`)

- All hits (intermediate, 4-day upper/lower):
  - deloads fall at weeks 4, 9 and 14, all `block_end`;
  - every load is a multiple of 2.5 kg;
  - a hit at the top of the range adds exactly +2.5 kg (upper) or +5 kg (lower) and restarts at the bottom of the range (66 pairs checked);
  - deload weeks have RPE 6, the bottom of the range, ≤ 3 sets, and a load never above the last normal load;
  - the week after a deload goes above the deload load and ≥ the pre-deload load;
  - most main lifts climb.
- Stalls: main lifts stalled from week 1 trigger a `stall` deload by week 3, with no deload the week after.
- Misses: a missed session never raises the load.
- Random hit/miss/stall mixes (12 seeded profiles, metric and imperial, 2–6 days): loads are finite, 0–500 kg and on plate steps, and there are no back-to-back deloads unless requested.
- Imperial: every load is a whole 5 lb step, and hits add +5 lb (upper) or +10 lb (lower).

## API additions (all additive)

- `ProfileSchema.daysPerWeek` now accepts 1–7 (was 2–6). `chooseSplit` gives 1 → full body and 7 → PPL. `DEFAULT_WEEKDAYS` gains entries for 1 and 7.
- New exports: `KCAL_CEILING`, `rotationFor`, `relaxPool`, `plateLoadKg`, `PLATE_STEP`, `MEAL_ATTEMPTS`, `EXTRA_SNACK_ATTEMPTS`.
- New template: `TEMPLATES.full_1`.
- Additions to existing types:
  - `PlanWarningCode` gains `'no_candidates'`;
  - `SafetyFlag` gains `'ceiling_applied'`;
  - `GoalCalories.ceilingApplied?`;
  - `PlanningContext.trainableGroups?`.

The app still clamps days to 2–6 (onboarding offers 2–6), so this change does not alter app behaviour.
