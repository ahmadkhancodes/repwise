# Repwise UI audit, round 2 (read-only)

Repo `/home/user/repwise`, main at `5351e80`, 20 Nov 2026. I measured against build-bible sheets 11 (design system, the authority), 10 (screens) and 08 (wow factors), and against round 1 (`docs/orchestration/ui_audit.md`). I read `src/theme`, every file in `src/ui`, the screens and main components of every feature, and the `app/` layouts. I did not edit any code. Contrast ratios were computed from `src/theme/colors.json`.

Severity: **P0** looks broken or off-brand · **P1** noticeably below premium · **P2** polish.

## Summary

| | P0 | P1 |
|---|---|---|
| Round 1 total | 4 | 48 |
| Fixed | 3 | 35 |
| Partial | 1 | 10 |
| Open | 0 | 3 |

**New in round 2:** P0 0 · P1 6 · P2 24.

The fix wave was large and mostly landed well. These are now in `src/ui`: `Tick`/`TickMark`/`Checkbox`, `Badge`, `Switch`, `StepProgress`, `WeekStrip`, `MacroRings`, `SearchBar`, `Skeleton*`, `BigTimer` and `listMotion`. `borderStrong`, `accentOnInverse`, `dangerOnInverse`, `iconMedium`, `iconStrokeBold`, `borderThick`, `hitGym` and `hero` type were added. Haptics now fire on commit. Toasts sit above pinned footers. Today has the right hierarchy. Settings is complete. The paywall is honest and has radio rows and a timeline. Progress home is visual, and Wrapped is in colour.

What still holds the app back is **consistency between features**. The same idea is still built two ways: meal row, swap, history, weight entry, section header, back button, eyebrow, sparkline and PR card. Two round-1 shared-component gaps also remain: `Sheet` cannot scroll, and `Screen` has no keyboard handling.

---

## A. Round-1 P0 / P1 status

### P0
| # | Item | Status | Evidence |
|---|---|---|---|
| O1 | WeekdayPicker overflows 360dp | **fixed** | `src/features/onboarding/components/WeekdayPicker.tsx:43-55`: flex 1 cells, borderStrong |
| W-P0 | Exercise player grey dumbbell box | **fixed** | `src/features/workout/screens/ExerciseScreen.tsx:172` uses `ExerciseHero` |
| L1 | Library media missing (grey tiles) | **partial** | The placeholder is now a designed muscle map (`src/features/library/components/ExerciseMedia.tsx:63-110`), so there are no grey tiles. Real demos are still blocked because the Cloudinary account is disabled (`docs/MEDIA_STATUS.md`). This needs owner action. |
| A1 | Settings dead rows, missing S38/S42 | **fixed** | `src/features/settings/screens/SettingsScreen.tsx:157-340`: grouped sections, units, export, delete, help, legal, version |

### P1: Onboarding
| Item | Status | Evidence / remaining |
|---|---|---|
| Welcome icon placeholder (S02 photo) | **partial** | `WelcomeScreen.tsx:135-176`: real logo plus `WelcomeArt`. The licensed full-bleed photo from S02 is still missing. |
| Plan "Loading your plan…" text | **fixed** | `PlanScreen.tsx:243-250`: skeleton |
| OptionTile outline contrast | **fixed** | `OptionTile.tsx:46-47,86`: borderStrong plus TickMark |
| Allergy copy | **fixed** | `logic/options.ts:51` |

### P1: Today / assistant
| Item | Status | Evidence / remaining |
|---|---|---|
| T1 card order, Start workout below the fold | **fixed** | `TodayScreen.tsx:206-256` |
| MealsCard tick contrast | **fixed** | `MealsCard.tsx:53` uses TickMark with borderStrong |
| Two "meal with tick and swap" components | **partial** | They share TickMark and SwapIcon, but the layout and the tap model are still opposite. See N2. |
| Water: 3 colours, 2 icons | **fixed** | One `WaterCard` (`nutrition/components/WaterCard.tsx`) on Today and Eat; WaterScreen uses accent. A small fork remains: P2-6. |
| AssistantCard nested a11y | **fixed** | `AssistantCard.tsx:40,59,86`: accessibilityActions and a sibling dismiss |
| Weight entry 3 ways | **partial** | Still three ways: a wheel (onboarding `StepContent.tsx:245-253`), a Stepper (`CheckinScreen.tsx:~268`) and a TextField (`LogBodyScreen.tsx:79-91`). The Stepper now repeats on hold and accepts typed input. |

