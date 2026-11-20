/**
 * Quiz answers (S03–S05) and how they become the `profile` row. Pure.
 * Stored values are always metric; imperial is display-only.
 */
import {
  EQUIPMENT_PRESETS,
  type Allergen,
  type Cuisine,
  type DietType,
  type Equipment,
  type Experience,
  type Goal,
  type Injury,
  type Lifestyle,
  type Sex,
} from '@/features/planner/engine';
import type { profile } from '@/db/schema';

import { defaultMealTimes } from './mealTimes';

export type Units = 'metric' | 'imperial';
export type Location = 'gym' | 'home' | 'bodyweight';

export type Answers = {
  goal: Goal | null;
  sex: Sex | null;
  birthYear: number | null;
  units: Units;
  heightCm: number | null;
  weightKg: number | null;
  /** null = no target (allowed) */
  targetKg: number | null;
  experience: Experience | null;
  daysPerWeek: number | null;
  /** 0 = Monday … 6 = Sunday */
  trainingWeekdays: number[];
  sessionMin: number | null;
  location: Location | null;
  equipment: Equipment[];
  injuries: Injury[];
  lifestyle: Lifestyle | null;
  dietType: DietType | null;
  allergies: Allergen[];
  dislikes: string[];
  cuisines: Cuisine[];
  budget: 1 | 2 | 3 | null;
  cookMin: number | null;
  mealsPerDay: number | null;
  mealTimes: string[];
};

// Lives in a light module so the onboarding store (evaluated at launch) skips the engine (perf r2 N1).
export { EMPTY_ANSWERS } from './emptyAnswers';

/** Countries that weigh in pounds and measure in feet (plus the UK mostly uses stone/lb). */
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);

/** "en-US" → imperial; everything else metric. Pure. */
export function defaultUnits(locale: string | null | undefined): Units {
  const region = (locale ?? '').split(/[-_]/)[1]?.toUpperCase();
  return region && IMPERIAL_REGIONS.has(region) ? 'imperial' : 'metric';
}

/** Equipment preset for a training location (engine onboarding kits, D27). */
export function presetFor(location: Location): Equipment[] {
  const kit =
    location === 'gym'
      ? EQUIPMENT_PRESETS.full_gym
      : location === 'home'
        ? EQUIPMENT_PRESETS.home_dumbbells
        : EQUIPMENT_PRESETS.bodyweight;
  return [...kit];
}

/** Body-stat defaults shown on first visit (typical adult values; the user adjusts them). */
export function bodyDefaults(sex: Sex | null): { heightCm: number; weightKg: number } {
  return sex === 'female' ? { heightCm: 165, weightKg: 65 } : { heightCm: 178, weightKg: 80 };
}

/** Starting point for the target wheel: −5 kg for fat loss, +4 kg for muscle gain. */
export function defaultTarget(goal: Goal | null, weightKg: number | null): number | null {
  if (weightKg == null) return null;
  if (goal === 'muscle_gain') return weightKg + 4;
  if (goal === 'fat_loss') return Math.max(35, weightKg - 5);
  return weightKg;
}

export type ProfilePatch = Partial<typeof profile.$inferInsert>;

/** Answers → profile row patch (sheet 14 columns). Unset answers fall back to sensible defaults. */
export function answersToProfile(
  a: Answers,
  ctx: { timezone?: string | null; locale?: string | null } = {},
): ProfilePatch {
  const meals = a.mealsPerDay ?? 3;
  return {
    goal: a.goal,
    sex: a.sex,
    birthYear: a.birthYear,
    heightCm: a.heightCm,
    weightKg: a.weightKg,
    targetKg: a.targetKg,
    experience: a.experience,
    days: a.daysPerWeek,
    sessionMin: a.sessionMin,
    equipment: a.equipment.length ? [...a.equipment] : presetFor(a.location ?? 'bodyweight'),
    injuries: [...a.injuries],
    activityLevel: a.lifestyle ?? 'light',
    dietType: a.dietType ?? 'omnivore',
    allergies: [...a.allergies],
    dislikes: [...a.dislikes],
    cuisines: [...a.cuisines],
    budget: String(a.budget ?? 2),
    cookMin: a.cookMin ?? 30,
    mealsPerDay: meals,
    mealTimes: a.mealTimes.length === meals ? [...a.mealTimes] : defaultMealTimes(meals),
    units: a.units,
    ...(ctx.timezone ? { timezone: ctx.timezone } : {}),
    ...(ctx.locale ? { locale: ctx.locale } : {}),
  };
}
