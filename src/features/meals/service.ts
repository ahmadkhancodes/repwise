/**
 * Meals slice orchestration over SQLite (the source of truth). Synchronous local reads/writes only:
 * nothing here touches the network, so every action responds instantly and works offline.
 *
 * - ensureWeekMeals: the offline planner. Fills missing days (today onwards) of a week with the
 *   engine's meal plan. Idempotent: days that already have a plan (from onboarding, the Worker or
 *   an earlier run) are never touched.
 * - swaps, ticks, "ate out" with rebalance, water.
 */
import {
  mealFromRecipe,
  type ISODate,
  type PlanWarning,
  type PlannedMeal,
  type Recipe as EngineRecipe,
} from '@repwise/engine';
import { and, asc, gte, inArray, lt } from 'drizzle-orm';

import { mealPlans, meals as mealsTable, type MealStatus } from '@/db/schema';
import { foodLogsRepo, logFood, logsForDate, removeLog, type FoodLog } from '@/features/nutrition/repo';
import { dayIntake } from '@/features/nutrition/logic/intake';
import { WATER_SLOT, waterName } from '@/features/nutrition/logic/water';
import { getProfile } from '@/features/settings/repo';
import { track } from '@/services/analytics';
import { getCatalog } from '@/services/catalog';

import { addDays, startOfWeek, todayISO, weekDates } from './logic/dates';
import { engineRecipes } from './logic/engineCatalog';
import {
  dayFromRows,
  historyFrom,
  planWeekMeals,
  rebalance,
  swapOptions,
  type PastMealRow,
} from './logic/plan';
import { toMealProfile, type MealProfile } from './logic/profile';
import {
  mealPlansRepo,
  mealsRepo,
  setMealStatus,
  sortBySlot,
  swapMeal,
  type Meal,
  type MealPlan,
} from './repo';
import { getSignals } from './signals';

/** History the planner sees (no-repeat window is 7–30 days). */
export const HISTORY_DAYS = 30;

export type PlannerInputs = {
  profile: MealProfile;
  recipes: EngineRecipe[];
  recipeById: Map<string, EngineRecipe>;
};

let recipeCache: { key: string; list: EngineRecipe[]; byId: Map<string, EngineRecipe> } | null = null;

/** Profile + safe engine recipes, or null until onboarding saved the body fields. */
export function plannerInputs(): PlannerInputs | null {
  const profile = toMealProfile(getProfile());
  if (!profile) return null;
  const key = `${[...profile.allergies].sort().join(',')}|${profile.dietType}`;
  if (recipeCache?.key !== key) {
    const cat = getCatalog();
    const list = engineRecipes(cat.recipes, cat.foodById, {
      allergies: profile.allergies,
      dietType: profile.dietType,
    });
    recipeCache = { key, list, byId: new Map(list.map((r) => [r.id, r])) };
  }
  return { profile, recipes: recipeCache.list, recipeById: recipeCache.byId };
}

/** Engine-shaped recipe by id from the current safe set (undefined if unsafe or unknown). */
export function engineRecipe(id: string | null | undefined): EngineRecipe | undefined {
  return id ? plannerInputs()?.recipeById.get(id) : undefined;
}

/** Latest plan row per date in [from, to). */
export function plansByDate(from: ISODate, to: ISODate): Map<string, MealPlan> {
  const rows = mealPlansRepo.list(and(gte(mealPlans.date, from), lt(mealPlans.date, to)), asc(mealPlans.updatedAt));
  const out = new Map<string, MealPlan>();
  for (const p of rows) out.set(p.date, p); // ascending updatedAt: the newest wins
  return out;
}

export function mealsOfPlans(planIds: readonly string[]): Meal[] {
  if (planIds.length === 0) return [];
  return mealsRepo.list(inArray(mealsTable.mealPlanId, [...planIds]), asc(mealsTable.createdAt));
}

