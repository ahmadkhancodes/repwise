# 13 Architecture

| Repwise · Architecture |  |
| Folder structure, layers, data flow, config, performance budgets. |  |
| ← Back to Start Here |  |
| Folder structure |  |
| Path | Responsibility |
| app/ | Expo Router routes only (thin). Screens import from src/features. |
| app/_layout.tsx | Root: fonts, providers (DB, PostHog, Sentry, billing init), splash handling, migrations. |
| app/(onboarding)/ | welcome, setup steps, notification primer. |
| app/(tabs)/ | _layout.tsx (tab bar) + tab screens: today, train, eat, progress, library |
| app/paywall.tsx | Modal route. Params: source (onboarding / gate:<feature> / settings). |
| app/settings/ | index, account, backup, reminders, subscription, export, about/legal. |
| src/ui/ | Design-system components (Screen, Card, Button, BigNumber, ProgressRing, Sheet...). No business logic. |
| src/theme/ | tokens.ts (colours, type, spacing, radius, motion) — single source of truth. |
| src/features/<domain>/ | Per domain: components/, hooks/ (useX), logic/ (pure functions, unit-tested), repo.ts (Drizzle queries). Domains: onboarding, planner, workout, library, nutrition, meals, progress, assistant, billing, settings |
| src/db/ | schema.ts (Drizzle), client.ts, migrations/ (drizzle-kit generated), seed.ts (dev only). |
| src/sync/ | syncEngine.ts (push/pull), mappers.ts (local ↔ remote), conflict.ts (last-write-wins by updated_at). |
| src/services/ | billing.ts (StoreKit + Play Billing, usePro()), api.ts (fetch wrapper with JWT refresh), auth.ts (Apple / Google / email code), ai.ts (Worker /ai routes), notifications.ts, analytics.ts, crash.ts, review.ts. |
| src/widgets/ | Android widget JSX (react-native-android-widget) + iOS WidgetKit/Live Activity targets (/targets). |
| src/lib/ | dates.ts, units.ts, ids.ts (uuid v7), format.ts. |
| assets/ | fonts, lottie/, illustrations/ (SVG), icon & splash. |
| server/ | Cloudflare Worker (Hono): src/routes/{auth,sync,billing,webhooks,account}.ts, src/db.ts (MongoDB client, cached per isolate), wrangler.toml. Deployed with `npx wrangler deploy`. |
| e2e/ | Maestro flows (*.yaml) for P0 journeys. |
| app.config.ts / eas.json | Config + EAS profiles. Secrets via `eas env` (never committed). |
| Layers and data flow |  |
| •  UI (screens/components) → feature hooks → repository (Drizzle) → SQLite. UI never talks to the API or billing libraries directly — only through src/services. |  |
| •  Writes: repo writes row with updated_at = now, dirty = 1 → live query updates UI instantly → syncEngine (if signed in) pushes dirty rows in a debounced batch (2 s) and on app background. |  |
| •  Reads: always local. Pull from the Worker (/sync/pull?since=) on sign-in, on app foreground (max every 5 min) and on manual 'Sync now'. |  |
| •  Conflicts: last-write-wins per row using updated_at; deletes are soft (deleted_at) so they sync. |  |
| •  Entitlements: services/billing.ts exposes usePro() backed by GET /billing/entitlement (our Worker); cached in MMKV with expiry for offline use; refreshed on foreground and after any purchase. |  |
| •  Notifications: services/notifications.ts rebuilds the full schedule from DB state after any schedule change, on boot (expo-notifications handles reboot) and on app update. Store notification IDs in DB. |  |
| •  Widgets: read a small JSON snapshot written to MMKV by the app after each change (widgets must not open the DB cold). |  |
| Configuration and environments |  |
| Item | Value / rule |
| Package name | com.client.repwise |
| URL scheme | repwise:// |
| EAS env vars | App (EAS env): EXPO_PUBLIC_API_URL, EXPO_PUBLIC_POSTHOG_KEY, EXPO_PUBLIC_SENTRY_DSN, GOOGLE_WEB_CLIENT_ID. Worker secrets (`wrangler secret put`): MONGODB_URI, JWT_SECRET, GOOGLE_WEB_CLIENT_ID, PLAY_SERVICE_ACCOUNT_JSON, APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, AI_API_KEY, CLOUDINARY_URL, RESEND_API_KEY (email codes, free tier). Never ship a secret in the app. |
| eas.json profiles | development: developmentClient true, distribution internal · preview: distribution internal, android.buildType apk, channel preview · production: autoIncrement, channel production, android AAB. |
| Android | minSdk per Expo SDK 58 default; targetSdk = Expo default (meets Play's target API rule). |
| iOS | Deployment target per Expo SDK 58 default; bundle id = package name; capabilities: Push Notifications, In-App Purchase, Sign in with Apple, Background fetch (plan refresh). |
| Permissions | POST_NOTIFICATIONS (13+), POST_NOTIFICATIONS, camera/photos only for progress photos. Nothing else. No location, contacts or ad ID. |
| Versioning | version = semver (1.0.0); ios.buildNumber + android.versionCode auto-increment by EAS. |
| Performance and quality budgets |  |
| Budget | Target |
| Cold start to interactive | < 1.5 s mid-range device (release build) |
| Core action latency | Tap → saved + UI updated < 100 ms (local write) |
| Animation | 60 fps; no JS-thread animations |
| App size | Download < 30 MB |
| Crash-free sessions | ≥ 99.5% |
| Battery | No background services except widget updates and scheduled notifications |
| Security and privacy by design |  |
| •  User data stays on device unless the user signs in for backup. Every Worker route verifies our JWT and filters MongoDB by userId; no route accepts a userId from the client. |  |
| •  Atlas: database user with readWrite on the app DB only; network access 0.0.0.0/0 is required for Workers, so use a long random password + SCRAM and rotate quarterly. |  |
| •  Optional app lock (biometric) hides content when the app resumes. |  |
| •  No third-party SDK receives user content. PostHog events never include note text, names, phone numbers or amounts — only counts and categories. |  |
