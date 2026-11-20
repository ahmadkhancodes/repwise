import { memo } from 'react';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Card, MacroRings, Text } from '@/ui';
import { enterAt } from '@/ui/listMotion';

import type { DayTargets, Nutrients } from '../logic/meals';

/**
 * Calm, glanceable day summary: the shared MacroRings (one hero number, kcal left, fitted to its
 * ring at any font scale) plus a single callout line for eaten / target. Tapping opens Eat.
 */
export const RingsCard = memo(function RingsCard({
  eaten,
  targets,
  onOpen,
  index = 3,
}: {
  eaten: Nutrients;
  targets: DayTargets;
  onOpen?: () => void;
  index?: number;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const fmt = (n: number) => Math.round(n).toLocaleString();
  return (
    <Animated.View entering={enterAt(index, reduceMotion)}>
      <Card
        testID="today-rings"
        onPress={onOpen}
        accessibilityLabel={onOpen ? 'Today’s calories and macros. Opens Eat' : undefined}
      >
        <MacroRings
          size="compact"
          eaten={{ kcal: eaten.kcal, protein: eaten.p, carbs: eaten.c, fat: eaten.f }}
          target={{ kcal: targets.kcal, protein: targets.p, carbs: targets.c, fat: targets.f }}
          testID="today-macros"
        />
        <Text variant="callout" color="textSecondary" tabular style={{ marginTop: t.spacing.sm }} testID="kcal-eaten">
          {fmt(eaten.kcal)} of {fmt(targets.kcal)} kcal eaten
        </Text>
      </Card>
    </Animated.View>
  );
});
