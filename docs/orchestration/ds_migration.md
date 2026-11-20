# Design-system migration map (branch `feat/ds`)

Everything below is exported from `@/ui`. Delete the fork after the swap, keep testIDs your tests and Maestro flows use (pass `testID`), and run `npm run check`.

## Global rules (read first)

- **Haptics fire on commit.** `PressableScale` now buzzes in `onPress`/`onLongPress`, never on press-in. A test that only fires `pressIn` no longer sees a haptic: fire `press`.
- **Toast haptics: `silent`.** A `tone: 'success'` toast buzzes once (haptics.success) unless you pass `silent: true`. Pass `silent: true` wherever the action already buzzed or is not a core action. Current double buzzes to fix (caller fires `haptics.success` AND shows a success toast): EatScreen:94, usePlayer:125, workout/actions:135, AddToWorkoutSheet:35, ExercisePickerScreen:34, SwapSheet:58, TargetsScreen:75, LogBodyScreen:45, AccountScreen:73, CustomExerciseScreen:145 → drop the manual call on core actions (let the toast buzz) or add `silent: true`. Non-core success toasts (photo saved, backup, exercise created/added, swapped, water) → `silent: true`. Core actions that rely on the toast buzz and need nothing: Today meal tick, Paywall purchase/restore, FoodLog, CookMode logged. `showUndoToast` is always silent.
- **Rest end:** the rest-timer store calls `haptics.restEnd()` (strong triple) once at zero, instead of the hook-level `success`.
- **New tokens:** `colors.borderStrong` (unselected control outlines), `colors.accentOnInverse` / `dangerOnInverse` (glyphs on inverse bars/pills), `typography.hero` (72, tabular), `sizes.hitGym` 56 / `hitGymLarge` 64 / `ringHero` 240 / `iconMedium` 20 / `iconStrokeBold` 2.5 / `borderThick` 2. Replace literals: `strokeWidth={2.5}` → `t.sizes.iconStrokeBold`; `iconSmall + 4` → `iconMedium`; `borderWidth: 2` → `t.sizes.borderThick`.
- **Colour values changed (light):** textTertiary, danger, macroCarb. Tests that compare against `colors[scheme].x` keep passing; hard-coded expectations don't.
- **Never** put textTertiary text on surface2 except via tokens tested in `contrast.test.ts`; accent on a light bg is never the only cue.

## Fork → shared component

