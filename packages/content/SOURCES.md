# Sources and licences

This file is the licence log required by build bible sheets 24 and 29 (it serves as `LICENSES.md` for the content package).

## Food nutrients — USDA FoodData Central (public domain)

- **Publisher:** U.S. Department of Agriculture, Agricultural Research Service, FoodData Central — https://fdc.nal.usda.gov/
- **Licence:** Public domain, published under CC0 1.0. USDA asks for citation; no permission needed for commercial use. See https://fdc.nal.usda.gov/download-datasets (licence notice) and https://creativecommons.org/publicdomain/zero/1.0/.
- **Datasets used:**
  - SR Legacy, April 2018 release (`FoodData_Central_sr_legacy_food_csv_2018-04.zip`) — 271 foods.
  - FNDDS 2019–2020, October 2022 release (`FoodData_Central_survey_food_csv_2022-10-28.zip`) — 4 foods SR Legacy lacks: paneer, ghee, naan, hummus.
- **Nutrients taken:** Energy (kcal, nutrient 1008/208), Protein (1003/203), Total lipid (1004/204), Carbohydrate by difference (1005/205), Fibre (1079/291), per 100 g edible portion.
- **Per item:** every record in `foods.json` carries `source.dataset`, `source.fdcId` and the exact USDA `source.description`, so each value can be traced and re-checked.
- **Rounding:** kcal to the nearest integer; protein, carbs, fat and fibre to 0.1 g. Missing USDA fibre values are stored as 0 (meat, fish and some spices).
- **Allergen flags** are Repwise's own mapping to the EU FIC 14 major allergens. USDA does not publish allergens. They are conservative for composite items (for example, kimchi carries fish and crustaceans, curry powder carries mustard, chicken/beef/vegetable stock carries celery).

Suggested citation: U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2019. fdc.nal.usda.gov.

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
