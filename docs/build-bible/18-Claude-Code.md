# 18 Claude Code

| Repwise · Claude Code |  |  |  |
| CLAUDE.md to paste + the exact prompt sequence to build the app. |  |  |  |
| ← Back to Start Here |  |  |  |
| A. Setup (15 minutes) |  |  |  |
| •  mkdir repwise && cd repwise && git init |  |  |  |
| •  Create CLAUDE.md in the repo root: use the file 'Repwise_CLAUDE.md' that comes with this workbook (rename to CLAUDE.md). Section B below shows the same text. |  |  |  |
| •  Start Claude Code in the folder: `claude`. First message: 'Read CLAUDE.md. Confirm the stack and the non-negotiables back to me in 5 bullets. Do not write code yet.' |  |  |  |
| •  Work in Plan mode for every prompt below: let Claude propose the plan, check it against this workbook, then approve. |  |  |  |
| •  Commit after every prompt that passes its check: `git commit -m "P<n>: <goal>"`. Push to the BufferSol GitHub org. |  |  |  |
| B. CLAUDE.md (paste exactly) |  |  |  |
| # | CLAUDE.md line |  |  |
| 1 | # Repwise — project memory for Claude Code |  |  |
| 2 |  |  |  |
| 3 | ## Mission |  |  |
| 4 | Everyone who walks into a gym knows exactly what to lift and what to eat today — without a coach, a spreadsheet or a nutritionist. |  |  |
| 5 | We win by being: The reference app (Leap 'Gym Workout Planner & Gym Log', 14M Android installs, ~$30–70k/month est.) is ad-heavy, workout-only and full of billing complaints. Category leaders charge $60–80/yr for workouts OR food. We ship both, AI-personalised, with Uber-level polish and no ads. |  |  |
| 6 |  |  |  |
| 7 | ## Product in one paragraph |  |  |
| 8 | One app that plans your training AND your food every day. A context-first onboarding builds a personal gym plan and a personal meal plan; an AI planning assistant keeps both fresh (never the same session or menu twice), sends today's meals and workout as notifications, logs everything in seconds and adapts weekly to your progress. Uber-grade UI: monochrome, fast, elegant, light and dark. |  |  |
| 9 | Core loop: Morning brief (push) → open Today → do the planned workout (log sets in 1 tap each) → eat planned meals (tick or swap) → evening: progress + tomorrow preview → weekly check-in adapts calories, volume and menus. |  |  |
| 10 |  |  |  |
| 11 | ## Non-negotiables |  |  |
| 12 | - No account needed to use the app. Sign-in (Google one-tap or email code) is only for backup/restore. |  |  |
| 13 | - Core action in ≤ 2 taps from home, widget or notification. |  |  |
| 14 | - Offline-first: SQLite is the source of truth; the Cloudflare Worker + MongoDB Atlas are backup/sync/entitlement only. |  |  |
| 15 | - No AI/LLM calls, no paid per-use APIs, no ads SDKs, no dark patterns. |  |  |
| 16 | - Paywall: visible close button, price after trial stated, restore purchases, terms/privacy links. |  |  |
| 17 | - Plans: weekly $4.99 / monthly $12.99 / 3-month $24.99 / yearly $59.99 (pre-selected, 7-day trial). NO ads. Pro unlocked ONLY by the Worker entitlement. |  |  |
| 18 | - Minimal, light design. One primary action per screen. Use tokens from src/theme/tokens.ts only — no hard-coded colours, sizes or fonts. |  |  |
| 19 | - Accessibility: 48dp targets, labels on icon buttons, works at 130% font scale. |  |  |
| 20 |  |  |  |
| 21 | ## Stack (do not change without asking) |  |  |
| 22 | Expo SDK 58 (React Native 0.88), TypeScript strict, Expo Router, EAS Build/Submit/Update, expo-sqlite + drizzle-orm, zustand, react-native-mmkv, Cloudflare Workers (Hono) + MongoDB Atlas backend in /server, @react-native-google-signin/google-signin, react-native-iap (StoreKit 2 + Play Billing), server-side AI planner, Cloudinary media via expo-image, expo-notifications, react-native-reanimated, react-native-gesture-handler, @shopify/react-native-skia, victory-native, lottie-react-native, @shopify/flash-list, @gorhom/bottom-sheet, react-hook-form, zod, date-fns, expo-haptics, lucide-react-native, @expo-google-fonts/inter, posthog-react-native, @sentry/react-native, jest-expo, @testing-library/react-native, Maestro. |  |  |
| 23 | Install Expo packages with `npx expo install`. AI calls never run on the device; the app only calls our Worker. Media via Cloudinary CDN. |  |  |
| 24 |  |  |  |
| 25 | ## Architecture |  |  |
| 26 | - app/ = routes only (thin). src/features/<domain>/ = components, hooks, logic (pure + unit tested), repo.ts (Drizzle). |  |  |
| 27 | - src/ui = design-system components; src/theme/tokens.ts = all design tokens. |  |  |
| 28 | - src/services = purchases, auth, notifications, analytics, crash, review. UI never calls the API or billing libraries directly. |  |  |
| 29 | - src/sync = push dirty rows / pull by updated_at; last-write-wins; soft deletes. |  |  |
| 30 | - Every table: id (uuid v7), user_id, created_at, updated_at, deleted_at, dirty. |  |  |
| 31 | - Domains: onboarding, planner, workout, library, nutrition, meals, progress, assistant, billing, settings. |  |  |
| 32 |  |  |  |
| 33 | ## Design tokens |  |  |
| 34 | accent #1FB86B · accentSoft #E3F7EC · accentPressed #17945A · bg #FFFFFF · surface #F7F8FA · surface2 #EEF0F4 · border #E6E8EC · text #0F172A / #5B6475 / #8A93A3 · success #16A34A · warning #D97706 · danger #DC2626. |  |  |
| 35 | Font Inter; body 16px; tabular numbers. Radius: card 20, sheet 28, button 14, input 12. Spacing 4/8/12/16/20/24/32/40; screen padding 20. Motion 180–280 ms springs (damping 18, stiffness 180). Haptics: selection on pickers, light on taps, success on core action. |  |  |
| 36 |  |  |  |
| 37 | ## Commands |  |  |
| 38 | - `npm run check` → eslint + tsc --noEmit + jest. Must pass before every commit. |  |  |
| 39 | - `npx expo start --dev-client` → run on the development build. |  |  |
| 40 | - `eas build -p android --profile development/preview/production` |  |  |
| 41 | - `eas update --channel preview -m "msg"` |  |  |
| 42 | - `maestro test e2e/` → P0 flows. |  |  |
| 43 |  |  |  |
| 44 | ## Definition of done (per feature) |  |  |
| 45 | - Matches the acceptance criteria in the build bible (sheet 07) and the screen spec (sheet 10). |  |  |
| 46 | - Empty, loading and error states built. Works offline. Analytics events from sheet 23 fired. |  |  |
| 47 | - Unit tests for any logic (dates, schedules, maths). Lightness test passed. No TypeScript errors. |  |  |
| 48 |  |  |  |
| 49 | ## Never |  |  |
| 50 | - Never block the UI on the network. Never lose user data. Never show an ad. Never call an LLM. Never add a library not in the stack list without asking. |  |  |
| 51 | - Never use the words 'cure', 'treat', 'diagnose' or give dosing/medical advice in UI copy. |  |  |
| 52 |  |  |  |
| 53 | ## App-specific rules |  |  |
| 54 | - All maths (calories, macros, sets, reps, progression) lives in pure TS modules with unit tests — the LLM never does maths. |  |  |
| 55 | - LLM calls only via the Worker /ai routes with JSON schema + validation + fallback to rules-only output. |  |  |
| 56 | - No ads SDK, no hardware SDK (no HealthKit workout streaming, no Watch). |  |  |
| 57 | - Every screen ships in light and dark; use tokens only. |  |  |
| 58 | - Never block a workout on the network — the player works fully offline. |  |  |
| C. Prompt sequence (run in order; each must pass its check before the next) |  |  |  |
| # | Goal | Paste this into Claude Code | Check before moving on |
| P1 | Project skeleton | Create an Expo SDK 58 TypeScript app named Repwise with Expo Router (tabs + stack + modal), package com.client.repwise, scheme repwise. Add expo-dev-client, eslint-config-expo, prettier, jest-expo, and an npm script `check` (eslint + tsc --noEmit + jest). Create the folder structure from CLAUDE.md with placeholder screens for: today, train, eat, progress, library, paywall (modal), settings. Add eas.json with development/preview/production profiles as described in CLAUDE.md. Do not add other libraries yet. | `npm run check` passes; `eas build -p android --profile development` succeeds; app opens on emulator showing the tabs. |
| P2 | Design system | Implement src/theme/tokens.ts from CLAUDE.md and the components in src/ui: Screen, Card, Button (primary/secondary/tertiary/destructive), BigNumber (animated), ProgressRing (Skia), Sheet (gorhom), ListRow, Chip, Segmented, Stepper, WheelPicker, Toast, EmptyState. Load Inter. Add a hidden /dev/ui route that shows every component in every state. | Screenshot of /dev/ui matches the design sheet: white, airy, one accent. Works at 130% font scale. |
| P3 | Database + domain logic | Add expo-sqlite + drizzle-orm. Implement the schema from the build bible sheet 14 (tables: profile, plans, sessions, session_exercises, sets, exercises, routines, meal_plans, meals, recipes, food_logs, body_metrics, photos, cards) with the common columns, migrations via useMigrations, and repo.ts per domain with live queries. Implement the pure logic module(s): nutrition.ts (BMR/TDEE/macros/carb cycling), progression.ts (double progression, RPE, deload), split.ts (split selection), variety.ts (no-repeat rules), plates.ts, oneRm.ts, met.ts (cardio kcal), heatmap.ts (muscle volume decay). Write unit tests for every logic function including edge cases (DST changes, midnight, leap day, empty data). | All logic tests pass; adding a row in a dev screen shows up live. |
| P4 | Onboarding | Build onboarding exactly as screens S02–S07 in sheet 10: value carousel, setup steps that create the user's first real data, notification primer (request POST_NOTIFICATIONS only after the primer), then the paywall modal, then Home. Save progress so killing the app mid-onboarding resumes. Fire analytics events from sheet 23. | Fresh install → Home with real data in < 60 s; no account asked; permission asked only after primer. |
| P5 | Core loop | Build the core loop: Morning brief (push) → open Today → do the planned workout (log sets in 1 tap each) → eat planned meals (tick or swap) → evening: progress + tomorrow preview → weekly check-in adapts calories, volume and menus. Follow screens S11, S13, S14, S21 in sheet 10. The core action must take ≤ 2 taps from Home, give success haptic + subtle animation, and update every number instantly from the live query. | Core action works offline, in < 100 ms, with undo (5 s toast). |
| P6 | Onboarding quiz + plan reveal | Build S02–S07 with resumable state, validation, notification primer and the animated plan reveal driven by real planner output. | Quiz → plan in < 3 min; reveal matches data. |
| P7 | Planner engines | Implement nutrition.ts, split.ts, progression.ts, variety.ts, heatmap.ts with exhaustive tests; Worker /ai/plan/week, /ai/meals/day, /ai/swap routes per sheet 28. | Validation suite passes; 60-session uniqueness test passes. |
| P8 | Workout player | S13–S17: set rows with previous/pre-fill, set types, RPE, rest timer + Live Activity/ongoing notification, swap, reorder, cardio, plate/1RM tools, summary + PRs. | Full workout offline; timer fires in background. |
| P9 | Library + media | S18–S19, Cloudinary media with expo-image caching; filters; custom exercises. | Search < 50 ms; GIF first frame < 300 ms on 4G. |
| P10 | Meals | S20–S27: targets, day/week plan, swap, ate out, recipe + cook mode, grocery list, logging, water. | 100 generated days pass macro + allergen checks. |
| P11 | Today + assistant + check-in | S11, S12, S28, assistant card rules, smart notification schedule. | Cards trigger correctly in rule tests. |
| P12 | Progress | S29–S36 charts, heatmap, photos (private storage), Wrapped. | Charts correct vs fixtures. |
| P-N1 | Notifications | Implement services/notifications.ts: rebuild-the-whole-schedule function driven by DB state, Android channels from sheet 17, action buttons (handled with Notifications.addNotificationResponseReceivedListener even when the app was killed), quiet hours, and the trial day-5 reminder. Store notification ids. Unit-test the schedule builder. | Every notification in sheet 17 fires at the right local time on device (test with time shifted); actions work from a killed app. |
| P-N2 | Widgets & lock-screen timer | Android: react-native-android-widget; iOS: WidgetKit + Live Activity target via @bacons/apple-targets. Build widgets/Live Activity in sheet 17 from an MMKV/App Group snapshot written after every change. | Widget appears in the picker, shows correct data, tap action works with the app killed. |
| P-PAY | Paywall + billing | Add react-native-iap (StoreKit 2 + Play Billing). Implement services/billing.ts + usePro() per sheet 16 with the 4-plan paywall from sheet 05 (yearly pre-selected with 7-day trial). In /server add /billing/verify (App Store Server API + Play Developer API), /billing/entitlement, /webhooks/apple (ASSN v2), /webhooks/play (RTDN). Settings → Subscription with Manage deep links + Restore. | Sandbox (iOS) + license tester (Android): trial → Pro within 3 s; cancel; restore on the OTHER platform after sign-in. |
| P-AUTH | Auth + sync (Cloudflare Worker + MongoDB Atlas) | Create /server: Cloudflare Worker with Hono, nodejs_compat, MongoDB driver client cached per isolate, routes /auth/google, /auth/email/start, /auth/email/verify, /auth/refresh, /sync/push, /sync/pull, DELETE /account per sheets 14–15 (JWT with jose, rotating refresh tokens, rate limits). App: services/api.ts (JWT + refresh), Sign in with Apple, Google, email code fallback, Settings → Backup & Account per sheet 15, src/sync (push dirty rows debounced 2 s + on background; pull by updatedAt on sign-in/foreground). Write Vitest tests for every Worker route (miniflare) incl. cross-user access attempts. | Data from phone A appears on phone B after sign-in; another user's token can never read/write your docs (test passes); delete account wipes Atlas docs; airplane-mode toggling loses nothing. |
| P-POL | Polish + analytics + crash | Add PostHog (events in sheet 23, no health values in properties) and Sentry (EAS source maps). Add expo-store-review after the success moments listed in sheet 22. Audit every screen with the lightness test and accessibility checklist in sheet 11; fix spacing, empty states, skeletons, haptics. Add app lock if listed in sheet 07. | Lightness + accessibility checklist passes on all screens; events visible in PostHog. |
| P-QA | E2E + release build | Write Maestro flows for every P0 test case in sheet 20 that can be automated. Fix failures. Prepare app.config for production (icon, splash, adaptive icon, versioning), build production AAB with EAS, submit to Play internal testing with `eas submit`. | All P0 Maestro flows green; AAB on internal track; release checklist in sheet 20 ticked. |
| D. Rules for working with Claude Code |  |  |  |
| •  One prompt = one feature slice. Small diffs are reviewable; giant diffs hide bugs. |  |  |  |
| •  Always ask Claude to run `npm run check` (lint + tsc + jest) and fix everything before you test on device. |  |  |  |
| •  Give Claude screenshots of the emulator when the UI looks off and ask it to compare against '11 Design System'. |  |  |  |
| •  When Claude proposes a new library, check '12 Tech Stack'. If it's not listed, ask Ahmad first. |  |  |  |
| •  Never paste secrets into prompts. Keys live in EAS env and .env.local (git-ignored). |  |  |  |
| •  If Claude gets stuck twice on the same bug, stop, read the error yourself, and give it the exact file and line. |  |  |  |
| •  End of each day: ask Claude 'Summarise what changed today, what is untested, and the riskiest thing left' and send that to Ahmad. |  |  |  |
