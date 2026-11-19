# 28 AI Engine

| Repwise · AI Engine |  |  |  |  |
| How the AI planner works: rules engine + LLM, uniqueness, prompts, cost control. |  |  |  |  |
| ← Back to Start Here |  |  |  |  |
| Rule: deterministic engines decide WHAT is safe and correct (calories, macros, sets, reps, equipment, allergens). The LLM only chooses and words VARIETY from our own validated catalogues and writes friendly copy. Every AI output is JSON-validated; if anything fails, the rules-only fallback ships instantly. |  |  |  |  |
| Pipeline |  |  |  |  |
| Step | Where | What happens | Output |  |
| 1 | Device | Profile + history summary (last 14 days sessions & meals, recent PRs, adherence) sent to Worker | Compact JSON (no names/emails) |  |
| 2 | Worker rules | Compute targets (kcal/macros/day types), split, weekly volume per muscle, recovery heatmap; build candidate pools (exercises fitting equipment/injury; recipes fitting diet/allergy/cuisine/budget/time) excluding recent items | Candidate lists + constraints |  |
| 3 | LLM | Pick & order items from candidate IDs to create varied sessions/menus; write titles, one-line coaching notes | JSON by schema (IDs only) |  |
| 4 | Validator | Check IDs exist, constraints hit (kcal ±5%, protein ±10 g, no allergens, equipment ok, volume within range, no repeats); portion solver adjusts servings to hit macros | Valid plan or fallback |  |
| 5 | Store + cache | Save plan to MongoDB; cache by profile hash; device syncs; notifications scheduled locally | Plan v-number |  |
| Uniqueness rules ('every time different') |  |  |  |  |
| Rule | Detail |  |  |  |
| Exercise rotation | Each movement pattern has 6–20 variants; no variant repeats in consecutive sessions for the same pattern; main lifts stay for a 4–6 week block (progress needs consistency), accessories rotate every session. |  |  |  |
| Session fingerprint | Hash of ordered exercise IDs; must differ from the last 10 sessions. |  |  |  |
| Meal no-repeat | No recipe within 14 days (configurable 7–30); no same protein source twice in a day; cuisine rotation. |  |  |  |
| Smart re-use | Ingredients shared across 2–3 meals per week to keep grocery cost down (grocery-aware selection). |  |  |  |
| User signals | 'Never show again' and 'more like this' adjust candidate weights. |  |  |  |
| Nutrition maths (deterministic — never ask the LLM to do maths) |  |  |  |  |
| Item | Formula / rule |  |  |  |
| BMR | Mifflin-St Jeor: 10×kg + 6.25×cm − 5×age + 5 (men) / −161 (women). |  |  |  |
| TDEE | BMR × activity factor (1.2–1.725 from steps/job + training days). |  |  |  |
| Goal | Fat loss −15–20% (floor: never below BMR×1.1 or 1,200/1,500 kcal), muscle gain +8–12%, recomposition maintenance. |  |  |  |
| Macros | Protein 1.6–2.2 g/kg; fat ≥ 0.6 g/kg; carbs = rest. Training days +15% carbs, rest days −15%. |  |  |  |
| Adjustment | Weekly: compare 7-day weight trend vs expected; change kcal by ±100–200. |  |  |  |
| Training maths (deterministic) |  |  |  |  |
| Item | Formula / rule |  |  |  |
| Split | 2–3 days full body; 4 upper/lower; 5–6 PPL (or user choice). |  |  |  |
| Volume | 10–20 hard sets/muscle/week by experience; starts at low end. |  |  |  |
| Progression | Double progression: reach top of rep range on all sets → +2.5 kg upper / +5 kg lower (or +1 rep for bodyweight). |  |  |  |
| Deload | Every 4–6 weeks or after 2 stalled sessions: −40% volume. |  |  |  |
| Starting loads | From quiz benchmark or first-session calibration; 1RM by Epley. |  |  |  |
| LLM calls (server-side only, JSON-schema output, validated) |  |  |  |  |
| Call | When | Input | Output schema | Budget |
| plan_week | Weekly (check-in) or plan regen | Targets, candidate exercise IDs, constraints, recent fingerprints | {sessions:[{day, title, items:[{exercise_id, sets, reps, rest_s}]}]} | ≤ 4k tokens |
| meals_week | Weekly + on regen | kcal/macro targets per day, candidate recipe IDs, recent recipes | {days:[{date, meals:[{slot, recipe_id}]}]} | ≤ 5k tokens |
| swap | User taps swap | Item + candidates | {options:[id,id,id]} | ≤ 800 tokens (often rules-only) |
| card_copy | Daily | Triggered rule + numbers | {title, body, action} | ≤ 300 tokens |
| checkin_summary | Weekly | Trend numbers | {summary, changes[]} | ≤ 600 tokens |
| Assistant suggestion cards (rule-triggered, LLM-worded) |  |  |  |  |
| ID | Trigger | Card copy example | Action |  |
| C1 | Muscle imbalance > 2:1 this week | 'Chest 3×, legs 1× — make Friday a leg day?' | Swap session |  |
| C2 | Protein < 80% target by 18:00 | '40 g protein short — Greek yogurt + nuts?' | Add snack |  |
| C3 | Missed planned workout | 'Missed Tuesday — moved Push to tomorrow.' | Accept re-plan |  |
| C4 | Stall 2 sessions on a lift | 'Bench stuck at 70 kg — try paused bench for 3 weeks?' | Apply variation |  |
| C5 | 5+ workouts in 5 days | 'Recovery day suggested — light walk + stretch.' | Swap to rest |  |
| C6 | Weight trend off target 2 weeks | 'Trend flat — lower 150 kcal from Monday?' | Apply |  |
| Cost model per user |  |  |  |  |
| Plan calls per paying user per month | 6 |  |  |  |
| Avg tokens per call (in+out) | 6000 |  |  |  |
| Blended $ per 1M tokens (verify current provider pricing) | 1 |  |  |  |
| Swap/card calls per month | 60 |  |  |  |
| Avg tokens per small call | 600 |  |  |  |
| AI cost per paying user per month | 0.072 |  |  |  |
| Safety & guardrails |  |  |  |  |
| •  Allergen & diet filters applied BEFORE (candidate pool) and AFTER (validator) the LLM. |  |  |  |  |
| •  Unsafe goals blocked: under-16s, BMI < 18.5 with weight-loss goal, kcal below floor, pregnancy → general plan + 'consult a professional'. |  |  |  |  |
| •  No medical, supplement-dosing or drug advice in any AI copy (prompt rule + regex filter). |  |  |  |  |
| •  Prompts contain no names, emails or photos. |  |  |  |  |
| •  Rate limits per user; daily AI budget cap with rules-only fallback. |  |  |  |  |
| •  Eval set of 200 profiles run on every prompt/model change (QA-G1..G3). |  |  |  |  |
