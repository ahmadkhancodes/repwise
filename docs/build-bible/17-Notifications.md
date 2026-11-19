# 17 Notifications

| Repwise · Notifications |  |  |  |  |  |  |
| Every notification, widget and quick action, with copy. |  |  |  |  |  |  |
| ← Back to Start Here |  |  |  |  |  |  |
| All notifications are LOCAL (expo-notifications). Ask for permission on a primer screen after the user has set something up — never at launch. Respect quiet hours (default 22:00–07:00 unless the user set the time). |  |  |  |  |  |  |
| ID | When | Title | Body | Actions | Channel | Notes |
| N-1 | Morning brief (wake time + 15 min) | Push day · 52 min | Lunch: chicken karahi bowl · 610 kcal | Open | brief |  |
| N-2 | Meal time (each slot) | Lunch time 🍽 | {dish} · {kcal} kcal · {protein} g protein | Ate it · Swap | meals | From plan; rebuilt daily |
| N-3 | Workout reminder | Leg day in 30 min | {n} exercises · {min} min | Start | training |  |
| N-4 | Pre/post-workout meal | Fuel up | {snack} 60 min before training | Ok | meals |  |
| N-5 | Rest timer done | Rest over | Next: {exercise} set {n} | — | timer (high) | Live Activity on iOS |
| N-6 | Weekly check-in (Sun) | Your week in 30 seconds | Check in to tune next week | Start | checkin |  |
| N-7 | Trial day 5 | Trial ends in 2 days | Keep Pro or cancel in 1 tap | Manage | billing |  |
| N-T5 | Trial day 5 (scheduled at trial start) | Your free trial ends in 2 days | Keep Repwise Pro or cancel in one tap. | Manage | account | Cancel if the user already converted or cancelled. |
| Home-screen widgets and quick actions |  |  |  |  |  |  |
| ID | Surface | Size | Shows | Tap / buttons | Update rule | Priority |
| WG-1 | Today (2×2) | 2×2 | Today's workout + next meal | Open | On change | P1 |
| WG-2 | Macros (2×2) | 2×2 | kcal + P/C/F rings | Open Eat | On log | P1 |
| WG-3 | Streak (1×1) | 1×1 | Weeks in a row | Open | Daily | P1 |
