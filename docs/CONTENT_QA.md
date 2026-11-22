# Content QA log

Owner: `packages/content`. Sheet 29 targets 600 recipes at launch. This file records each audit, what was fixed and what still needs a human.

## 22 Nov 2026: US/UK meals first (611 → 759 recipes)

148 everyday American, British and Canadian-friendly recipes (american 124, british 122 in total) via the normal pipeline (authored fields only, `npm run build` computes macros, allergens, tags and main protein from foods.json). Overnight oats, egg-white scrambles, Greek yogurt bowls, porridges, protein pancakes, veggie full English; turkey clubs, Caesar wraps, jacket potatoes, BLT, chicken and avocado sandwiches; grilled chicken with sweet potato, steak with roast veg, salmon traybakes, cottage and shepherd's pies, chilli, turkey meatballs, fish pie, roast chicken dinner; protein shakes, cottage cheese with fruit, jerky, rice cakes with peanut butter; maple salmon and poutine bowl for Canada. Gap fillers for the new regional opt-in rule (D-CUISINE-DEFAULT): about 20 keto, 43 vegan (23 with ≥ 30 g protein), large breakfasts, gluten-free egg-free vegetarian. Four drafts were dropped or changed by QA (duplicate ingredient list, Atwater mismatch over 8 %, a 539 kcal snack). Content QA 56/56 green. Needs the usual 10 % human spot-check.

## 20 Nov 2026: audit of 325 recipes, 283 exercises, 282 foods; expansion to 611 recipes

| | Before | After |
|---|---|---|
| Recipes | 325 | 611 |
| Foods | 282 | 294 |
| Exercises | 283 | 283 (21 corrected) |
| Content tests | 43 | 56 |

### How it was checked

- **Foods:** every record compared with the USDA downloads it cites (SR Legacy April 2018 CSV, FNDDS October 2022 CSV): description and all five nutrients. All 282 matched, so no nutrient value changed. The 12 new foods were taken from the same SR Legacy file, never typed from memory.
- **Recipes:** nutrition, allergens, diet tags and main protein are computed by `scripts/build.ts` and pinned by tests, so the audit covered the inputs: food allergens and origins, then scripted checks on every recipe (steps that name a food missing from the ingredient list, cooking with `cookMin` 0, minutes in the steps above the stated time, salt, fat and dry-grain weight per serving, cost tier against ingredients, ingredient-set overlap for duplicates), then a read of every title, serving count, time and main ingredient weight.
- **Exercises:** primary and secondary muscles, equipment, pattern, level, per-side flag, mechanics and contraindications read for all 283; scripted checks for equipment named in the text but missing from `equipment`, duplicate names and aliases; the text of the 27 highest-risk movements read in full.

### Food fixes (allergens are conservative for composite products)

| Food | Change | Why |
|---|---|---|
| `worcestershire` | + gluten | barley malt vinegar in the common UK recipe |
| `miso` | + gluten | barley miso is common |
| `mayonnaise` | + mustard | common ingredient |
| `naan` | + eggs | enriched dough |
| `english-muffin` | + milk, origin dairy | milk or whey in most commercial muffins |
| `beef-jerky` | + gluten, soybeans | soy sauce marinade |
| `ketchup` | + celery | spice extracts |
| `sriracha` | + sulphites | preservative |
| `bagel` | + sesame | the USDA record itself "includes onion, poppy, sesame"; found by the new keyword test |

The build recomputed the allergens and diet tags of every recipe that uses these foods.

### Recipe fixes

| Recipe | Change |
|---|---|
| `chana-chaat`, `sprout-salad-chaat`, `turkey-club-wrap`, `smoked-salmon-bagel`, `ploughmans-plate`, `smoked-mackerel-pate`, `guacamole-veg`, `tuna-tabbouleh` | `cookMin` was 0 although the steps boil, grill, toast or soak; now 3 to 15 min |
| `shrimp-zoodle-scampi` | same ingredient list as `garlic-prawn-courgetti`; reworked as chilli-tomato prawns with courgetti (dairy-free) |
| `grilled-hammour-salad` | cost tier 3 to 2 (haddock) |

