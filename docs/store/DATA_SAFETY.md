# Data safety (Google Play) and App Privacy "nutrition label" (App Store)

Status: answers for v1 as built. Re-check before each submission if SDKs or synced tables change (`server/src/sync/tables.ts`, PostHog, Sentry config).

## What the app does with data (the facts the answers rest on)

- **No account needed.** Everything works offline from on-device SQLite. Without an account, plans, logs and profile never leave the device, except the items below.
- **Optional account** (email code, Google, or Apple sign-in) for backup, restore and Pro entitlement across devices. Account data: email (or the Google / Apple user id) and an internal user id.
- **Backup / sync when signed in:** profile (name, goal, sex, birth year, height, weight, target weight, experience, equipment, injuries note, diet type, allergies, dislikes, cuisines, meal times, units, theme, timezone, locale), plans, workout sessions and sets, routines and custom exercises, meal plans, meals, custom recipes, food logs, body measurements, assistant cards, and progress photo records (date, pose and file reference). Sent to our Cloudflare Worker over HTTPS (TLS), stored in MongoDB Atlas (encrypted at rest by the provider).
- **Progress photos:** stored in the app's private storage on the device, never saved to the gallery, shared only when the user taps share. In v1 the photo files are not uploaded (only the record is synced). If photo upload is switched on later, update this file and both forms first.
- **AI:** plan personalization calls our server, and our server calls the Anthropic API. The prompts contain internal ids of exercises and recipes, targets and constraints (goal type, equipment, diet tags, allergen tags). No name, email, user id, photos or free text are sent. The provider does not train on API data under its commercial terms. If AI is unavailable the app uses rules only.
- **Analytics:** PostHog, anonymous (random install id, no email, no name), events like "onboarding_completed" or "workout_finished". Off switch in Settings (opt-out). No advertising id (AD_ID permission removed), no cross-app tracking.
- **Crash logs:** Sentry (stack trace, device model, OS version, app version). No health data, no email, user id scrubbed.
- **Purchases:** handled by Apple / Google. We receive a purchase receipt or token and verify it on our server to unlock Pro. We never see card details.
- **Not done:** no ads, no ad SDKs, no selling or sharing for advertising, no tracking across other companies' apps or sites, no location, no contacts, no microphone.
- **Health data is not shared with third parties.** The only processors are our own infrastructure providers (Cloudflare, MongoDB Atlas), the AI provider (no personal identifiers, see above), Cloudinary (exercise demo media, downloads only), PostHog and Sentry (no health data).

Data deletion URL (placeholder): **https://repwise.app/delete-account**  (content: `docs/legal/delete-account.md`). In-app path: Settings > Account > Delete account.

---

## Google Play: Data safety form

### Data collection and security (top-level questions)

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes |
| Do you provide a way for users to request that their data is deleted? | Yes |
| Data deletion URL | https://repwise.app/delete-account (placeholder) |
| Does the app follow the Families Policy? | No (target audience 18+) |
| Independent security review (optional) | No |

### Data types

"Collected" = leaves the device to us or a processor. "Shared" = transferred to a third party for their own use; service providers acting for us (hosting, crash reporting, analytics under contract, the AI provider as a processor) are not "shared" under Play's definition, so every Shared answer is **No**.

