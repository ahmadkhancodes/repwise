import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { ListRow, Sheet, Text } from '@/ui';

import type { MealView } from '../logic/meals';
import type { RecipeLookup } from '../logic/view';
import { portionNutrients, mealMeta } from '../logic/meals';
import { getPlanner, type SwapOption } from '../plannerBridge';

import { SkeletonBlock } from './Skeleton';

type Load =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'error' }
  | { kind: 'ready'; options: SwapOption[] };

/** W4 "swap anything": three smart alternatives from the planner (engine swapMeal). */
export function SwapSheet({
  meal,
  recipe,
  onClose,
  onPick,
}: {
  meal: MealView | null;
  recipe: RecipeLookup;
  onClose: () => void;
  onPick: (meal: MealView, option: SwapOption) => void;
}) {
  const t = useTheme();
  const [fetched, setFetched] = useState<{ mealId: string; load: Load } | null>(null);
  const swap = getPlanner().swapOptions;

  useEffect(() => {
    if (!meal || !swap) return;
    let live = true;
    swap(meal.id)
      .then((options) => {
        if (live) setFetched({ mealId: meal.id, load: { kind: 'ready', options: options.slice(0, 3) } });
      })
      .catch(() => {
        if (live) setFetched({ mealId: meal.id, load: { kind: 'error' } });
      });
    return () => {
      live = false;
    };
  }, [meal, swap]);

  const load: Load = !swap
    ? { kind: 'unavailable' }
    : meal && fetched?.mealId === meal.id
      ? fetched.load
      : { kind: 'loading' };

  return (
    <Sheet open={meal !== null} onClose={onClose} title={meal ? `Swap ${meal.slotLabel.toLowerCase()}` : 'Swap'} testID="swap-sheet">
      {meal ? (
        <Text variant="callout" color="textSecondary">
          Instead of {meal.title}. Same slot, close in calories and protein.
        </Text>
      ) : null}
      {!meal ? null : load.kind === 'loading' ? (
        <View testID="swap-loading" style={{ gap: t.spacing.sm }}>
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} height={t.sizes.row} />
          ))}
        </View>
      ) : load.kind === 'unavailable' ? (
        <Text variant="body" testID="swap-unavailable">
          Smart swaps arrive with your next plan update. You can still log any food from the Eat tab.
        </Text>
      ) : load.kind === 'error' ? (
        <Text variant="body" testID="swap-error">
          Couldn’t find alternatives right now. Your planned meal is unchanged.
        </Text>
      ) : load.options.length === 0 ? (
        <Text variant="body" testID="swap-empty">
          No alternatives fit your diet and targets for this meal yet.
        </Text>
      ) : (
        <View>
          {load.options.map((o, i) => {
            const info = recipe(o.recipeId);
            const n = portionNutrients(info?.perServing, o.portion);
            return (
              <ListRow
                key={o.recipeId}
                title={info?.title ?? o.recipeId}
                subtitle={mealMeta(n)}
                onPress={() => meal && onPick(meal, o)}
                divider={i < load.options.length - 1}
                testID={`swap-option-${i}`}
              />
            );
          })}
        </View>
      )}
    </Sheet>
  );
}
