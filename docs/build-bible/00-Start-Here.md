# 00 Start Here

| Repwise · Start Here |  |
| Read first. Mission, rules, reading order, first 30 minutes. |  |
| ← Back to Start Here |  |
| App | Repwise: AI Gym & Meal Planner  (working name — run the name checks in '24 Legal & Policy' before Day 1 ends) |
| Package name | com.client.repwise |
| One line | One app that plans your training AND your food every day. A context-first onboarding builds a personal gym plan and a personal meal plan; an AI planning assistant keeps both fresh (never the same session or menu twice), sends today's meals and workout as notifications, logs everything in seconds and adapts weekly to your progress. Uber-grade UI: monochrome, fast, elegant, light and dark. |
| Your mission | Make Repwise the #1 AI gym workout + meal planner app on the App Store and Google Play in the US, UK, Canada, Europe and the Gulf/South-Asia growth markets. Not 'a good app' — the app people mean when they say 'gym workout planner'. Every decision in this workbook serves that goal. |
| Version / date | Build bible v1.0 · 31 Oct 2026 · Owner: Ahmad (BufferSol Technologies) · You: the developer, building with Claude Code |
| Platform | iOS AND Android from day 1 (one Expo codebase). Every P0 feature must pass QA on a real iPhone and a real Android phone. |
| Stack in one line | React Native + Expo SDK 58 (React Native 0.88) + Expo Router + TypeScript + EAS cloud (Build, Submit, Update) + SQLite (local-first) + Cloudflare Workers API + MongoDB Atlas + server-side AI planner (LLM behind our Worker only) + Cloudinary (exercise media) + App Store / Play Billing + PostHog + Sentry. |
| Money | Approved: Weekly $4.99 · Monthly $12.99 · 3-Month $24.99 · Yearly $59.99 (pre-selected, 7-day free trial). No ads. Native App Store / Google Play subscriptions; regional (PPP) prices in South Asia/LATAM. |
| Look and feel | Minimal, light, calm. White space, one accent colour (Energy Green #1FB86B), soft cards, big readable numbers, gentle motion and haptics. If a screen feels busy, remove things. |
| Hard costs allowed | Only: our own server (Cloudflare Workers + MongoDB Atlas), store/payment fees, and free-tier tools. NO AI/LLM calls, NO paid per-use APIs, NO ads SDKs. Ever. |
| Non-negotiables (break one = not done) |  |
| •  No forced signup. The app is fully usable without an account; sign-in is only for backup and multi-device. |  |
| •  Core action in 2 taps or fewer from the home screen, the widget or the notification. |  |
| •  Never lose user data: local SQLite + cloud sync for every signed-in user (account is created after onboarding so plans follow the user across iOS/Android). |  |
| •  No ads, no dark patterns: the paywall always has a visible close button, the price after the trial is stated in plain words, cancel instructions are one tap away. |  |
| •  Every screen passes the 'lightness test' in '11 Design System' (one primary action, generous white space, max 2 font weights). |  |
| •  Works offline. Everything except sign-in, backup and purchase must work in airplane mode. |  |
| •  'Lightning fast': cold start < 1.2 s on iPhone 12 / mid-range Android (Galaxy A35 class); every tap responds < 100 ms; 60 fps (120 on ProMotion); images/GIFs cached and progressive. |  |
| •  Crash-free sessions ≥ 99.5% before production release (Sentry). |  |
| •  Accessibility: 48dp touch targets, AA contrast, works at 130% font size, TalkBack labels on every control. |  |
| •  Ship only what is P0 in '07 Features' for v1.0. P1 only if all P0 is done and tested. |  |
| Read in this order (click to jump) |  |
| 00 Start Here | Read first. Mission, rules, reading order, first 30 minutes. |
| 01 Vision | Why this app exists, what 'King of Google Play' means, who it serves. |
| 02 Market | The evidence behind the idea and the market facts. |
| 03 Competitors | Top 5 rivals: what users love, what they hate, how we beat each. |
| 04 Beat Them | Every competitor complaint mapped to our answer and screen. |
| 05 Pricing & Trial | Approved ladder: Weekly / Monthly / 3-Month / Yearly, 7-day trial, free vs Pro. |
| 06 Revenue Model | 12-month projection. Edit the blue inputs; everything else is formulas. |
| 07 Features | Full scope with priority, tier and acceptance criteria. |
| 08 Wow Factors | The moments that make users screenshot and tell friends. |
| 09 User Flows | Step-by-step journeys, edge cases and analytics events. |
| 10 Screens | Every screen: route, layout, actions, states (light + dark). |
| 11 Design System | Uber-inspired look: black/white + one accent, light AND dark tokens, motion. |
| 12 Tech Stack | Exact stack: React Native + Expo + EAS cloud. Packages and why. |
| 13 Architecture | Folder structure, layers, data flow, config, performance budgets. |
| 14 Data Model | Every table and field (local SQLite + MongoDB Atlas via Worker). |
| 15 Signup & Auth | Frictionless signup: no account to start, one-tap Google later. |
| 16 Payments | App Store + Google Play subscriptions, entitlements on our Worker. |
| 17 Notifications | Every notification, widget and quick action, with copy. |
| 18 Claude Code | CLAUDE.md to paste + the exact prompt sequence to build the app. |
| 19 Build Plan | Day-by-day plan from empty repo to Play Store. |
| 20 QA & Release | Test cases, device matrix and release checklist. |
| 21 ASO & Listing | Store title, descriptions, keywords, screenshots, replies. |
| 22 Launch & Growth | Closed test, launch, communities, content, reviews. |
| 23 KPIs & Events | Targets and the analytics event plan. |
| 24 Legal & Policy | Google Play policies, privacy, GDPR, trademark, deletion. |
| 25 Ops & Costs | Running costs (formulas), support, maintenance. |
| 26 Risks | What could go wrong and the mitigation. |
| 27 Sources | Where every number came from, plus glossary. |
| 28 AI Engine | How the AI planner works: rules engine + LLM, uniqueness, prompts, cost control. |
| 29 Content & Data | Exercise media, food & recipe data, licences, Cloudinary pipeline, content QA. |
| Your first 30 minutes |  |
| •  1. Read 00, 01, 03, 07, 10, 11 (about 20 minutes). These define what 'great' means for this app. |  |
| •  2. Install Node 22.13+ (or 24.3+), Git, Android Studio (emulator, API 35/36 image), Xcode 26 + iOS Simulator (Mac) or EAS cloud iOS builds, and Claude Code. Run `npm i -g eas-cli` and `eas login` with the BufferSol Expo account. |  |
| •  3. Open '18 Claude Code'. Create the repo, paste the CLAUDE.md text into the repo root, then run Prompt 1. Follow the prompts in order; do not skip the acceptance checks. |  |
| •  4. Post a daily update (what shipped, screenshots, blockers) to Ahmad. Day plan is in '19 Build Plan'. |  |
| Definition of done for v1.0 |  |
| •  All P0 features in '07 Features' meet their acceptance criteria on a real iPhone AND a real Android device. |  |
| •  All P0 test cases in '20 QA & Release' pass; release checklist complete. |  |
| •  Subscriptions work end to end with a license tester: trial start, conversion, cancel, restore. |  |
| •  Store listing assets in '21 ASO & Listing' are produced and uploaded. |  |
| •  App is live in Closed Testing with 12+ testers (see '22 Launch & Growth' — Google's 14-day rule). |  |
| Colour code used in this workbook |  |
| •  Blue text = an input/assumption you may change. Black = formula or fixed spec. Yellow fill = decision needed or verify before use. |  |
