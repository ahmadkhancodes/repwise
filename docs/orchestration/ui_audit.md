# Repwise UI audit — design-system conformance (read-only)

Repo: `/home/user/repwise` (main), 19 Nov 2026. I measured against build-bible sheet 11 (the authority), sheet 10 (screens) and sheet 08 (wow factors). I read `src/theme/*` and `src/ui/*`, every screen under `src/features/*/screens`, the feature components and the `app/` layouts. Nothing in the repo was edited.

Severity: **P0** looks broken or off-brand · **P1** noticeably below premium · **P2** polish.
Totals: **P0 4 · P1 48 · P2 64** (116 findings).

## What is already good (keep it)
- Token discipline is strong. There is no hex colour, `fontSize` literal or `fontWeight` anywhere in `src/features`, `src/ui` or `app`. Nearly every spacing, radius and size goes through `useTheme()`.
- Springs use `motion.spring` (damping 18, stiffness 180) almost everywhere. Reduce Motion is honoured in the shared components.
- `IconButton` requires an `accessibilityLabel`, so all icon-only buttons are labelled. Touch targets use `sizes.touch` (48).
- The wow moments W1 (plan reveal), W2 (MorningBrief "trip" card), W4 (long-press swap), W5 (native rest timer), W6 (heatmap) and W7 (grocery list) exist.

## Measured contrast of token pairs in use (WCAG 2.x)
| Pair (where used) | Light | Dark |
|---|---|---|
| textTertiary on surface (hints, captions) | 4.80 ✓ | 5.70 ✓ |
| textTertiary on surface2 (NumberCell placeholders = ghosted previous) | **4.35 ✗** | 5.10 ✓ |
| accentText on accentSoft (badges, delta pill) | 4.82 ✓ | 7.91 ✓ |
| onAccent on accent (filled buttons, calendar days) | 8.13 ✓ | 10.82 ✓ |
| accent on bg (heart fill, widget streak number) | **2.58 ✗** | 10.82 ✓ |
| accent on inverse (success toast icon, rest pill fill) | 8.13 ✓ | **1.94 ✗** |
| danger on inverse (danger toast icon) | 4.34 | **3.07** (icon only) |
| border on surface (unchecked tick/checkbox/radio outlines) | **1.17 ✗** (needs 3:1) | **1.28 ✗** |
| surface2 on surface (SetRow check, NumberCell, Segmented track) | **1.10 ✗** | **1.12 ✗** |
| surface2 on bg (switch off-track) | **1.23 ✗** | **1.27 ✗** |
| macroCarb on surface (carb ring, bar, dot) | **1.84 ✗** | 10.15 ✓ |
| macroProtein / macroFat on surface | 4.13 / 4.96 ✓ | 5.98 / 5.99 ✓ |

Suggested new tokens (computed):
- `borderStrong`: light `#868686` (3.28:1 on surface, 3.64:1 on bg), dark `#6B6B6B` (3.46:1 / 3.94:1).
- `macroCarb` light: `#B87400` (3.42:1 on surface).
- `accentOnInverse`: dark `#0E7A47` (5.39:1 on white).

Log all three in `docs/DECISIONS.md`.

---

## 1. Onboarding (S02–S07)

- **[P0] `src/features/onboarding/components/WeekdayPicker.tsx:33,40`**
  - Problem: seven fixed 48dp circles with `space-between` need 336dp. On the most common Android width (360dp minus 2×20 padding = 320dp), Sunday overflows and is clipped.
  - Fix: use `flex: 1` + `aspectRatio: 1`, with `maxWidth: sizes.touch` and a `spacing.xxs` gap. Or draw a 40dp visual inside a 48dp `hitSlop`.
- **[P1] `src/features/onboarding/screens/WelcomeScreen.tsx:159-177`**
  - Problem: S02 specifies a full-bleed photo. The screen shows a 120dp icon circle instead (accent on slide 1, black on slides 2–3), which reads as a placeholder.
  - Fix: use licensed photography with light and dark variants, or a live mini Today card. Use one treatment on every slide.
- **[P2] `WelcomeScreen.tsx:182`**
  - Problem: the `display` (40pt) title wraps to 3–4 lines at 130% on 360dp.
  - Fix: use `title1`, or add `numberOfLines={3}` with `adjustsFontSizeToFit`.
- **[P2] `WelcomeScreen.tsx:125-131`**
  - Problem: the wordmark is plain `headline` text "Repwise".
  - Fix: use the logo SVG (monochrome, both themes).
- **[P1] `src/features/onboarding/screens/PlanScreen.tsx:216-221`**
  - Problem: the reveal shows a Card that says "Loading your plan…". Sheet 11 says skeletons, never text or spinners.
  - Fix: show a skeleton shaped like TargetsHero, the week strip and the meal rows.
- **[P2] Hard-coded timings**
  - Where: `PlanScreen.tsx:81` (`setInterval 120`) and `:192` (`FadeIn.delay(1800)`); `RevealParts.tsx:49` (420 ms pulse) and `:153,187,255,275,307` (delays 300+140i, 500+70i, 1000, 1150+80i, 1400+110i); `NotifyScreen.tsx:40` (150+160i).
  - Fix: add a `motion.reveal` sequence (steps in multiples of `listStagger`) to tokens.
- **[P2] `RevealParts.tsx:123,139,159,363`**
  - Problem: sizes are arithmetic on tokens (`ring*1.5`, `ringStroke+4`, `ringStroke-2`).
  - Fix: add `sizes.ringLarge`, `sizes.ringSmall` and `sizes.ringStrokeThin`.
