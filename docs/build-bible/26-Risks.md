# 26 Risks

| Repwise · Risks |  |  |  |  |
| What could go wrong and the mitigation. |  |  |  |  |
| ← Back to Start Here |  |  |  |  |
| Risk | Likelihood | Impact | Mitigation | Owner |
| AI generates unsafe or allergen meal | Low | High | Recipes come only from our validated DB; allergen filter is rules-based before and after AI; QA-G3. | Developer |
| AI cost overrun | Medium | Medium | Caching, weekly batch generation, free users rules-only, budget alerts, cheap model. | Ahmad |
| Content licence issue (GIFs/recipes) | Medium | High | Licence register; replace unlicensed assets before launch. | Client |
| Scope (5 modules) slips | Medium | High | Weekly demos; cut P1s first; keep P0 list frozen. | Ahmad |
| Closed-testing rule delays launch | High | Medium | Start closed test on Day 8 with 15–20 testers; keep them engaged with weekly builds. | Developer |
| App Review / Play policy rejection (subscriptions, health claims) | Medium | High | Follow sheets 16 and 24; full paywall disclosures; no medical claims; demo account for reviewers. | Developer |
| Notifications killed by battery savers (Samsung) | Medium | High | Test on Samsung; in-app guide to disable battery optimisation if reminders are missed. | Developer |
| Competitor copies our features | High | Medium | Ship fast, own reviews and rank; our price and design are hard to match without cutting their revenue. | Ahmad |
| Price ladder mis-set for the market | Medium | Medium | Re-test pricing after 60 days (Play price experiments; App Store offer codes / A-B paywall). | Ahmad |
| Data loss bug | Low | High | Local-first + Auto Backup + cloud backup; migrations tested; never delete data on downgrade. | Developer |
