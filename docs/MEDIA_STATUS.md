# Media status (exercise demos and recipe photos)

Last updated 19 Nov 2026 (branch `feat/media`).

## Cloudinary account: BLOCKED

- Every Cloudinary MCP call on 19 Nov 2026 was refused: `get-usage-details` and `search-assets` returned `disabled customer`, and `generate-image` returned `unauthorized: disabled account`. Each was retried; none worked.
- **Nothing is uploaded and no images were generated.** Credits used: **0**. Generation credits: **unknown** (the account could not be read).
- **Cloud name: unknown.** The MCP never returned it, and it is not in the repo. Leave `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` unset until uploads are done: the app then shows the offline placeholder and makes no media requests.
- **Owner action:** re-enable the Cloudinary account (Console → Settings → Billing, or Cloudinary support). Then either:
  - run `CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud> node scripts/media/upload-exercises.mjs --limit 3` (pilot), check the printed URLs, then run it without `--limit`; or
  - ask a session to do the same uploads with the Cloudinary MCP (`upload-asset` with each `url` → `publicId` pair in `packages/content/media/exercise-media-map.json`, tags `repwise, exercise`).

  Then put the cloud name here and in `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME`.

## Exercises: 179 of 283 matched, ready to upload

| | |
|---|---|
| Dataset | [free-exercise-db](https://github.com/yuhonas/free-exercise-db) by yuhonas (873 exercises, 2 JPEG frames each, 850 × 567) |
| Licence | **Unlicense** (public-domain dedication, commercial use allowed, no attribution required) |
| Proof | [LICENSE.md at commit f00c92c](https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/LICENSE.md); the README also says "Open Public Domain Exercise Dataset". Every source URL in the map is pinned to this commit. |
| Map | `packages/content/media/exercise-media-map.json`: our id → source id, start/end URLs, public ids, confidence, notes |
| App list | `packages/content/media/exercises-with-media.json`, exposed as `exerciseHasMedia(id)` from `@repwise/content` |
| Matched | **179**: 151 high (same exercise and equipment) + 28 medium (same movement, different implement or a minor variant, listed below) |
| Unmatched | **104**: placeholder, no request |
| Public ids | `repwise/exercises/<id>` (start frame), `repwise/exercises/<id>-end` (end frame); tags `repwise`, `exercise`, `source:free-exercise-db`, `licence:unlicense` |
| Checks | All 358 source URLs returned HTTP 200 (`build-exercise-media-map.mjs --check-urls`) |

### Provenance risk: owner sign-off needed before upload

The repository is Unlicense, but the photos appear to come from a commercial fitness site's exercise library. Its studio and a logo on the model's shirt are visible in the frames, and the instruction text uses that site's phrasing. free-exercise-db is a restructure of [wrkout/exercises.json](https://github.com/wrkout/exercises.json), whose README does not state where the images came from.

A public-domain dedication only covers rights the author held. If the photos were scraped, the Unlicense may not protect us. ExerciseDB-style paid packs were ruled out per sheet 29.

**Recommendation:** get the owner's (or counsel's) explicit acceptance before uploading. If it is not accepted, the matching work is reusable: change `source` in `scripts/media/exercise-match-decisions.json` to another licensed set (for example wger.de images, which are CC-BY-SA and need attribution) or to commissioned photos, then rebuild. We use only the images, never the dataset's instruction text; our text is original.

### Medium-confidence matches (28)

goblet-squat ← Goblet_Squat (kettlebell) · pause-squat ← Barbell_Squat · kettlebell-swing ← One-Arm_Kettlebell_Swings · single-leg-romanian-deadlift ← Kettlebell_One-Legged_Deadlift · forward-lunge ← Bodyweight_Walking_Lunge · walking-lunge ← Dumbbell_Lunges · deficit-reverse-lunge ← Elevated_Back_Lunge (barbell) · kettlebell-overhead-press ← Two-Arm_Kettlebell_Military_Press · kroc-row ← One-Arm_Dumbbell_Row · cable-single-arm-row ← Seated_One-arm_Cable_Pulley_Rows · seal-row ← Lying_Cambered_Barbell_Row · neutral-grip-pull-up ← V-Bar_Pullup · plate-pinch-carry ← Plate_Pinch · renegade-row ← Alternating_Renegade_Row (kettlebells) · cable-fly ← Cable_Crossover · rear-delt-fly ← Seated_Bent-Over_Rear_Delt_Raise · spider-curl ← Spider_Curl (EZ bar) · sissy-squat ← Weighted_Sissy_Squat · dumbbell-calf-raise ← Standing_Dumbbell_Calf_Raise · reverse-curl ← Reverse_Barbell_Curl · incline-walk ← Walking_Treadmill · kettlebell-swing-intervals ← One-Arm_Kettlebell_Swings · cat-cow ← Cat_Stretch · childs-pose ← Childs_Pose · pause-bodyweight-squat ← Bodyweight_Squat · standing-dumbbell-calf-raise ← Standing_Dumbbell_Calf_Raise · seated-dumbbell-calf-raise ← Dumbbell_Seated_One-Leg_Calf_Raise · bodyweight-triceps-extension ← Body_Tricep_Press

### Unmatched (104): no licensed demo, placeholder shown

