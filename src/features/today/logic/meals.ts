import type { MealStatus } from '@/db/schema';

import { clockMinutes } from './day';
import { humanize } from './workout';

export type Nutrients = { kcal: number; p: number; c: number; f: number };
export type PerServing = { kcal: number; protein: number; carbs: number; fat: number };

export type MealView = {
  id: string;
  slot: string;
  slotLabel: string;
  /** "13:00" from the user's meal times, when known. */
  time: string | null;
  recipeId: string | null;
  title: string;
  status: MealStatus;
  nutrients: Nutrients;
};

export const ZERO: Nutrients = { kcal: 0, p: 0, c: 0, f: 0 };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** One portion of a recipe: kcal rounded to 1, grams to 0.1. */
export function portionNutrients(per: PerServing | undefined, portion: number): Nutrients {
  if (!per) return ZERO;
  const k = Number.isFinite(portion) && portion > 0 ? portion : 1;
  return {
    kcal: Math.round(per.kcal * k),
    p: r1(per.protein * k),
    c: r1(per.carbs * k),
    f: r1(per.fat * k),
  };
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return { kcal: a.kcal + b.kcal, p: r1(a.p + b.p), c: r1(a.c + b.c), f: r1(a.f + b.f) };
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  return list.reduce(addNutrients, ZERO);
}

export function slotLabel(slot: string): string {
  return humanize(slot);
}

/**
 * Pair meals (already in slot order) with the user's meal times ("HH:MM", in order). Times are
 * assigned only when every meal gets one, so a 3-time list never labels a 4-meal day wrongly.
 */
export function assignTimes<T extends { slot: string }>(
  meals: T[],
  mealTimes: string[] | null | undefined,
): (string | null)[] {
  const times = (mealTimes ?? []).filter((t) => clockMinutes(t) != null);
  if (times.length < meals.length) return meals.map(() => null);
  return meals.map((_, i) => times[i] ?? null);
}

/** The next meal to eat: the first planned one whose time is at most 60 min ago, else the first planned. */
export function nextMeal<T extends { status: MealStatus; time: string | null }>(
  meals: T[],
  nowMinutes: number,
): T | undefined {
  const planned = meals.filter((m) => m.status === 'planned' || m.status === 'swapped');
  const upcoming = planned.find((m) => {
    const at = clockMinutes(m.time);
    return at == null || at >= nowMinutes - 60;
  });
  return upcoming ?? planned[0];
}

export type DayTargets = { kcal: number; p: number; c: number; f: number };

/** Targets from the day's meal plan; falls back to the planned meals' totals. */
export function dayTargets(
  plan: { kcalTarget: number | null; macros: { protein: number; carbs: number; fat: number } | null } | undefined,
  planned: Nutrients,
): DayTargets | null {
  const kcal = plan?.kcalTarget ?? 0;
  const m = plan?.macros;
  if (kcal > 0 && m) return { kcal, p: m.protein, c: m.carbs, f: m.fat };
  if (kcal > 0) return { kcal, p: planned.p, c: planned.c, f: planned.f };
  if (planned.kcal > 0) return planned;
  return null;
}

/** 0..1 progress of eaten vs target (0 when there is no target). */
export function ratio(eaten: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.max(0, Math.min(1, eaten / target));
}

export function remaining(eaten: number, target: number): number {
  return Math.max(0, Math.round(target - eaten));
}

export function countEaten(meals: { status: MealStatus }[]): number {
  return meals.filter((m) => m.status === 'eaten').length;
}

/** "640 kcal · 42 g protein". */
export function mealMeta(n: Nutrients): string {
  return `${n.kcal.toLocaleString('en-US')} kcal · ${Math.round(n.p)} g protein`;
}