### P1: Train / workout
| Item | Status | Evidence / remaining |
|---|---|---|
| Train error copy without retry | **fixed** (week) | `TrainScreen.tsx:335-343`. The History tab still has no retry: P2-17. |
| Train no loading state | **fixed** | `TrainScreen.tsx:344-348` |
| W3 PR moment only on Summary | **fixed** | `components/PRCelebration.tsx` (live confetti and hero card) |
| Summary shares text only | **fixed** | `SummaryScreen.tsx:101-104` `shareViewAsImage` |
| RestTimer buttons clip at 360dp | **partial** | The footer `RestBar` is good (`RestTimer.tsx:75-167`). The hero sheet now uses `BigTimer`, which has the same three-up clipping. See N5. |
| SetRow Previous column truncates | **fixed** | `SetRow.tsx:142-176`: ghost values in the cells |
| Player muscles as Chips | **fixed** | `WorkoutPlayerScreen.tsx:301-303` Badge. The labels are lowercase: P2-4. |
| Discard workout without confirm | **fixed** | `WorkoutPlayerScreen.tsx:444-473`, plus undo |
| RoutineBuilder delete without confirm | **OPEN (regression)** | A confirm sheet was built (`RoutineBuilderScreen.tsx:256-280`), but the header trash calls `remove` directly (`:113-118`). The sheet can never open, and deletion is instant with no undo. |
| ExercisePicker fork | **fixed** | `ExercisePickerScreen.tsx`: SearchBar, ExerciseRow, FlatList, X close |

### P1: Eat / nutrition
| Item | Status | Evidence / remaining |
|---|---|---|
| No food photos | **partial** | `RecipeArt.tsx` gives designed gradient art, with a photo on top when `mediaId` exists. There are 0 photos because the Cloudinary account is blocked. |
| MealTile nested a11y | **fixed** | `MealTile.tsx:66-120`: tick and swap are siblings |
| CookMode ingredients sheet can't scroll | **partial** | Worked around with an RN `ScrollView` inside `BottomSheetView` (`CookModeScreen.tsx:251`). On Android, gorhom's pan gesture can swallow that scroll. The real fix (Sheet `scrollable`) is still missing. |
| Three swap icons | **partial** | Meals are unified on `ArrowLeftRight` (`meals/components/icons.ts:6`). Workout still uses `Repeat` (`ExerciseScreen.tsx:9,215`, `Sheets.tsx:6,131`). |
| Three week strips | **fixed** | `src/ui/WeekStrip.tsx` is used by Train, Eat and the reveal. The reveal misuses it: P2-8. |
| Three macro-ring layouts | **partial** | `src/ui/MacroRings` is used by Today, Eat and DayLog. The reveal `TargetsHero` (`RevealParts.tsx:130-210`) is still its own layout. |
| FoodLog search not "Where to?" | **fixed** | `FoodLogScreen.tsx:188-194` SearchBar |

### P1: Library
| Item | Status | Evidence |
|---|---|---|
| BodyMap silhouette on surface card | **fixed** | The map is now the hero (`ExerciseMedia.tsx`). The Muscles section is a legend. |
| Two body maps | **fixed** | Only `library/components/BodyMap.tsx` remains; Heatmap imports `BodyHeatmap` from library |

### P1: Progress
| Item | Status | Evidence |
|---|---|---|
| Progress home is a settings menu | **fixed** | `ProgressScreen.tsx:162-296`: streak, calendar, PR rail, tiles |
| Wrapped monochrome | **fixed** | `logic/storyColors.ts`. Every pair is ≥ 4.5:1 (checked: light fat 5.51, protein 4.59). |