heels-elevated-goblet-squat, landmine-squat, belt-squat, cyclist-squat, dumbbell-romanian-deadlift, kettlebell-deadlift, dumbbell-hip-thrust, smith-machine-hip-thrust, split-squat, barbell-reverse-lunge, lateral-lunge, curtsy-lunge, goblet-reverse-lunge, smith-machine-split-squat, cossack-squat, front-foot-elevated-split-squat, landmine-press, pike-push-up, landmine-shoulder-press, z-press, pendlay-row, band-row, assisted-pull-up, negative-pull-up, machine-lat-pulldown, band-lat-pulldown, trap-bar-carry, suitcase-carry, kettlebell-rack-carry, overhead-carry, body-saw, stability-ball-rollout, hollow-body-hold, plank-shoulder-tap, long-lever-plank, bear-crawl-hold, band-pallof-press, copenhagen-plank, bird-dog, side-plank-hip-dip, hanging-knee-raise, decline-sit-up, band-chest-fly, machine-lateral-raise, cable-y-raise, band-curl, band-pushdown, prone-y-raise, spanish-squat, wall-sit, cable-leg-curl, slider-leg-curl, banded-lateral-walk, clamshell, frog-pump, bodyweight-calf-raise, dead-hang, towel-hang, outdoor-walk, burpee, thoracic-rotation, ninety-ninety-hip-switch, deep-squat-hold, hamstring-stretch, pigeon-stretch, doorway-chest-stretch, ankle-mobility-drill, shoulder-dislocate, assisted-pistol-squat, dumbbell-front-squat, bodyweight-single-leg-rdl, bodyweight-good-morning, single-leg-hip-thrust, kickstand-dumbbell-rdl, door-frame-row, table-row, towel-door-row, tripod-dumbbell-row, sliding-floor-pulldown, towel-isometric-pulldown, single-arm-band-pulldown, floor-dumbbell-pullover, knee-push-up, archer-push-up, doorway-isometric-lateral-raise, wall-lean-lateral-raise, prone-t-raise, door-frame-face-pull, reverse-snow-angel, band-face-pull, side-lying-rear-delt-raise, towel-curl, door-frame-curl, table-bodyweight-curl, sliding-floor-fly, floor-dumbbell-fly, single-leg-calf-raise, bent-knee-calf-raise, kneeling-pike-push-up, wall-handstand-hold, prone-lat-pulldown, floor-triceps-dip, reverse-nordic, bridge-walkout

Most of these are home/bodyweight variants added in content round 2. They need commissioned or generated demos.

### App delivery (`src/features/library/logic/media.ts`)

- Image masters (`image/upload`), explicit WebP: thumb `c_fill,g_auto,h_160,w_160,q_auto,f_webp`, poster `c_limit,w_480,q_auto,f_webp`, end frame with the same transform on `<id>-end`.
- `MediaUrls.frames = [start, end]` plus the pure `crossfadeOpacity(elapsedMs)` (900 ms hold, 600 ms fade) drive the 2-frame "loop". `loop` = the start frame, so today's `ExerciseHero` shows a correct still image. **Follow-up for the library owner:** layer `frames[1]` over `frames[0]` in `ExerciseHero` with opacity from `crossfadeOpacity` (Reanimated), so the demo moves.
- No request unless the cloud name is set AND `exerciseHasMedia(id)`. A failed load still falls back to the placeholder through `onError`.

## Recipes: no photos yet

- Generation is impossible while the account is disabled, so **0 recipes have photos**.
- The 325 placeholder `mediaId`s were removed from `recipes.json`. `mediaId` is now optional in `RecipeSchema` (old data that has it still parses) and is set only for recipes with a live photo. The app shows the designed placeholder and makes no request.
- When the account is back:
  1. Check the generation credits.
  2. Run a 5-recipe pilot with `generate-image` (managed asset, `public_id` `repwise/recipes/<id>`, 4:3, 1K).
  3. Open the delivery URLs and judge the quality.
  4. If it is premium and credits allow, generate all 325; otherwise generate 60 heroes (sheet 29, "Photography ~60": about 5 per cuisine, most-planned first).
  5. Record the live ones with `node scripts/media/set-recipe-media.mjs <id> …`.
- Prompt template: "Overhead top-down photograph of <title>, <key ingredients>, plated in a matte ceramic bowl/plate on a light neutral stone surface, soft diffused natural window light, shallow depth of field, appetising, realistic food photography, no text, no hands, no people, no logos or brand packaging, no cutlery clutter, consistent styling."

## Scripts (`scripts/media/`)

| Script | Purpose |
|---|---|
| `suggest-exercise-matches.mjs <dataset.json>` | top-3 candidates for undecided exercises (review aid) |
| `exercise-match-decisions.json` | the reviewed decision per exercise (source of truth) |
| `build-exercise-media-map.mjs <dataset.json> [--check-urls]` | validates the decisions and writes both media JSON files |
| `upload-exercises.mjs [--limit 3] [--only a,b] [--dry-run]` | usage guard (stops above 60 % of credits), signed upload by URL, delivery check |
| `set-recipe-media.mjs [--remove] <id> …` | records recipe photos in `recipes.json` |

The dataset file is `https://raw.githubusercontent.com/yuhonas/free-exercise-db/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/dist/exercises.json`.