/** Stored meals in [from, to) as engine history rows. */
export function pastMealRows(from: ISODate, to: ISODate): PastMealRow[] {
  const plans = plansByDate(from, to);
  const dateOf = new Map([...plans.values()].map((p) => [p.id, p.date]));
  return mealsOfPlans([...dateOf.keys()]).map((m) => ({
    date: dateOf.get(m.mealPlanId) ?? '',
    slot: m.slot,
    recipeId: m.recipeId,
  }));
}

export type EnsureResult =
  | { status: 'no_profile' }
  | { status: 'ready'; created: number; warnings: PlanWarning[] };

/**
 * Offline planner: make sure every day of the week containing `date`, from today on, has a meal
 * plan. Runs the engine once per week; inserts only the missing days.
 */
export function ensureWeekMeals(date: ISODate, now: number = Date.now()): EnsureResult {
  const inputs = plannerInputs();
  if (!inputs) return { status: 'no_profile' };
  const weekStart = startOfWeek(date);
  const today = todayISO(now);
  const wanted = weekDates(weekStart).filter((d) => d >= today);
  if (wanted.length === 0) return { status: 'ready', created: 0, warnings: [] };
  dropUnsafeDays(wanted[0]!, addDays(weekStart, 7), inputs, now);
  const existing = plansByDate(weekStart, addDays(weekStart, 7));
  const missing = wanted.filter((d) => !existing.has(d));
  if (missing.length === 0) return { status: 'ready', created: 0, warnings: [] };

  const history = historyFrom(pastMealRows(addDays(weekStart, -HISTORY_DAYS), weekStart), getSignals());
  const week = planWeekMeals({
    profile: inputs.profile.engine,
    history,
    recipes: inputs.recipes,
    date: weekStart,
    now,
  });
  let created = 0;
  for (const day of week.days) {
    if (!missing.includes(day.date)) continue;
    const plan = mealPlansRepo.insert(
      {
        date: day.date,
        dayType: day.dayType,
        kcalTarget: day.targets.kcal,
        macros: { protein: day.targets.protein, carbs: day.targets.carbs, fat: day.targets.fat },
      },
      now,
    );
    for (const m of day.meals) {
      mealsRepo.insert(
        { mealPlanId: plan.id, slot: m.slot, recipeId: m.recipeId, portion: m.servings, status: 'planned' },
        now,
      );
    }
    created++;
  }
  if (created > 0) {
    const p = inputs.profile.engine;
    track('plan_generated', { goal: p.goal, days: p.daysPerWeek, diet_type: p.dietType ?? 'omnivore', kind: 'meals' });
  }
  return { status: 'ready', created, warnings: week.warnings };
}

/**
 * Allergies or diet changed after a plan was made: a planned meal whose recipe is no longer in the
 * safe set must never be shown as the plan. Untouched days are dropped (and re-planned right
 * after); on days with something already eaten or logged the unsafe meals are marked skipped.
 */
function dropUnsafeDays(from: ISODate, to: ISODate, inputs: PlannerInputs, now: number): void {
  for (const plan of plansByDate(from, to).values()) {
    const rows = mealsOfPlans([plan.id]);
    const unsafe = rows.filter((m) => m.status === 'planned' && m.recipeId && !inputs.recipeById.has(m.recipeId));
    if (unsafe.length === 0) continue;
    const touched = rows.some((m) => m.status === 'eaten') || logsForDate(plan.date).some((l) => l.slot !== WATER_SLOT);
    if (touched) {
      for (const m of unsafe) setMealStatus(m.id, 'skipped', now);
      continue;
    }
    for (const m of rows) mealsRepo.remove(m.id, now);
    mealPlansRepo.remove(plan.id, now);
  }
}

/**
 * Re-plan the not-yet-eaten days of this week from `from` (after targets or preferences change).
 * Days with anything eaten or logged stay as they are, so no logged data is ever replaced.
 */
