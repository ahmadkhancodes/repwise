/**
 * Local `profile` row (sheet 14) → engine `ProfileInput`. Pure: no clock, no DB.
 * Returns null while the profile is incomplete (onboarding not finished), so callers never plan
 * from guessed body stats.
 */
import {
  ALLERGENS,
  CUISINES,
  DIET_TYPES,
  EQUIPMENT,
  EXPERIENCE,
  GOALS,
  INJURIES,
  LIFESTYLES,
  SEXES,
  type ProfileInput,
} from '../engine';

import type { profile } from '@/db/schema';

export type ProfileRow = typeof profile.$inferSelect;

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined;

const someOf = <T extends string>(list: readonly T[], v: unknown): T[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is T => (list as readonly string[]).includes(x)))]
    : [];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function budgetTier(v: string | null | undefined): 1 | 2 | 3 {
  return v === '1' ? 1 : v === '3' ? 3 : 2;
}

/** Spread `count` training days across the week, starting on `startWeekday` (0 = Monday). */
export function spreadWeekdays(count: number, startWeekday: number): number[] {
  const n = clamp(Math.round(count), 1, 7);
  const out = new Set<number>();
  for (let i = 0; i < n; i++) out.add((startWeekday + Math.round((i * 7) / n)) % 7);
  // Rounding can collide for 6–7 days: fill the gaps in order.
  for (let d = 0; out.size < n; d++) out.add((startWeekday + d) % 7);
  return [...out].sort((a, b) => a - b);
}

export function toEngineProfile(
  row: ProfileRow | undefined,
  opts: { trainingWeekdays?: readonly number[] | null } = {},
): ProfileInput | null {
  if (!row) return null;
  const goal = oneOf(GOALS, row.goal);
  const sex = oneOf(SEXES, row.sex);
  const experience = oneOf(EXPERIENCE, row.experience);
  if (!goal || !sex || !experience) return null;
  if (!row.birthYear || !row.heightCm || !row.weightKg || !row.days || !row.sessionMin) return null;

  const daysPerWeek = clamp(row.days, 2, 6);
  const weekdays = (opts.trainingWeekdays ?? [])
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .slice(0, daysPerWeek);
  // Content cuisine groups are engine values too (D26); `cuisineMatches` links fine and group values.
  const cuisines = someOf(CUISINES, row.cuisines);
  const targetKg =
    row.targetKg != null && row.targetKg >= 30 && row.targetKg <= 300 ? row.targetKg : undefined;

  return {
    goal,
    sex,
    birthYear: row.birthYear,
    heightCm: clamp(row.heightCm, 120, 230),
    weightKg: clamp(row.weightKg, 30, 300),
    ...(targetKg !== undefined ? { targetKg } : {}),
    experience,
    daysPerWeek,
    ...(weekdays.length === daysPerWeek ? { trainingWeekdays: [...new Set(weekdays)] } : {}),
    sessionMin: clamp(row.sessionMin, 20, 180),
    equipment: someOf(EQUIPMENT, row.equipment),
    injuries: someOf(INJURIES, row.injuries),
    lifestyle: oneOf(LIFESTYLES, row.activityLevel) ?? 'light',
    dietType: oneOf(DIET_TYPES, row.dietType) ?? 'omnivore',
    allergies: someOf(ALLERGENS, row.allergies),
    dislikes: (row.dislikes ?? []).filter((d) => typeof d === 'string' && d.trim().length > 0),
    cuisines,
    budget: budgetTier(row.budget),
    cookMin: clamp(row.cookMin ?? 30, 5, 240),
    mealsPerDay: clamp(row.mealsPerDay ?? 3, 2, 6),
    units: row.units === 'imperial' ? 'imperial' : 'metric',
  };
}
