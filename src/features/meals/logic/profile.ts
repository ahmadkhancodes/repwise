/**
 * SQLite profile row → engine ProfileInput. Pure. Returns null until the body fields the targets
 * need exist (onboarding not finished), so screens can show "finish setup" instead of guessing.
 */
import {
  ALLERGENS,
  DIET_TYPES,
  EXPERIENCE,
  GOALS,
  LIFESTYLES,
  type DietType,
  type ProfileInput,
} from '@repwise/engine';

import { CONTENT_TO_ENGINE_ALLERGEN, normaliseAllergies, type ContentAllergen } from './allergens';
import { toEngineCuisine } from './engineCatalog';

/** Only the profile columns the meal planner reads (structural, so tests can pass plain objects). */
export type ProfileLike = {
  goal?: string | null;
  sex?: string | null;
  birthYear?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  targetKg?: number | null;
  experience?: string | null;
  days?: number | null;
  sessionMin?: number | null;
  dietType?: string | null;
  allergies?: string[] | null;
  dislikes?: string[] | null;
  cuisines?: string[] | null;
  budget?: string | null;
  cookMin?: number | null;
  mealsPerDay?: number | null;
  mealTimes?: string[] | null;
  units?: string | null;
  activityLevel?: string | null;
};

export type MealProfile = {
  engine: ProfileInput;
  /** User allergies in EU-14 content names (used for the app-side safety filter). */
  allergies: ContentAllergen[];
  dietType: DietType;
  mealTimes: string[];
  units: 'metric' | 'imperial';
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const oneOf = <T extends string>(list: readonly T[], v: string | null | undefined, d: T): T =>
  v && (list as readonly string[]).includes(v) ? (v as T) : d;

/** Budget text from onboarding ('1'…'3', 'low'/'mid'/'high', 'budget'/'premium') → tier 1–3. */
export function budgetTier(b: string | null | undefined): 1 | 2 | 3 {
  const v = (b ?? '').toLowerCase();
  if (v === '1' || v === 'low' || v === 'budget' || v === 'tight') return 1;
  if (v === '3' || v === 'high' || v === 'premium' || v === 'flexible') return 3;
  return 2;
}

/** Activity text ('very_active' included) → engine lifestyle. */
export function lifestyleOf(a: string | null | undefined): (typeof LIFESTYLES)[number] {
  if (a === 'very_active') return 'active';
  return oneOf(LIFESTYLES, a, 'light');
}

export function toMealProfile(p: ProfileLike | null | undefined): MealProfile | null {
  if (!p || !p.birthYear || !p.heightCm || !p.weightKg || !p.sex) return null;
  const sex = p.sex === 'male' || p.sex === 'female' ? p.sex : null;
  if (!sex) return null;
  const dietType = oneOf(DIET_TYPES, p.dietType, 'omnivore');
  const allergies = normaliseAllergies(p.allergies);
  // The engine gets the allergens it knows (the app also filters recipes on the EU-14 names first).
  const engineAllergies = [
    ...new Set(allergies.map((a) => CONTENT_TO_ENGINE_ALLERGEN[a])),
  ].filter((a) => (ALLERGENS as readonly string[]).includes(a));
  const engine: ProfileInput = {
    goal: oneOf(GOALS, p.goal, 'maintain'),
    sex,
    birthYear: clamp(Math.round(p.birthYear), 1900, 2100),
    heightCm: clamp(p.heightCm, 120, 230),
    weightKg: clamp(p.weightKg, 30, 300),
    ...(p.targetKg ? { targetKg: clamp(p.targetKg, 30, 300) } : {}),
    experience: oneOf(EXPERIENCE, p.experience, 'beginner'),
    daysPerWeek: clamp(Math.round(p.days ?? 3), 2, 6),
    sessionMin: clamp(Math.round(p.sessionMin ?? 45), 20, 180),
    lifestyle: lifestyleOf(p.activityLevel),
    dietType,
    allergies: engineAllergies as ProfileInput['allergies'],
    dislikes: (p.dislikes ?? []).filter(Boolean),
    cuisines: [...new Set((p.cuisines ?? []).map(toEngineCuisine))],
    budget: budgetTier(p.budget),
    cookMin: clamp(Math.round(p.cookMin ?? 30), 5, 240),
    mealsPerDay: clamp(Math.round(p.mealsPerDay ?? 3), 2, 6),
    units: p.units === 'imperial' ? 'imperial' : 'metric',
  };
  return {
    engine,
    allergies,
    dietType,
    mealTimes: p.mealTimes ?? [],
    units: engine.units ?? 'metric',
  };
}