export function replanFrom(from: ISODate, now: number = Date.now()): EnsureResult {
  const weekStart = startOfWeek(from);
  const plans = plansByDate(from, addDays(weekStart, 7));
  for (const plan of plans.values()) {
    const rows = mealsOfPlans([plan.id]);
    if (rows.some((m) => m.status === 'eaten')) continue;
    if (logsForDate(plan.date).some((l) => l.slot !== WATER_SLOT)) continue;
    for (const m of rows) mealsRepo.remove(m.id, now);
    mealPlansRepo.remove(plan.id, now);
  }
  return ensureWeekMeals(from, now);
}

type MealContext = { meal: Meal; plan: MealPlan; rows: Meal[] };

function mealContext(mealId: string): MealContext | null {
  const meal = mealsRepo.get(mealId);
  if (!meal) return null;
  const plan = mealPlansRepo.get(meal.mealPlanId);
  if (!plan) return null;
  return { meal, plan, rows: sortBySlot(mealsOfPlans([plan.id])) };
}

function targetsOf(plan: MealPlan) {
  return {
    kcal: plan.kcalTarget ?? 0,
    protein: plan.macros?.protein ?? 0,
    carbs: plan.macros?.carbs ?? 0,
    fat: plan.macros?.fat ?? 0,
  };
}

/** S22: three alternatives for a planned meal (engine swapMeal; allergens, diet, no-repeat). */
export function swapChoices(mealId: string, now: number = Date.now()): PlannedMeal[] {
  const inputs = plannerInputs();
  const ctx = mealContext(mealId);
  if (!inputs || !ctx) return [];
  const { day, rowIndex } = dayFromRows(
    ctx.plan.date,
    ctx.plan.dayType ?? 'rest',
    targetsOf(ctx.plan),
    ctx.rows,
    inputs.recipeById,
  );
  const index = rowIndex.indexOf(ctx.rows.findIndex((r) => r.id === mealId));
  if (index < 0) return [];
  const rows = pastMealRows(addDays(ctx.plan.date, -HISTORY_DAYS), addDays(ctx.plan.date, HISTORY_DAYS));
  return swapOptions({
    profile: inputs.profile.engine,
    history: historyFrom(rows, getSignals()),
    recipes: inputs.recipes,
    day,
    index,
    now,
  });
}

export function applySwap(mealId: string, option: PlannedMeal, now: number = Date.now()): Meal | undefined {
  // Swapping an eaten meal re-opens it: its intake log goes too, so tile and rings agree.
  const ctx = mealContext(mealId);
  if (ctx?.meal.status === 'eaten') for (const l of planLogsFor(ctx)) removeLog(l.id, now);
  const saved = swapMeal(mealId, option.recipeId, now, option.servings);
  if (saved) track('meal_swapped', { slot: saved.slot });
  return saved;
}

/**
 * The 'plan' logs recording this meal. Keyed by meal id: with 4–6 meals a day several snacks share
 * the 'snack' slot, and ticking one must never touch another's log. A legacy log (no meal id) is
 * only claimed when the slot is unambiguous (one meal in it that day).
 */
function planLogsFor({ meal, plan, rows }: MealContext): FoodLog[] {
  const slotIsUnique = rows.filter((m) => m.slot === meal.slot).length === 1;
  return logsForDate(plan.date).filter(
    (l) => l.source === 'plan' && (l.mealId ? l.mealId === meal.id : slotIsUnique && l.slot === meal.slot),
  );
}

/** Core action "Ate it" (fraction < 1 = partial). Writes the intake log in the same tap. */
export function markMealEaten(mealId: string, fraction = 1, now: number = Date.now()): boolean {
  const ctx = mealContext(mealId);
  if (!ctx) return false;
  const { meal, plan } = ctx;
  const recipe = engineRecipe(meal.recipeId);
  for (const l of planLogsFor(ctx)) removeLog(l.id, now);
  if (recipe && (meal.slot === 'breakfast' || meal.slot === 'lunch' || meal.slot === 'dinner' || meal.slot === 'snack')) {
    const eaten = mealFromRecipe(recipe, meal.slot, meal.portion * fraction);
    logFood(
      {
        date: plan.date,
        source: 'plan',
        name: recipe.name,
        slot: meal.slot,
        kcal: eaten.kcal,
        p: eaten.protein,
        c: eaten.carbs,
        f: eaten.fat,
        mealId: meal.id,
      },
      now,
    );
  }
  setMealStatus(mealId, 'eaten', now);
  track('meal_logged', { slot: meal.slot, from_plan: true, partial: fraction < 1 });
  return true;
}

