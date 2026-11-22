# @repwise/content

Validated content catalogues for the Repwise planner, exercise library and meal plans.

| File | Records | What it is |
|---|---|---|
| `exercises.json` | 283 | Exercise library. Original text, placeholder Cloudinary media ids. Cardio carries Compendium MET values. |
| `recipes.json` | 759 | Recipes across 13 cuisines (US/UK first: american 124, british 122). Nutrition, allergens, diet tags and main protein are **computed**. |
| `foods.json` | 294 | Ingredients with per-100 g nutrients from USDA FoodData Central (public domain). |

The JSON files are the source of truth. `src/schemas.ts` holds the zod schemas and enums, `src/compute.ts` holds the pure derivation logic, and `src/index.ts` re-exports both plus the typed data.

## Commands

```bash
npm install
npm run build      # recompute recipe macros/allergens/tags/mainProtein and rewrite recipes.json
npm run verify     # integrity check; fails if recipes.json is stale
npm test           # content QA suite (node:test via tsx)
npm run check      # typecheck + verify + test (run before every commit)
```

Editing workflow: change authored fields only (never `perServing`, `allergens`, `dietTags`, `mainProtein`), run `npm run build`, then `npm run check`.

## Exercise fields (`ExerciseSchema`)

| Field | Type | Notes |
|---|---|---|
| `id` | kebab-case string | Stable forever. Used by plans, history and `alternatives`. |
| `name` | string | Display name. |
| `aliases` | string[] | Extra search terms (bible: "name, aliases"). |
| `pattern` | enum (23) | **Rotation group** for the uniqueness rules: `squat`, `hinge`, `lunge`, `push_h`, `push_v`, `pull_h`, `pull_v`, `carry`, `core_anti_extension`, `core_anti_rotation` (includes anti-lateral-flexion), `core_flexion`, `isolation_chest`, `isolation_shoulders`, `isolation_biceps`, `isolation_triceps`, `isolation_back`, `isolation_quads`, `isolation_hamstrings`, `isolation_glutes`, `isolation_calves`, `isolation_forearms`, `cardio`, `mobility`. Each has 6–20 variants. |
| `patternFamily` | enum | The coarse bible value (sheet 29): `squat / hinge / lunge / push_h / push_v / pull_h / pull_v / carry / core / isolation / cardio / mobility`. Derived from `pattern` (`PATTERNS` map). |
| `primaryMuscles` | Muscle[] ≥1 | Fixed heatmap list `MUSCLES`: chest, front_delts, side_delts, rear_delts, biceps, triceps, forearms, upper_back, lats, traps, lower_back, abs, obliques, hip_flexors, glutes, abductors, adductors, quads, hamstrings, calves. |
| `secondaryMuscles` | Muscle[] | Never overlaps primary. |
| `equipment` | Equipment[] ≥1 | **All** items are required. Values: bodyweight, dumbbell, barbell, ez_bar, trap_bar, kettlebell, cable, machine, smith_machine, band, bench, squat_rack, pull_up_bar, dip_station, landmine, box, medicine_ball, suspension_trainer, ab_wheel, stability_ball, weight_plate, sled, jump_rope, treadmill, bike, rower, elliptical, stair_climber, foam_roller, mat. |
| `level` | `beginner \| intermediate \| advanced` | Maps to bible `difficulty` 1 / 2 / 3. |
| `unilateral` | boolean | One side at a time (log reps per side). |
| `mechanics` | `compound \| isolation` | |
| `met` | number, cardio only | Required for cardio: MET from the 2024 Compendium of Physical Activities (code per exercise in SOURCES.md). Drives the RW-24 calorie estimate. |
| `contraindications` | enum[] | shoulder, elbow, wrist, neck, lower_back, hip, knee, ankle. Used to filter candidates for users who report a limitation. Not medical guidance. |
| `instructions` | string[3–5] | Short steps, original wording. |
| `cues` | string[2–4] | Coaching cues (bible "tips"). |
| `commonMistakes` | string[2–4] | |
| `mediaId` | string | Cloudinary public id, always `repwise/exercises/<id>`. Placeholder until media is licensed (see MEDIA.md). |
| `alternatives` | id[1–5] | 3 swaps from the same `pattern`, ranked by muscle overlap, different equipment and similar level (RW-13). |
| `source`, `licence` | `repwise-original`, `proprietary` | Text written for Repwise. Media licence is recorded per asset when imported. |

## Food fields (`FoodSchema`)

| Field | Type | Notes |
|---|---|---|
| `id` | kebab-case | Referenced by `recipes[].ingredients[].foodId`. |
| `name` | string | Display name (UK/US neutral where possible). |
| `category` | enum | poultry, meat, seafood, eggs, dairy, legumes, plant_protein, grains, bread_pasta, vegetables, fruit, nuts_seeds, fats, condiments, sweeteners, herbs_spices. |
| `origin` | enum | plant, dairy, egg, honey, fish, shellfish, poultry, meat, pork. Drives diet tags. Composite foods use their strictest ingredient (e.g. Worcestershire = fish, naan = dairy, chicken stock = poultry). |
| `per100g` | `{kcal, protein, carbs, fat, fibre}` | kcal integer; grams to 0.1. Carbs are USDA "by difference" (they include fibre). |
| `allergens` | Allergen[] | EU 14: celery, gluten, crustaceans, eggs, fish, lupin, milk, molluscs, mustard, nuts, peanuts, sesame, soybeans, sulphites. |
| `source` | `{dataset, fdcId, description, licence}` | Exact USDA FDC record the values came from. |

