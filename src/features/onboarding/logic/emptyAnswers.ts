/**
 * The blank quiz. Its own module (type-only imports) because the onboarding store is evaluated on
 * the launch path, and `answers.ts` value-imports the planner engine (perf audit r2 N1).
 */
import type { Answers } from './answers';

export const EMPTY_ANSWERS: Answers = {
  goal: null,
  sex: null,
  birthYear: null,
  units: 'metric',
  heightCm: null,
  weightKg: null,
  targetKg: null,
  experience: null,
  daysPerWeek: null,
  trainingWeekdays: [],
  sessionMin: null,
  location: null,
  equipment: [],
  injuries: [],
  lifestyle: null,
  dietType: null,
  allergies: [],
  dislikes: [],
  cuisines: [],
  budget: null,
  cookMin: null,
  mealsPerDay: null,
  mealTimes: [],
};
