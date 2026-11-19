import { FULL_GYM, type Catalogues, type ProfileInput } from '../../src';
import { exercises } from './exercises';
import { recipes } from './recipes';

export const catalogues: Catalogues = { exercises, recipes };

/** Monday 2026-11-23, 08:00 UTC. */
export const NOW = Date.UTC(2026, 10, 23, 8, 0, 0);
export const WEEK = '2026-11-23';

export const gymMale: ProfileInput = {
  goal: 'muscle_gain',
  sex: 'male',
  birthYear: 1994,
  heightCm: 180,
  weightKg: 80,
  experience: 'intermediate',
  daysPerWeek: 4,
  sessionMin: 60,
  equipment: FULL_GYM,
  lifestyle: 'light',
  dietType: 'omnivore',
  mealsPerDay: 4,
  budget: 3,
  cookMin: 45,
};

export const cutFemale: ProfileInput = {
  goal: 'fat_loss',
  sex: 'female',
  birthYear: 1990,
  heightCm: 165,
  weightKg: 72,
  experience: 'beginner',
  daysPerWeek: 3,
  sessionMin: 45,
  equipment: FULL_GYM,
  lifestyle: 'sedentary',
  dietType: 'halal',
  allergies: ['nuts', 'shellfish'],
  cuisines: ['pakistani', 'indian', 'arab'],
  mealsPerDay: 3,
  budget: 2,
  cookMin: 30,
};

export const veganHome: ProfileInput = {
  goal: 'recomp',
  sex: 'female',
  birthYear: 1998,
  heightCm: 170,
  weightKg: 62,
  experience: 'beginner',
  daysPerWeek: 3,
  sessionMin: 40,
  equipment: ['bodyweight', 'band', 'dumbbell'],
  injuries: ['knee'],
  dietType: 'vegan',
  allergies: ['peanut'],
  mealsPerDay: 5,
  budget: 2,
  cookMin: 30,
};

export const pplAdvanced: ProfileInput = {
  goal: 'maintain',
  sex: 'male',
  birthYear: 1985,
  heightCm: 175,
  weightKg: 85,
  experience: 'advanced',
  daysPerWeek: 6,
  sessionMin: 75,
  equipment: FULL_GYM,
  lifestyle: 'moderate',
  dietType: 'pescatarian',
  allergies: ['dairy'],
  mealsPerDay: 4,
  budget: 3,
  cookMin: 60,
};

export const vegetarianGluten: ProfileInput = {
  goal: 'fat_loss',
  sex: 'male',
  birthYear: 1979,
  heightCm: 172,
  weightKg: 95,
  experience: 'beginner',
  daysPerWeek: 2,
  sessionMin: 30,
  equipment: FULL_GYM,
  injuries: ['shoulder', 'lower_back'],
  dietType: 'vegetarian',
  allergies: ['gluten', 'egg'],
  dislikes: ['spinach'],
  mealsPerDay: 6,
  budget: 1,
  cookMin: 20,
};

export const allProfiles: Record<string, ProfileInput> = { gymMale, cutFemale, veganHome, pplAdvanced, vegetarianGluten };
