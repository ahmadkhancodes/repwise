# Decisions

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 19 Nov 2026 | iOS + Android from day 1; iOS ready and tested (simulator + Maestro), App Store publish decided later | Owner request |
| D2 | 19 Nov 2026 | Rules-first AI planner; Worker /ai routes with AI_PROVIDER=none by default | Bible conflict: "no LLM costs" vs "LLM via Worker"; rules engine satisfies both |
| D3 | 19 Nov 2026 | Store subscriptions via react-native-iap (StoreKit 2 + Play Billing), verified by the Worker | Store policy for digital subscriptions; bible sheet 16 |
| D2b | 19 Nov 2026 | SUPERSEDES D2: AI in v1 via the Anthropic API behind the Worker, with a hard budget of $50/month (rules-only fallback, an 80%/100% budget guard, caching, daily limits) | Owner decision: AI allowance of $50/month |
