import { memo } from 'react';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { SwapIcon } from '@/features/meals/components/icons';
import { useTheme } from '@/theme';
import { Badge, Card, IconButton, PressableScale, Skeleton, SkeletonGroup, Text, TickMark } from '@/ui';
import { enterAt } from '@/ui/listMotion';

import { mealMeta, type MealView } from '../logic/meals';

/**
 * One meal on the timeline. The row IS the checkbox (≥ 56dp, whole row is the target) with the
 * shared TickMark inside: ticking buzzes success (core action), unticking selection. Swap is a
 * sibling icon button so screen readers reach both.
 */
export const MealRow = memo(function MealRow({
  meal,
  next = false,
  onToggle,
  onSwap,
}: {
  meal: MealView;
  /** The next meal to eat today (gets a "Next" badge). */
  next?: boolean;
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
        feedback={eaten ? 'selection' : 'success'}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: eaten }}
        accessibilityLabel={`${meal.slotLabel}: ${meal.title}, ${mealMeta(meal.nutrients)}`}
        accessibilityHint={eaten ? 'Marks it as not eaten' : 'Logs it as eaten. Long-press to swap.'}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          minHeight: t.sizes.row,
          paddingVertical: t.spacing.xs,
          borderRadius: t.radius.button,
        }}
      >
        <TickMark checked={eaten} testID={`today-tick-${meal.slot}`} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
            <Text variant="caption" color="textSecondary" tabular numberOfLines={1} style={{ flexShrink: 1 }}>
              {when}
            </Text>
            {next && !eaten ? <Badge label="Next" tone="accent" testID="today-next-meal" /> : null}
          </View>
          <Text
            variant="headline"
            color={eaten ? 'textSecondary' : 'textPrimary'}
            numberOfLines={2}
            style={eaten ? { textDecorationLine: 'line-through' } : undefined}
          >
            {meal.title}
          </Text>
          <Text variant="callout" color="textSecondary" tabular numberOfLines={1}>
            {mealMeta(meal.nutrients)}
          </Text>
        </View>
      </PressableScale>
      {eaten ? null : (
        <IconButton
          icon={SwapIcon}
          accessibilityLabel={`Swap ${meal.title}`}
          onPress={() => onSwap(meal)}
          color="textSecondary"
          testID={`today-swap-${meal.slot}`}
        />
      )}
    </View>
  );
});

/** Meal rows while recipe names load. */
export function MealsSkeleton({ rows = 3 }: { rows?: number }) {
  const t = useTheme();
  return (
    <SkeletonGroup label="Loading meals" testID="meals-skeleton" style={{ gap: t.spacing.sm }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={t.sizes.row} />
      ))}
    </SkeletonGroup>
  );
}

/** Today's meal timeline: every planned meal with a 1-tap tick; the next one is flagged. */
export const MealsCard = memo(function MealsCard({
  meals,
  nextId,
  loading,
  onToggle,
  onSwap,
  index = 2,
}: {
  meals: MealView[];
  nextId?: string;
  loading: boolean;
  onToggle: (meal: MealView) => void;
  onSwap: (meal: MealView) => void;
  index?: number;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const eaten = meals.filter((m) => m.status === 'eaten').length;
  return (
    <Animated.View entering={enterAt(index, reduceMotion)}>
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
              <MealRow key={m.id} meal={m} next={m.id === nextId} onToggle={onToggle} onSwap={onSwap} />
            ))}
          </View>
        )}
      </Card>
    </Animated.View>
  );
});