### P1: Settings / paywall / auth / notifications
| Item | Status | Evidence |
|---|---|---|
| Settings ungrouped | **fixed** | `settings/components/SettingsGroup.tsx` |
| Paywall footer too tall | **fixed** | `PaywallScreen.tsx:272-293`: CTA and price line only |
| Plan rows not radios | **fixed** | `PaywallScreen.tsx:98-152`: role radio, TickMark, 2dp border |
| Paywall text-only | **fixed** | Icon benefits and `TrialTimeline`. New issue on this screen: N7. |
| Google button off-brand | **fixed** | `settings/components/GoogleButton.tsx` |
| ToggleRow switch fork, 1.23:1 off track | **fixed** | `src/ui/Switch.tsx` with borderStrong |
| TimeSheet 24h only | **fixed** | `TimeSheet.tsx:24-31` 12h + AM/PM |

### P1: Shared UI
| Item | Status | Evidence / remaining |
|---|---|---|
| PressableScale buzzes on press-in | **fixed** | `PressableScale.tsx:58-73` |
| Toast double success haptic | **fixed** | `Toast.tsx:22-34` `silent`; callers pass it. The success haptic is now over-used elsewhere: P2-11. |
| Sheet has no scroll | **OPEN** | `src/ui/Sheet.tsx:83-107` is still `BottomSheetView` only. Three different workarounds exist: FilterSheet `BottomSheetScrollView`, CookMode RN ScrollView, and none in ReorderSheet. |
| Screen has no keyboard handling | **OPEN** | Still per-screen `KeyboardAvoidingView` with different behaviours: `ExerciseScreen.tsx:125-128` (Android `undefined`), `LogBodyScreen.tsx:52-55` (Android `'height'`), `RoutineBuilderScreen.tsx:~101`, `ExercisePickerScreen.tsx:67-70`, FoodLog. AccountScreen has none. |
| Missing core components (≈30 forks) | **partial** | Most forks are gone. Remaining forks: section headers (P2-2), back buttons (P2-3), sparkline (P2-5), grouped list (P2-13), stagger helpers (P2-7), eyebrow (P2-1), the meals-only `BackButton`, and `ToggleRow` living inside notifications. |
| Control outlines < 3:1 | **partial** | Ticks, switch, radio, weekday and water use borderStrong (3.87:1). Still on `border` (1.17–1.30:1): TextField (`TextField.tsx:28`), SetRow value cells (`SetRow.tsx:79-80`), Chip (`Chip.tsx:51`) and unselected paywall rows (`PaywallScreen.tsx:121`). See P2-18. |
| Toast dark-mode icon contrast | **fixed** | accentOnInverse 5.39, dangerOnInverse 5.70 |
| Chip always checkbox | **fixed** | `Chip.tsx:17,37` role prop |
| Ring / BigNumber overflow at 130% | **fixed** | `BigNumber` `fitWidth` + `fit.ts`; used in MacroRings, Water and the reveal |
| Toast covers pinned footer | **fixed** | `Toast.tsx:73-81` plus Screen footer registration |

---

## B. New findings

### P1

- **N1 [P1] `src/features/workout/screens/RoutineBuilderScreen.tsx:113-118`: routine deletes instantly (regression)**
  - Problem: the header trash calls `remove`, while the confirm sheet at `:256-280` is gated on `confirmDelete`, which nothing sets to true. The fix wave built the confirm UI but never wired it. The routine is gone with no confirm and no undo, and the toast says only "Routine deleted".
  - Fix: `onPress={() => setConfirmDelete(true)}`. Also use `showUndoToast('Routine deleted', restore)` with a soft delete. Add a test that tapping `routine-delete` shows `routine-delete-sheet`.
  - (This is the round-1 item still open. It is listed here because it is a fix-wave regression.)

- **N2 [P1] Same meal, two opposite interaction models (Today vs Eat)**
  - `src/features/today/components/MealsCard.tsx:34-73`: tapping the row ticks the meal (tick on the left). There is no art. Macros are plain text. An eaten meal is struck through.
  - `src/features/meals/components/MealTile.tsx:66-120`: tapping the row opens the recipe (tick on the right, under the swap button). There is recipe art and coloured macro dots. An eaten meal is greyed, and a skipped one is struck through.
  - Problem: a user who learns "tap = I ate it" on Today opens a recipe on Eat, and the other way round. Strikethrough means "eaten" on one tab and "skipped" on the other.
  - Fix: one `src/ui` (or meals) `MealRow` with a `compact` prop. Use the same tap target on both tabs (recommended: tick on the leading edge, body opens the recipe, long-press swaps). Use the same eaten style (greyed with a check, no strike) and the same `MacroChips`. Today's compact variant can drop the art.

