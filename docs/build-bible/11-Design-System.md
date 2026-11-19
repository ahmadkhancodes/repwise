# 11 Design System

| Repwise · Design System |  |  |  |
| Uber-inspired look: black/white + one accent, light AND dark tokens, motion. |  |  |  |
| ← Back to Start Here |  |  |  |
| Feel | Uber-grade: bold, monochrome, confident, fast. Content is the UI; chrome is invisible. |  |  |
| Rules | 1) Black/white + ONE accent (Energy Green) for progress & primary CTAs. 2) Big bold titles (UberMove-like geometric sans → use Inter Tight / Satoshi-style licensed font). 3) Stacked full-width cards, generous 16–24 px spacing. 4) Bottom sheets for every secondary action. 5) Skeletons not spinners. 6) Max one primary button per screen, pinned to the bottom. |  |  |
| Light & dark | Both in v1. Follow system; manual override in Settings. Every screen designed and QA'd in both. |  |  |
| Speed budget | Tap feedback < 100 ms, screen transition 220 ms, Today renders from local cache < 300 ms, GIFs progressive with blurhash placeholder. |  |  |
| Colour tokens — LIGHT and DARK (both ship in v1; follow system setting + manual override) |  |  |  |
| Token | Light | Dark | Use |
| bg | #FFFFFF | #000000 | Screen background |
| surface | #F3F3F3 | #141414 | Cards, inputs |
| surface2 | #E8E8E8 | #1F1F1F | Pressed, segmented |
| border | #E2E2E2 | #2A2A2A | Dividers |
| textPrimary | #000000 | #FFFFFF | Titles, numbers |
| textSecondary | #5E5E5E | #A6A6A6 | Body |
| textTertiary | #8F8F8F | #6B6B6B | Hints |
| accent | #1FB86B | #2BD47D | Primary CTA, progress, PR |
| accentSoft | #E3F7EC | #0F2A1C | Selected chips |
| inverse | #000000 | #FFFFFF | Uber-style black primary buttons (light) / white (dark) |
| warning | #F5A524 | #F5B544 | Due soon |
| danger | #E11900 | #FF5B4A | Destructive only |
| macroProtein | #276EF1 | #5B91F5 | Protein ring |
| macroCarb | #F5A524 | #F5B544 | Carb ring |
| macroFat | #7356BF | #9B85E0 | Fat ring |
| Typography |  |  |  |
| Style | Size / line height | Weight | Use |
| display | 40 / 44 | Bold 700 | Hero numbers (timer, kcal) |
| title1 | 32 / 38 | Bold 700 | Screen titles (Uber-style big) |
| title2 | 24 / 30 | Bold 700 | Section titles |
| headline | 18 / 24 | SemiBold 600 | Card titles |
| body | 16 / 24 | Regular 400 | Text |
| callout | 14 / 20 | Medium 500 | Secondary |
| caption | 12 / 16 | Medium 500 | Labels, units |
| Spacing, shape, elevation, motion, haptics |  |  |  |
| Spacing | 4 · 8 · 12 · 16 · 24 · 32 · 48. Screen padding 16. Card padding 16. |  |  |
| Radius | Cards 12 · Sheets 16 · Buttons 8 (Uber-style tight) · Chips 999. |  |  |
| Elevation | Flat. Dividers and surface contrast; shadow only for floating sheets. |  |  |
| Buttons | Primary: inverse (black in light, white in dark), 56 h, bold label. Accent button only for 'Start workout' and 'Start trial'. |  |  |
| Motion | Reanimated springs; shared-element transitions card → detail; list stagger 20 ms; respect reduced motion. |  |  |
| Haptics | Selection on pickers; light on set tick; success on workout finish & PR; never on scroll. |  |  |
| Icons | Lucide or Phosphor, 24 px, 1.75 stroke. |  |  |
| Imagery | Licensed photography only; GIF exercise media on neutral background matching theme (light/dark variants or transparent). |  |  |
| Uber-style patterns to reuse (study, don't copy assets) |  |  |  |
| Pattern | How we use it |  |  |
| 'Where to?' search bar | Library and food search: big rounded search field at the top of Library/Eat. |  |  |
| Stacked action cards | Today: workout card, next meal card, assistant cards — full-width, tappable, with one trailing action. |  |  |
| Bottom sheet flows | Swap, log, timer settings, filters — never full-screen modals for small tasks. |  |  |
| Ride-progress bar | Workout progress as a thin segmented bar at top (like trip progress). |  |  |
| Big bold totals | Summary screens lead with one huge number (e.g. 12,450 kg volume). |  |  |
| Segmented tabs | Day / Week toggles in Eat and Train. |  |  |
| Core components (src/ui) |  |  |  |
| Component | Spec |  |  |
| Screen | Large bold title collapsing on scroll; safe areas; theme-aware. |  |  |
| ActionCard | Full-width, 12 radius, title + meta + trailing CTA; press scale 0.98. |  |  |
| SetRow | Weight / Reps / RPE / check; previous value ghosted; 56 h. |  |  |
| MacroRings | Skia rings (kcal + P/C/F). |  |  |
| Timer | Big countdown, ±15 s, skip; mini floating pill when navigating. |  |  |
| MealTile | Photo, name, kcal, P/C/F chips, swap icon. |  |  |
| BodyMap | SVG front/back with intensity fills. |  |  |
| Sheet | @gorhom/bottom-sheet; 16 radius; grabber. |  |  |
| Paywall | 4 plan rows, yearly selected, trial line, close X. |  |  |
| Skeleton | Shimmer blocks per component. |  |  |
| Design research brief for the UI designer (Pinterest / Dribbble / Mobbin) |  |  |  |
| •  Collect 40+ references on Pinterest/Dribbble/Mobbin: Uber, Uber Eats, Hevy, Fitbod, Ladder, Future, MacroFactor, Lifesum, Strava — screen types: Today, player, library, meal plan, paywall, progress. |  |  |  |
| •  Make a moodboard per screen type in Figma; pick one direction; build a 1-page style tile (light + dark) before any screen. |  |  |  |
| •  Client's secret UI ideas get added as P0 deltas after the style tile is approved. |  |  |  |
| •  Do not copy any app's logos, icons, illustrations, screenshots or copy — patterns only. |  |  |  |
| Quality gate (every screen, light AND dark) |  |  |  |
| •  One primary action per screen |  |  |  |
| •  Looks right in light AND dark |  |  |  |
| •  Text readable at Dynamic Type XL / Android 130% |  |  |  |
| •  No spinner after first launch — skeleton or cached data |  |  |  |
| •  Tap response < 100 ms on mid-range Android |  |  |  |
