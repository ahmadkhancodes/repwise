# Privacy labels: Apple App Privacy + Google Play Data safety

Source of truth for both store forms (sheet 24, sheet 20 release checklist). Update this file
whenever an SDK or a synced field changes, then copy it into App Store Connect and Play Console.

Basics for both stores:
- No ads, no ad SDKs, no advertising ID. The Android `AD_ID` permission is blocked in `app.config.ts`.
- No tracking: `NSPrivacyTracking: false`, no ATT prompt, no data brokers, nothing sold.
- All data is encrypted in transit (HTTPS). Users can delete their data in the app and on the web.
- The app works with no account. Everything stays on the phone (SQLite) unless the user signs in
  for backup.

## 1. Diagnostics and analytics (obs slice, Nov 2026)

| Data | SDK | When | Linked to identity | Tracking | Purpose | Optional |
|---|---|---|---|---|---|---|
| Crash logs (stack trace, device model, OS, app version) | Sentry (`@sentry/react-native`) | only when `EXPO_PUBLIC_SENTRY_DSN` is set | No | No | App functionality (stability) | Yes: Settings → Privacy → "Share anonymous usage data" |
| Session health and performance (crash-free sessions, launch) | Sentry | same | No | No | App functionality | Yes (same toggle) |
| Product interaction (sheet 23 events: screen/feature used, categories and counts) | PostHog (`posthog-react-native`) | only when `EXPO_PUBLIC_POSTHOG_KEY` is set | No | No | Analytics | Yes (same toggle, default ON) |

Why "not linked": we never call PostHog `identify()` or Sentry `setUser()`. PostHog uses a random
install id, `personProfiles: 'never'`, GeoIP off. Sentry runs with `sendDefaultPii: false`, and
`beforeSend` removes the user, server name, cookies, headers and query strings.

What is never sent: body weight and measurements, calories, macros, meal text, AI prompts, names,
emails. `src/services/analyticsGuard.ts` strips these props from every analytics event and Sentry
breadcrumb (only `*_bucket` categories such as `kcal_change_bucket` pass, as sheet 23 allows).
Console and text-input breadcrumbs are dropped.

### Apple: App Privacy answers
- Crash Data: collected, not linked, not tracking, purpose App Functionality.
- Performance Data: collected, not linked, not tracking, purpose App Functionality.
- Product Interaction: collected, not linked, not tracking, purpose Analytics.
- Matching `NSPrivacyCollectedDataTypes` entries are in `app.config.ts` (`ios.privacyManifests`).
  The Sentry and PostHog SDKs also ship their own privacy manifests; Xcode merges them.

### Google Play: Data safety answers
- App info and performance → Crash logs: collected, not shared, processed ephemerally: No,
  optional: Yes, purpose: App functionality / Analytics.
- App info and performance → Diagnostics: collected, not shared, optional, purpose: App functionality.
- App activity → App interactions: collected, not shared, optional, purpose: Analytics.
- Device or other IDs: **not collected** (no ad ID; the random PostHog install id is not a device
  id and is not linked to the user). Revisit if PostHog is ever configured to identify users.
- "Shared" = No: Sentry and PostHog act as our service providers (processors), which Play does
  not count as sharing.

## 2. Account, backup and AI (from sheet 24; owned by the auth, sync and planner slices)

Listed here so both forms are complete. Confirm against the code before submitting.

| Data | Apple category | Play category | Linked | Purpose | Optional |
|---|---|---|---|---|---|
| Email (Google / Apple sign-in) | Contact Info → Email Address | Personal info → Email address | Yes | App functionality (account, backup) | Yes (sign-in is optional) |
| User id | Identifiers → User ID | Personal info → User IDs | Yes | App functionality | Yes |
| Workouts, body weight, measurements | Health & Fitness → Fitness (and Health for body metrics) | Health and fitness → Fitness info / Health info | Yes | App functionality (backup, AI plans) | Yes (backup only when signed in) |
| Daily step count (read only, after "Turn on steps") | Health & Fitness → Fitness | Health and fitness → Fitness info | Yes | App functionality (dashboard tile, backup) | Yes (backup only when signed in) |
| Nutrition logs, diet preferences, allergies | Health & Fitness → Health | Health and fitness → Health info | Yes | App functionality | Yes |
| Progress photos (private, optional backup) | User Content → Photos | Photos and videos → Photos | Yes | App functionality | Yes |
| Purchases (subscription status via the Worker) | Purchases → Purchase History | Financial info → Purchase history | Yes | App functionality | No (if subscribed) |

AI: plan requests go to our Worker, which calls the Anthropic API with no training on user data
(API terms). Only plan inputs are sent, never photos.