- **[P1] `src/features/onboarding/components/OptionTile.tsx:43-44, 81-91`**
  - Problem: the unselected tile border and the radio/checkbox ring use `border`, which is 1.17:1 on surface. The answer indicator is effectively invisible, which fails WCAG 1.4.11.
  - Fix: use `borderStrong` for control outlines.
- **[P2] Selection styling is inconsistent across the app**
  - OptionTile and Chip use accentSoft + accent border.
  - `WeekdayPicker.tsx:38` uses an inverse fill.
  - `QuizProgress` fills done segments black and the current one green.
  - The meals WeekStrip uses an inverse fill.
  - Fix: write down one rule — inverse for single-select date pills, accentSoft for chips and tiles — and apply it.
- **[P2] `src/features/onboarding/components/StepContent.tsx:149-151`**
  - Problem: the caption "Used for your calorie maths only." repeats the step subtitle (`logic/options.ts:27`).
  - Fix: delete the caption.
- **[P1] `src/features/onboarding/logic/options.ts:51`**
  - Problem: "Allergies are never in your plan. Dislikes neither." is clumsy and makes an absolute safety claim.
  - Fix: "We leave out recipes with these allergens — always check labels. Dislikes too."
- **[P2] `StepContent.tsx:497-506`**
  - Problem: meal times use a Stepper in 15-minute steps (up to about 40 taps). Notifications uses a wheel TimeSheet for the same job.
  - Fix: reuse the wheel, once it supports 12-hour time (see A10).
- **[P2] `src/features/onboarding/screens/NotifyScreen.tsx:23,156`**
  - Problem: preview times "13:00" and the copy "Quiet from 22:00 to 07:00" are fixed 24-hour (the US is a primary market). `:68` sets the icon size as `iconSmall + 4`.
  - Fix: format times with the user's 12/24h setting; add `sizes.iconMedium`.

## 2. Today (S11) + assistant / weekly check-in (S12, S28)

- **[P1] `src/features/today/screens/TodayScreen.tsx:179-212`**
  - Problem: the order is brief → N assistant cards → rings → workout. The screen's one accent primary, "Start workout", lands below the fold on 667pt and 360dp screens, which fails the lightness test.
  - Fix: order brief → workout → meals → rings → water, and show at most one assistant card inline.
- **[P1] `src/features/today/components/MealsCard.tsx:38-40`**
  - Problem: the unchecked meal tick is a white disc with a `border` ring on the surface card (1.17:1 light, 1.28:1 dark). The core action has almost no visible affordance.
  - Fix: use `borderStrong`, via a shared Checkbox (U5).
- **[P1] Two components do the same "meal with tick and swap" job**
  - Where: `MealsCard.tsx` MealRow on Today and `src/features/meals/components/MealTile.tsx` on Eat.
  - Problem: they differ in tick size (32 vs 48), swap icon, layout and the presence of macro chips.
  - Fix: one `src/ui` MealTile with a `compact` variant.
- **[P2] `src/features/today/components/RingsCard.tsx:43,51`**
  - Problem: the ring centre shows "kcal left" and a BigNumber "Eaten" sits beside it. Two hero numbers compete.
  - Fix: keep one hero (kcal left) and make "Eaten / target" a callout line. The overflow risk is covered in U9.
- **[P2] `RingsCard.tsx:70`**
  - Problem: ring stroke is `xs - xxs/2` (= 6).
  - Fix: add `sizes.ringStrokeThin`.
- **[P2] `TodayScreen.tsx:220`**
  - Problem: a negative margin (`marginTop: -t.spacing.sm`) attaches the date line.
  - Fix: give Screen a `subtitle` prop.
- **[P2] `src/features/today/components/motion.ts:8`**
  - Problem: stagger is `listStagger*3` (60 ms). `src/features/meals/components/motion.ts` is a fork using 20 ms, and sheet 11 says 20 ms.
  - Fix: one `src/ui/motion.ts`.
- **[P1] Water has three colours and two icons**
  - Today: green dots (`WaterCard.tsx:43`) and the GlassWater icon (`:69`).
  - Eat: the Droplet icon in `macroProtein` (`src/features/meals/screens/EatScreen.tsx:238`).
  - Water screen: the ring and glasses in `macroProtein` (`src/features/nutrition/screens/WaterScreen.tsx:77`).
  - Problem: blue implies protein, and the three screens don't match.
  - Fix: add a `water` token (light and dark) and use one icon.
- **[P2] Toast copy and tone differ between Today and Eat**
  - "Lunch logged" (`TodayScreen.tsx:93`) vs "{title} logged" (`EatScreen.tsx:95`).
  - Water: success tone with `GLASS_ML` on Today; default tone with a hard-coded 250 on Eat (`EatScreen.tsx:99-101`).
  - Fix: one helper for each action.
- **[P2] Uppercase eyebrows are typed as literals**
  - Where: "YOUR DAY", "TODAY'S WORKOUT", "TODAY SO FAR", "WEIGHT TREND", "DAILY CALORIES" and others.
  - Problem: some screen readers spell them out.
  - Fix: add a Text `eyebrow` variant using `textTransform: 'uppercase'` and a letter-spacing token.
