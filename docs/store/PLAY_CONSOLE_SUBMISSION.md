# Google Play Console: answers to paste, in the console's order

App: Repwise · Package `com.client.repwise` · Developer contact: buffersoltechnologies@gmail.com
Copy text from `play-listing.md` (listing), `DATA_SAFETY.md` (data safety), `release-notes.txt`. Placeholders marked (placeholder) need the real website before production.

## 1. Create app (Dashboard > Create app)

| Field | Answer |
|---|---|
| App name | Repwise: AI Gym & Meal Planner |
| Default language | English (United States) en-US |
| App or game | App |
| Free or paid | Free (with in-app subscriptions) |
| Declarations | Tick developer program policies and US export laws |

## 2. Set up your app (Dashboard task list, same order as the console)

### 2.1 Privacy policy
URL: https://repwise.app/privacy (placeholder; content `docs/legal/privacy.md`)

### 2.2 App access
Select **All functionality is available without special access**. (No login is required; sign-in is optional.) Add the instruction text: "No account needed. Tap Get started and finish the quiz."

### 2.3 Ads
**No, my app does not contain ads.**

### 2.4 Content rating (IARC questionnaire)
Email: buffersoltechnologies@gmail.com. Category: **All other app types** (not a game, not social, not news).

| Question | Answer |
|---|---|
| Violence (any) | No |
| Sexuality / nudity | No |
| Profanity / crude humor | No |
| Controlled substances (drugs, alcohol, tobacco) | No |
| Gambling or simulated gambling | No |
| Does the app share the user's location with others | No |
| Users can interact or exchange content | No |
| Digital purchases | Yes (subscriptions) |
| Unrestricted internet access / web browser | No |
| Health-related information | Fitness and nutrition guidance only; answer per questionnaire wording, no medical claims |
| Expected result | Everyone or Teen. Accept the calculated rating. |

### 2.5 Target audience and content
| Field | Answer |
|---|---|
| Target age groups | **18 and over** only (tick nothing younger) |
| Appeals to children | No |
| Store listing may unintentionally appeal to children | No |

### 2.6 Data safety
Enter exactly the tables in `DATA_SAFETY.md` (Google Play section). Data deletion URL: https://repwise.app/delete-account (placeholder).

### 2.7 Government apps
No.

### 2.8 Financial features
My app does not provide any financial features.

### 2.9 Health apps declaration
Yes, the app has health features. Select **Activity and fitness** and **Nutrition and weight management**. Not a medical device, not clinical research, no health data from Health Connect (not used). Disclaimer shown in onboarding, Settings > About and the listing.

### 2.10 Advertising ID
**No**, the app does not use the advertising ID (the AD_ID permission is removed in the manifest).

### 2.11 News apps
Not a news app.

### 2.12 Account deletion (part of Data safety)
Account creation in app: Yes (optional). In-app deletion: Settings > Account > Delete account. Web URL: https://repwise.app/delete-account (placeholder). Say that data is deleted within 30 days (backups included) except records we must keep, such as purchase records.

### 2.13 App category and contact details
| Field | Answer |
|---|---|
| Category | Health & Fitness |
| Tags | Fitness, Workout, Gym, Nutrition (pick from the offered list) |
| Email | buffersoltechnologies@gmail.com |
| Website | https://repwise.app (placeholder) |
| Phone | optional, leave blank |
| External marketing | Allow (default) |

## 3. Main store listing (Grow users > Store presence > Main store listing)

Use the en-US block from `play-listing.md`: title (30), short description (75), full description (3513). Then add translations en-GB and en-CA from the same file (Manage translations > English (United Kingdom), English (Canada)).

| Asset | Spec | Source |
|---|---|---|
| App icon | 512 x 512 PNG, black square, white "R", small green dot | assets |
| Feature graphic | 1024 x 500 | `screenshots.md` brief |
| Phone screenshots | 8 frames, 1080 x 2340 | `screenshots.md` |
| Tablet screenshots | Optional for v1 (phone-only listing) | |
| Promo video | Optional | |

What's new for the first release (en-US, 437 chars): paste `release-notes.txt`.

## 4. Monetize > Products > Subscriptions

Create subscription **Repwise Pro**, product ID `repwise_pro`. Benefits (up to 4): "AI plans that adapt every week", "Daily meal plan with swaps", "Grocery list and reminders", "Full progress history". Tax and compliance category: default for apps.

Base plans (all auto-renewing, grace period 7 days, account hold 30 days, resubscribe allowed):

| Base plan ID | Billing period | USD | GBP | EUR | CAD | Offer |
|---|---|---|---|---|---|---|
| `weekly` | P1W (weekly) | 4.99 | 3.99 | 4.49 | 6.99 | none |
| `monthly` | P1M (monthly) | 12.99 | 9.99 | 11.49 | 18.49 | none |
| `quarterly` | P3M (every 3 months) | 24.99 | 18.99 | 21.99 | 34.99 | none |
| `yearly` | P1Y (yearly) | 59.99 | 45.99 | 52.49 | 83.49 | `trial-7d` |

Offer on `yearly`: ID **`trial-7d`**, eligibility **New customer acquisition** (never had this subscription), phase 1: **Free trial, 7 days**, then the base price. Tags: none. Other countries: let Play convert from USD, then apply the prices from `docs/build-bible/05-Pricing-Trial.md` (the AED and PKR columns there). Activate each base plan and the offer.

The paywall copy that matches this setup: "Start your 7-day free trial. Then $59.99/year ($1.15/week). Cancel anytime." Trial is shown only if the store reports the user as eligible.

Server: Play Developer API service account with subscription read access, and RTDN topic (Pub/Sub) pointing at the Worker webhook. See `docs/BILLING_SETUP.md`. Payments stay behind `PAYMENTS_ENABLED` until this is done.

## 5. Release > Testing

| Step | Answer |
|---|---|
| Internal testing | Add testers, upload AAB, add license testers (Settings > License testing) for subscription tests |
| Closed testing | New personal developer accounts need 12 testers for 14 days before production; check the account type |
| Production countries | United States, United Kingdom, Canada first (add more later) |
| Release notes | `release-notes.txt` |
| App signing | Play App Signing (default) |

## 6. Pre-launch checklist
- [ ] Privacy URL and deletion URL live and match `docs/legal/*`
- [ ] Data safety saved and consistent with the shipped build
- [ ] Subscriptions active, `trial-7d` attached to `yearly`, license tester can buy and cancel
- [ ] Screenshots show only shipped features
- [ ] Target audience 18+, ads No, advertising ID No
