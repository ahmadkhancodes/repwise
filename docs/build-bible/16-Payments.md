# 16 Payments

| Repwise · Payments |  |
| App Store + Google Play subscriptions, entitlements on our Worker. |  |
| ← Back to Start Here |  |
| Stores | Native in-app subscriptions only: Apple StoreKit 2 (iOS) and Google Play Billing (Android) via react-native-iap. No web checkout in v1. |
| Products | Subscription group 'Repwise Pro': weekly $4.99, monthly $12.99, quarterly $24.99, yearly $59.99 (1-week free trial). Same 4 base plans on Play. |
| Entitlement | Worker is the single source of truth: iOS → App Store Server API + App Store Server Notifications v2 webhook; Android → Play Developer API + RTDN Pub/Sub webhook. GET /billing/entitlement cached on device. |
| Cross-platform | Entitlement bound to the user account, so Pro works on iOS and Android after sign-in (store purchase on one platform unlocks the account). |
| Paywall rules | Show price, period, trial and price after trial, auto-renew, Restore, Terms, Privacy; close X immediately (Apple 3.1.2 / Play policy). |
| Manage / cancel | Settings → Subscription → 'Manage' opens the store subscription page (fixes the #1 complaint of the reference app). |
| Testing | Apple sandbox testers + StoreKit config file; Play license testers; test trial → renew → cancel → restore on both. |
| Refunds | Handled by Apple / Google; support replies with official links. |
| Paywall copy (use verbatim, edit only prices) |  |
| Element | Copy |
| Header | Your plan is ready, {name}. |
| Proof row | Goal: {goal} by {date} · {kcal} kcal/day · {days}×/week |
| Benefits | AI workouts that adapt every week · Daily meal plan in your cuisine · Meal & workout reminders · Progress tracking · No ads |
| Plan 1 (pre-selected) | Yearly — $59.99 · $1.15/week · 7 days free |
| Plan 2 | 3 Months — $24.99 |
| Plan 3 | Monthly — $12.99 |
| Plan 4 | Weekly — $4.99 |
| CTA | Start free trial / Continue |
| Footer | Auto-renews until cancelled. Cancel anytime in your App Store / Google Play settings. Restore · Terms · Privacy |
