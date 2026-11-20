# App Store Connect: answers to paste, in Connect's order

App: Repwise · Bundle ID `com.client.repwise` · SKU `repwise-ios` · Contact: buffersoltechnologies@gmail.com
Copy text from `app-store.md`, `DATA_SAFETY.md` (App Privacy), `screenshots.md`. Whether to publish on the App Store is decided later; everything below is ready for TestFlight and review.

## 1. New App

| Field | Answer |
|---|---|
| Platforms | iOS |
| Name | Repwise: Gym & Meal Planner (27) |
| Primary language | English (U.S.) |
| Bundle ID | com.client.repwise |
| SKU | repwise-ios |
| User access | Full Access |

## 2. App Information

| Field | Answer |
|---|---|
| Subtitle | AI workout plans + meal plans (29) |
| Category | Primary: Health & Fitness. Secondary: Food & Drink |
| Content rights | Does not contain third-party content that needs rights beyond licensed open data (exercise and recipe content licences are recorded in `packages/content/SOURCES.md`) |
| Age rating | Complete the questionnaire with the answers in `app-store.md` |
| Privacy Policy URL | https://repwise.app/privacy (placeholder) |
| License agreement | Apple standard EULA, or custom: https://repwise.app/terms (placeholder) |

## 3. Pricing and Availability

Price: **Free**. Availability: United States, United Kingdom, Canada first (add others later). Pre-orders: No. Apple Silicon Mac / Vision: opt out of Vision Pro availability if offered.

## 4. In-App Purchases and Subscriptions > Subscriptions

Create subscription group **Repwise Pro**. Localization (group display name) "Repwise Pro" for en-US, en-GB, en-CA. Level order (rank 1 is highest): Yearly, 3-Month, Monthly, Weekly.

| Reference name | Product ID | Duration | USD | GBP | EUR | CAD | Offer |
|---|---|---|---|---|---|---|---|
| Repwise Pro Yearly | `com.client.repwise.pro.yearly` | 1 year | 59.99 | 45.99 | 52.49 | 83.49 | Introductory: free, 1 week, all new subscribers, all territories |
| Repwise Pro 3 Months | `com.client.repwise.pro.quarterly` | 3 months | 24.99 | 18.99 | 21.99 | 34.99 | none |
| Repwise Pro Monthly | `com.client.repwise.pro.monthly` | 1 month | 12.99 | 9.99 | 11.49 | 18.49 | none |
| Repwise Pro Weekly | `com.client.repwise.pro.weekly` | 1 week | 4.99 | 3.99 | 4.49 | 6.99 | none |

Pick the nearest Apple price points to these values, then check the territory table. Per-subscription localization (en-US): Display name "Repwise Pro Yearly" (etc.); description "AI plans that adapt every week, daily meals, grocery list and full progress history." Review screenshot: the paywall (`screen-paywall`). Review notes: "Paywall appears after onboarding; see App Review notes."

Subscription terms to show in the app and in the description (already in the description and paywall): price, period, "auto-renews until cancelled", "cancel any time in your Apple ID settings", Terms and Privacy links.

Server: App Store Server API key + Server Notifications v2 URL (production and sandbox) pointing at the Worker. See `docs/BILLING_SETUP.md`. Add Sandbox testers in Users and Access.

## 5. Version 1.0 (Prepare for Submission)

| Field | Answer |
|---|---|
| Screenshots | 6.9 or 6.7 inch iPhone set, 8 frames from `screenshots.md`. 6.5 inch if Connect asks |
| Promotional text | from `app-store.md` (152) |
| Description | from `app-store.md` (3510) |
| Keywords | from `app-store.md` (98) |
| Support URL | https://repwise.app/support (placeholder) |
| Marketing URL | https://repwise.app (placeholder) |
| Version | 1.0 |
| Copyright | 2026 BufferSol Technologies LLC (confirm legal name) |
| What's new | from `app-store.md` |
| Build | Select the TestFlight build from EAS Submit |
| Sign-in required | **No** (leave Sign-in information blank) |
| Contact for review | First/last name, phone, buffersoltechnologies@gmail.com |
| Notes | The App Review notes block in `app-store.md` |
| Version release | Manually release after approval |

## 6. App Privacy

Privacy policy URL as above. Then enter the table in `DATA_SAFETY.md` (Apple section): Tracking **No**. Data collected: Email, Name, Health, Fitness, User ID, Purchase History (linked to the user, only when signed in); Product Interaction, Crash Data, Performance Data, Other Diagnostic Data (not linked). All purposes App Functionality or Analytics. Nothing for Third-Party Advertising.

## 7. Account deletion (guideline 5.1.1(v))

Account creation in app: optional. In-app deletion: Settings > Account > Delete account (full delete of server data and local sign-out). Web deletion page: https://repwise.app/delete-account (placeholder). Sign in with Apple is offered because Google sign-in is offered (guideline 4.8).

## 8. Export compliance and other prompts

| Prompt | Answer |
|---|---|
| Uses encryption | Yes, only standard HTTPS/TLS (exempt). `ITSAppUsesNonExemptEncryption` false |
| Third-party content | No |
| Advertising identifier (IDFA) | **No** |
| Made for Kids | No |
| Digital Services Act trader status (EU) | Declare as trader if distributing in the EU, with contact email above |
| Health / medical regulated device | No |

## 9. Pre-submission checklist
- [ ] TestFlight build installed on a real device, onboarding offline and online both tested
- [ ] Subscription products "Ready to Submit", attached to the version, sandbox purchase, trial, restore tested
- [ ] Info.plist usage strings present (camera, photo library, notifications primer) and privacy manifest lists the collected types above
- [ ] Privacy, terms and deletion pages live
- [ ] Screenshots show only shipped features; no competitor names in any text
