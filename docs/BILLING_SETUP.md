# Billing setup (what Ahmad creates in the stores)

Repwise sells one auto-renewing subscription, **Repwise Pro**, on both stores (sheet 05/16).
The app buys with `react-native-iap`; the Worker (`server/`) verifies every purchase and is the only
source of Pro. Product ids below must match `src/features/billing/config.ts` and `server/src/config.ts`
(or override both with the Worker's `PLANS_JSON`).

| Plan | USD | App Store product id | Play base plan |
|---|---|---|---|
| Weekly | 4.99 | `com.client.repwise.pro.weekly` | `weekly` (P1W) |
| Monthly | 12.99 | `com.client.repwise.pro.monthly` | `monthly` (P1M) |
| 3 Months | 24.99 | `com.client.repwise.pro.quarterly` | `quarterly` (P3M) |
| Yearly | 59.99 + 7-day free trial | `com.client.repwise.pro.yearly` | `yearly` (P1Y) + offer `trial-7d` |

Local prices per country: sheet 05 (GBP, EUR, CAD, AED, PKR rows).

## 1. App Store Connect (iOS)

1. **Agreements, Tax and Banking**: the Paid Apps agreement must be active, or no product loads.
2. App `com.client.repwise` → **Features → In-App Purchase** capability is on for the App ID
   (developer.apple.com → Identifiers; on by default).
3. **Subscriptions → Subscription group** `Repwise Pro` (one group, so users can only hold one plan).
4. Create 4 **auto-renewable subscriptions** in that group with the ids above, durations 1 week /
   1 month / 3 months / 1 year, prices from sheet 05 (set USD, then edit other countries), a display
   name and description per locale, and the review screenshot (the paywall).
   Suggested service level order (top = highest): Yearly, 3 Months, Monthly, Weekly.
5. On **Yearly** only: **Introductory offer → Free, 1 week**, all countries, new subscribers.
   (The app only shows the trial when StoreKit says the Apple ID is eligible.)
6. **App Store Server Notifications**: App Information → App Store Server Notifications →
   **Version 2**, Production URL and Sandbox URL both `https://<api-host>/webhooks/apple`.
7. Worker secrets (server/README.md): `APPLE_ROOT_CA_G3_B64` (required), and for live status lookups
   `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (Users and Access → Integrations →
   In-App Purchase key).
8. Submit the 4 subscriptions **with the first app version** that shows the paywall.

## 2. Play Console (Android)

1. **Payments profile** linked (Setup → Payments profile), or subscriptions cannot be created.
2. Upload any build that contains `react-native-iap` (Play Billing adds `com.android.vending.BILLING`)
   to a testing track first; Play only lets you create products after that.
3. **Monetize → Products → Subscriptions → Create subscription**: Product ID `repwise_pro`,
   name "Repwise Pro".
4. Add 4 **base plans**: ids `weekly`, `monthly`, `quarterly`, `yearly`; auto-renewing; billing
   periods 1 week / 1 month / 3 months / 1 year; prices from sheet 05; activate each.
5. On base plan `yearly` → **Add offer**: id `trial-7d`, eligibility **New customer acquisition →
   Never had this subscription**, phase **Free trial, 7 days**. Activate.
   (Play only returns offers the user is eligible for, so the app shows the trial only then.)
6. **Real-time developer notifications (RTDN)**: Google Cloud → Pub/Sub → create topic
   `repwise-play-rtdn`, grant `google-play-developer-notifications@system.gserviceaccount.com` the
   *Pub/Sub Publisher* role, then Play Console → Monetize → Monetization setup → topic name
   `projects/<gcp-project>/topics/repwise-play-rtdn` → Send test notification.
7. Push subscription on that topic → endpoint `https://<api-host>/webhooks/play`, with
   **authentication (OIDC)** on, audience = that URL (Worker `PLAY_PUBSUB_AUDIENCE`,
   `PLAY_PUBSUB_SERVICE_ACCOUNT`). Without OIDC use `…/webhooks/play?token=<PLAY_RTDN_SECRET>`.
8. Service account for the Play Developer API: Google Cloud → IAM → service account + JSON key;
   Play Console → Users and permissions → invite it with **View financial data** and **Manage orders
   and subscriptions**. Put the JSON in the Worker secret `PLAY_SERVICE_ACCOUNT_JSON`.

## 3. Testers

**iOS sandbox**
- App Store Connect → Users and Access → **Sandbox → Test accounts**: create 2+ testers (a fresh
  email each; one per "new customer" trial test).
- On the device: Settings → App Store → **Sandbox Account** → sign in (iOS 18+; no need to sign out
  of the real Apple ID).
- Sandbox renewals are fast (1 week ≈ 3 minutes, 1 year ≈ 1 hour); a trial converts in minutes.
- Optional local testing without App Store Connect: a StoreKit configuration file in Xcode
  (only for the ios-simulator profile; it does not reach our Worker's Apple verification).

**Android license testers**
- Play Console → Settings → **License testing**: add the testers' Google accounts, response
  `RESPOND_NORMALLY`. Testers must also be on the internal testing track and install from Play.
- Test cards: "Test card, always approves" / "declines" / "slow card (approves after a few minutes)"
  — the slow card exercises the pending-purchase path.
- Test subscriptions renew every 5 minutes (weekly) to 30 minutes (yearly) and stop after 6 renewals.

## 4. Turn payments on

1. Worker: `PAYMENTS_ENABLED=true` (all `/billing/*` and `/webhooks/*` routes are 404 until then).
2. The app reads `GET /config` → `payments_enabled`; nothing is gated and the paywall cannot open
   until it is true.
3. Acceptance (sheet 18 P-PAY), on both platforms: trial → Pro within 3 s; cancel in the store →
   Pro until period end; Restore on the OTHER platform after signing in with the same account.
