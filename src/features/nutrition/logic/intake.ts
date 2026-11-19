/**
 * Day intake (S26 rings): food_logs are the record of what was eaten. A planned meal ticked from
 * elsewhere without its 'plan' log still counts, so totals never miss a meal. Plan logs are matched
 * to meals by meal id (several snacks share the 'snack' slot); logs written before meal_id existed
 * fall back to the slot. Water rows carry no energy and are left out. Pure.
 */
import { sumLogs, type DayTotals } from '../repo';
import { isWaterLog } from './water';

export type IntakeLog = {
  source: string;
  slot: string | null;
  kcal: number;
  p: number | null;
  c: number | null;
  f: number | null;
  mealId?: string | null;
};

export type EatenMeal = {
  /** Without an id the meal is matched by slot only (legacy callers). */
  id?: string;
  slot: string;
  status: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** True when an eaten meal already has its 'plan' log among `logs` (by meal id, else legacy slot). */
export function planLogMatcher(logs: readonly { source: string; slot: string | null; mealId?: string | null }[]) {
  const plan = logs.filter((l) => l.source === 'plan');
  const byMeal = new Set(plan.map((l) => l.mealId).filter((id): id is string => !!id));
  const legacySlots = new Set(plan.filter((l) => !l.mealId).map((l) => l.slot));
  const anySlot = new Set(plan.map((l) => l.slot));
  return (m: { id?: string; slot: string }) =>
    m.id ? byMeal.has(m.id) || legacySlots.has(m.slot) : anySlot.has(m.slot);
}

export function dayIntake(logs: readonly IntakeLog[], meals: readonly EatenMeal[] = []): DayTotals {
  const food = logs.filter((l) => !isWaterLog(l));
  const logged = planLogMatcher(food);
  const extra = meals
    .filter((m) => m.status === 'eaten' && !logged(m))
    .map((m) => ({ kcal: m.kcal, p: m.protein, c: m.carbs, f: m.fat }));
  return sumLogs([...food, ...extra]);
}

/** 0..1 progress with a safe zero target. */
export function progress(value: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.max(0, value / target);
}

/** Remaining amount (never negative) and whether the target is passed. */
export function remaining(value: number, target: number): { left: number; over: number } {
  const d = Math.round(target - value);
  return d >= 0 ? { left: d, over: 0 } : { left: 0, over: -d };
}
