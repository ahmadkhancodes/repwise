# Screenshot storyboard and Play feature graphic

Eight frames, same order on both stores. Portrait, 1080 x 2340 px (Play phone) and 1290 x 2796 px (App Store 6.7 inch); App Store also needs 6.5 inch (1242 x 2688) if Connect asks. Style: light background, one headline per frame (6 words or fewer, Inter Bold), the phone UI below it, one message per image. Frame 8 shows light and dark side by side. Use seeded demo data (a fresh onboarding run with the "fat loss" goal), never real people's data. No competitor names, no ranking or "#1" claims, no medical claims.

Capture with Maestro (`takeScreenshot` writes `<name>.png` next to the run). Run the onboarding flow first, because every other flow assumes a finished profile. Android: emulator "Pixel 8" at 1080 x 2400, hide the system bars, set the clock to 9:41. iOS: simulator "iPhone 15 Pro Max".

| # | Caption (on image) | Screen (route) | Maestro steps that produce the frame |
|---|---|---|---|
| 1 | Your workouts and meals, planned daily | Today (`app/(tabs)/today.tsx`, `screen-today`) | `e2e/onboarding/01_f1_happy_path.yaml`, then `tapOn: id: "tab-today"`, `extendedWaitUntil visible id: "screen-today"`, `takeScreenshot: store/01-today` (as in `e2e/today/01_today_core_loop.yaml`) |
| 2 | Fresh AI workouts every week | Train tab (`screen-train`) with this week's plan | `tapOn: id: "tab-train"`, `assertVisible: id: "screen-train"`, `takeScreenshot: store/02-train` |
| 3 | Log a set in one tap | Workout player (`screen-workout`) mid-session, one set ticked, rest pill showing | Follow `e2e/workout/01_empty_workout_log_rest_finish.yaml` up to the first `exercise-0-set-0-check` tap and `rest-pill`, then `takeScreenshot: store/03-player` |
| 4 | Meals in your cuisine | Eat tab (`tab-eat`, `eat-rings`, `meal-lunch`) | `tapOn: id: "tab-eat"`, `assertVisible: id: "eat-rings"`, `takeScreenshot: store/04-eat` |
| 5 | Swap anything in one tap | Swap sheet (`swap-sheet`) open on dinner | As `e2e/meals/01_eat_tick_swap.yaml`: `tapOn: id: "swap-dinner"`, `assertVisible: id: "swap-sheet"`, `takeScreenshot: store/05-swap` (before choosing `swap-option-0`) |
| 6 | Your grocery list, done | Grocery (`app/grocery/index.tsx`, `grocery-left`) | As `e2e/meals/03_grocery.yaml`: `tapOn: id: "open-grocery"`, `assertVisible: id: "grocery-left"`, tick two `grocery-item-.*`, `takeScreenshot: store/06-grocery` |
| 7 | See your progress | Progress hub, then Records or Heatmap (`screen-progress`, `screen-progress-heatmap`, `body-map`) | `tapOn: id: tab-progress`, `tapOn: id: nav-heatmap`, `assertVisible: id: body-map`, `takeScreenshot: store/07-progress`. Seed a few logged workouts first so the heatmap is not the empty state |
| 8 | Light and dark, your choice | Today in light, then Today in dark, composited side by side | `tapOn: id: tab-today`, `takeScreenshot: store/08-light`; open Settings (`screen-settings`) and set `theme` to Dark; `tapOn: id: tab-today`, `takeScreenshot: store/08-dark`; compose the two in Figma or Canva |

Optional frame 9 for App Store only if space allows: paywall (`screen-paywall`, close button `paywall-close` visible, yearly plan pre-selected). Do not use the paywall in Play frames 1 to 8; both stores prefer product shots.

Notes for the person capturing:
- Notifications are denied in the happy-path flow; that is fine, frames do not show the system dialog.
- Only show features that ship in v1: Today, Train, Eat, grocery list, swap, progress, heatmap, themes.
- Headlines must match the listing wording: "AI-personalized" plans, "adapts every week". No unverifiable claims.

## Play feature graphic brief (1024 x 500 px, PNG or JPG, no alpha)

- **Background:** solid black (matches the black app icon with white "R" and a small green dot).
- **Headline (left, 55% width):** "Train smart. Eat right." in white Inter Bold, about 64 px, two lines. Sub-line in light grey, 24 px: "AI gym plans and daily meal plans. No ads."
- **Visual (right):** one phone mockup showing the Today screen (frame 1), tilted 8 degrees, bottom of the phone cropped by the canvas edge. A thin green (#1FB86B) accent line or glow behind the phone.
- **Safe area:** keep all text inside the central 924 x 400 px, Play crops edges on some surfaces.
- **Do not include:** store badges, prices, ratings, awards, competitor names, people photos, or small text under 20 px.
- **Alt text:** "Repwise app showing today's workout and meals".
- Deliver `docs/store/assets/feature-graphic-1024x500.png` when produced (assets folder not created by this pack).