- **[P1] `src/features/assistant/components/AssistantCard.tsx:34-73`**
  - Problem: the whole Card is a Pressable that contains the dismiss IconButton and the action Button. On iOS the outer element is the only accessible element, so VoiceOver can't reach dismiss or apply.
  - Fix: add `accessibilityActions` (apply, dismiss) on the card, or make the body pressable and the controls siblings.
- **[P2] Sparkles means four things**
  - Assistant cards, "Daily targets" (`EatScreen.tsx:169`), "Monthly Wrapped" (`ProgressScreen.tsx:267`), "Tomorrow preview" and the onboarding empty state.
  - Fix: keep Sparkles for AI only. Use Target for targets and Gift or Star for Wrapped.
- **[P1] Weight entry works three different ways**
  - Where: the check-in uses a Stepper in 0.1 kg steps (`src/features/assistant/screens/CheckinScreen.tsx:264-276`), so 2 kg is 20 taps, and the same value also shows in a BigNumber right above it. Onboarding uses a WheelPicker; LogBody uses a TextField.
  - Fix: one `WeightPicker` (whole and decimal wheel columns) used in all three places.
- **[P2] `CheckinScreen.tsx:280`**
  - Problem: "Add today's weight" starts at an arbitrary 75 kg or 165 lb.
  - Fix: start from the profile weight.
- **[P2] `CheckinScreen.tsx:292,300`**
  - Problem: energy and sleep are single-choice but use Chips, which announce as checkboxes.
  - Fix: see U8.
- **[P2] Error states without an icon**
  - Where: `CheckinScreen.tsx:175`, `src/features/library/screens/ExerciseDetailScreen.tsx:156`, CustomExercise "not found" and the meals SwapSheet error.
  - Fix: always pass the CircleAlert icon.
- **[P2] Check-in has no loading state**
  - Problem: while `data` is undefined the step UI renders with a disabled Next button, so the "Add weight" button flashes.
  - Fix: show a skeleton.

## 3. Train / workout (S08–S17, S35)

- **[P0] `src/features/workout/screens/ExerciseScreen.tsx:74-87`**
  - Problem: the S14 exercise player shows a hand-made grey box with a dumbbell where the demo goes. It doesn't even reuse the library's `ExerciseHero`, so it is both a fork and visibly unfinished.
  - Fix: use `ExerciseHero` and ship the media (L1).
- **[P1] `src/features/workout/screens/TrainScreen.tsx:193`**
  - Problem: the error copy says "Pull down or reopen the tab", but there is no `RefreshControl` anywhere in the app and no retry button.
  - Fix: add a "Try again" action that reloads, and optionally pull-to-refresh in Screen.
- **[P1] `TrainScreen.tsx:211-227`**
  - Problem: there is no loading state. While queries run, "No sessions this week" and "No workouts yet" flash.
  - Fix: show a skeleton while `data` is undefined.
- **[P1] W3 PR moment during the workout**
  - Where: `src/features/workout/actions.ts:135`.
  - Problem: a PR mid-workout only gets a haptic and a toast. Confetti plays only on the Summary screen.
  - Fix: pop a Trophy on the set row, play a small confetti burst, and show a "New PR" card with a Share action.
- **[P1] `src/features/workout/screens/SummaryScreen.tsx:65-71`**
  - Problem: Share sends plain text, even though `shareViewAsImage` already exists for Wrapped and Photos.
  - Fix: render a share card image (volume as the hero number, PR list, light and dark).
- **[P1] `src/features/workout/components/RestTimer.tsx:106-131`**
  - Problem: three equal secondary Buttons (−15 s, Pause, +15 s) with 20dp side padding leave about 58dp of content each on 360dp. "Resume" plus its icon needs about 82dp, so it clips even at 100%.
  - Fix: round ±15 IconButtons with one wide Pause/Resume, or a compact Button size.
- **[P1] `src/features/workout/components/SetRow.tsx:147-160`**
  - Problem: the Previous column gets about 66dp on 360dp, so "102.5 × 10" truncates, and that ghost value is the key cue.
  - Fix: show the previous value only as the cell placeholder and drop the column, or stack it under the set number.
- **[P1] `src/features/workout/screens/WorkoutPlayerScreen.tsx:132`**
  - Problem: the overview shows muscles as Chips. Chip is an interactive checkbox: a 48dp pill that buzzes on touch and is announced as "checkbox, not checked".
  - Fix: a non-interactive `Badge` (U5).
- **[P1] `WorkoutPlayerScreen.tsx:201`**
  - Problem: "Discard workout" deletes logged sets but is a neutral tertiary button right under "Keep going", with no confirmation.
  - Fix: use the `destructive` variant and add a confirm step or an undo toast.
- **[P1] `src/features/workout/screens/RoutineBuilderScreen.tsx:74`**
  - Problem: the trash icon in the header deletes the routine instantly, with no confirm and no undo.
  - Fix: a confirm Sheet like CustomExercise, or an undo toast.
- **[P2] `WorkoutPlayerScreen.tsx:140-147`**
  - Problem: the workout clock is `title2`, but sheet 11 says timers use `display`.
  - Fix: use display size.
- **[P2] `src/features/workout/components/ExerciseCard.tsx:84-89,95`**
  - Problem: a hand-rolled card with 12dp padding, while Card uses 16 and everything else matches it. `delayLongPress={350}` is hard-coded.
  - Fix: use Card; add a `motion.longPress` token.
- **[P2] Off-spec strokes and sizes**
  - Where: `SetRow.tsx:228-229` and `src/features/workout/components/WeekStrip.tsx:69,74` use strokeWidth 2.5, borderWidth 2 and `iconSmall + xxs`. Sheet 11 says icons use a 1.75 stroke.
  - Fix: see U18.
