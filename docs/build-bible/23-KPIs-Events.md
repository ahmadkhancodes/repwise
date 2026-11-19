# 23 KPIs & Events

| Repwise · KPIs & Events |  |  |  |
| Targets and the analytics event plan. |  |  |  |
| ← Back to Start Here |  |  |  |
| KPI | Definition | Target (first 90 days) | Where |
| Day-1 retention | % of installs active the next day | ≥ 45% | PostHog |
| Day-7 retention | % active on day 7 | ≥ 25% | PostHog |
| Onboarding completion | Reached Home / installs | ≥ 80% | PostHog funnel |
| Paywall start rate | Paid starts + trials / onboarding completions | ≥ 10% | Worker + PostHog |
| Trial → paid | Converted trials / trials ended | ≥ 33% | Worker entitlements |
| Core actions per active user per week | Workouts completed + meals ticked per active user per week | ≥ 3 workouts and ≥ 14 meals | PostHog |
| Store rating | Average rating, last 30 days | ≥ 4.7★ | App Store Connect + Play Console |
| Crash-free sessions | Sentry | ≥ 99.5% | Sentry |
| Keyword rank | Rank for 'gym workout planner' in US/UK/CA | Top 3 by day 90; #1 by month 6 | ASO tool + manual check |
| Store listing conversion | Installs / listing visitors | ≥ 30% | App Store Connect + Play Console |
| Event plan (PostHog). Never send body measurements, meal text or AI prompts — only categories and counts. |  |  |  |
| Event | When | Properties |  |
| plan_generated | Plan built | goal, days, diet_type |  |
| workout_finished | Finish | duration_bucket, sets, prs |  |
| meal_logged | Ate it | slot, from_plan |  |
| meal_swapped | Swap | slot |  |
| checkin_done | Check-in | kcal_change_bucket |  |
| ai_call | Server AI call | route, latency_bucket, cached |  |
| app_open | Every foreground | source (cold/warm/widget/notification) |  |
| onboarding_step | Each onboarding screen | step, index |  |
| onboarding_complete | Reached Home first time | duration_s |  |
| notification_permission | After system prompt | granted (bool) |  |
| paywall_view | Paywall shown | source |  |
| trial_start | Purchase success with trial | plan |  |
| purchase | Paid purchase | plan |  |
| restore | Restore tapped | found (bool) |  |
| auth_success | Signed in | method |  |
| widget_added | Widget enabled | type |  |
| review_prompt | Store review asked | moment |  |
| export | Export done | format |  |
