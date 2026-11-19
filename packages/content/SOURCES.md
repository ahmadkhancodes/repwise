# Sources and licences

This file is the licence log required by build bible sheets 24 and 29 (it serves as `LICENSES.md` for the content package).

## Food nutrients — USDA FoodData Central (public domain)

- **Publisher:** U.S. Department of Agriculture, Agricultural Research Service, FoodData Central — https://fdc.nal.usda.gov/
- **Licence:** Public domain, published under CC0 1.0. USDA asks for citation; no permission needed for commercial use. See https://fdc.nal.usda.gov/download-datasets (licence notice) and https://creativecommons.org/publicdomain/zero/1.0/.
- **Datasets used:**
  - SR Legacy, April 2018 release (`FoodData_Central_sr_legacy_food_csv_2018-04.zip`) — 278 foods (7 added 19 Nov 2026: vital wheat gluten 168147, soy flour defatted 174275 used for TVP / soya chunks, SILK plain soy yogurt 175227, red lentils 174284, chickpea flour 174288, hemp seed 170148, macadamia nuts 170178).
  - FNDDS 2019–2020, October 2022 release (`FoodData_Central_survey_food_csv_2022-10-28.zip`) — 4 foods SR Legacy lacks: paneer, ghee, naan, hummus.
- **Nutrients taken:** Energy (kcal, nutrient 1008/208), Protein (1003/203), Total lipid (1004/204), Carbohydrate by difference (1005/205), Fibre (1079/291), per 100 g edible portion.
- **Per item:** every record in `foods.json` carries `source.dataset`, `source.fdcId` and the exact USDA `source.description`, so each value can be traced and re-checked.
- **Rounding:** kcal to the nearest integer; protein, carbs, fat and fibre to 0.1 g. Missing USDA fibre values are stored as 0 (meat, fish and some spices).
- **Allergen flags** are Repwise's own mapping to the EU FIC 14 major allergens. USDA does not publish allergens. They are conservative for composite items (for example, kimchi carries fish and crustaceans, curry powder carries mustard, chicken/beef/vegetable stock carries celery).

Suggested citation: U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2019. fdc.nal.usda.gov.

## Cardio MET values — 2024 Adult Compendium of Physical Activities

- **Source:** Herrmann SD, Willis EA, Ainsworth BE, et al. 2024 Adult Compendium of Physical Activities: a third update of the energy costs of human activities. *Journal of Sport and Health Science* 2024;13(1):6–12. Values read from https://pacompendium.com (conditioning exercise, bicycling, running and walking pages), 19 Nov 2026.
- **Use:** facts (a number per activity code), cited per exercise below; no text copied. The engine uses MET × kg × hours for the RW-24 calorie estimate. Where several codes fit, the general or moderate code is used so estimates stay conservative.

| Exercise id | Code | MET | Compendium activity |
|---|---|---|---|
| `treadmill-run` | 12150 | 8.0 | Running (Taylor Code 200), general |
| `incline-walk` | 17034 | 5.3 | Climbing hills, no load, 1 to 5% grade, moderate-to-brisk pace |
| `outdoor-walk` | 17200 | 4.8 | Walking, 3.5 to 3.9 mph, level, brisk, firm surface, walking for exercise |
| `stationary-bike` | 01200 | 6.8 | Bicycling, stationary, general |
| `bike-intervals` | 01305 | 8.8 | Bicycling, high intensity interval training |
| `rowing-machine` | 02071 | 5.0 | Rowing, stationary ergometer, general, < 100 watts, moderate effort |
| `elliptical` | 02048 | 5.0 | Elliptical trainer, moderate effort |
| `stair-climber` | 02065 | 9.3 | Stair treadmill ergometer, general |
| `jump-rope` | 02068 | 11.0 | Rope skipping exercise, general |
| `burpee` | 02020 | 7.5 | Calisthenics (pushups, sit ups, pull-ups, jumping jacks, burpees, battling ropes), vigorous effort |
| `mountain-climber` | 02020 | 7.5 | Calisthenics, vigorous effort (same class as burpees) |
| `kettlebell-swing-intervals` | 02040 | 7.5 | Circuit training, including kettlebells, some aerobic movement with minimal rest, vigorous |
| `sled-push-intervals` | 02210 | 7.0 | High intensity interval exercise, moderate effort (the Compendium has no sled-push code) |

## Exercise text — original (proprietary)

All exercise names, instructions, cues and common mistakes were written for Repwise in our own words. No text was copied from websites, books or commercial datasets. `source: "repwise-original"`, `licence: "proprietary"`.

## Recipes — original (proprietary)

All recipe titles, ingredient lists and steps were written for Repwise. Nutrition is computed from USDA values by `scripts/build.ts`. Dish names are common culinary names (not protected). `source: "repwise-original"`, `licence: "proprietary"`.

Before launch (bible sheet 29 QA): a human spot-checks 10 % of recipes, a second reviewer checks allergen tags, and native cooks review the Pakistani, Indian and Gulf/Arab dishes.

## Media — none yet

No images, GIFs or videos are in this package. `mediaId` values are placeholders. When media is licensed, record each source here with its licence, proof link and attribution needs, following MEDIA.md. Prefer CC0 / MIT / CC-BY (CC-BY needs the in-app attribution screen). Commercial GIF packs such as ExerciseDB need a paid licence first.

| Asset set | Source | Licence | Proof | Attribution needed |
|---|---|---|---|---|
| — | — | — | — | — |
