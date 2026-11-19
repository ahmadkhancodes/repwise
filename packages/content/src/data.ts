/** The bundled catalogues (static JSON imports, so bundlers such as wrangler inline them). */
import exercisesJson from '../exercises.json';
import foodsJson from '../foods.json';
import recipesJson from '../recipes.json';
import type { Exercise, Food, Recipe } from './schemas';

export const exercises = exercisesJson as Exercise[];
export const foods = foodsJson as Food[];
export const recipes = recipesJson as Recipe[];
