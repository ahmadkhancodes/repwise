import type { PlannedMeal } from '@repwise/engine';
import { useEffect, useState } from 'react';

import { useCatalogFor } from '@/services/catalog';
import { SwapChooser, showToast } from '@/ui';

import type { MealView } from '../hooks/useEat';
import { recipeArt } from '../logic/art';
import { cuisineLabel, totalMinutes } from '../logic/recipe';
import { slotLabel } from '../logic/slots';
import { applySwap, swapChoices } from '../service';
import { addMoreLike, addNeverShow } from '../signals';
import { MacroChips } from './MacroChips';
import { RecipeArt } from './RecipeArt';

type Props = { meal: MealView | null; onClose: () => void };

/**
 * S22 swap sheet: three alternatives from the engine (same kcal and protein ±10%, safe for the
 * user's allergens and diet, outside the no-repeat window). One tap swaps; "More like this" and
 * "Never show again" teach the planner.
 */
export function SwapSheet({ meal, onClose }: Props) {
  const cat = useCatalogFor('recipes');
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ key: string; options: PlannedMeal[] | null } | null>(null);
  const key = meal ? `${meal.id}|${meal.recipeId}|${nonce}` : '';

  useEffect(() => {
    if (!meal) return;
    // Next tick, so the skeleton shows while the engine looks for alternatives.
    const id = setTimeout(() => {
      let options: PlannedMeal[] | null;
      try {
        options = swapChoices(meal.id);
      } catch {
        options = null;
      }
      setResult({ key, options });
    }, 0);
    return () => clearTimeout(id);
  }, [meal, key]);
  const settled = result?.key === key ? result : null;
  const options = settled ? settled.options : null;
  const error = settled !== null && settled.options === null;

  const pick = (o: PlannedMeal) => {
    if (!meal) return;
    const saved = applySwap(meal.id, o);
    if (!saved) return;
    const title = cat?.recipeById.get(o.recipeId)?.title ?? 'new meal';
    onClose();
    showToast({
      message: `Swapped to ${title}`,
      tone: 'success',
      actionLabel: 'More like this',
      onAction: () => addMoreLike(o.recipeId),
      silent: true,
    });
  };

  const never = () => {
    if (!meal?.recipeId) return;
    addNeverShow(meal.recipeId);
    showToast({ message: `We won’t suggest ${meal.title} again` });
    setNonce((n) => n + 1);
  };

  return (
    <SwapChooser
      open={meal !== null}
      onClose={onClose}
      title={meal ? `Swap ${slotLabel(meal.slot).toLowerCase()}` : 'Swap'}
      intro={
        meal
          ? `Instead of ${meal.title} · ${meal.kcal} kcal · ${Math.round(meal.protein)} g protein`
          : undefined
      }
      state={error ? 'error' : options === null ? 'loading' : 'ready'}
      choices={(options ?? []).map((o) => {
        const r = cat?.recipeById.get(o.recipeId);
        return {
          key: o.recipeId,
          title: r?.title ?? o.recipeId,
          subtitle: r ? `${cuisineLabel(r.cuisine)} · ${totalMinutes(r)} min` : undefined,
          media: <RecipeArt art={recipeArt(r ? { ...r, slot: meal?.slot } : { slot: meal?.slot })} />,
          detail: <MacroChips kcal={o.kcal} protein={o.protein} carbs={o.carbs} fat={o.fat} />,
          accessibilityLabel: `Swap to ${r?.title ?? o.recipeId}, ${o.kcal} calories, ${Math.round(o.protein)} grams protein`,
        };
      })}
      onPick={(key) => {
        const o = options?.find((x) => x.recipeId === key);
        if (o) pick(o);
      }}
      empty={{
        title: 'No close matches',
        body: 'Nothing else fits this meal’s calories and protein with your food settings right now.',
      }}
      onRetry={() => setNonce((n) => n + 1)}
      never={meal?.recipeId ? { label: `Never show ${meal.title}`, onPress: never } : undefined}
    />
  );
}
