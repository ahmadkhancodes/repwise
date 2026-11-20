import { router } from 'expo-router';

/**
 * Tapping a meal's body, on Today AND Eat (UI audit N2: one behaviour per job): open its recipe
 * at the planned portion, linked to the meal so "Ate it" in cook mode ticks it. A meal with no
 * recipe (logged food) has nothing to open.
 */
export function openMeal(meal: { id: string; recipeId: string | null; portion: number }): boolean {
  if (!meal.recipeId) return false;
  router.push({
    pathname: '/recipe/[id]',
    params: { id: meal.recipeId, portion: String(meal.portion), mealId: meal.id },
  });
  return true;
}
