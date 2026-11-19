/**
 * WeekPlan (engine) → rows for plans, sessions, session_exercises, meal_plans and meals. Pure:
 * the service stamps ids/timestamps and writes them in one SQLite transaction.
 */
import type { DayMealPlan, PlannedSession, WeekPlan } from '../engine';

import type { DayType, Macros } from '@/db/schema';

export type PlanSource = 'rules' | 'ai';

/** plans.payload for type 'training' (everything except the meal days). */
export type TrainingPayload = Omit<WeekPlan, 'days' | 'nutrition'> & {
  kind: 'training';
  trainingWeekdays: number[];
};

/** plans.payload for type 'nutrition'. */
export type NutritionPayload = Pick<
  WeekPlan,
  'weekStart' | 'nutrition' | 'noRepeatDays' | 'seed'
> & {
  kind: 'nutrition';
  days: DayMealPlan[];
};

export type SessionRows = {
  date: string;
  title: string;
  dayIndex: number;
  exercises: {
    exerciseId: string;
    position: number;
    targetSets: number;
    targetReps: string;
    targetLoad: number | null;
    restS: number;
    notes: string | null;
  }[];
};

export type MealPlanRows = {
  date: string;
  dayType: DayType;
  kcalTarget: number;
  macros: Macros;
  meals: { slot: string; recipeId: string; portion: number }[];
};

export type WeekRows = {
  weekStart: string;
  blockNo: number;
  training: TrainingPayload;
  nutrition: NutritionPayload;
  sessions: SessionRows[];
  mealPlans: MealPlanRows[];
};

export function repsLabel(range: readonly [number, number], target: number): string {
  const [lo, hi] = range;
  if (lo === hi) return String(lo);
  if (lo > 0 && hi > lo) return `${lo}-${hi}`;
  return String(target);
}

/**
 * When the catalogue cannot fill a day (e.g. strict diets with few recipes), repeat the menu of
 * the nearest earlier (else later) day of the same day type rather than leave the day empty.
 * The copied meals keep the engine's own portions and totals; nothing is recalculated here.
 */
export function fillEmptyDays(days: readonly DayMealPlan[]): {
  days: DayMealPlan[];
  filled: string[];
} {
  const filled: string[] = [];
  const out = days.map((d) => ({ ...d, meals: [...d.meals] }));
  out.forEach((day, i) => {
    if (day.meals.length > 0) return;
    const order = [...out.slice(0, i).reverse(), ...days.slice(i + 1)].filter(
      (d) => d.meals.length > 0,
    );
    const donor = order.find((d) => d.dayType === day.dayType) ?? order[0];
    if (!donor) return;
    out[i] = { ...day, meals: donor.meals.map((m) => ({ ...m })), totals: { ...donor.totals } };
    filled.push(day.date);
  });
  return { days: out, filled };
}

export function sessionRows(s: PlannedSession): SessionRows {
  return {
    date: s.date,
    title: s.title,
    dayIndex: s.weekday,
    exercises: s.items.map((it, position) => ({
      exerciseId: it.exerciseId,
      position,
      targetSets: it.sets,
      targetReps: repsLabel(it.repRange, it.targetReps),
      targetLoad: it.loadKg,
      restS: it.restS,
      notes: it.rpe ? `RPE ${it.rpe}` : null,
    })),
  };
}

export function mealPlanRows(d: DayMealPlan): MealPlanRows {
  return {
    date: d.date,
    dayType: d.dayType,
    kcalTarget: Math.round(d.targets.kcal),
    macros: { protein: d.targets.protein, carbs: d.targets.carbs, fat: d.targets.fat },
    meals: d.meals.map((m) => ({ slot: m.slot, recipeId: m.recipeId, portion: m.servings })),
  };
}

/**
 * Rows for every date of the plan on or after `fromDate`. Dates in `keepSessionDates` /
 * `keepMealDates` already hold user activity (a started workout, an eaten meal) and are skipped.
 */
export function planToRows(
  plan: WeekPlan,
  opts: {
    fromDate: string;
    trainingWeekdays: number[];
    keepSessionDates?: ReadonlySet<string>;
    keepMealDates?: ReadonlySet<string>;
  },
): WeekRows {
  const { days, nutrition, ...rest } = plan;
  const keepS = opts.keepSessionDates ?? new Set<string>();
  const keepM = opts.keepMealDates ?? new Set<string>();
  const filledDays = fillEmptyDays(days).days;
  return {
    weekStart: plan.weekStart,
    blockNo: plan.block.blockNo,
    training: { ...rest, kind: 'training', trainingWeekdays: [...opts.trainingWeekdays] },
    nutrition: {
      kind: 'nutrition',
      weekStart: plan.weekStart,
      nutrition,
      noRepeatDays: plan.noRepeatDays,
      seed: plan.seed,
      days: filledDays,
    },
    sessions: plan.sessions
      .filter((s) => s.date >= opts.fromDate && !keepS.has(s.date))
      .map(sessionRows),
    mealPlans: filledDays
      .filter((d) => d.date >= opts.fromDate && !keepM.has(d.date))
      .map(mealPlanRows),
  };
}

/** The planner-owned fields of a session exercise row. */
export type ExerciseRowFields = Pick<
  SessionRows['exercises'][number],
  'exerciseId' | 'position' | 'targetSets' | 'targetReps' | 'targetLoad' | 'restS'
>;

/**
 * True when a session's live exercises are exactly what the planner wrote for it (same exercises,
 * order and targets). Anything else (a swap, an added, removed or reordered exercise, an edited
 * target) means the user touched it, and a regenerate must leave it alone.
 */
export function sessionMatchesPlan(
  planned: SessionRows | undefined,
  live: readonly {
    exerciseId: string;
    position: number;
    targetSets: number | null;
    targetReps: string | null;
    targetLoad: number | null;
    restS: number | null;
  }[],
): boolean {
  if (!planned) return false;
  const rows = [...live].sort((a, b) => a.position - b.position);
  if (rows.length !== planned.exercises.length) return false;
  return planned.exercises.every((p, i) => {
    const l = rows[i]!;
    return (
      l.exerciseId === p.exerciseId &&
      l.position === p.position &&
      l.targetSets === p.targetSets &&
      l.targetReps === p.targetReps &&
      (l.targetLoad ?? null) === (p.targetLoad ?? null) &&
      l.restS === p.restS
    );
  });
}
