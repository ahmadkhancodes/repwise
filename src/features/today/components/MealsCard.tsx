import { ArrowLeftRight, Check } from 'lucide-react-native';
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
import { Card, IconButton, PressableScale, Text } from '@/ui';

import { mealMeta, type MealView } from '../logic/meals';

import { MealsSkeleton } from './Skeleton';
import { enterAt, layoutSpring } from './motion';

/** Round tick that pops (spring 1 → 1.18 → 1) and fills with the accent when eaten. */
function TickMark({ checked }: { checked: boolean }) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion || !checked) return;
    scale.set(withSequence(withSpring(1.18, t.motion.spring), withSpring(1, t.motion.spring)));
  }, [checked, reduceMotion, scale, t.motion.spring]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const size = t.sizes.icon + t.spacing.xs;
  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: t.radius.pill,
          borderWidth: checked ? 0 : t.sizes.hairline * 2,
          borderColor: t.colors.border,
          backgroundColor: checked ? t.colors.accent : t.colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {checked ? <Check color={t.colors.onAccent} size={t.sizes.iconSmall} strokeWidth={t.sizes.iconStroke + 1} /> : null}
    </Animated.View>
  );
}

export function MealRow({
  meal,
  onToggle,
  onSwap,
}: {
  meal: MealView;
  onToggle: (meal: MealView) => void;
  onSwap: (meal: MealView) => void;
}) {
  const t = useTheme();
  const eaten = meal.status === 'eaten';
  const when = [meal.time, meal.slotLabel].filter(Boolean).join(' · ');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: t.sizes.row }}>
      <PressableScale
        testID={`today-meal-${meal.slot}`}
        onPress={() => onToggle(meal)}
        onLongPress={() => onSwap(meal)}
        feedback="light"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: eaten }}
        accessibilityLabel={`${meal.slotLabel}: ${meal.title}, ${mealMeta(meal.nutrients)}`}
        accessibilityHint={eaten ? 'Marks it as not eaten' : 'Logs it as eaten'}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          minHeight: t.sizes.touch,
          paddingVertical: t.spacing.xs,
          borderRadius: t.radius.button,
        }}
      >
        <TickMark checked={eaten} />
        <View style={{ flex: 1 }}>
          <Text variant="caption" color="textSecondary" tabular>
            {when}
          </Text>
          <Text
            variant="headline"
            color={eaten ? 'textSecondary' : 'textPrimary'}
            numberOfLines={2}
          >
            {meal.title}
          </Text>
          <Text variant="callout" color="textSecondary" tabular>
            {mealMeta(meal.nutrients)}
          </Text>
        </View>
      </PressableScale>
      {eaten ? null : (
        <IconButton
          icon={ArrowLeftRight}
          accessibilityLabel={`Swap ${meal.title}`}
          onPress={() => onSwap(meal)}
          color="textSecondary"
          testID={`today-swap-${meal.slot}`}
        />
      )}
    </View>
  );
}

export function MealsCard({
  meals,
  loading,
  onToggle,
  onSwap,
  index = 3,
}: {
  meals: MealView[];
  loading: boolean;
  onToggle: (meal: MealView) => void;
  onSwap: (meal: MealView) => void;
  index?: number;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const eaten = meals.filter((m) => m.status === 'eaten').length;
  return (
    <Animated.View entering={enterAt(index, reduceMotion)} layout={layoutSpring(reduceMotion)}>
      <Card testID="today-meals">
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: t.spacing.xs }}>
          <Text variant="headline" accessibilityRole="header" style={{ flex: 1 }}>
            Meals
          </Text>
          {meals.length > 0 ? (
            <Text variant="callout" color="textSecondary" tabular testID="meals-count">
              {eaten} of {meals.length} eaten
            </Text>
          ) : null}
        </View>
        {loading ? (
          <MealsSkeleton rows={Math.max(2, meals.length)} />
        ) : meals.length === 0 ? (
          <Text variant="callout" color="textSecondary" testID="meals-empty">
            No meals planned today. Log food from the Eat tab.
          </Text>
        ) : (
          <View style={{ gap: t.spacing.xxs }}>
            {meals.map((m) => (
              <MealRow key={m.id} meal={m} onToggle={onToggle} onSwap={onSwap} />
            ))}
          </View>
        )}
      </Card>
    </Animated.View>
  );
}
