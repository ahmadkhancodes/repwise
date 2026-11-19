# @repwise/engine

The deterministic planner for Repwise (build bible sheet 28; decision D2: in v1 the rules engine **is** the planner).
It is pure TypeScript with no React, Expo, network or clock access. The same code runs on the phone (the offline planner) and in the Cloudflare Worker.

```bash
npm install
npm test            # jest (ts-jest)
npm run typecheck   # tsc --noEmit (strict)
```

The only runtime dependency is `zod`.

## Rules the code follows

- **No hidden inputs.** Nothing reads `Date.now()` or `Math.random()`. Callers pass `now` (epoch ms) and calendar dates (`'YYYY-MM-DD'`, local to the user).
- **Same input, same plan.** Randomness comes from a seeded PRNG (`createRng`, mulberry32 + cyrb53). If you give no seed, the seed is derived from the profile and the week.
- **DST-safe dates.** Date arithmetic works on day numbers through `Date.UTC`, so a week is always 7 consecutive local dates, whatever the device's time zone.
- **No medical advice.** The engine returns numbers and flags only. The app writes the user-facing copy (for example "consult a professional" when `consultProfessional` is set).

## API

### Planner (`planner.ts`)

| Function | What it does |
|---|---|
| `planWeek(profile, history, catalogues, { now, weekStart, seed?, noRepeatDays?, adjustmentKcal? })` | Returns a `WeekPlan`: the sessions on training dates, 7 `DayMealPlan`s, targets, split, block or deload state, volume, `warnings` and `validation`. |
| `planDay(profile, history, catalogues, { now, date, ... })` | Returns one day, taken from the week plan that contains it, so the preview always matches the week. |
| `swapExercise({ profile, history, catalogues, session, index, now, count? })` | Returns up to 3 exercise IDs. They share the same pattern, fit the user's equipment, are safe for their injuries, are not already in the session and were not used in the last 2 sessions. |
| `swapMeal({ profile, history, catalogues, day, index, now, count? })` | Returns up to 3 `PlannedMeal`s within ±10% of the original meal's kcal and protein. They are safe, outside the no-repeat window and use a protein source not already used that day. |
| `planWeekWithVariety(..., { hook })` | Async. Builds the rules plan first, then asks an optional `LlmVarietyHook` to pick items. Each part (workouts, meals) is accepted only if the hook's output parses with the zod schema **and** passes `validate`. Otherwise the rules part ships, with an `llm_rejected` or `llm_error` warning. |
| `appendPlanToHistory(history, plan)` | Adds a finished week to the history (sessions with fingerprints and pattern keys, meals and block state). Persist `plan.block` back as `history.block`. |

### Validator (`validate.ts`)

- `validatePlan(ctx, plan)`, `validateSessions(ctx, sessions)` and `validateDays(ctx, days)` return `{ ok, errors: ValidationError[] }`.
- Every error is a discriminated union with a `code`:
  - IDs and safety: `unknown_exercise`, `equipment_unavailable`, `injury_conflict`, `level_too_high`, `never_show`, `duplicate_exercise`, `invalid_prescription`.
  - Session structure and uniqueness: `empty_session`, `session_outside_week`, `duplicate_session_date`, `fingerprint_mismatch`, `fingerprint_repeat`, `consecutive_variant_repeat`.
  - Volume: `volume_below_range`, `volume_above_range`.
  - Meals: `unknown_recipe`, `slot_mismatch`, `allergen`, `diet_mismatch`, `disliked_ingredient`, `portion_out_of_bounds`, `macro_mismatch`, `kcal_out_of_range`, `protein_out_of_range`, `protein_source_repeat`, `recipe_repeat_window`, `day_outside_week`.
- Build `ctx` with `buildContext(profile, history, catalogues, opts)`. When you check a plan made elsewhere, first set `ctx.volumeRange = plan.volumeRange` and `ctx.noRepeatDays = plan.noRepeatDays`. Those are the feasible limits the rules planner settled on.

### Maths modules

