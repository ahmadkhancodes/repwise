import { memo, useCallback, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { MealRow, type MealRowModel } from '@/features/meals';
import { useTheme } from '@/theme';
import { Card, Skeleton, SkeletonGroup, Text } from '@/ui';
import { enterAt } from '@/ui/listMotion';

import type { MealView } from '../logic/meals';

/** Today's view of a meal mapped onto the shared meals MealRow (compact: no art). Pure. */
export function todayMealRow(meal: MealView): MealRowModel {
  return {
    id: meal.id,
    slot: meal.slot,
    title: meal.title,
    status: meal.status,
    meta: [meal.time, meal.slotLabel].filter(Boolean).join(' · '),
    kcal: meal.nutrients.kcal,
    protein: meal.nutrients.p,
    carbs: meal.nutrients.c,
    fat: meal.nutrients.f,
  };
}

/**
 * One meal on the timeline: the SAME row as Eat (UI audit N2): leading tick logs it, the body
 * opens the recipe, long-press or the swap icon swaps.
 */
export const TodayMealRow = memo(function TodayMealRow({
  meal,
  next = false,
  onOpen,
  onToggle,
  onSwap,
}: {
  meal: MealView;
  /** The next meal to eat today (gets a "Next" badge). */
  next?: boolean;
  onOpen: (meal: MealView) => void;
  onToggle: (meal: MealView) => void;
  onSwap: (meal: MealView) => void;
}) {
  const model = useMemo(() => todayMealRow(meal), [meal]);
  const open = useCallback(() => onOpen(meal), [onOpen, meal]);
  const toggle = useCallback(() => onToggle(meal), [onToggle, meal]);
  const swap = useCallback(() => onSwap(meal), [onSwap, meal]);
  return (
    <MealRow
      meal={model}
      compact
      next={next}
      idPrefix="today-"
      onOpen={open}
      onToggle={toggle}
      onSwap={swap}
    />
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
  onOpen,
  onToggle,
  onSwap,
  index = 2,
}: {
  meals: MealView[];
  nextId?: string;
  loading: boolean;
  onOpen: (meal: MealView) => void;
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
              <TodayMealRow
                key={m.id}
                meal={m}
                next={m.id === nextId}
                onOpen={onOpen}
                onToggle={onToggle}
                onSwap={onSwap}
              />
            ))}
          </View>
        )}
      </Card>
    </Animated.View>
  );
});