## Recipe fields (`RecipeSchema`)

Authored:

| Field | Type | Notes |
|---|---|---|
| `id` | kebab-case | Stable. |
| `title` | string | Bible `title`. |
| `cuisine` | enum | american, british, mediterranean, italian, middle_eastern, gulf, north_african, pakistani, indian, east_asian, southeast_asian, mexican, global. Each has ≥ 10 recipes. |
| `slots` | MealSlot[] | breakfast, lunch, dinner, snack. Array because many dishes fit lunch and dinner (bible had a single `slot`). |
| `servings` | int | Ingredient grams are for the whole recipe. |
| `prepMin`, `cookMin` | int minutes | Bible `prep_min`; total time = prep + cook. |
| `costTier` | 1 \| 2 \| 3 | Bible `cost_level`: budget / mid / premium per serving. |
| `scalable` | `{min, max}` | Portion multiplier range for the portion solver. |
| `ingredients` | `{foodId, grams, note?}[]` | Raw/as-purchased weight unless the food itself is cooked or canned-drained. |
| `steps` | string[2–8] | Original wording. |
| `mediaId` | string | `repwise/recipes/<id>` placeholder. |
| `source`, `licence` | `repwise-original`, `proprietary` | |

Computed by `scripts/build.ts` (never hand-edited):

| Field | Rule |
|---|---|
| `perServing` | Σ(food per100g × grams/100) ÷ servings; kcal rounded to int, grams to 0.1. Bible `per_portion`. |
| `allergens` | Union of ingredient allergens, EU-14 order. |
| `dietTags` | `vegetarian` (plant/dairy/egg/honey only), `vegan` (plant only), `pescatarian` (no meat, poultry or pork; vegetarian dishes qualify), `halal_friendly` (no pork; meat must still be bought halal), `high_protein` (≥ 25 g, or ≥ 15 g for snack-only, and ≥ 25 % of energy), `low_carb` (≤ 25 g and ≤ 20 % of energy), `gluten_free`, `dairy_free` (from allergens). Thresholds live in `TAG_RULES`. |
| `mainProtein` | Protein family of the ingredient contributing the most protein: chicken, turkey, beef, lamb, goat, pork, fish, shellfish, eggs, dairy, legumes, soy, nuts_seeds, grains, other. For the "no same protein twice a day" rule. |

## Engine adapter (`src/toEngine.ts`)

`toEngineCatalogues()` (memoised: `engineCatalogues()`) returns `{ exercises, recipes, excluded }` in `@repwise/engine` shape. The mapping tables (`EQUIPMENT_TO_ENGINE`, `ALLERGEN_TO_ENGINE`, `DIET_TAG_TO_ENGINE`, `PROTEIN_TO_ENGINE`, …) are exhaustive, so a new content enum value fails the typecheck until it is mapped. Decisions D26–D28 list every mapping. Every cardio exercise carries a Compendium `met`, so nothing is excluded (the empty list is pinned in `test/toEngine.test.ts`). Ingredient grams become per serving; nutrition is carried, never recomputed.

## Content QA (tests)

`test/toEngine.test.ts` parses every item with the engine schemas. `test/content.test.ts` checks: schema validity; size targets; no duplicate ids; ingredient and alternative references; 6–20 variants per pattern; every bible pattern family present; a home-friendly variant for each strength pattern; ≥ 10 recipes per diet tag and cuisine; ≥ 30 per slot; stored computed fields equal recomputed ones; kcal within 8 % of 4P + 4C + 9F; per-serving kcal sane for each slot; allergens propagate; diet tags never contradict ingredient origins; no empty steps; no banned medical wording (cure, treat, diagnose, prescribe).

`test/qa.test.ts` (added with the 600-recipe expansion, see `docs/CONTENT_QA.md`) checks: every allergen has a keyword rule and every food whose name or USDA description matches a keyword carries that allergen; every allergen flag is explained by a keyword or a documented composite flag; plant-origin foods have no animal words; food kcal ≈ 4P + 4C + 9F; fibre ≤ carbohydrate; no shared FDC record; no orphan foods; no duplicate titles or ingredient lists; ≤ 3 g salt per serving; ≥ 600 recipes with the sheet 29 balance (Pakistani/Indian, Arab, Mediterranean, breakfast, snack, budget, quick, meal prep, vegetarian, high protein).

## Known limits

- Coverage targets (tests): every split slot has ≥ 2 variants for the bodyweight-only and home-dumbbell kits; the engine's real-catalogue acceptance plans vegan, keto and vegetarian + gluten + egg-allergy weeks with no skipped main meal (D33–D36).
- TVP / soya chunks use the USDA "Soy flour, defatted" record (the raw material TVP is extruded from). Seitan is made from vital wheat gluten and counts as `grains` for the main-protein rule.
- USDA kcal for tofu, fruit and some vegetables sit about 9 % below 4P + 4C + 9F, so tofu-led recipes include a grain to stay inside the 8 % QA check.
- Vegetarian tags assume a vegetarian (microbial-rennet) hard cheese when parmesan or pesto is used.
- `halal_friendly` only excludes pork and alcohol (none in the catalogue); the user must still buy halal meat.
- Nutrient values are USDA averages for generic foods, not brands. Bible QA still requires a human spot-check of 10 % of recipes, a second allergen reviewer and native-cook review of desi/Arab dishes before launch.
