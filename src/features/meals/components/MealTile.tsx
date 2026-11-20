import { memo, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Badge, IconButton, PressableScale, Text, Tick } from '@/ui';
import { enterAt } from '@/ui/listMotion';

import type { MealView } from '../hooks/useEat';
import { recipeArt } from '../logic/art';
import { formatServings } from '../logic/recipe';
import { slotLabel } from '../logic/slots';
import { SwapIcon } from './icons';
import { MacroChips } from './MacroChips';
import { RecipeArt } from './RecipeArt';

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
  return recipeArt(meal.recipe ? { ...meal.recipe, slot: meal.slot } : { title: meal.title, slot: meal.slot });
}

/**
 * Sheet 11 MealTile: recipe art, slot + time, dish, kcal and P/C/F chips, swap icon and the 1-tap
 * tick (core action, shared Tick with its success haptic). The body opens the recipe; the tick and
 * swap are SIBLINGS of the body, so VoiceOver / TalkBack reach each one. Long-press swaps (W4).
 */
export const MealTile = memo(function MealTile({ meal, index, locked, onOpen, onToggle, onSwap }: Props) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const eaten = meal.status === 'eaten';
  const skipped = meal.status === 'skipped';
  const art = useMemo(() => mealArt(meal), [meal]);
  const label = slotLabel(meal.slot);

  const meta = [label, meal.time, meal.portion !== 1 ? `${formatServings(meal.portion)} servings` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Animated.View entering={enterAt(index, reduce)}>
      <View
        testID={`meal-tile-${meal.slot}`}
        style={{
          backgroundColor: t.colors.surface,
          borderRadius: t.radius.card,
          flexDirection: 'row',
          alignItems: 'center',
          paddingRight: t.spacing.xs,
        }}
      >
        <PressableScale
          testID={`meal-${meal.slot}`}
          onPress={() => onOpen(meal)}
          onLongPress={locked ? undefined : () => onSwap(meal)}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${meal.title}, ${meal.kcal} calories${eaten ? ', eaten' : skipped ? ', skipped' : ''}`}
          accessibilityHint={locked ? 'Opens the recipe' : 'Opens the recipe. Long-press to swap.'}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            padding: t.spacing.card,
            paddingRight: t.spacing.xs,
            borderRadius: t.radius.card,
          }}
        >
          <RecipeArt art={art} testID={`meal-art-${meal.slot}`} style={eaten || skipped ? { opacity: 0.55 } : undefined} />
          <View style={{ flex: 1, minWidth: 0, gap: t.spacing.xxs }}>
            <Text variant="caption" color="textSecondary" tabular numberOfLines={1}>
              {meta}
            </Text>
            <Text
              variant="headline"
              color={eaten || skipped ? 'textSecondary' : 'textPrimary'}
              numberOfLines={2}
              style={skipped ? { textDecorationLine: 'line-through' } : undefined}
            >
              {meal.title}
            </Text>
            {skipped ? (
              <Badge label="Skipped" testID={`meal-skipped-${meal.slot}`} />
            ) : (
              <MacroChips kcal={meal.kcal} protein={meal.protein} carbs={meal.carbs} fat={meal.fat} />
            )}
          </View>
        </PressableScale>
        {locked ? null : (
          <View style={{ alignItems: 'center' }}>
            <IconButton
              icon={SwapIcon}
              accessibilityLabel={`Swap ${meal.title}`}
              onPress={() => onSwap(meal)}
              testID={`swap-${meal.slot}`}
              color="textSecondary"
            />
            <Tick
              checked={eaten}
              onChange={() => onToggle(meal)}
              accessibilityLabel={`${meal.title} eaten`}
              accessibilityHint={eaten ? 'Marks it as not eaten' : 'Logs it as eaten'}
              testID={`tick-${meal.slot}`}
            />
          </View>
        )}
      </View>
    </Animated.View>
  );
});
