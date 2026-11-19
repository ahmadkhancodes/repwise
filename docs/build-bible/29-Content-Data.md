# 29 Content & Data

| Repwise · Content & Data |  |  |  |
| Exercise media, food & recipe data, licences, Cloudinary pipeline, content QA. |  |  |  |
| ← Back to Start Here |  |  |  |
| Sources (verify licence of every source before import — keep proof in /content/LICENSES.md) |  |  |  |
| Asset | Source | Licence / notes | Volume |
| Exercise data + GIFs | Client-selected open dataset(s) found by client's agent | Record licence + proof for each; prefer CC0 / MIT / CC-BY (with attribution screen). Commercially sold GIF packs (e.g. ExerciseDB) need a paid licence. | 500–1,300 |
| Food nutrients | USDA FoodData Central | Public domain (CC0) | ~400k foods |
| Packaged foods | Open Food Facts | ODbL database (share-alike on DB) + image licences; attribution | 3M+ |
| Recipes | Own recipes: AI-drafted from validated ingredient lists, nutrition computed from USDA, reviewed by a nutrition-literate editor; photos generated or licensed | Owned by client | 600 at launch (Pakistani/Indian, Arab, Mediterranean, Western, budget, vegetarian) |
| Photography | Licensed stock or shoot | Per-image licence | ~60 |
| Exercise media pipeline (Cloudinary) |  |  |  |
| Step | Detail |  |  |
| Ingest | Script reads dataset → normalises names, muscles, equipment, patterns → MongoDB 'exercises'. |  |  |
| Upload | Upload GIFs to Cloudinary folder /exercises/{id}; public_id = exercise id. |  |  |
| Transform | Deliver as f_auto,q_auto animated WebP/MP4 at 480px; poster frame for lists; light/dark-friendly background. |  |  |
| Cache | expo-image disk cache; prefetch today's session media on Wi-Fi. |  |  |
| Licence log | LICENSES.md + licence field per record; attribution screen in Settings if any CC-BY. |  |  |
| Exercise record schema |  |  |  |
| Field | Rule |  |  |
| id | stable slug |  |  |
| name, aliases | searchable |  |  |
| pattern | squat / hinge / push_h / push_v / pull_h / pull_v / lunge / carry / core / isolation / cardio |  |  |
| muscles | primary[], secondary[] (fixed muscle list for heatmap) |  |  |
| equipment | barbell / dumbbell / cable / machine / kettlebell / band / bodyweight / smith / … |  |  |
| difficulty | 1–3 |  |  |
| contraindications | shoulder / knee / lower_back / wrist … |  |  |
| media | cloudinary public_id + poster |  |  |
| steps, tips | 3–6 / 2–4 short lines |  |  |
| source, licence | required |  |  |
| Recipe & food record schema |  |  |  |
| Field | Rule |  |  |
| title, cuisine, slot | e.g. 'Chicken tikka bowl', pakistani, lunch |  |  |
| diet_tags | halal, vegetarian, vegan, keto, high_protein, gluten_free … |  |  |
| allergens | dairy, egg, gluten, nuts, peanut, soy, fish, shellfish, sesame |  |  |
| ingredients | [{fdc_id, name, grams}] — nutrition computed, never typed by hand |  |  |
| per_portion | kcal, protein, carbs, fat, fibre |  |  |
| prep_min, cost_level | for filters |  |  |
| scalable | min/max portion multiplier for the portion solver |  |  |
| Content QA checklist |  |  |  |
| •  Every exercise has media, muscles, equipment, pattern and licence. |  |  |  |
| •  Every recipe's nutrition recomputed from ingredients; spot-check 10% by a human. |  |  |  |
| •  Allergen tags double-checked by a second reviewer. |  |  |  |
| •  Desi/Arab dishes reviewed by native cooks for authenticity. |  |  |  |
| •  Dark-mode check of every GIF/photo. |  |  |  |