| Fork (location) | Replace with | How to swap |
|---|---|---|
| `today/components/Skeleton.tsx` `SkeletonBlock`, `TodaySkeleton`, `MealsSkeleton` | `Skeleton`, `SkeletonGroup`, `SkeletonCard` | `SkeletonBlock height radius width` → `<Skeleton height width radius>` (same props). Screen-level wrappers: `<SkeletonGroup label="Loading today" testID="today-skeleton">…</SkeletonGroup>` (gives one busy a11y label). |
| `meals/components/SkeletonBlock.tsx` (`SkeletonBlock`, `SkeletonList`) | `Skeleton`, `SkeletonGroup` | Same props. `SkeletonList rows` → `SkeletonGroup` + `rows × <Skeleton height={t.sizes.row} />`. |
| `progress/components/Skeleton.tsx` (`SkeletonBlock`, `ProgressSkeleton`) | `Skeleton`, `SkeletonGroup`, `SkeletonText` | Hero line → `<SkeletonText variant="display" lines={1} lastLineWidth="45%" />`; chart → `<Skeleton height={200} radius={t.radius.card} />`. |
| `workout/components/Skeleton.tsx` (`SkeletonBlock`, `SkeletonList`) | `Skeleton`, `SkeletonGroup`, `SkeletonCard` | `SkeletonList count` → `SkeletonGroup` + `count × <SkeletonCard lines={2} />`. |
| `library/components/SkeletonRows.tsx` | `SkeletonGroup` + `SkeletonCard media lines={1}` | Keep the `testID` on the group. |
| `notifications/screens/NotificationSettingsScreen.tsx:40` local `Skeleton` | `Skeleton` | `<Skeleton height={96} radius={t.radius.card} />` (and replace 96/56 with tokens). |
| SetRow check `workout/components/SetRow.tsx:205-235` | `Tick size="gym"` | `<Tick checked={done} onChange={toggle} size="gym" accessibilityLabel={`${spoken} done`} testID={`${testID}-check`} />`. Remove the pop animation and `feedback="light"` (Tick owns spring + success haptic). 56dp box, 64dp effective. |
| MealsCard `TickMark` `today/components/MealsCard.tsx:21` | `TickMark` | Row stays the checkbox; inside it `<TickMark checked={eaten} />`. Row `feedback="success"` when ticking a meal (core action). |
| MealTile tick `meals/components/MealTile.tsx:94` | `Tick` (or `TickMark` if the whole tile is the checkbox) | `<Tick checked onChange accessibilityLabel={`${title} eaten`} />`. |
| Grocery check `meals/screens/GroceryScreen.tsx:114` | `Checkbox` | `<Checkbox checked onChange label={name} description={qty} strikeWhenChecked />`. Uses `feedback="selection"`; groceries are not a core action. |
| OptionTile indicator `onboarding/components/OptionTile.tsx` | `TickMark` (shape `circle` for single choice, `square` for multi) | Keep the tile as the pressable with `accessibilityRole="radio"`/`"checkbox"`. |
| WeekdayPicker `onboarding/components/WeekdayPicker.tsx:29` | `Chip role="checkbox"` or `WeekStrip` | Fixes the 360dp overflow: use flex cells (`WeekStrip` pattern) not fixed widths. |
| FoodLogScreen radio `nutrition/screens/FoodLogScreen.tsx:170` | `Checkbox role="radio"` | One-of list row. |
| ExerciseDetail `Tag` `library/screens/ExerciseDetailScreen.tsx:55` | `Badge` (neutral) | `<Badge label={muscle} />`. |
| "Yours" pill `library/components/ExerciseRow.tsx:62` | `Badge tone="accent"` | `<Badge label="Yours" tone="accent" />`. |
| Paywall plan badge `billing/screens/PaywallScreen.tsx:228-238` | `Badge tone="inverse"` (or accent) | `<Badge label={BADGE[plan.badge]} tone="inverse" />`. |
| ToggleRow "Pro" pill `notifications/components/ToggleRow.tsx:100` | `Badge tone="accent"` | `<Badge label={locked} tone="accent" />`. |
| Check-in delta pill `assistant/screens/CheckinScreen.tsx:377` | `Badge` | `tone={deltaKcal ? 'accent' : 'neutral'}`, spoken label via `accessibilityLabel`. |
| CompareSlider `Tag` `progress/components/CompareSlider.tsx:129` | `Badge tone="inverse"` | Over a photo, inverse reads best. |
| QuizProgress `onboarding/components/QuizProgress.tsx` | `StepProgress` | `<StepProgress total={total} current={index} accessibilityLabel="Quiz progress" />` (keep the screen padding on a wrapper View). |
| StepBar `assistant/components/StepBar.tsx` | `StepProgress` | `<StepProgress total={count} current={current} accessibilityLabel={`Step ${current + 1} of ${count}`} testID="checkin-progress" />`. |
| WorkoutProgressBar `workout/components/WorkoutProgressBar.tsx` | `StepProgress fractions` | `<StepProgress fractions={fractions} color="accent" accessibilityLabel="Workout progress" testID={testID} />`. |
| Cook-mode bar `meals/screens/CookModeScreen.tsx:139` | `StepProgress` | `total={steps.length} current={i}`. |
| Wrapped `StoryBar` `progress/screens/WrappedScreen.tsx:180` | `StepProgress` | `total={count} current={index}`; if the bar sits on a coloured story, wrap it in `ThemeScope`/keep the local colour only if contrast needs it. |
| Meals WeekStrip `meals/components/WeekStrip.tsx` | `WeekStrip` | Map dates → `days: { key: d, weekday: shortWeekday(d), day: dayOfMonth(d), status: done.has(d) ? 'done' : 'none', locked: locked?.(d), accessibilityLabel: dayLabel(d, today) }`, `selectedKey={selected}`, `todayKey={today}`, `onSelect`. Keep `testID="week-strip"` on the strip; day testIDs stay `day-<date>`. |
| Workout WeekStrip `workout/components/WeekStrip.tsx` | `WeekStrip` | `status` maps 1:1 (`done/active/planned/missed/rest`); weekday/day from your date helpers. Day testIDs stay `day-<date>`. |
| Onboarding reveal WeekStrip `onboarding/components/RevealParts.tsx:179` | `WeekStrip` | Display only: pass `selectedKey={null}` and a no-op `onSelect`, or keep the reveal animation wrapper around it. |
| Meals MacroRings `meals/components/MacroRings.tsx` | `MacroRings` | Same props (`eaten`, `target`: `{ kcal, protein, carbs, fat }`). testIDs: `<testID>-kcal`, `<testID>-kcal-value`, `<testID>-kcal-ring`. |
| Today RingsCard `today/components/RingsCard.tsx` | `MacroRings size="compact"` (inside your Card) | Removes the "Eaten" BigNumber overflow beside the ring at 360dp. |
| TargetsHero / BuildRing `onboarding/components/RevealParts.tsx:110,345` | `BigNumber variant="hero" fitWidth={ringInnerWidth(size, stroke)} center` inside `ProgressRing` (or `MacroRings`) | kcal reveal = hero step; never overflows at 130%. |
| Water ring `nutrition/screens/WaterScreen.tsx:75-86` | `BigNumber fitWidth={ringInnerWidth(size, stroke)} center` | "2,000 ml" now fits its ring. |
| Any `BigNumber` inside a `ProgressRing` | add `fitWidth={ringInnerWidth(size, stroke)}` + `center` | Mandatory for every ring number. |
| Library SearchBar `library/components/SearchBar.tsx` | `SearchBar` | `<SearchBar value={q} onChangeText={setQ} onSearch={runQuery} placeholder accessibilityLabel="Search exercises" filterCount onOpenFilters testID="library-search" />`. Clear = `library-search-clear`, filters = `library-search-filters` (update tests/flows that used `library-filters`). Use `onSearch` (debounced 200 ms) for the query, not `onChangeText`. |
| Food search field `nutrition/screens/FoodLogScreen.tsx` (TextField) | `SearchBar` | `accessibilityLabel="Search food"`; no filters. |
| ToggleRow switch `notifications/components/ToggleRow.tsx` | `SwitchTrack` (row stays role "switch") | Replace the local track/thumb with `<SwitchTrack value={value} testID={testID ? `${testID}-track` : undefined} />`. Off state now has a visible borderStrong outline. Standalone switches elsewhere: `Switch`. |
| NumberCell weight/reps `workout/components/NumberCell.tsx` (TextInput, 18 pt) | `Stepper` in a set-editor `Sheet` | Cells become buttons opening a sheet with `<Stepper size="large" label="Weight" step={plateStep} unit="kg" … />` and `<Stepper size="large" label="Reps" step={1} … />`, plus a 64dp "Log set" `Button`. Plate step by unit/equipment: 2.5 kg / 5 lb barbell, 1 kg / 2.5 lb dumbbell. |
| Existing `Stepper` callers (OneRm, PlateCalculator, RoutineBuilder, Recipe servings, Check-in, Onboarding, Water goal) | no change needed | Same API; buttons grew to 56dp, hold-to-repeat and tap-to-type come for free. Pass `editable={false}` where typing makes no sense (servings). |
| RestTimerSheet `workout/components/RestTimer.tsx:67-145` | `BigTimer` | `<BigTimer remainingMs={view.remainingMs} totalMs={total} onAdjust={(d) => restTimer.add(d)} onSkip={() => { restTimer.skip(); onClose(); }} caption={paused ? 'Paused' : undefined} next={`Next: ${st.next.exercise} · set ${st.next.setNo}`} testID="rest" />`. testIDs: `rest-time`, `rest-minus`, `rest-plus`, `rest-skip` (update tests). Keep Pause as a separate secondary Button if needed. |
| RestTimerPill `workout/components/RestTimer.tsx:14` | keep, but use `colors.accentOnInverse` for the progress fill and `Text variant="title2"` min | accent on inverse is 1.9:1 in dark. |
| Toast + Undo (Today, Eat, player delete/remove/untick) | `showUndoToast(message, onUndo)` | 5 s window, 48dp pill. e.g. `showUndoToast('Set deleted', () => restoreSet(id))`. Pinned `Screen` footers are detected automatically; toasts no longer cover "Log set"/rest bar. |
| Chip used as radio (check-in, set type, RPE, goal, slot, pose, Ate/Half/Skipped) | `Chip role="radio"` | Speaks as one-of. Water "+250 ml" chips → `role="button"`. Static muscle chips in the player → `Badge`. |
| Toast success icon colour | automatic | Toast now uses `accentOnInverse` / `dangerOnInverse`. |