| Category > Type | Collected | Shared | Optional? | Purpose | Notes |
|---|---|---|---|---|---|
| Personal info > Email address | Yes | No | Yes (account is optional) | Account management, App functionality | Only if user signs in by email or Google / Apple |
| Personal info > User IDs | Yes | No | Yes | Account management, App functionality | Internal user id, Google / Apple subject id |
| Personal info > Name | Yes | No | Yes (only when signed in) | App functionality | First name from onboarding, backed up as profile data. Declared to be safe |
| Health and fitness > Health info | Yes | No | Yes (only when signed in) | App functionality | Body weight, body measurements, injuries note, allergies, diet type, food and calorie logs |
| Health and fitness > Fitness info | Yes | No | Yes (only when signed in) | App functionality | Workouts, sets, reps, routines, plans |
| Photos and videos > Photos | No | No |  | | Stay on device in v1 (see above) |
| Financial info > Purchase history | Yes | No | Yes | App functionality, Account management | Subscription status verified by our server; Google Play handles payment |
| App activity > App interactions | Yes | No | Yes (opt-out in Settings) | Analytics | PostHog, anonymous |
| App info and performance > Crash logs | Yes | No | No | Analytics (app stability) | Sentry |
| App info and performance > Diagnostics | Yes | No | No | Analytics (app stability) | Sentry performance / device info |
| Device or other IDs > Device or other IDs | Yes | No | Yes | Analytics | Anonymous PostHog install id (not the advertising id) |
| Location, Contacts, Messages, Audio, Files and docs, Calendar, Web browsing, Search history | No | No | | | |

Data handling statements for each collected type: **Encrypted in transit: Yes. Users can request deletion: Yes.** Data is processed ephemerally for no type. Analytics and crash types are collected automatically; account and health types only when the user turns on backup by signing in.

### Other Play declarations (go with this form)

| Item | Answer |
|---|---|
| Advertising ID | Not used (Play Console > App content > Advertising ID: **No**) |
| Ads | **No**, app contains no ads |
| Health apps declaration (Play Console > App content > Health apps) | Select "Activity and fitness" and "Nutrition and weight management". Not a medical app; no medical device functions; includes a not-medical-advice disclaimer |
| Financial features | None |
| Government app / news app | No |

---

## Apple: App Privacy ("nutrition label")

Question: *Do you or your third-party partners collect data from this app?* **Yes**.

| Data type (Apple's list) | Collected | Linked to the user | Used for tracking | Purposes |
|---|---|---|---|---|
| Contact Info > Email Address | Yes (only if the user signs in) | Yes | No | App Functionality |
| Contact Info > Name | Yes (only if the user signs in, backed-up first name) | Yes | No | App Functionality |
| Health & Fitness > Health | Yes (only if signed in: body weight and measurements, diet, allergies, injuries note) | Yes | No | App Functionality |
| Health & Fitness > Fitness | Yes (only if signed in: workouts, sets, plans) | Yes | No | App Functionality |
| Identifiers > User ID | Yes (only if signed in) | Yes | No | App Functionality |
| Identifiers > Device ID | No (no IDFA, no IDFV is sent to ad networks; PostHog uses its own random install id, declared below as Product Interaction) | n/a | n/a | n/a |
| Purchases > Purchase History | Yes | Yes | No | App Functionality |
| Usage Data > Product Interaction | Yes (anonymous PostHog events, opt-out in Settings) | **No** (not linked, no user id attached) | No | Analytics |
| Diagnostics > Crash Data | Yes (Sentry) | No | No | App Functionality, Analytics |
| Diagnostics > Performance Data | Yes (Sentry) | No | No | App Functionality, Analytics |
| Diagnostics > Other Diagnostic Data | Yes (device model, OS version) | No | No | App Functionality, Analytics |
| Photos or Videos | No (progress photos stay on device) | n/a | n/a | n/a |
| Location, Contacts, Browsing History, Search History, Financial Info, Sensitive Info, User Content (other) | No | n/a | n/a | n/a |

Tracking: **No data is used to track users** (no ATT prompt, `NSPrivacyTracking` false in the privacy manifest). Consistent with `app.config.ts` `ios.privacyManifests`: update its `NSPrivacyCollectedDataTypes` list to the rows above that say Yes before submission (D9 in `docs/DECISIONS.md` notes it was empty until PostHog and Sentry shipped).

If Apple asks about "Health and fitness data shared with third parties": **No**. HealthKit is not used.

## One-line statements for the store listing and support replies

- "Your data lives on your device first. An account is optional, and only used to back up and restore."
- "We do not sell your data. There are no ads."
- "Plans are personalized with AI through our server. We do not send your name or email to the AI."
