# 20 QA & Release

| Repwise · QA & Release |  |  |  |  |
| Test cases, device matrix and release checklist. |  |  |  |  |
| ← Back to Start Here |  |  |  |  |
| ID | Area | Steps | Expected | Priority |
| QA-G1 | Plan validity | Generate 200 random profiles | Every session uses only available equipment; no injured-area exercises | P0 |
| QA-G2 | Uniqueness | 60 consecutive sessions | No identical session; no recipe repeat inside 14 days | P0 |
| QA-G3 | Macros | 100 generated days | kcal ±5%, protein ±10 g, zero allergen violations | P0 |
| QA-G4 | Rest timer | Lock phone during rest | Lock-screen countdown + alert at 0 | P0 |
| QA-G5 | Meal notifications | Set meal times, change timezone | Fire at new local times with dish name | P0 |
| QA-G6 | Offline workout | Airplane mode full session | Saved; syncs later | P0 |
| QA-G7 | Cross-platform restore | Buy on iOS, sign in on Android | Pro active (server entitlement) | P0 |
| QA-G8 | Dark mode | Every screen | No unreadable text/images | P0 |
| QA-G9 | AI failure | Kill LLM provider | Rules-only fallback plan within 2 s; no crash | P0 |
| QA-C1 | Install | Fresh install from TestFlight / internal track, open, complete onboarding without account | Home with data in < 60 s; no sign-in asked | P0 |
| QA-C2 | Offline | Airplane mode: do the core action 10×, kill app, reopen | All 10 saved, numbers correct | P0 |
| QA-C3 | Trial | Sandbox tester (iOS) + license tester (Android): start 7-day trial from onboarding paywall | Pro unlocks instantly; day-5 reminder scheduled | P0 |
| QA-C4 | Cancel/restore | Cancel in App Store / Play, uninstall, reinstall, Restore purchases | Pro restored while period active | P0 |
| QA-C5 | Paywall policy | Check paywall shows price after trial, renewal, cancel info, terms, privacy, restore, close X | All present | P0 |
| QA-C6 | Backup | Sign in with Google on phone A, add data, sign in on phone B | Same data on B within 10 s | P0 |
| QA-C7 | Delete account | Settings → Delete account | User + all collections removed (check Atlas); local wiped | P0 |
| QA-C8 | Notifications | Grant/deny permission paths; time-shift device to trigger each notification | Correct copy/time; actions work from killed app | P0 |
| QA-C9 | Font scale | iOS Dynamic Type XL + Android font 130% | No clipped text, no overlaps | P0 |
| QA-C10 | Small screen | 360×640 dp emulator | All screens usable, primary button visible | P0 |
| QA-C11 | Timezone/DST | Change timezone and cross a DST boundary with schedules set | Schedules keep local wall-clock times | P0 |
| QA-C12 | Widget | Add widget, use tap action with app killed, reboot phone | Widget updates and survives reboot | P0 |
| QA-C13 | Auto Backup | Run `adb shell bmgr backupnow <pkg>`, uninstall, reinstall | Local data restored | P1 |
| QA-C14 | Performance | Release build on mid-range device: cold start, scroll 500-row history | < 1.5 s; 60 fps | P0 |
| QA-C15 | TalkBack | Navigate onboarding + core action with VoiceOver and TalkBack | Everything reachable and labelled | P1 |
| Device matrix |  |  |  |  |
| •  iPhone SE (small), iPhone 13/15, iPhone 16 Pro Max (ProMotion) · Pixel 8 emulator · Samsung Galaxy A-series (real, One UI) · 360dp emulator · light AND dark mode on every screen. Samsung battery optimisation must not kill meal/workout notifications — test it. |  |  |  |  |
| Release checklist |  |  |  |  |
| •  All P0 QA cases pass on a real device |  |  |  |  |
| •  Sentry has zero unresolved crashes from the last 2 days of testing |  |  |  |  |
| •  Privacy policy, terms and account-deletion web pages live (URLs in App Store Connect + Play Console) |  |  |  |  |
| •  Play Data safety form + Apple App Privacy labels completed (sheet 24) |  |  |  |  |
| •  Content rating questionnaire done; target audience 18+ |  |  |  |  |
| •  Health apps declaration completed (if prompted) |  |  |  |  |
| •  Subscriptions + introductory offers active in App Store Connect and Play Console in every launch country |  |  |  |  |
| •  Store listing assets uploaded (sheet 21) |  |  |  |  |
| •  buildNumber/versionCode incremented; production channel set for EAS Update; App Review notes include a demo account |  |  |  |  |
| •  Staged rollout plan ready |  |  |  |  |
