import { Check, Repeat2 } from 'lucide-react-native';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { IconButton, PressableScale, Text } from '@/ui';

import type { MealView } from '../hooks/useEat';
import { formatServings } from '../logic/recipe';
import { slotLabel } from '../logic/slots';
import { MacroChips } from './MacroChips';
import { enterAt, layoutSpring } from './motion';

type Props = {
  meal: MealView;
  index: number;
  locked?: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onSwap: () => void;
};

/**
 * Sheet 11 MealTile: slot + time, dish, kcal and P/C/F, swap icon, and the 1-tap tick (core
 * action). Long-press opens the swap sheet (W4 "Swap anything").
 */
export function MealTile({ meal, index, locked, onOpen, onToggle, onSwap }: Props) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const eaten = meal.status === 'eaten';
  const skipped = meal.status === 'skipped';
  const pop = useSharedValue(1);
  useEffect(() => {
    if (eaten && !reduce) {
      pop.set(withSequence(withSpring(1.18, t.motion.spring), withSpring(1, t.motion.spring)));
    }
  }, [eaten, pop, reduce, t.motion.spring]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const meta = [slotLabel(meal.slot), meal.time, meal.portion !== 1 ? `${formatServings(meal.portion)} servings` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Animated.View entering={enterAt(index, reduce)} layout={layoutSpring(reduce)}>
      <PressableScale
        testID={`meal-${meal.slot}`}
        onPress={onOpen}
        onLongPress={locked ? undefined : onSwap}
        accessibilityRole="button"
        accessibilityLabel={`${slotLabel(meal.slot)}: ${meal.title}, ${meal.kcal} calories${eaten ? ', eaten' : skipped ? ', skipped' : ''}`}
        accessibilityHint="Opens the recipe. Long-press to swap."
        style={{
          backgroundColor: t.colors.surface,
          borderRadius: t.radius.card,
          padding: t.spacing.card,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          opacity: skipped ? 0.6 : 1,
        }}
      >
        <View style={{ flex: 1, gap: t.spacing.xxs }}>
          <Text variant="caption" color="textSecondary">
            {meta}
            {skipped ? ' · Skipped' : ''}
          </Text>
          <Text variant="headline" color={eaten ? 'textSecondary' : 'textPrimary'} numberOfLines={2}>
            {meal.title}
          </Text>
          <MacroChips kcal={meal.kcal} protein={meal.protein} carbs={meal.carbs} fat={meal.fat} />
        </View>
        {locked ? null : (
          <View style={{ alignItems: 'center' }}>
            <IconButton
              icon={Repeat2}
              accessibilityLabel={`Swap ${meal.title}`}
              onPress={onSwap}
              testID={`swap-${meal.slot}`}
              color="textSecondary"
            />
            <Animated.View style={popStyle}>
              <PressableScale
                testID={`tick-${meal.slot}`}
                onPress={onToggle}
                feedback="none"
                accessibilityRole="checkbox"
                accessibilityLabel={eaten ? `Undo ate ${meal.title}` : `Ate ${meal.title}`}
                accessibilityState={{ checked: eaten }}
                style={{
                  width: t.sizes.touch,
                  height: t.sizes.touch,
                  borderRadius: t.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: eaten ? t.colors.accent : t.colors.bg,
                  borderWidth: eaten ? 0 : t.sizes.hairline + 1,
                  borderColor: t.colors.border,
                }}
              >
                <Check
                  color={eaten ? t.colors.onAccent : t.colors.textTertiary}
                  size={t.sizes.icon}
                  strokeWidth={t.sizes.iconStroke}
                />
              </PressableScale>
            </Animated.View>
          </View>
        )}
      </PressableScale>
    </Animated.View>
  );
}