- **[P2] `src/features/workout/components/NumberCell.tsx:44,57`**
  - Problem: ghosted values use textTertiary on surface2, which is 4.35:1 (below 4.5).
  - Fix: use textSecondary for placeholders, or a surface cell background with a `borderStrong` outline.
- **[P1] `src/features/workout/screens/ExercisePickerScreen.tsx:52`**
  - Problem: a forked search — a TextField with a loose Search icon beside it, then plain ListRows with no thumbnails or filters, all in a ScrollView. The Library uses the "Where to?" SearchBar with ExerciseRow. The picker is presented as a modal (`app/workout/_layout.tsx:17`) but closes with a back chevron.
  - Fix: reuse SearchBar, ExerciseRow and FlatList, and use an X close.
- **[P2] `RestTimer.tsx:50,58`**
  - Problem: the pill's track is filled with a text token (textSecondary), and in dark mode the accent progress on the inverse pill is 1.94:1.
  - Fix: track = onInverse at 25% opacity; fill = `accentOnInverse`.
- **[P2] `src/features/workout/components/PlateCalculator.tsx:21,25,66-67`**
  - Problem: the bar is drawn with text tokens, `borderRadius: 2` and `button*1.6`. The Stepper's 2.5 kg steps make 100→200 kg 40 taps.
  - Fix: long-press auto-repeat in Stepper, or a wheel.
- **[P2] Workout history in two places**
  - Where: Train › History (Cards) and Progress › History (ListRows).
  - Fix: keep one design, and link from the other.

## 4. Eat / meals / nutrition (S20–S27)

- **[P1] No food photos**
  - Where: `src/features/meals/components/MealTile.tsx:53-117` and `src/features/meals/screens/RecipeScreen.tsx:83-96`.
  - Problem: every recipe has a `mediaId` (`packages/content/src/schemas.ts:363`), and sheet 11 specifies MealTile = "Photo, name, kcal, P/C/F chips, swap icon". Eat is a wall of grey text cards and Recipe has no hero image.
  - Fix: a Cloudinary thumbnail through expo-image, using the same pipeline as exercise media, with a blurhash placeholder.
- **[P1] `MealTile.tsx:53-117`**
  - Problem: the whole tile is one accessible Pressable with the tick and swap nested inside, so VoiceOver can't reach the core tick.
  - Fix: make the tick and swap siblings of the body, or add `accessibilityActions`.
- **[P1] `src/features/meals/screens/CookModeScreen.tsx:256`**
  - Problem: the ingredients Sheet can't scroll (Sheet uses `BottomSheetView`), so 10–15 rows clip off-screen.
  - Fix: see U3.
- **[P2] `CookModeScreen.tsx:202`**
  - Problem: the timer start is a hand-rolled accent pill, but accent buttons are reserved for "Start workout" and "Start trial".
  - Fix: a secondary Button with an icon.
- **[P2] `src/features/meals/screens/GroceryScreen.tsx:103`**
  - Problem: aisle headers are uppercase captions, while other lists use `headline` or `title2` section headers. The checkbox contrast issue is covered in U6.
  - Fix: a shared `SectionHeader`.
- **[P2] `src/features/meals/screens/EatScreen.tsx:216-245`**
  - Problem: the "Ate out" and Water tiles are hand-rolled pressables instead of Card, and quick-add water is a hidden long-press.
  - Fix: use Card and a visible "+250 ml" button like Today.
- **[P2] `EatScreen.tsx:328`**
  - Problem: the week view uses Card `selected` to mean "today", which reads as a selection.
  - Fix: an eyebrow or dot that says "Today".
- **[P2] `EatScreen.tsx:353`**
  - Problem: eaten meals get a "✓ " character in the text.
  - Fix: a Check icon or textSecondary with strikethrough, like Grocery.
- **[P2] `EatScreen.tsx:169`**
  - Problem: the AI icon (Sparkles) is used for "Daily targets".
  - Fix: use Target.
- **[P1] Three swap icons for the W4 hero feature**
  - ArrowLeftRight on Today (`src/features/today/components/MealsCard.tsx:127`).
  - Repeat2 on Eat (`MealTile.tsx:83`).
  - Repeat in the workout (`src/features/workout/screens/ExerciseScreen.tsx:124`, `src/features/workout/components/Sheets.tsx:104`).
  - Fix: pick one.
- **[P2] `src/features/meals/components/WeekStrip.tsx:36`**
  - Problem: seven flex pills with gaps are 44dp wide on 375pt and 40dp on 360dp, under the 48dp minimum.
  - Fix: a horizontal scroll, or `hitSlop`.
- **[P2] Arithmetic on tokens**
  - `WeekStrip.tsx:53` `xxs+2`; `src/features/meals/components/MacroRings.tsx:44` `xxs+1`; `MealTile.tsx:104` `hairline+1`; `GroceryScreen.tsx:135` `hairline+1`.
  - Fix: add the missing tokens.
- **[P1] Three week strips**
  - Where: onboarding `src/features/onboarding/components/RevealParts.tsx:179-236`, meals `WeekStrip.tsx` and workout `src/features/workout/components/WeekStrip.tsx`.
  - Problem: different sizes, selection styles and "today" markers (accent border, accentText, inverse ring).
  - Fix: one `src/ui/WeekStrip`.
