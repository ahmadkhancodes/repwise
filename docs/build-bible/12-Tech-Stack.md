# 12 Tech Stack

| Repwise · Tech Stack |  |  |  |
| Exact stack: React Native + Expo + EAS cloud. Packages and why. |  |  |  |
| ← Back to Start Here |  |  |  |
| Expo SDK 58 was released 15 Oct 2026 with React Native 0.88 (expo.dev/changelog). Create the app with `npx create-expo-app@latest` and add every Expo package with `npx expo install <pkg>` so versions match the SDK. Non-Expo packages: use the version the Expo docs recommend for SDK 58. |  |  |  |
| Layer | Choice | Package(s) | Why / notes |
| Runtime | Expo SDK 58 · React Native 0.88 · Hermes | expo | Managed workflow + config plugins; no ejecting. Node 22.13+ (or 24.3+) for tooling. |
| Language | TypeScript (strict) | typescript | `strict: true`, no `any` without a comment. |
| Navigation | Expo Router (file-based, typed routes) | expo-router | Stack + Tabs. Deep links: repwise:// |
| Build | EAS Build (cloud) | eas-cli | Profiles: development (dev client), preview (internal APK), production (AAB). No local Gradle builds needed. |
| Release | EAS Submit | eas-cli | Uploads AAB to Play internal → closed testing. Needs Play service-account JSON (stored in EAS). |
| OTA updates | EAS Update | expo-updates | Channels: preview, production. runtimeVersion policy 'fingerprint'. JS-only fixes ship same day. |
| CI (optional) | EAS Workflows | .eas/workflows/*.yml | On push to main: lint, typecheck, test, preview build. |
| Local database | SQLite + Drizzle ORM | expo-sqlite, drizzle-orm, drizzle-kit | Local-first source of truth. Typed schema, migrations via useMigrations, live queries (useLiveQuery). |
| Small app state | Zustand | zustand | UI state only (sheets, filters, onboarding progress). Data lives in SQLite. |
| Settings storage | MMKV or expo-sqlite kv | react-native-mmkv | Fast key-value for flags (onboarding done, last sync time). |
| Backend API | Cloudflare Workers (TypeScript, Hono router) | wrangler, hono, mongodb (Node driver via nodejs_compat) | Our only server. One Worker per app: /auth, /sync, /billing, /webhooks. Secrets in `wrangler secret`. Free plan 100k req/day; Paid $5/month when needed. |
| Database (cloud) | MongoDB Atlas (M0 free → Flex/M10 when > 500 paying users) | mongodb | One database per app; collections mirror SQLite tables + users, entitlements, purchases. Every query filtered by userId from the verified JWT. |
| Auth | Google one-tap + email one-time code, own JWT | @react-native-google-signin/google-signin, jose (Worker) | Worker verifies Google ID token, issues our JWT (15 min) + refresh token. No passwords. See '15 Signup & Auth'. |
| Secure storage | expo-secure-store | expo-secure-store | Stores our refresh token and device id. |
| Payments | Apple StoreKit 2 + Google Play Billing (native subscriptions only) | react-native-iap | Entitlement 'pro' decided ONLY by our Worker (App Store Server API / Play Developer API + webhooks). See sheet 16. |
| Notifications | Local scheduled notifications | expo-notifications | No push server needed. Action buttons on notifications. |
| Widgets | Android home-screen widgets + iOS WidgetKit | react-native-android-widget, @bacons/apple-targets | Snapshot data written after every change (MMKV / App Group). |
| Animations | Reanimated + Gesture Handler | react-native-reanimated, react-native-gesture-handler | All motion on the UI thread. |
| Graphics / charts | Skia + Victory Native | @shopify/react-native-skia, victory-native | Rings, gauges, body maps, charts. |
| Celebrations | Lottie | lottie-react-native | Short (<1.5 s) success animations, local JSON files. |
| Lists | FlashList | @shopify/flash-list | History and logs. |
| Bottom sheets | Gorhom bottom sheet | @gorhom/bottom-sheet | Logging sheets, pickers. |
| Forms | React Hook Form + Zod | react-hook-form, zod | Validation shared with DB inserts. |
| Dates | date-fns (+ date-fns-tz) | date-fns | Store UTC, display local; handle DST in schedules. |
| Haptics | Expo Haptics | expo-haptics | See design system rules. |
| Icons / fonts | Lucide + Inter | lucide-react-native, @expo-google-fonts/inter, expo-font |  |
| Images | expo-image, expo-image-picker, expo-camera, expo-file-system |  | Photos stay in app storage; optional private cloud backup. |
| PDF / share | expo-print + expo-sharing |  | Reports and exports. |
| App lock | expo-local-authentication |  | Optional fingerprint / face lock (Pro or Free per sheet 07). |
| In-app review | expo-store-review |  | Ask after a success moment, max 3 times/year. |
| Analytics | PostHog | posthog-react-native | Free tier. No advertising IDs. Events in '23 KPIs & Events'. |
| Crash reporting | Sentry | @sentry/react-native | Free developer tier; source maps uploaded by EAS. |
| Testing | Jest + RN Testing Library + Maestro | jest-expo, @testing-library/react-native, maestro | Unit for logic, Maestro YAML for the P0 flows. |
| Quality | ESLint (expo config) + Prettier + tsc | eslint-config-expo | `npm run check` = lint + typecheck + test. |
| AI planner | Server-side LLM (cheapest model that passes our eval set; e.g. a 'mini/flash/haiku' class model) called only from the Worker | OpenAI/Anthropic/Google SDK in /server | JSON-schema outputs, validation, caching; budget alerts. Sheet 28. |
| Exercise media | Cloudinary (GIF → MP4/WebP auto-format, CDN) | cloudinary URLs + expo-image | Prefetch next exercises; disk cache. |
| Food data | USDA FoodData Central + Open Food Facts (imported to MongoDB) | /server/import | Sheet 29. |
| Push | expo-notifications (local schedule) + Expo Push for server events | expo-notifications | Meal/workout schedule rebuilt daily from plan. |
| Lock-screen timer | iOS Live Activity via expo-apple-targets/WidgetKit; Android ongoing notification | @bacons/apple-targets | P0 for timer (no hardware). |
| Theming | Design tokens with light/dark maps; useColorScheme + override | src/theme |  |
| Lists & images | FlashList v2, expo-image with blurhash |  | Speed budget. |
| Banned |  |  |  |
| •  Any AI/LLM SDK or paid per-call API |  |  |  |
| •  Ad SDKs (AdMob etc.) |  |  |  |
| •  Firebase Analytics/Ads ID |  |  |  |
| •  UI kits that fight the design system (NativeBase, Paper) |  |  |  |
| •  Expo Go for real testing — use a development build (expo-dev-client). |  |  |  |