- **N3 [P1] W4 "swap anything" looks like two different features**
  - Exercise swap (`src/features/workout/components/Sheets.tsx:104-169`) shows generic `Dumbbell` icon cards, lowercase muscles (`o.primaryMuscles.join`), raw equipment ids (`e.replace(/_/g,' ')`), an em-dash in the copy, and the `Repeat` icon (`:131`, `ExerciseScreen.tsx:215`).
  - Meal swap (`src/features/meals/components/SwapSheet.tsx:105-143`) shows art thumbs, MacroChips, a "Never show" action and `ArrowLeftRight`.
  - Fix:
    - Use `SwapIcon` from one shared place (move `meals/components/icons.ts` to `src/ui/icons.ts`) in the workout screens too.
    - Render exercise options with `ExerciseThumb` + `MUSCLE_LABEL`/`EQUIPMENT_LABEL`, in the same row shape as the meal options.
    - Add the same "Never suggest this" tertiary action.

- **N4 [P1] Two workout histories with different Pro rules**
  - Train › History (`src/features/workout/screens/TrainScreen.tsx:196-249`, `hooks/useTrain.ts:69`) shows Cards that open the summary and lists the last 60 workouts for everyone.
  - Progress › History (`src/features/progress/screens/HistoryScreen.tsx:104-123`) shows ListRows that cannot be tapped, and free users only get 30 days (`:38-40`).
  - Problem: free users see the "locked" history one tab over, and the same data has two designs.
  - Fix: one history list component (Card rows that open the summary; food days as a second row type), used in both places. Apply the gate in one helper (`historyWindow(isPro)`). Or drop Train › History and link to Progress › History.
  - Wrapped month navigation has the same gating gap: P2-12.

- **N5 [P1] `src/ui/BigTimer.tsx:124-157`: rest-sheet controls clip at 360dp**
  - Problem: three `Button`s with `flex: 1` and `gap xs` inside the sheet's 320dp content give ≈101dp each. Button's 20dp side padding leaves ≈61dp. "Skip" with its 24dp icon and 8dp gap needs ≈72dp, so it wraps or clips. "−15 s" wraps at 130%. This is the gym hero control.
  - Fix: round 56dp `IconButton`-style "−15" and "+15" buttons, plus one wide Skip. Or give Button a `compact` size (`paddingHorizontal: spacing.sm`, `numberOfLines={1}` + `adjustsFontSizeToFit`).

- **N6 [P1] `src/features/workout/screens/ExerciseScreen.tsx:106-114,135-151`: "Log set" label wraps in S14**
  - Problem: the footer puts two 48dp chevrons around the Button. That leaves ≈168dp for the icon and "Log set 2 · 102.5 kg × 10". Button text has no `numberOfLines`, so it breaks to 2 lines (3 at 130%) and the 64dp target grows unevenly. The player list footer (`WorkoutPlayerScreen.tsx:152-160`) is full width and fine.
  - Fix: put the target on its own caption line under the label (two-line button design). Or drop the chevrons into the header and use the full width, as the list player does.

- **N7 [P1] `src/features/billing/screens/PaywallScreen.tsx:268,296-299`: two stacked 32pt titles, and copy that fits only one entry**
  - Problem: the Screen large title "Repwise Pro" (title1) sits directly above another title1, "Your plan is ready.". On the conversion screen that reads as a layout bug. The header says "Your plan is ready" even when the paywall opens from the Eat week lock, the grocery gate, History, the check-in or a routine gate (`source=` params exist).
  - Fix: no Screen `title` (keep only the X), and one hero title. Choose the header from `source` (e.g. "Plan the whole week", "Your grocery list, done"). Keep "Your plan is ready" only for `source=onboarding`.

### P2

