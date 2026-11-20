# Repwise Privacy Policy

Last updated: 19 November 2026 · Draft for the website page https://repwise.app/privacy

Repwise is an AI gym and meal planner. This policy explains what we collect, why, who helps us run the app, and the choices you have. We have tried to keep it short and plain.

**Who we are.** Repwise is operated by BufferSol Technologies LLC (confirm the registered company name and address before publishing) ("we", "us"). We are the controller of your personal data. Contact: **buffersoltechnologies@gmail.com**.

## The short version

- You can use Repwise **without an account**. Without one, your plans, workouts, meals and progress stay **on your device**.
- An account is **optional** and only for backing up, restoring and syncing across your devices, and for keeping your Pro subscription across devices.
- **No ads. No selling your data. No tracking across other companies' apps or websites.**
- Health, fitness and nutrition data is **not shared with third parties** for their own purposes.
- You can delete your account and data at any time, in the app or on our website.

## What we collect

### 1. Data you enter (stored on your device)
Your goal, sex, year of birth, height, weight, equipment, schedule, diet type, allergies, foods you dislike, injuries note, workouts, sets, meals and food logs, water, body measurements, and progress photos. This is stored in the app on your phone. Progress photos stay in the app's private storage, are never saved to your gallery, and are only shared if you tap Share.

### 2. Data we back up, if you create an account
If you sign in, we copy your profile, plans, workouts, meals, food logs, body measurements and the records of your progress photos (date and pose) to our server so you can restore them on a new phone. We send it over an encrypted connection (HTTPS/TLS) and it is stored in a database that is encrypted at rest. In this version the photo files themselves are not uploaded.

### 3. Account data
Your email address (if you sign in by email code), or the identifier Google or Apple gives us when you use Sign in with Google / Apple (Apple may let you hide your email), plus an internal user id.

### 4. Subscription data
If you subscribe, Apple or Google processes your payment. We receive a purchase receipt or token and your subscription status, and check it with the store so Pro unlocks. We never see your card details.

### 5. Usage and technical data
- **Analytics (PostHog):** anonymous product events such as "finished a workout" or "opened the paywall", tied to a random install id, not to your name or email. You can switch this off in Settings.
- **Crash reports (Sentry):** error details, device model, operating system and app version, so we can fix bugs. We do not put health data or your email in crash reports.
- We do not use the advertising id.

## How AI is used

Repwise uses AI to personalise your plans. When it builds or changes a plan, the app asks **our server**, and our server calls an AI provider (**Anthropic**). The request contains things like your goal type, equipment, diet and allergy tags, calorie and protein targets, and ids of exercises and recipes to choose from. It does **not** contain your name, email, user id, photos or notes. Calculations (calories, macros, sets, reps) are done by our own tested rules, not by the AI. Under the provider's commercial API terms, your requests are not used to train its models. If the AI is unavailable or its answer is invalid, Repwise uses a rules-based plan instead.

## Why we use your data (legal bases)

| Purpose | Basis (UK/EU GDPR) |
|---|---|
| Running the app, your plans and your logs | Contract (providing the service you asked for) |
| Backup, restore and sync when you sign in | Contract, and for health data your explicit consent, which you give by turning on backup (you can withdraw it by signing out and deleting your account) |
| Verifying subscriptions | Contract and legal obligation (tax records) |
| Anonymous analytics | Legitimate interests (improving the app); you can opt out in Settings |
| Crash reports and security | Legitimate interests (keeping the app working and secure) |
| Replying to your emails | Legitimate interests / contract |

Some of the data you enter (weight, diet, allergies, injuries note) is health-related, so we handle it as sensitive. We only send it off your device if you sign in for backup.

## Who we share data with (processors)

We use these providers to run Repwise. They act on our instructions and may not use your data for their own purposes (except where noted):

| Provider | What for | Data |
|---|---|---|
| Cloudflare | Hosting our API (Workers) | Requests from the app, backup data in transit |
| MongoDB Atlas | Database for accounts and backups | Account and backup data |
| Anthropic | AI plan personalisation | Non-identifying plan inputs (see above) |
| Apple, Google | Sign in, subscriptions, app distribution | Sign-in identifiers, purchase data |
| Cloudinary | Delivering exercise demo images and videos | Standard request data (IP address); no account data |
| PostHog | Anonymous analytics | Random install id, events |
| Sentry | Crash reports | Technical data |

We do not sell personal data and do not share it for advertising. We may disclose data if the law requires it.

## International transfers
Our providers may process data in the United States and other countries. Where required (UK/EU), we rely on adequacy decisions or standard contractual clauses (with the UK addendum).

## How long we keep data
- On your device: until you delete the data or uninstall the app.
- Account and backup data: until you delete your account. After you delete, we remove it from live systems straight away and from backups within 30 days.
- Anonymous analytics and crash reports: up to 12 months.
- Purchase and tax records: as long as the law requires (usually 6 to 7 years).

## Your choices and rights
In the app: edit or delete any entry, export or share photos, turn off analytics, sign out, **delete your account** (Settings > Account > Delete account). On the web: https://repwise.app/delete-account.

If you are in the UK, EU, Canada or a US state with a privacy law (such as California), you have rights to access, correct, delete and receive a copy of your data, to object to or restrict some uses, and to withdraw consent. We do not sell or share personal data for cross-context advertising, so there is nothing to opt out of there. Email buffersoltechnologies@gmail.com and we will reply within 30 days (one month under UK GDPR). We will not discriminate against you for using your rights. You can also complain to your regulator: the ICO in the UK (ico.org.uk), the Office of the Privacy Commissioner of Canada, or your local data protection authority.

## Children
Repwise is for adults (18 and over). We do not knowingly collect data from children. If you think a child has given us data, email us and we will delete it.

## Health notice
Repwise gives general fitness and nutrition guidance for healthy adults. It is not medical advice. See our Terms.

## Security
Encryption in transit (TLS), encryption at rest at our database provider, access limits on our systems, and tokens that rotate. No system is perfectly secure, so keep your device locked and updated.

## Changes
If we change this policy in a meaningful way we will update the date above and tell you in the app before the change applies.

## Contact
buffersoltechnologies@gmail.com
