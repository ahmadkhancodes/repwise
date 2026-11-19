/**
 * Day intake (S26 rings): food_logs are the record of what was eaten. A planned meal ticked from
 * elsewhere without a matching 'plan' log (same slot) still counts, so totals never miss a meal.
 * Water rows carry no energy and are left out. Pure.
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
};

export type EatenMeal = {
  slot: string;
  status: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export function dayIntake(logs: readonly IntakeLog[], meals: readonly EatenMeal[] = []): DayTotals {
  const food = logs.filter((l) => !isWaterLog(l));
  const loggedSlots = new Set(food.filter((l) => l.source === 'plan').map((l) => l.slot));
  const extra = meals
    .filter((m) => m.status === 'eaten' && !loggedSlots.has(m.slot))
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