1. **Eyebrows are built three ways.**
   - Uppercase literals: "UP NEXT" (`WorkoutPlayerScreen.tsx:143`), "YOUR PLAN IS READY" (`PlanScreen.tsx:226`), "TODAY · REST DAY" (`RevealParts.tsx:~266`), "PROFILE & PLAN" (`SettingsScreen.tsx:~112`), "MENUS" (`CheckinScreen.tsx:~430`).
   - JS `toUpperCase()`: `SettingsGroup.tsx:32`, `PaywallScreen.tsx:~207`.
   - `textTransform` in 7 other places.
   - Screen readers may spell out the literals, and none of them have tracking.
   - Fix: a Text `eyebrow` variant (caption, `textTransform: 'uppercase'`, a `letterSpacing` token), and replace all of them.
2. **Section headers are forked about 6 ways.**
   - progress `SectionTitle` (`progress/components/bits.tsx:32`, title2)
   - ExerciseDetail `Section`
   - Grocery aisle (headline, `GroceryScreen.tsx:103`)
   - Settings group caption
   - Train "This week" (title2, `TrainScreen.tsx:358`)
   - Today "Meals" (headline, `MealsCard.tsx:122`)
   - Recipe "Ingredients" (title2)

   Fix: `src/ui/SectionHeader` with `level: 'section' | 'card'` and an optional trailing slot.
3. **About 18 hand-rolled back buttons call `router.back()` with no fallback.**
   - Examples: `HistoryScreen.tsx:57`, `SettingsScreen.tsx:168`, `HelpScreen.tsx:36`, `HeatmapScreen.tsx:44`, `CheckinScreen.tsx:169`.
   - `/checkin` and `/today/card` are notification deep links, so Back can be a no-op there.
   - `meals/components/BackButton.tsx` already has the right `canGoBack()` fallback, but it lives in meals.
   - Fix: move it to `src/ui/BackButton` (props `close`, `fallback`) and use it everywhere.
4. **Workout shows lowercase muscle names** ("front delts", "lats").
   - The workout's own formatter (`workout/exerciseMeta.ts:18` `pretty`) is used instead of `MUSCLE_LABEL`.
   - Visible in Badges (`ExerciseScreen.tsx:167`, `WorkoutPlayerScreen.tsx:301`), `ExerciseCard.tsx:143` and the swap sheet.
   - Fix: map with `MUSCLE_LABEL` / `EQUIPMENT_LABEL` from `@/features/library`.
5. **Two weight sparklines.** `assistant/components/Sparkline.tsx` uses SVG with stroke `iconStroke + 1`; `progress/components/Sparkline.tsx` uses Skia. Fix: keep the Skia one, move it to `src/ui`, and use it in the check-in.
6. **Two water-glass visuals.** `WaterCard.tsx:17-46` (round dots) vs WaterScreen bottles that fill from the bottom (`WaterScreen.tsx:~30-53`). Fix: one `Glass` in nutrition/components.
7. **Stagger and motion forks remain beside `src/ui/listMotion.ts`.**
   - progress `Stagger` (`bits.tsx:52`, no cap)
   - `LibraryScreen.tsx:60`
   - Paywall `listStagger*3` (`PaywallScreen.tsx:261`)
   - Summary `FadeInUp.delay(200 + i*120)` literals (`SummaryScreen.tsx:165`)

   Fix: `enterAt(i, reduce)` everywhere.
8. **The reveal uses the interactive WeekStrip as a display** (`RevealParts.tsx:~232`, `onSelect={() => undefined}`). Each day announces as a tab, buzzes on tap and does nothing. Fix: a `readOnly` prop (no Pressable, role `text`).
9. **Reveal `TargetsHero` fills each macro ring to its share of kcal** (`RevealParts.tsx:158-197`). It reads as progress ("protein 30% done") and does not match `MacroRings` on Today a minute later. Fix: render `MacroRings` (eaten 0) under the hero kcal number, or draw full rings without a progress meaning.
10. **The reveal's `WorkoutCard` and `MealsList` are forks** (`RevealParts.tsx:246-350`). W1 → Today continuity breaks: the cards change shape the moment the user lands on Today. Fix: reuse the Today `WorkoutCard` (with no action) and the shared meal row from N2 in a preview mode.
11. **The success haptic is over-used.** Sheet 11: "success on workout finish & PR".
    - Also fires on notification permission granted (`NotifyScreen.tsx:122`, `NotificationSettingsScreen.tsx:133`), sign-in (`AccountScreen.tsx:74`), exercise added (`ExercisePickerScreen.tsx:58`), grocery complete (`GroceryScreen.tsx:48`) and the cook timer (`CookModeScreen.tsx:69,141`).
    - The Summary buzzes again for PRs already celebrated live (`SummaryScreen.tsx:43-48`).
    - Fix: `light` for these. Summary buzzes only on workout finish (once).
