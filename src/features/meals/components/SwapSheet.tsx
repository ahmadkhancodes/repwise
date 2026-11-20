import type { PlannedMeal } from '@repwise/engine';
import { Ban, CircleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useCatalog } from '@/services/catalog';
import { useTheme } from '@/theme';
import { Button, EmptyState, PressableScale, Sheet, SkeletonCard, SkeletonGroup, Text, showToast } from '@/ui';
import { enterAt } from '@/ui/listMotion';

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
  const t = useTheme();
  const reduce = useReducedMotion();
  const cat = useCatalog();
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
    <Sheet open={meal !== null} onClose={onClose} title={meal ? `Swap ${slotLabel(meal.slot).toLowerCase()}` : 'Swap'} testID="swap-sheet">
      {meal ? (
        <Text variant="callout" color="textSecondary">
          Instead of {meal.title} · {meal.kcal} kcal · {Math.round(meal.protein)} g protein
        </Text>
      ) : null}
      {!meal ? null : error ? (
        <EmptyState
          icon={CircleAlert}
          title="Couldn’t load swaps"
          body="Something went wrong on this phone. Try again."
          actionLabel="Try again"
          onAction={() => setNonce((n) => n + 1)}
          testID="swap-error"
        />
      ) : options === null ? (
        <SkeletonGroup label="Finding swaps" testID="swap-loading" style={{ gap: t.spacing.sm }}>
          <SkeletonCard media lines={2} />
          <SkeletonCard media lines={2} />
          <SkeletonCard media lines={2} />
        </SkeletonGroup>
      ) : options.length === 0 ? (
        <EmptyState
          title="No close matches"
          body="Nothing else fits this meal's calories and protein with your food settings right now."
          testID="swap-empty"
        />
      ) : (
        <View style={{ gap: t.spacing.sm }}>
          {options.map((o, i) => {
            const r = cat?.recipeById.get(o.recipeId);
            return (
              <Animated.View key={o.recipeId} entering={enterAt(i, reduce)}>
                <PressableScale
                  testID={`swap-option-${i}`}
                  onPress={() => pick(o)}
                  accessibilityRole="button"
                  accessibilityLabel={`Swap to ${r?.title ?? o.recipeId}, ${o.kcal} calories, ${Math.round(o.protein)} grams protein`}
                  style={{
                    backgroundColor: t.colors.surface,
                    borderRadius: t.radius.card,
                    padding: t.spacing.card,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.spacing.sm,
                  }}
                >
                  <RecipeArt
                    art={recipeArt(r ? { ...r, slot: meal.slot } : { slot: meal.slot })}
                    testID={`swap-art-${i}`}
                  />
                  <View style={{ flex: 1, minWidth: 0, gap: t.spacing.xxs }}>
                    <Text variant="headline" numberOfLines={2}>
                      {r?.title ?? o.recipeId}
                    </Text>
                    {r ? (
                      <Text variant="caption" color="textSecondary">
                        {cuisineLabel(r.cuisine)} · {totalMinutes(r)} min
                      </Text>
                    ) : null}
                    <MacroChips kcal={o.kcal} protein={o.protein} carbs={o.carbs} fat={o.fat} />
                  </View>
                </PressableScale>
              </Animated.View>
            );
          })}
        </View>
      )}
      {meal?.recipeId ? (
        <Button
          label={`Never show ${meal.title}`}
          variant="tertiary"
          icon={Ban}
          onPress={never}
          testID="swap-never"
        />
      ) : null}
    </Sheet>
  );
}
