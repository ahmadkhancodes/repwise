/**
 * @repwise/content — validated content catalogues for the planner, library and meals.
 * The JSON files are the source of truth; recipe nutrition is computed by scripts/build.ts.
 */
import exercisesJson from '../exercises.json';
import foodsJson from '../foods.json';
import recipesJson from '../recipes.json';
import type { Exercise, Food, Recipe } from './schemas';

export * from './schemas';
export * from './compute';

export const exercises = exercisesJson as Exercise[];
export const foods = foodsJson as Food[];
export const recipes = recipesJson as Recipe[];