12. **Wrapped month navigation.**
    - Free users can page through any past month (`WrappedScreen.tsx:67-72`), while Progress locks older months (`ProgressScreen.tsx:128` `isMonthLocked`).
    - The header back chevron (`:87`) sits right above an identical "Previous month" chevron (`:109`).
    - Fix: share `isMonthLocked` and the locked state. Use a centred month label with prev/next under the cards (stories pattern) so it doesn't clash with Back.
13. **List styles are mixed.** Settings uses grouped cards (`SettingsGroup`). Eat puts bare `ListRow`s between cards (`EatScreen.tsx:217,256`), and Progress home ends in bare ListRows (`ProgressScreen.tsx:264-296`). Fix: promote `SettingsGroup` to `src/ui/ListGroup` and use it for every list of navigation rows.
14. **Three PR treatments.** Progress `PrCard` uses inverse with an accentOnInverse trophy; Summary uses an accentSoft `Card selected` (`SummaryScreen.tsx:170`); `PRCelebration` uses inverse. Fix: inverse plus accentOnInverse everywhere (Summary PR rows included), so a PR always looks the same.
15. **Step-number discs differ.** Recipe uses a surface disc (`RecipeScreen.tsx:179-192`); Exercise detail uses an inverse disc (`ExerciseDetailScreen.tsx:~70-82`). Fix: one `StepNumber`, inverse.
16. **Screens that bypass `Screen`.** They miss the collapsing title and the hairline: `HistoryScreen.tsx:45-63` (hand-rolled header), `LibraryScreen.tsx:208` (`scroll={false}`, the fixed title, search and chips take ≈200dp on small phones), CookMode chrome (`CookModeScreen.tsx:150-158`). Fix: a Screen `list` mode that wires FlatList/SectionList `onScroll` to the header.
17. **History tabs have no retry on error.** Train › History (`TrainScreen.tsx:199-207`) and Progress › History (`HistoryScreen.tsx:79-86`) show an error with no "Try again". Fix: an `actionLabel` and reload, as on the week view.
18. **Remaining control outlines below 3:1 (WCAG 1.4.11).**
    - TextField unfocused `border` (`TextField.tsx:28`, 1.17:1 on surface), and it uses `2 * hairline` instead of `borderThick` (`:57`).
    - SetRow value cells: a `bg` fill with a `border` hairline (`SetRow.tsx:78-80`).
    - Chip unselected (`Chip.tsx:51`).
    - Fix: borderStrong at hairline for these, or rely on a clear fill difference such as bg on a surface card. Note that surface on bg is 1.11:1, which is not clear.
19. **The SetRow "next set" highlight is weak in light mode** (`SetRow.tsx:190-192`). surface2 on a surface card is 1.10:1, and the 2dp accent edge is 2.11:1. The comment promises "the eye lands on it from standing height". Fix: a `bg` fill with a 4dp accent bar, or put the set label in an inverse pill on the active row.
20. **Check-in.**
    - "Add today's weight" still starts at 75 kg / 165 lb (`CheckinScreen.tsx:~280`). Start from the profile or last weigh-in.
    - The before → after kcal row (`:~402-410`) puts a title2, an arrow and a display `BigNumber` with no `fitWidth` in one row, so it overflows at 130% on 360dp. Fix: stack it, or use `fitWidth`.