- **[P1] Three macro-ring layouts**
  - Where: `src/features/today/components/RingsCard.tsx`, `MacroRings.tsx` and TargetsHero (`RevealParts.tsx:110-176`).
  - Problem: sheet 11 defines a single MacroRings component.
  - Fix: consolidate into one.
- **[P2] `src/features/meals/screens/TargetsScreen.tsx:115`**
  - Problem: in light mode the carb bar and the carb dot in MacroChips are 1.84:1.
  - Fix: light `macroCarb` → `#B87400`.
- **[P1] `src/features/nutrition/screens/FoodLogScreen.tsx:202`**
  - Problem: food search is a labelled TextField, but sheet 11 says Library and food search share the big rounded "Where to?" field.
  - Fix: move `src/features/library/components/SearchBar.tsx` to `src/ui` and use it here.
- **[P2] `FoodLogScreen.tsx:170,237`**
  - Problem: the size-estimate tiles are a fork of OptionTile, and "Search 275 everyday foods" is a hard-coded count.
  - Fix: reuse OptionTile and read the count from the food catalogue.
- **[P2] `src/features/nutrition/screens/DayLogScreen.tsx:98`**
  - Problem: Ate it, Half and Skipped behave as a radio group but announce as checkboxes.
  - Fix: see U8.
- **[P2] `src/features/nutrition/screens/WaterScreen.tsx:95,117,119`**
  - Problem: "+ 250 ml" Chips act as buttons but announce as checkboxes; entry times use `toTimeString()`, which is always 24-hour; trash deletes with no undo, unlike DayLog.
  - Fix: button-role chips, a locale-aware time formatter, and an undo toast.

## 5. Library (S18–S19)

- **[P0] Media not uploaded: `src/features/library/components/ExerciseMedia.tsx:14-52,103`**
  - Problem: with no Cloudinary media, every list row and shelf card is the same grey dumbbell tile, and every detail page opens with a 4:3 grey box reading "Demo coming soon". The library looks unfinished.
  - Fix: upload the media and set the cloud name. Until then, hide the thumbnail column and the hero box and lead with the BodyMap.
- **[P1] `src/features/library/components/BodyMap.tsx:63`**
  - Problem: the silhouette is painted in `surface` inside a Card that is also `surface` (`src/features/library/screens/ExerciseDetailScreen.tsx:90-96`; CustomExercise does the same). The body outline disappears and muscles float.
  - Fix: outline in `surface2` or `borderStrong`, or remove the Card.
- **[P1] Two different body maps**
  - Where: `src/features/library/components/BodyMap.tsx` (`logic/bodyMap` paths) and `src/features/progress/components/BodyMap.tsx` (`logic/bodyShapes` paths).
  - Problem: the app draws two different figures in two styles.
  - Fix: one `src/ui/BodyMap` with `mode: 'muscles' | 'heatmap'`.
- **[P2] `src/features/library/screens/LibraryScreen.tsx:159`**
  - Problem: `scroll={false}`, so the large title never collapses here, unlike every other tab.
  - Fix: give Screen a list mode that wires FlatList `onScroll` to the header.
- **[P2] `src/features/library/components/ExerciseRow.tsx:52`**
  - Problem: body size with a headline font override, which is off the type scale.
  - Fix: add a `bodyStrong` variant.
- **[P2] Favourite heart in accent: `ExerciseRow.tsx:102`, `ExerciseDetailScreen.tsx:221-226`**
  - Problem: accent is reserved for progress and CTAs, and the filled heart is 2.58:1 on white.
  - Fix: fill with textPrimary (Uber-style).
- **[P2] `src/features/library/components/AddToWorkoutSheet.tsx:46-51`**
  - Problem: the empty state is a dead end.
  - Fix: add "Start a workout with this exercise".
- **[P2] `BodyMap.tsx:39,87`**
  - Problem: `GAP = 16` and `maxHeight = 280` are literals.
  - Fix: use tokens.

## 6. Progress (S29–S36)

- **[P1] `src/features/progress/screens/ProgressScreen.tsx:215-284`**
  - Problem: below the streak card, the home is a 7-row settings-style menu. It hides W6 and W8 and doesn't feel premium.
  - Fix: visual tiles — weight sparkline, a mini heatmap, the latest photo, a Wrapped teaser. Keep a short list for the rest.
- **[P2] `ProgressScreen.tsx:85-87,109-114`**
  - Problem: free users tapping to an older month are sent straight to the paywall with no explanation, and the error state has no retry.
  - Fix: show a locked-month state, and add a "Try again" action.
- **[P1] `src/features/progress/screens/WrappedScreen.tsx:298-299`**
  - Problem: all 8 story cards are the same inverse slab — black in light mode, glaring white in dark. W8 calls for a Spotify-style colourful story.
  - Fix: rotate calm colour backgrounds (accent, macroProtein, macroFat, each with an on-colour pair at ≥ 4.5:1).
- **[P2] Hard-coded sizes**
  - `WrappedScreen.tsx:205` (3) and `:298` (`card*2`).
  - `src/features/progress/components/MonthCalendar.tsx:85,106,121-123` (34, 1.5, 4).
  - `src/features/progress/screens/HeatmapScreen.tsx:131,139,166` (6, 12).
  - `src/features/progress/screens/PhotosScreen.tsx:245` (22).
  - `src/features/progress/components/LineChart.tsx:124,139` (2.5).
  - `src/features/progress/components/BarChart.tsx:49` (6).
  - `src/features/progress/components/BodyMap.tsx:31,85` (360, blur 6).
  - `src/features/progress/components/Skeleton.tsx:54` (200).
  - Fix: add chart and calendar size tokens.
