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

/**
 * Cook mode's screen options, declared once in the root Stack (app/_layout.tsx) so the screen is
 * pushed with them from the first frame. A full-screen card that rises from the bottom, with no
 * back swipe (a wet thumb must not leave the recipe). Deliberately NOT a native modal: on iOS a
 * presentation switched from inside the screen (the old `<Stack.Screen presentation=
 * "fullScreenModal">`) left "Next step" dead on device (Maestro meals/02), and a native modal
 * covers the root sheet + toast hosts (the ingredients sheet would open behind it).
 */
export const COOK_SCREEN_OPTIONS = {
  animation: 'slide_from_bottom',
  gestureEnabled: false,
} as const;
