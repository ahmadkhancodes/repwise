/**
 * Thin wrappers over @repwise/engine for the meals slice. All maths (targets, portions, swaps,
 * validation) is the engine's; this file only shapes inputs and outputs. Pure (no DB, no clock).
 */
import {
  MEAL_SLOTS,
  buildContext,
  computeTargets,
  mealFromRecipe,
  planMeals,
  solvePortions,
  swapMeal,
  validateDays,
  ProfileSchema,
  type DayMealPlan,
  type DayType,
  type HistoryInput,
  type ISODate,
  type MacroSet,
  type MealSlot,
  type NutritionTargets,
  type PlanWarning,
  type PlannedMeal,
  type ProfileInput,
  type Recipe as EngineRecipe,
  type ValidationResult,
} from '@repwise/engine';

export type PastMealRow = { date: string; slot: string; recipeId: string | null };

export type MealSignals = { neverShow: string[]; moreLike: string[] };

export const isMealSlot = (s: string): s is MealSlot => (MEAL_SLOTS as readonly string[]).includes(s);

/** Engine history from stored meals (other slots and custom rows without a recipe are ignored). */
export function historyFrom(rows: readonly PastMealRow[], signals: MealSignals): HistoryInput {
  return {
    meals: rows
      .filter((r): r is PastMealRow & { recipeId: string } => !!r.recipeId && isMealSlot(r.slot))
      .map((r) => ({ date: r.date, slot: r.slot as MealSlot, recipeId: r.recipeId })),
    signals: { neverShow: [...signals.neverShow], moreLike: [...signals.moreLike] },
  };
}

export type WeekMeals = {
  weekStart: ISODate;
  days: DayMealPlan[];
  warnings: PlanWarning[];
  validation: ValidationResult;
  noRepeatDays: number;
};

export type PlanArgs = {
  profile: ProfileInput;
  history: HistoryInput;
  recipes: readonly EngineRecipe[];
  /** Any date in the week. */
  date: ISODate;
  now: number;
  noRepeatDays?: number;
  adjustmentKcal?: number;
};

/** One week of meals (engine planMeals) plus the engine's own validation of the result. */
export function planWeekMeals(a: PlanArgs): WeekMeals {
  const ctx = buildContext(
    a.profile,
    a.history,
    { exercises: [], recipes: a.recipes },
    {
      now: a.now,
      weekStart: a.date,
      ...(a.noRepeatDays !== undefined ? { noRepeatDays: a.noRepeatDays } : {}),
      ...(a.adjustmentKcal !== undefined ? { adjustmentKcal: a.adjustmentKcal } : {}),
    },
  );
  const warnings: PlanWarning[] = [];
  const days = planMeals(ctx, warnings);
  return {
    weekStart: ctx.weekStart,
    days,
    warnings,
    validation: validateDays(ctx, days),
    noRepeatDays: ctx.noRepeatDays,
  };
}

/** Validate stored/edited days against the same rules (allergens, diet, macros, repeats). */
export function validateMealDays(a: Omit<PlanArgs, 'date'>, days: readonly DayMealPlan[]): ValidationResult {
  const first = days[0];
  if (!first) return { ok: true, errors: [] } as ValidationResult;
  const ctx = buildContext(
    a.profile,
    a.history,
    { exercises: [], recipes: a.recipes },
    {
      now: a.now,
      weekStart: first.date,
      ...(a.noRepeatDays !== undefined ? { noRepeatDays: a.noRepeatDays } : {}),
    },
  );
  return validateDays(ctx, days);
}

/** Daily targets (S20): training and rest day sets from the engine. */
export function targetsFor(profile: ProfileInput, date: ISODate, adjustmentKcal?: number): NutritionTargets {
  return computeTargets(
    ProfileSchema.parse(profile),
    date,
    adjustmentKcal !== undefined ? { adjustmentKcal } : {},
  );
}

export type StoredMeal = { slot: string; recipeId: string | null; portion: number };

/** Rebuild the engine's DayMealPlan from stored rows (unknown recipes are skipped). */
export function dayFromRows(
  date: ISODate,
  dayType: DayType,
  targets: MacroSet,
  rows: readonly StoredMeal[],
  recipeById: ReadonlyMap<string, EngineRecipe>,
): { day: DayMealPlan; rowIndex: number[] } {
  const meals: PlannedMeal[] = [];
  const rowIndex: number[] = [];
  rows.forEach((m, i) => {
    const r = m.recipeId ? recipeById.get(m.recipeId) : undefined;
    if (!r || !isMealSlot(m.slot)) return;
    meals.push(mealFromRecipe(r, m.slot, m.portion));
    rowIndex.push(i);
  });
  const totals = meals.reduce(
    (t, m) => ({
      kcal: t.kcal + m.kcal,
      protein: t.protein + m.protein,
      carbs: t.carbs + m.carbs,
      fat: t.fat + m.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return { day: { date, dayType, targets, meals, totals }, rowIndex };
}

export type SwapArgs = Omit<PlanArgs, 'date' | 'adjustmentKcal'> & {
  day: DayMealPlan;
  index: number;
  count?: number;
};

/** S22: up to 3 alternatives (same kcal and protein ±10%, safe, outside the no-repeat window). */
export function swapOptions(a: SwapArgs): PlannedMeal[] {
  return swapMeal({
    profile: a.profile,
    history: a.history,
    catalogues: { exercises: [], recipes: a.recipes },
    day: a.day,
    index: a.index,
    now: a.now,
    count: a.count ?? 3,
    ...(a.noRepeatDays !== undefined ? { noRepeatDays: a.noRepeatDays } : {}),
  });
}

/**
 * RW-34 rebalance: after an off-plan meal, re-solve the servings of the meals still to eat so the
 * day lands as close to target as their bounds allow (engine portion solver, 0.25 steps).
 */
export function rebalance(
  remaining: readonly { recipe: EngineRecipe }[],
  left: { kcal: number; protein: number },
): number[] {
  if (remaining.length === 0) return [];
  const res = solvePortions(
    remaining.map(({ recipe }) => ({
      perServing: recipe.perServing,
      min: recipe.scalable.min,
      max: recipe.scalable.max,
    })),
    { kcal: Math.max(0, left.kcal), protein: Math.max(0, left.protein) },
  );
  return res.servings;
}
