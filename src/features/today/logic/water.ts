/**
 * Water on Today. Storage, names and the goal belong to the nutrition domain
 * (`@/features/nutrition/logic/water`, `getWaterGoal`); this only maps a total to the glasses row.
 */
import { DEFAULT_WATER_GOAL_ML, GLASS_ML, glassCount } from '@/features/nutrition/logic/water';

/** Glasses for the dots row: filled = whole glasses drunk (capped at the goal's glass count). */
export function waterGlasses(totalMl: number, goalMl: number = DEFAULT_WATER_GOAL_ML) {
  const goal = glassCount(goalMl);
  const filled = Math.min(goal, Math.floor(Math.max(0, totalMl) / GLASS_ML));
  return { filled, goal, goalMl };
}
