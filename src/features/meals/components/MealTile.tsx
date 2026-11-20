import { memo, useCallback, useMemo } from 'react';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { enterAt } from '@/ui/listMotion';

import type { MealView } from '../hooks/useEat';
import { recipeArt } from '../logic/art';
import { formatServings } from '../logic/recipe';
import { slotLabel } from '../logic/slots';
import { MealRow, type MealRowModel } from './MealRow';

type Props = {
  meal: MealView;
  index: number;
  locked?: boolean;
  onOpen: (meal: MealView) => void;
  onToggle: (meal: MealView) => void;
  onSwap: (meal: MealView) => void;
};

/** Art for a meal row: the recipe's category, in the slot it is eaten in. */
export function mealArt(meal: Pick<MealView, 'recipe' | 'title' | 'slot'>) {
  return recipeArt(
    meal.recipe ? { ...meal.recipe, slot: meal.slot } : { title: meal.title, slot: meal.slot },
  );
}

/** "Lunch · 13:00 · 1.5 servings" — the caption above the dish on Eat. Pure. */
export function eatMealMeta(meal: Pick<MealView, 'slot' | 'time' | 'portion'>): string {
  return [
    slotLabel(meal.slot),
    meal.time,
    meal.portion !== 1 ? `${formatServings(meal.portion)} servings` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Eat's view of a meal mapped onto the shared {@link MealRow}. Pure. */
export function eatMealRow(meal: MealView): MealRowModel {
  return {
    id: meal.id,
    slot: meal.slot,
    title: meal.title,
    status: meal.status,
    meta: eatMealMeta(meal),
    kcal: meal.kcal,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    art: mealArt(meal),
  };
}

/** Eat's meal list item: the shared MealRow (with art) plus the list entrance. */
export const MealTile = memo(function MealTile({
  meal,
  index,
  locked,
  onOpen,
  onToggle,
  onSwap,
}: Props) {
  const reduce = useReducedMotion();
  const model = useMemo(() => eatMealRow(meal), [meal]);
  const open = useCallback(() => onOpen(meal), [onOpen, meal]);
  const toggle = useCallback(() => onToggle(meal), [onToggle, meal]);
  const swap = useCallback(() => onSwap(meal), [onSwap, meal]);
  return (
    <Animated.View entering={enterAt(index, reduce)}>
      <MealRow meal={model} locked={locked} onOpen={open} onToggle={toggle} onSwap={swap} />
    </Animated.View>
  );
});
