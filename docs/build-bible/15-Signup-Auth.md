# 15 Signup & Auth

| Repwise · Signup & Auth |  |
| Frictionless signup: no account to start, one-tap Google later. |  |
| ← Back to Start Here |  |
| Principle | No sign-up wall before value: quiz first, plan first. A silent anonymous server account is created when the plan is generated. |
| Upgrade to real account | Offered on the paywall success screen and in Settings: Sign in with Apple (required on iOS when offering other social logins), Google, or email 6-digit code. Anonymous data merges into the account. |
| Tokens | Worker issues JWT (15 min) + rotating refresh token in expo-secure-store. |
| Restore | Sign in on a new phone (any OS) → data + Pro restored. |
| Delete account | In-app + web page; deletes all server data including AI history and photos. |
