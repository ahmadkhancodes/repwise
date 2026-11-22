# Repwise — final report (22 Nov 2026)

## What the app does
One app that plans your training and your food every day, with no ads and no account needed. Onboarding builds a gym plan and a meal plan. Today shows the planned workout and meals. You log sets in one tap, tick or swap meals, and cook with step-by-step mode. Progress, library and a weekly check-in adapt calories, volume and menus. A rules engine does all the maths; the AI planner runs only behind our Worker, with a budget guard and a rules-only fallback. Light and dark themes. iOS and Android.

## Tests (main, code at 26fb53a; later commits are docs only)
- App (Jest): 3129 tests, green.
- Engine: 763 tests, green.
- Server: 150 tests, green.
- Content: checks green (`npm run test:all`).
- E2E, Maestro, 29 flows per platform, all passed:
  - iOS: https://github.com/ahmadkhancodes/repwise/actions/runs/44962551228
  - Android: https://github.com/ahmadkhancodes/repwise/actions/runs/44962552794

## Device bugs found and fixed
- Sheets never opened (gorhom vs Reanimated 4.7); `Sheet` rewritten.
- Entering animations could stay invisible with reduced motion; all 36 files now use the safe helper.
- Cook mode "Next step" was dead on iOS.
- The missing-workout deep link was only a short toast; it is now an inline notice.
- Android notification permission was read wrongly.
- The paywall outcomes were hidden under the iOS modal; they are now inline.
- Toasts could be hidden by native modals or the splash.
- Meal swap sheet could be empty; the engine now falls back in tiers.
- The iOS FullWindowOverlay hid the app from accessibility; removed.

## Known limits
- Store launch is not done: Worker secrets (ANTHROPIC_API_KEY), EAS project id, Apple team id, store products, legal business address.
- No recipe photos; exercise media are blocked until Cloudinary is re-enabled (a muscle-map placeholder is used).
- 104 exercises have no licensed demo.
- Content needs human review (10 % spot-check, allergen second review, native cooks for regional dishes).
- Some E2E flows are timing-sensitive on CI runners and have flaked before, with no app change.
- Real purchases and AI plans are untested against live services.

## Dark Mode iPhone tour
- With music (CC BY 4.0): https://github.com/ahmadkhancodes/repwise/releases/download/app-tour-dark/repwise-ios-dark-tour-music.mp4
- Silent: https://github.com/ahmadkhancodes/repwise/releases/download/app-tour-dark/repwise-ios-dark-tour.mp4
- Release page: https://github.com/ahmadkhancodes/repwise/releases/tag/app-tour-dark