| Module | Exports |
|---|---|
| `nutrition.ts` | `bmrMifflin`, `activityLevel` (lifestyle + training days → 1.2/1.375/1.55/1.725), `tdee`, `goalCalories` (fat loss −15% when BMI < 27 or −20% otherwise; gain +10% in the 8–12% range; floor = max(BMR×1.1, 1,200 for women / 1,500 for men)), `macroTargets` (protein 1.6–2.2 g/kg, fat ≥ 0.6 g/kg, carbs = rest, keto 30 g carbs; g/kg is computed on min(weight, weight at BMI 27)), `dayTypeMacros` (training +15% carbs, rest −15%), `weeklyAdjustment` (7-day average vs the previous 7 days against the expected change, giving ±100–200 kcal), `weightTrend`, `assessSafety`, `computeTargets`, unit conversions (`kgToLb`, `cmToFtIn`, `kcalToKj`, …) |
| `met.ts` | `metKcal(met, kg, minutes)` |
| `split.ts` | `chooseSplit` (2–3 days full body, 4 upper/lower, 5–6 PPL, or the user's preference), `TEMPLATES` and `SPLIT_ROTATIONS`, `trainingWeekdays`, `exercisesPerSession`, `setsPerSession`, `volumeTargets` (10/12/14 starting sets by experience, +1 per week in the block, capped by capacity and by 16/18/20), `allocateSets`, `weeklyVolume`, `groupContribution` (primary = 1, secondary = 0.5) |
| `progression.ts` | `epley1RM`, `brzycki1RM`, `loadForReps`, `percentTable`, `doubleProgression` (+2.5 kg upper / +5 kg lower, or +5/+10 lb; +1 rep for bodyweight; holds at RPE 10), `rpeLoad`, `startingLoad`, `stalledSessions`, `deloadDecision` (last week of the block or 2 stalled sessions), `deloadSets` (−40%), `platesPerSide` (kg/lb, custom bar, limited pairs) |
| `variety.ts` | `sessionFingerprint`, `fingerprintIsFresh` (last 10), `lastVariantsByPattern`, `consecutiveRepeats`, `blockedRecipes` (\|Δdays\| < window), `clampNoRepeatDays` (7–30, default 14), `recipeWeight` and `exerciseWeight` (more-like-this, cuisine rotation, grocery re-use, protein-share fit, recent-use decay), `createRng` |
| `heatmap.ts` | `muscleHeatmap(sets, exById, now)`: per-muscle fatigue and recovery with half-life decay. Also `meanRecovery` and `imbalanceRatio` (for card C1). |
| `candidates.ts` | `exerciseCandidates`, `slotCandidates`, `recipeCandidates`. Hard filters (diet, allergens, dislikes, never-show) are never relaxed. Soft filters relax in the order cuisine → time → budget. |
| `portion.ts` | `solvePortions(items, { kcal, protein })`: servings in 0.25 steps within each recipe's `scalable` bounds, aiming for kcal ±5% and protein ±10 g. |
| `dates.ts` | `weekDates`, `startOfWeek`, `addDays`, `daysBetween`, `weekdayMon0`, `localDateFromEpoch(ms, utcOffsetMin)` |

## How the planner works (sheet 28, steps 2 and 4)

**1. Context.** `buildContext` works out:

- the targets and the safety result (under 16, BMI < 18.5 with fat loss, or pregnancy all give a maintain plan with `consultProfessional`);
- the split and the training dates;
- the **block**: main lifts are held for 6/5/4 weeks by experience, and the last week is a deload;
- stall detection on the main lifts (best e1RM per day);
- the volume ranges;
- the candidate constraints;
- history from before `weekStart`.

Re-planning a week ignores that week's own history.

**2. Sessions.**

- The rotation continues after the last template in the history. With no rotation history, it starts with the most recovered main-lift muscles, using the heatmap.
- Main slots use the block's main lift.
- Other slots pick, by weight, from the slot's candidates. A candidate is excluded if it is already in the session, is a block main lift, or was a non-main variant for the same pattern key in the previous session.
- If the fingerprint matches one of the last 10, the planner retries, and from the 10th attempt it also reshuffles the order of the accessories.
- Sets are then allocated across the week to land each group in its range. The deload cut (−40%, RPE 6, load ×0.9) is applied after that.
- Loads come from double progression on the last logged sets. `null` means bodyweight, or calibrate in the first session.

**3. Meals.** Each day's slots come from `mealsPerDay`: 2 gives lunch and dinner, 3 adds breakfast, and 4–6 add snacks. For each slot the planner:

- picks from the pool, minus the no-repeat window and any protein source already used that day;
- weights the pick by more-like-this, preferred cuisines, the cuisine rotation penalty, grocery re-use (non-staple ingredients used 1–2 times so far) and protein-share fit;
- then runs the portion solver, with up to 30 attempts.

If the targets still can't be reached, the planner adds snacks, up to 8 eating occasions (`extra_snack_added`). A snack slot with no eligible recipe is skipped. If the catalogue can't support the window, it shrinks towards 7 days (`repeat_window_relaxed`).

**4. Validation.** The planner runs `validatePlan` and stores the result in `plan.validation`. If volume can't be reached with the user's days, time and equipment, the rules plan's figure becomes the enforced range, with a `volume_capped` warning. This keeps the rules plan the best feasible plan.

## Catalogue contract (for `packages/content`)

`exercises.json` must parse with `ExerciseCatalogueSchema` and `recipes.json` with `RecipeCatalogueSchema`. Both are arrays with unique IDs.

| Schema | Fields |
|---|---|
| `ExerciseSchema` | `id` (slug), `name`, `aliases[]`, `pattern` (`PATTERNS`), `primaryMuscles[]` and `secondaryMuscles[]` (`MUSCLES`, no overlap), `equipment[]` (`EQUIPMENT`, all required; `bodyweight` = nothing needed), `level` 1–3, `unilateral`, `mediaId` (Cloudinary public_id), `contraindications[]` (`INJURIES`), `compound?`, `met?` (required for cardio), `steps` 3–6, `tips` 2–4, `source`, `licence` |
| `RecipeSchema` | `id` (slug), `name`, `cuisine` (`CUISINES`), `slots[]` (`breakfast`, `lunch`, `dinner`, `snack`), `dietTags[]` (`DIET_TAGS`), `allergens[]` (`ALLERGENS`), `proteinSource` (`PROTEIN_SOURCES`; `none` is exempt from the once-a-day rule), `ingredients[]` (`{ id, name, grams, fdcId?, aisle? }`, unique IDs), `perServing` (`{ kcal, protein, carbs, fat, fibre }`; kcal must agree with 4/4/9 within max(25 kcal, 12%)), `prepMin`, `costTier` 1–3, `scalable` (`{ min, max }`, default 0.5–3), `steps[]`, `imageId?` |

Diet matching:

- `halal` requires the `halal` tag.
- `vegetarian` accepts `vegetarian` or `vegan`.
- `pescatarian` accepts `pescatarian`, `vegetarian` or `vegan`.
- `vegan` requires `vegan`.
- `keto` requires `keto`.

Engine inputs and LLM output also have schemas:

- inputs: `ProfileSchema`, `HistorySchema` (sessions, sets, meals, weights, block, signals);
- LLM output: `LlmWorkoutOutputSchema` (`{sessions:[{day,title,items:[{exercise_id,sets,reps,rest_s}]}]}`) and `LlmMealsOutputSchema` (`{days:[{date,meals:[{slot,recipe_id}]}]}`).

The Worker should use these to check LLM output before it calls the engine.

## Tests

The test suite is in `test/`. The fixture catalogues are in `test/fixtures/`: about 150 exercises and about 320 recipes, generated with nutrition computed from ingredient grams.

- Formula fixtures for BMR, TDEE, floors, macros, 1RM and plates.
- Edge cases: ages 16 and 100, weights 30 and 300 kg, every goal, both sexes, metric and imperial.
- DST weeks: 2026-03-08, 03-29, 10-25 and 11-01.
- **60-session uniqueness**: 6-day PPL, 4-day upper/lower and 3-day full body (gym and home), with no fingerprint repeated within a rolling 10 and no repeated consecutive variants.
- **100+ generated days** checked independently for kcal ±5%, protein ±10 g, allergens, diet, slots and protein sources.
- Determinism with the same seed.
- Blocks and deloads, progression and stalls.
- Swaps.
- LLM hook acceptance and fallback.
- Validator mutation tests for every error code.
