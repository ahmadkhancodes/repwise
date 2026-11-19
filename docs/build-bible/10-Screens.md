# 10 Screens

| Repwise · Screens |  |  |  |  |  |  |  |  |  |
| Every screen: route, layout, actions, states (light + dark). |  |  |  |  |  |  |  |  |  |
| ← Back to Start Here |  |  |  |  |  |  |  |  |  |
| 42 screens (limit 20). Routes use Expo Router. Every screen: one primary action, white background, 20px side padding. |  |  |  |  |  |  |  |  |  |
| ID | Screen | Route | Purpose | Layout top → bottom | Primary action | Other actions | Empty / error states | Free / Pro | Motion & haptics |
| S01 | Splash | (native) | Brand | Monochrome logo | — | — | — | Both | Fade |
| S02 | Welcome | /(onboarding)/welcome | Value: 'Your workouts and meals, planned daily' | Full-bleed photo, 2 lines, CTA | Get started · I have an account | — | — | Both |  |
| S03 | Quiz: goal & body | /(onboarding)/q/[step] | Goal, sex, age, height, weight, target | One question per screen, big tiles | Next | Validation | — | Both | Slide |
| S04 | Quiz: training | /(onboarding)/q/[step] | Experience, days, length, gym type, equipment grid, injuries |  |  |  |  | Both |  |
| S05 | Quiz: food | /(onboarding)/q/[step] | Diet type, allergies, dislikes, cuisine, budget, cook time, meals/day, meal times |  |  |  |  | Both |  |
| S06 | Notification primer | /(onboarding)/notify | Why reminders (meals + workouts) |  | Allow | Denied |  | Both |  |
| S07 | Building + plan preview | /(onboarding)/plan | Animated build → summary | Rings, week strip, today's meals | Continue |  |  | Both | W1 |
| S08 | Training plan (week) | /(tabs)/train | Week strip, block progress, sessions |  | Open session, regenerate |  | Pro after wk1 | Both |  |
| S09 | Session overview | /train/session/[id] | Exercises, est. time, muscles |  | Start, swap, reorder |  |  | Both |  |
| S10 | Programs | /train/programs | Program cards |  | Start program |  | Pro | Both |  |
| S11 | Today (home) | /(tabs)/today | Brief, workout card, meal timeline, rings, assistant cards | Uber-style stacked cards | Start workout, tick meal | Rest day state |  | Both |  |
| S12 | Assistant card detail | /today/card/[id] | Explanation + one action |  | Apply / Dismiss |  |  | Both | Sheet |
| S13 | Workout player – list | /workout/[id] | Exercise cards with set rows |  |  |  |  | Both |  |
| S14 | Workout player – exercise | /workout/[id]/ex/[ex] | GIF, set rows, previous, timer |  | Tick, add set, swap |  |  | Both |  |
| S15 | Swap sheet | /workout/swap (sheet) | 3 alternatives |  | Pick |  |  | Both | Sheet |
| S16 | Routine builder | /train/routine/[id] | Exercises, sets, drag |  |  |  | Free 3 | Both |  |
| S17 | Tools | /tools | Plate calc, 1RM calc, % table |  |  |  |  | Both |  |
| S18 | Exercise library | /(tabs)/library | Search + filters |  |  | No results |  | Both |  |
| S19 | Exercise detail | /library/[id] | GIF, muscles, steps, records |  | Add to workout |  |  | Both |  |
| S20 | Nutrition targets | /eat/targets | kcal, macros, day types |  | Edit |  |  | Both |  |
| S21 | Meal plan (day/week) | /(tabs)/eat | Day timeline + week switcher |  | Swap, tick, recipe |  | Pro beyond today | Both |  |
| S22 | Swap meal sheet | /eat/swap (sheet) | 3 alternatives |  |  |  |  | Both | Sheet |
| S23 | Ate out / quick log | /eat/log | Search food, portions |  |  |  |  | Both |  |
| S24 | Recipe + cook mode | /eat/recipe/[id] | Ingredients, steps, macros |  | Cook mode |  |  | Both |  |
| S25 | Grocery list | /eat/grocery | Aisle groups, checkboxes |  | Share | Empty | Pro | Both |  |
| S26 | Nutrition day log | /eat/day/[date] | Rings + logged items |  |  |  |  | Both |  |
| S27 | Water | /eat/water | Quick add |  |  |  |  | Both |  |
| S28 | Weekly check-in | /checkin | 4 steps + adjustments |  | Approve |  | Pro | Both |  |
| S29 | Progress home | /(tabs)/progress | Calendar, streak, highlights |  |  |  |  | Both |  |
| S30 | Body weight & measurements | /progress/body | Trend chart, measurements |  | Add |  |  | Both |  |
| S31 | Exercise records | /progress/exercise/[id] | 1RM/volume charts, PRs |  |  |  |  | Both |  |
| S32 | Muscle heatmap | /progress/heatmap | Front/back map |  |  |  |  | Both |  |
| S33 | Progress photos | /progress/photos | Grid + compare slider |  | Add photo |  | Pro | Both |  |
| S34 | Wrapped / badges | /progress/wrapped | Shareable cards |  | Share |  |  | Both |  |
| S35 | Workout summary | /workout/[id]/summary | Time, volume, PRs, share |  |  |  |  | Both |  |
| S36 | History | /progress/history | All workouts & meals |  |  |  |  | Both |  |
| S37 | Paywall | /paywall | 4 plans, yearly pre-selected |  |  |  |  | Both | Modal |
| S38 | Settings | /settings | Profile, my plan, units, theme, notifications, export |  |  |  |  | Both |  |
| S39 | Account / sign-in | /settings/account | Apple / Google / email |  |  |  |  | Both |  |
| S40 | Sync & restore | /settings/sync | Status, restore |  |  |  |  | Both |  |
| S41 | Subscription | /settings/subscription | Plan, renewal, manage, restore |  |  |  |  | Both |  |
| S42 | Help, legal, delete account | /settings/help |  |  |  |  |  | Both |  |
