# Repwise — project memory for Claude Code

## Mission
Everyone who walks into a gym knows exactly what to lift and what to eat today — without a coach, a spreadsheet or a nutritionist.
We win by being: The reference app (Leap 'Gym Workout Planner & Gym Log', 14M Android installs, ~$30–70k/month est.) is ad-heavy, workout-only and full of billing complaints. Category leaders charge $60–80/yr for workouts OR food. We ship both, AI-personalised, with Uber-level polish and no ads.

## Product in one paragraph
One app that plans your training AND your food every day. A context-first onboarding builds a personal gym plan and a personal meal plan; an AI planning assistant keeps both fresh (never the same session or menu twice), sends today's meals and workout as notifications, logs everything in seconds and adapts weekly to your progress. Uber-grade UI: monochrome, fast, elegant, light and dark.
Core loop: Morning brief (push) → open Today → do the planned workout (log sets in 1 tap each) → eat planned meals (tick or swap) → evening: progress + tomorrow preview → weekly check-in adapts calories, volume and menus.

## Non-negotiables
- No account needed to use the app. Sign-in (Google one-tap or email code) is only for backup/restore.
- Core action in ≤ 2 taps from home, widget or notification.
- Offline-first: SQLite is the source of truth; the Cloudflare Worker + MongoDB Atlas are backup/sync/entitlement only.
- No paid per-use APIs except the Anthropic API behind our Worker (budget-capped, see Owner overrides); no ads SDKs, no dark patterns.
- Paywall: visible close button, price after trial stated, restore purchases, terms/privacy links.
- Plans: weekly $4.99 / monthly $12.99 / 3-month $24.99 / yearly $59.99 (pre-selected, 7-day trial). NO ads. Pro unlocked ONLY by the Worker entitlement.
- Minimal, light design. One primary action per screen. Use tokens from src/theme/tokens.ts only — no hard-coded colours, sizes or fonts.
- Accessibility: 48dp targets, labels on icon buttons, works at 130% font scale.

## Stack (do not change without asking)
Expo SDK 58 (React Native 0.88), TypeScript strict, Expo Router, EAS Build/Submit/Update, expo-sqlite + drizzle-orm, zustand, react-native-mmkv, Cloudflare Workers (Hono) + MongoDB Atlas backend in /server, @react-native-google-signin/google-signin, react-native-iap (StoreKit 2 + Play Billing), server-side AI planner, Cloudinary media via expo-image, expo-notifications, react-native-reanimated, react-native-gesture-handler, @shopify/react-native-skia, victory-native, lottie-react-native, @shopify/flash-list, @gorhom/bottom-sheet, react-hook-form, zod, date-fns, expo-haptics, lucide-react-native, @expo-google-fonts/inter, posthog-react-native, @sentry/react-native, jest-expo, @testing-library/react-native, Maestro.
Install Expo packages with `npx expo install`. AI calls never run on the device; the app only calls our Worker. Media via Cloudinary CDN.

## Architecture
- app/ = routes only (thin). src/features/<domain>/ = components, hooks, logic (pure + unit tested), repo.ts (Drizzle).
- src/ui = design-system components; src/theme/tokens.ts = all design tokens.
- src/services = purchases, auth, notifications, analytics, crash, review. UI never calls the API or billing libraries directly.
- src/sync = push dirty rows / pull by updated_at; last-write-wins; soft deletes.
- Every table: id (uuid v7), user_id, created_at, updated_at, deleted_at, dirty.
- Domains: onboarding, planner, workout, library, nutrition, meals, progress, assistant, billing, settings.

## Design tokens
accent #1FB86B · accentSoft #E3F7EC · accentPressed #17945A · bg #FFFFFF · surface #F7F8FA · surface2 #EEF0F4 · border #E6E8EC · text #0F172A / #5B6475 / #8A93A3 · success #16A34A · warning #D97706 · danger #DC2626.
Font Inter; body 16px; tabular numbers. Radius: card 20, sheet 28, button 14, input 12. Spacing 4/8/12/16/20/24/32/40; screen padding 20. Motion 180–280 ms springs (damping 18, stiffness 180). Haptics: selection on pickers, light on taps, success on core action.

## Commands
- `npm run check` → eslint + tsc --noEmit + jest. Must pass before every commit.
- `npx expo start --dev-client` → run on the development build.
- `eas build -p android --profile development/preview/production`
- `eas update --channel preview -m "msg"`
- `maestro test e2e/` → P0 flows.

## Definition of done (per feature)
- Matches the acceptance criteria in the build bible (sheet 07) and the screen spec (sheet 10).
- Empty, loading and error states built. Works offline. Analytics events from sheet 23 fired.
- Unit tests for any logic (dates, schedules, maths). Lightness test passed. No TypeScript errors.

## Never
- Never block the UI on the network. Never lose user data. Never show an ad. Never call an LLM from the app (only the Worker /ai routes may). Never add a library not in the stack list without asking.
- Never use the words 'cure', 'treat', 'diagnose' or give dosing/medical advice in UI copy.

## App-specific rules
- All maths (calories, macros, sets, reps, progression) lives in pure TS modules with unit tests — the LLM never does maths.
- LLM calls only via the Worker /ai routes with JSON schema + validation + fallback to rules-only output.
- No ads SDK, no hardware SDK (no HealthKit workout streaming, no Watch).
- Every screen ships in light and dark; use tokens only.
- Never block a workout on the network — the player works fully offline.

## Owner overrides (19 Nov 2026). These win over anything above or in the workbook.
- **iOS + Android from day 1, and iOS must be READY and TESTED.** Whether we publish on the App Store is decided later.
  - **Config:** iOS bundle id `com.client.repwise`; Info.plist usage strings for every permission; Sign in with Apple (required, because Google sign-in is offered); a privacy manifest via `ios.privacyManifests`; App Group for widgets; an EAS `ios-simulator` profile.
  - **Payments:** StoreKit 2 through `react-native-iap` (Apple requires IAP for digital subscriptions). Never Stripe for in-app subscriptions on either store.
  - **Tests:** every test runs for both `Platform.OS` values where behaviour differs; Maestro flows work on both platforms.
- **AI in v1 (owner, 19 Nov 2026): Anthropic API, hard budget of $50/month.**
  - The Worker `/ai/*` routes call the Anthropic Messages API (cheapest capable model, configurable). The key is the Worker secret `ANTHROPIC_API_KEY`.
  - The deterministic engine (`@repwise/engine`) computes targets, candidate pools and validation. The LLM only picks and orders candidate IDs and writes titles and coaching copy. The LLM never does maths.
  - Any invalid output or timeout falls back to the rules-only plan.
  - **Budget guard:** real cost is tracked per month. At 80% of the budget, free users get rules-only plans; at 100%, everyone does. There are also per-user daily limits, a cache, and prompt caching.
  - The app never calls an LLM directly. It only calls our Worker.
  - This replaces the bible's "No AI/LLM calls" line for the planner, and only for these Worker routes.
- **Package and branding:** `com.client.repwise`, scheme `repwise`. Light AND dark themes, per sheet 11.
- **How we build:** in Claude Code (this session) with parallel agents on branches/worktrees. Each agent works only in its own directories, and the orchestrator merges. Memory lives in `docs/PROGRESS.md` and `docs/DECISIONS.md`.