No recipe had a wrong diet tag or a missing allergen once the food flags above were corrected: tags are derived from ingredient origins, and no step names a food that is missing from its ingredient list.

### Exercise fixes

| Exercise | Change |
|---|---|
| `overhead-press`, `z-press`, `pike-push-up`, `kneeling-pike-push-up`, `landmine-shoulder-press` | secondary `upper_back` replaced by `traps` (upper traps rotate the shoulder blade in overhead pressing; the rhomboid group does not drive it) |
| `push-press` | + secondary `traps` |
| `overhead-carry` | + secondary `front_delts` |
| `deep-squat-hold` | primary `adductors, glutes`, secondary `calves, lower_back` (hip flexors are shortened, not worked, in a deep squat) |
| `pallof-press`, `band-pallof-press`, `cable-woodchop` | `unilateral` true (the steps say to switch sides) |
| `sumo-deadlift` | level advanced to intermediate, in line with the conventional deadlift |
| `bench-dip`, `machine-triceps-dip`, `floor-triceps-dip` | mechanics compound (shoulder and elbow both move) |
| `barbell-bench-press`, `incline-barbell-bench-press`, `close-grip-bench-press`, `barbell-back-squat`, `skull-crusher`, `handstand-push-up` | one safety cue added (spotter or safety arms, grip, prerequisite) |

### New recipes (286)

Pakistani 56, Indian 38, Middle Eastern 35, Gulf 22, North African 16, Mediterranean 23, Italian 11, American 18, British 14, Mexican 10, East Asian 13, Southeast Asian 10, global 20. All are original, built from foods in `foods.json`, and pass the schema, the computed-field check and the 8 % energy check.

| Balance | Before | After |
|---|---|---|
| Breakfast / lunch / dinner / snack | 74 / 203 / 184 / 49 | 121 / 385 / 371 / 85 |
| Budget (tier 1) | 179 | 350 |
| Quick (≤ 15 min in total) | 87 | 137 |
| Batch (4 servings or more) | 17 | 34 |
| Vegetarian / vegan | 161 / 77 | 287 / 101 |
| High protein | 188 | 354 |
| Pakistani + Indian | 63 | 157 |
| Middle Eastern + Gulf + North African | 56 | 129 |
| Foods used by no recipe | 41 | 0 |

### Automated checks added (`packages/content/test/qa.test.ts`)

- Every allergen has a keyword rule; a food whose id, name or USDA description matches a keyword must carry that allergen; every flag must be explained by a keyword or by a documented composite flag.
- Plant-origin foods must not carry animal words.
- Food energy ≈ 4P + 4C + 9F (25 %, or 50 % at 20 g fibre or more; vinegars exempt because of acetic acid). Recipe energy within 8 % was already tested.
- Fibre ≤ carbohydrate; no two foods cite the same FDC record.
- No orphan foods; no duplicate titles or identical ingredient lists; at most 3 g added salt per serving.
- At least 600 recipes with the sheet 29 balance pinned.

### Known limits, for the human review that sheet 29 requires

- **Paneer:** the USDA FNDDS record (2341143) lists 22.5 g carbohydrate per 100 g, far above typical paneer (about 3 to 6 g). The value is USDA's and was kept; paneer recipes therefore overstate carbohydrate and none is tagged low-carb. A nutrition reviewer should decide whether to switch record.
- **Proxies:** `mixed-berries` uses the USDA frozen strawberries record; `oatcakes` is a rye crispbread record; `artichoke-hearts` uses raw artichoke; chana dal is entered as dry chickpeas; vermicelli as pasta; regag bread as chapati; barberries as dried cranberries.
- **Mussels:** `mussels-tomato-garlic` and `seafood-fennel-stew` give the weight of mussel meat, not mussels in the shell (the first says so in its steps).
- **Near neighbours kept on purpose:** `chana-chaat`, `chana-salad-vegan` and `tofu-chana-chaat` share a base but differ in protein and dressing.
- **Bodyweight exercises that use furniture** (table rows, towel and door-frame pulls) are tagged `bodyweight`; their steps and cues tell the user to test the support first.
- Still open from sheet 29: a human spot-check of 10 % of recipes, a second allergen reviewer, and native-cook review of the Pakistani, Indian and Arab dishes (167 of the new recipes).