- **[P2] `HeatmapScreen.tsx:78`**
  - Problem: the "Recovering" legend swatch is accentSoft, but the map paints a surface2→accent blend, so the legend doesn't match.
  - Fix: build the legend from `mixColor` stops.
- **[P2] `src/features/progress/screens/HistoryScreen.tsx:44-63`**
  - Problem: a hand-rolled header and title (no collapse) on a SectionList.
  - Fix: Screen list mode (see L4).
- **[P2] `ProgressSkeleton` everywhere**
  - Problem: the same hero-plus-200-block skeleton is used for the photo grid, Wrapped cards and records, so it doesn't match what loads.
  - Fix: skeletons shaped like each component (sheet 11: "per component").
- **[P2] Wrapped share card**
  - Problem: the brand mark is the lowercase text "repwise".
  - Fix: use the logo.

## 7. Settings / paywall / auth / notifications (S37–S42)

- **[P0] `src/features/settings/screens/SettingsScreen.tsx:69`**
  - Problem: the "Privacy" row has no `onPress`, so it is a dead row with an icon (the file comment says "other rows are placeholders"). Most of S38 and S42 is missing: profile and plan (goal, days, diet), units, export, help, terms and privacy links, delete-account entry, version. A store reviewer will see it as unfinished.
  - Fix: build these rows, or remove the placeholders.
- **[P1] `SettingsScreen.tsx:34,42,50`**
  - Problem: section titles are bare `headline` text, rows are ungrouped, and dividers are inconsistent (Notifications has none).
  - Fix: grouped sections (SectionHeader plus ListRows inside a surface Card).
- **[P1] `src/features/billing/screens/PaywallScreen.tsx:121-168`**
  - Problem: the pinned footer holds the CTA, price line, reminder, cancel copy and three tertiary buttons — about 230dp, or about 300dp at 130%. The plan list gets squeezed on small phones.
  - Fix: pin only the CTA and the price line; move the rest to the bottom of the scroll content.
- **[P1] `PaywallScreen.tsx:205-216` with `src/ui/Card.tsx:34-35`**
  - Problem: the selected plan is shown only by an accentSoft fill and a 1px accent hairline. There is no radio control, and the rows have role "button" inside a radiogroup.
  - Fix: a radio dot, a 2px border and `accessibilityRole="radio"`.
- **[P1] `PaywallScreen.tsx:170-189`**
  - Problem: the paywall is text only (a title plus 5 grey bullets).
  - Fix: add a trial timeline (Today → Day 5 reminder → Day 7 billed) and a recap of the plan reveal (kcal ring, week strip).