21. **`src/ui/WeekStrip.tsx:82-92`: cells are below the 48dp target width.** Seven flex cells with a 4dp gap are ≈42dp wide on 360dp. Fix: `hitSlop={{ left: xxs/2, right: xxs/2 }}`, or let the strip scroll horizontally at 130%.
22. **`src/ui/MacroRings.tsx`.**
    - The kcal ring clamps at 100% with no "over" visual; only the caption changes (`:76`).
    - The macro ring stroke is arithmetic (`xxs + xxs/4`, `:89`).
    - Fix: switch the ring to `warning` (or textPrimary) once over target. Add a `sizes.ringStrokeThin` token.
23. **`src/ui/ProgressRing.tsx:73`: empty ring track is nearly invisible.** The track is `surface2`, which is 1.10:1 on surface Cards in light mode. Fix: track `border` (light) / `surface2` (dark), or borderStrong at 35% opacity.
24. **Round-1 P2s still open (spot-checked).**
    - Button label is SemiBold, but sheet 11 says Bold (`Button.tsx:94`).
    - `Card selected` is a 1px hairline (`Card.tsx:34-35`); Summary PRs use it.
    - Segmented `INSET = 4` and `radius.button - 2` (`Segmented.tsx:26,77`).
    - No tab-press haptic (`app/(tabs)/_layout.tsx`).
    - `app/progress/_layout.tsx` has no `animationDuration`.
    - PlateCalculator literals and text-token bar (`PlateCalculator.tsx:21,66-67,83`).
    - Screen large title only fades, no shrink (`Screen.tsx:66-82`).
    - There are no shared-element transitions.
    - Light-mode accent graphics are 2.33:1 on surface (rings, heatmap bars). Values are always printed beside them, so this is acceptable, but log it in DECISIONS.

---

## C. Wow factors (sheet 08)
| ID | Status |
|---|---|
| W1 plan reveal | Good. A skeleton replaced the loading text and delays use `revealDelay`. Its cards are forks of Today's (P2-9, P2-10). |
| W2 Today in one glance | Fixed. The inverse "trip" card plus Start workout sits above the fold. |
| W3 PR moment | Fixed. Live confetti and hero card; image share on Summary. The PR visual differs per screen (P2-14). |
| W4 swap anything | Partial. Two swap UIs and two icons (N3). |
| W5 rest timer | Good in the footer (RestBar). The hero sheet buttons clip (N5). |
| W6 body heatmap | Fixed. One body map, a teaser on Progress home, and a legend built from the palette. |
| W7 grocery | Good. Shared Checkbox and aisle groups. |
| W8 Wrapped | Fixed (colour). Its month gating is inconsistent (P2-12). |

---

## D. Ranked top 10
1. **Wire the routine delete confirm, with undo** (N1). It is a one-line fix for a data-loss path, and a regression from the fix wave.
2. **Give `Sheet` a `scrollable` prop** using `BottomSheetScrollView`, with `maxDynamicContentSize` about 90% of the screen. Then remove the CookMode and FilterSheet workarounds and fix ReorderSheet clipping with more than 8 exercises (round-1 U3, still open).
3. **One meal row across Today and Eat** with the same tap model, eaten style and macros (N2).
4. **One swap experience.** One `SwapIcon` app-wide; the exercise swap sheet gets `ExerciseThumb`, title-case labels and "Never suggest" (N3, P2-4).
5. **Gym controls at 360dp.** Fix the BigTimer button row (N5) and the S14 "Log set" label (N6).
6. **One history, and one Pro rule for history, months and Wrapped** (N4, P2-12).
7. **Give `Screen` a `keyboard` prop** and remove the five per-screen `KeyboardAvoidingView`s with mixed Android behaviour (round-1 U4, still open).
8. **Paywall hero.** One title, and a header that depends on `source` (N7).
9. **Promote the last forks to `src/ui`:** `SectionHeader`, `BackButton` with a deep-link fallback, `ListGroup`, `Sparkline`, a Text `eyebrow` variant, and use `enterAt` everywhere (P2-1, 2, 3, 5, 7, 13).
10. **Media and weight entry.**
    - Owner: re-enable Cloudinary so the exercise demos and recipe photos ship (round-1 P0 L1 and M1, still partial).
    - Code: one `WeightPicker` for onboarding, the check-in and Log body (round-1 T13, still partial).