/** Undo a tick or skip a meal; that meal's plan log goes too (never another meal's). */
export function setMealOpen(mealId: string, status: Exclude<MealStatus, 'eaten' | 'swapped'>, now: number = Date.now()): boolean {
  const ctx = mealContext(mealId);
  if (!ctx) return false;
  for (const l of planLogsFor(ctx)) removeLog(l.id, now);
  setMealStatus(mealId, status, now);
  return true;
}

/** Remaining planned meals re-solved to what's left of the day (RW-34). Returns how many changed. */
export function rebalanceDay(date: ISODate, now: number = Date.now()): number {
  const inputs = plannerInputs();
  const plan = plansByDate(date, addDays(date, 1)).get(date);
  if (!inputs || !plan) return 0;
  const rows = sortBySlot(mealsOfPlans([plan.id]));
  const eatenMeals = rows
    .filter((m) => m.status === 'eaten')
    .flatMap((m) => {
      const r = engineRecipe(m.recipeId);
      return r && (['breakfast', 'lunch', 'dinner', 'snack'] as const).includes(m.slot as never)
        ? [{ ...mealFromRecipe(r, m.slot as 'lunch', m.portion), id: m.id, status: 'eaten' }]
        : [];
    });
  const consumed = dayIntake(logsForDate(date), eatenMeals);
  const open = rows
    .filter((m) => m.status === 'planned')
    .flatMap((m) => {
      const recipe = engineRecipe(m.recipeId);
      return recipe ? [{ meal: m, recipe }] : [];
    });
  const target = targetsOf(plan);
  const servings = rebalance(open, { kcal: target.kcal - consumed.kcal, protein: target.protein - consumed.p });
  let changed = 0;
  open.forEach(({ meal }, i) => {
    const s = servings[i];
    if (s !== undefined && Math.abs(s - meal.portion) > 1e-9) {
      mealsRepo.update(meal.id, { portion: s }, now);
      changed++;
    }
  });
  return changed;
}

export type OffPlanEntry = {
  date: ISODate;
  slot: string;
  name: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  source: 'search' | 'quick';
  /** Planned meal this replaces ("I ate out instead"). */
  replaceMealId?: string | null;
};

/** S23: log an off-plan food or meal, mark the replaced meal skipped and rebalance the rest. */
export function logOffPlan(e: OffPlanEntry, now: number = Date.now()): { log: FoodLog; rebalanced: number } {
  const log = logFood({ date: e.date, source: e.source, name: e.name, slot: e.slot, kcal: e.kcal, p: e.p, c: e.c, f: e.f }, now);
  if (e.replaceMealId) setMealOpen(e.replaceMealId, 'skipped', now);
  const rebalanced = rebalanceDay(e.date, now);
  track('meal_logged', { slot: e.slot, from_plan: false, kind: e.source === 'quick' ? 'ate_out' : 'food' });
  return { log, rebalanced };
}

/** S27 quick add; returns the row so the toast can undo it. */
export function addWater(date: ISODate, ml: number, now: number = Date.now()): FoodLog {
  const row = logFood({ date, source: 'quick', name: waterName(ml), slot: WATER_SLOT, kcal: 0 }, now);
  track('water_logged', { ml_bucket: ml <= 250 ? 'glass' : 'bottle' });
  return row;
}

export function undoLog(id: string, now: number = Date.now()): boolean {
  return foodLogsRepo.remove(id, now);
}