- **[P2] `PaywallScreen.tsx:209`**
  - Problem: selecting a plan buzzes twice (Card's light haptic on press-in, then `haptics.selection`).
  - Fix: keep only the selection haptic.
- **[P1] `src/features/settings/screens/AccountScreen.tsx:111`**
  - Problem: "Continue with Google" is a plain text button with no "G" mark, next to the native Apple button. That is off-brand and against Google's branding rules.
  - Fix: Google-styled button with the official logo asset.
- **[P2] Subscription "See plans"**
  - Problem: it uses the accent fill, which sheet 11 reserves for "Start workout" and "Start trial".
  - Fix: use the inverse primary.
- **[P1] `src/features/notifications/components/ToggleRow.tsx:30-32,60`**
  - Problem: a complete Switch lives inside one feature, with hard-coded 52/32/26 sizes. Its off-track is surface2 on bg (1.23:1), so "off" is a white thumb on near-white.
  - Fix: `src/ui/Switch` with size tokens and a `borderStrong` off-track.
- **[P1] `src/features/notifications/components/TimeSheet.tsx:14`**
  - Problem: the hour wheel is always 00–23, while the rows show 12-hour times to US users (they must pick "13" for 1 pm).
  - Fix: a 12-hour wheel with an AM/PM column when `prefers12h()`.
- **[P2] `src/features/notifications/screens/NotificationSettingsScreen.tsx:40,132-135`**
  - Problem: a seventh skeleton fork with fixed heights (96, 56). The screen is very long (5 sections, about 20 rows), which fails the lightness test.
  - Fix: make each reminder's time editable from its toggle row and drop the separate "Times" block.

## 8. Shared UI (`src/ui`, `src/theme`, `app/`)

- **[P1] `src/ui/PressableScale.tsx:51-52`**
  - Problem: haptics fire on press-in. Every touch that starts a scroll on a card or row buzzes (sheet 11: "never on scroll"), and on iOS cards shrink under the finger while scrolling.
  - Fix: fire the haptic in `onPress`, or after `unstable_pressDelay` of about 80 ms, and start the scale after that delay.
- **[P1] `src/ui/Toast.tsx:124` — double success haptics**
  - Problem: every success toast fires `haptics.success`, and these callers fire it too:
    - `src/features/meals/screens/EatScreen.tsx:94`
    - `src/features/workout/hooks/usePlayer.tsx:125`
    - `src/features/workout/actions.ts:135`
    - `src/features/library/components/AddToWorkoutSheet.tsx:35`
    - `src/features/workout/screens/ExercisePickerScreen.tsx:34`
    - `src/features/meals/components/SwapSheet.tsx:58`
    - `src/features/meals/screens/TargetsScreen.tsx:75`
    - `src/features/progress/screens/LogBodyScreen.tsx:45`
    - `src/features/settings/screens/AccountScreen.tsx:73`
    - `src/features/library/screens/CustomExerciseScreen.tsx:145`
  - Non-core actions also get the success buzz (water add, deleting an exercise at `CustomExerciseScreen.tsx:156`).
  - Fix: Toast takes `haptic?: 'none' | 'success'`, default `'none'`. Only core actions use success: set tick, PR, workout finish, meal tick, purchase.
- **[P1] `src/ui/Sheet.tsx:83-107`**
  - Problem: Sheet uses only `BottomSheetView`, with no scroll and no `maxDynamicContentSize`. Long content clips: cook-mode ingredients, CardDetailSheet, SetSheet at 130%, swap sheets at 130%.
  - Fix: a `scrollable` prop using `BottomSheetScrollView`, max height about 90% of the screen, and `keyboardBehavior="interactive"`.
- **[P1] `src/ui/Screen.tsx` has no keyboard handling**
  - Problem: eight screens add their own KeyboardAvoidingView with no behaviour on Android (`src/features/progress/screens/LogBodyScreen.tsx:56`, `src/features/onboarding/components/QuizFrame.tsx:54`, …). SDK 58 is edge-to-edge, so pinned footers (Save, Create, Verify) and the Notes field can end up under the keyboard on Android.
  - Fix: a Screen `keyboard` prop that pads on both platforms; check on a device; remove the per-screen wrappers.
- **[P1] Sheet 11 core components are missing from `src/ui`, so features forked them**
  - **Skeleton** — 6 forks:
    - `src/features/today/components/Skeleton.tsx` (surface2)
    - `src/features/meals/components/SkeletonBlock.tsx`
    - `src/features/progress/components/Skeleton.tsx`
    - `src/features/workout/components/Skeleton.tsx`
    - `src/features/library/components/SkeletonRows.tsx`
    - `src/features/notifications/screens/NotificationSettingsScreen.tsx:40`

    They use two colours, only some are hidden from screen readers, and all are opacity pulses rather than the shimmer sheet 11 asks for.
  - **Checkbox / Tick** — 5 forks: the MealsCard tick, the MealTile tick, the SetRow check, the Grocery check and the OptionTile indicator.
  - **Badge** — 5 forks: the ExerciseDetail Tag, the "Yours" pill, the paywall badge, the ToggleRow "Pro" pill, the check-in delta pill.
  - **Segmented progress bar** — 5 forks: QuizProgress, `src/features/assistant/components/StepBar.tsx:17` (filled black), `src/features/workout/components/WorkoutProgressBar.tsx` (accent), the cook-mode bar and the Wrapped StoryBar.
  - **Other one-offs:** WeekStrip (3 versions), MacroRings (3), BodyMap (2), SearchBar and Switch (each inside a single feature), motion helpers (2) and a meals-only BackButton.
  - Fix: promote each one to `src/ui` and add it to the gallery. This removes about 30 forks.
- **[P1] Control outlines fail WCAG 1.4.11 (3:1)**
  - Problem: border on surface is 1.17:1 and surface2 on surface is 1.10:1. Unchecked ticks, checkboxes, radios, the switch off-track and NumberCell edges are all affected.
  - Fix: add `borderStrong` (light `#868686`, dark `#6B6B6B`) for interactive outlines.
- **[P1] Dark mode: `src/ui/Toast.tsx:44`**
  - Problem: the success icon is accent on the inverse (white) toast, 1.94:1; the danger icon on inverse is 3.07:1.
  - Fix: add `accentOnInverse` (dark `#0E7A47`) and use the matching danger shade.
- **[P1] `src/ui/Chip.tsx:25`**
  - Problem: Chip is always `role="checkbox"` with a selection haptic. Apps use it as a radio (check-in, set type, RPE, bar, goal, meal slot, pose, reps, rest, Ate/Half/Skipped), as a button (water +ml) and as a static tag (player muscles).
  - Fix: a `role: 'checkbox' | 'radio' | 'button'` prop, and a Badge for tags.
- **[P1] Ring and BigNumber overflow at 130% font**
  - Problem: BigNumber is a non-wrapping TextInput at `display` size (40pt, up to 52pt at 130%):
    - MacroRings: a 144dp ring (124dp inside) holding "1,850", about 142dp (`src/features/meals/components/MacroRings.tsx:27-32`).
    - Water: "2,000 ml" (`src/features/nutrition/screens/WaterScreen.tsx:82`) in a 152dp interior, about 175dp.
    - TargetsHero.
    - RingsCard's "Eaten" number (`src/features/today/components/RingsCard.tsx:51`) beside the ring on 360dp.
  - Fix: a BigNumber `size` prop (display, title1, title2) with `adjustsFontSizeToFit`; rings use title1.
- **[P1] `src/ui/Toast.tsx:141`**
  - Problem: the toast sits at a fixed `insets.bottom + 72`, which covers pinned footers. In the player, the rest pill and "Finish" (or "Next") sit exactly where PR and swap toasts appear.
  - Fix: Screen reports its footer height through a store, and ToastHost sits above it (and above the tab bar).
- **[P2] `src/ui/Button.tsx:94`**
  - Problem: the label uses `headline` (SemiBold), but sheet 11 says bold.
  - Fix: add a `button` type style (Bold).
- **[P2] `src/ui/Card.tsx:34-35`**
  - Problem: the selected state is a 1px hairline, too faint.
  - Fix: 2px `borderWidth` token.
- **[P2] `src/ui/Segmented.tsx:26,77`**
  - Problem: `INSET = 4` and `radius.button - 2` are literals.
  - Fix: use tokens.
- **[P2] `app/(tabs)/_layout.tsx`**
  - Problem: tab presses have no haptic, though sheet 11 says light haptics on taps.
  - Fix: add a `tabPress` listener with `haptics.selection`.
- **[P2] `app/progress/_layout.tsx` and `app/settings/_layout.tsx`**
  - Problem: they omit `animationDuration`; other stacks use 220.
  - Fix: set it to `motion.duration.base`.
- **[P2] `src/ui/Screen.tsx:57-72`**
  - Problem: the large title only cross-fades — no shrink or translate as sheet 11 describes — and there is no footer hairline when content scrolls under it.
  - Fix: interpolate the title's scale and translation, and show a footer divider on overflow.
- **[P2] Apostrophes**
  - Problem: UI copy mixes curly (11) and straight (42) apostrophes, e.g. "Couldn’t" vs "Couldn't".
  - Fix: add a lint rule.
- **[P2] Icon strokes and sizes off-token**
  - strokeWidth 2.5: `src/features/workout/components/SetRow.tsx:229`, `src/features/workout/components/WeekStrip.tsx:74`.
  - `iconStroke+1`: OptionTile, TickMark, BuildLine.
  - Sizes `iconSmall+2` / `+4` / `+xxs`: `src/features/onboarding/screens/PlanScreen.tsx:241`, `src/features/onboarding/screens/NotifyScreen.tsx:68`, `src/features/workout/components/RestTimer.tsx:41`, `src/features/workout/screens/SummaryScreen.tsx:160`.
  - Fix: add `sizes.iconMedium = 20` and `iconStrokeBold`.
- **[P2] Typeface (owner decision)**
  - Problem: sheet 11 asks for an Inter Tight / Satoshi-style face for big titles; the app uses Inter everywhere.
  - Fix: Inter Tight for display and title1 only. It is a new package, so it needs owner approval.
- **[P2] Hard-coded locale formatting**
  - Problem: `toLocaleString('en-US')` and 24-hour strings are scattered across features.
  - Fix: central number and time formatters in `src/lib` that use the device locale and the 12/24h setting.
- **[P2] `src/widgets/android/widgets.tsx:173`**
  - Problem: the streak number is accent on a white widget (2.58:1). Font sizes 11–32 and padding values are literals (`:36,67,84,98,105-109,168`).
  - Fix: use accentText, and map sizes to typography tokens.
- **[P2] No shared-element transitions**
  - Problem: sheet 11 calls for card → detail transitions (MealTile → Recipe, ExerciseRow → Detail, SessionCard → Player), and none exist.
  - Fix: add Reanimated shared transitions.

---

## Wow factors (sheet 08)
| ID | Status |
|---|---|
| W1 plan reveal | Built and good. The "Loading your plan…" text card and the hard-coded delays let it down. |
| W2 Today in one glance | MorningBrief is good, but card order buries "Start workout". |
| W3 PR moment | Partial: confetti only on Summary, text-only share, no live PR card. |
| W4 swap anything | Built, but uses three different swap icons. |
| W5 lock-screen rest timer | Native module present. The in-app pill shows only in player footers, not app-wide. |
| W6 body heatmap | Built, but not shown on Progress home, and two body maps diverge. |
| W7 grocery list | Built. |
| W8 Monthly Wrapped | Built but monochrome. |

Also missing: food photography, exercise media, and a share card for workouts.

---

## Top 15 highest-impact improvements
1. **Ship exercise media and remove the placeholders** (L1, W1): use `ExerciseHero` in the player; until media is uploaded, hide the grey tiles.
2. **Finish Settings** (A1, A2): no dead "Privacy" row; add units, profile and plan, export, help and legal, delete account, version; grouped sections.
3. **Fix the WeekdayPicker overflow on 360dp Android** (O1).
4. **Promote the missing core components to `src/ui`** (U5): Skeleton, Checkbox, Badge, SegmentedProgress, WeekStrip, MacroRings, BodyMap, SearchBar, Switch. This removes about 30 forks.
5. **Add `borderStrong` and fix control contrast** (U6, T2, O9, A9): visible unchecked meal ticks, set checks, radios and switches in both themes.
6. **Food photography** (M1): MealTile thumbnail and Recipe hero from the existing recipe `mediaId`.
7. **Fix haptics** (U1, U2): no buzz on scroll touches, no double success, success only for core actions.
8. **Re-order Today** (T1): workout card right after the brief, assistant cards capped, "Start workout" above the fold.
9. **Make BigNumber and rings safe at 130% font** (U9): size prop and font scaling.
10. **Finish the PR moment** (W4, W5): in-session PR card with confetti, plus an image share card on Summary.
11. **Premium paywall** (A3, A4, A5): slim pinned footer, radio plan rows, trial timeline.
12. **Scrollable Sheet and Screen-level keyboard handling** (U3, U4): cook ingredients, long sheets, Android footers above the keyboard.
13. **Nested-pressable accessibility** (M2, T11): VoiceOver can reach the meal tick and the assistant-card actions.
14. **Visual Progress home and colourful Wrapped** (P1, P3).
15. **Workout player at 360dp** (W6, W7, U10): rest-sheet controls, the Previous column, toasts covering the footer.
