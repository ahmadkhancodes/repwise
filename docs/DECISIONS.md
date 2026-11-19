# Decisions

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 19 Nov 2026 | iOS + Android from day 1; iOS ready and tested (simulator + Maestro), App Store publish decided later | Owner request |
| D2 | 19 Nov 2026 | Rules-first AI planner; Worker /ai routes with AI_PROVIDER=none by default | Bible conflict: "no LLM costs" vs "LLM via Worker"; rules engine satisfies both |
| D3 | 19 Nov 2026 | Store subscriptions via react-native-iap (StoreKit 2 + Play Billing), verified by the Worker | Store policy for digital subscriptions; bible sheet 16 |
