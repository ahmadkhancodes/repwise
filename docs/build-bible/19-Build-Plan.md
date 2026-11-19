# 19 Build Plan

| Repwise · Build Plan |  |  |  |  |
| Day-by-day plan from empty repo to Play Store. |  |  |  |  |
| ← Back to Start Here |  |  |  |  |
| Target: v1 in 8–9 weeks with 4–6 developers (each with Claude Code) + 1 UI designer from week 1. Weeks 1–2 foundation & design system run in parallel with content import and AI eval set. |  |  |  |  |
| Day | Focus | Tasks (prompts from sheet 18) | Deliverable | Done when |
| W1 | Foundation + design | P1, P2 (light+dark tokens), style tile, content import scripts (sheet 29) | Dev build iOS+Android; style tile approved | Client sign-off on UI direction |
| W2 | Data + auth + server | P3, P-AUTH (Apple/Google/email), Worker skeleton, MongoDB collections, Cloudinary pipeline | Sync working | Phone A ↔ B sync |
| W3 | Onboarding + engines | P6, P7 (rules engines + tests) | Quiz + plan reveal | Uniqueness/macro tests green |
| W4 | Workout | P8, P9 | Player + library | Full offline workout |
| W5 | Meals | P10 + AI meal routes | Meal plan + grocery | Validation suite green |
| W6 | Today, assistant, notifications | P11, P-N1 | Daily loop complete | Notifications at correct local times |
| W7 | Progress + paywall | P12, P-PAY (StoreKit + Play), subscription screens | Monetisation | Sandbox + license tester purchase/restore |
| W8 | Polish + QA | P-POL, P-QA, perf budget, dark-mode QA, accessibility | RC builds | All P0 QA pass |
| W9 | Store prep | TestFlight external + Play closed test, listings, review notes | Submitted | Approved builds |
| Critical path after the build |  |  |  |  |
| When | What |  |  |  |
| W8 | TestFlight external testing + Play closed testing (if the client's Play account is a personal account created after Nov 2023: 12+ testers for 14 days). |  |  |  |
| W9 | App Store review (1–3 days typical) with demo account + notes on AI and subscriptions. |  |  |  |
| Launch | Staged rollout on Play; phased release on iOS over 7 days; watch Sentry, AI cost and reviews. |  |  |  |
