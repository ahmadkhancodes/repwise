import { CircleCheck, Clock, Dumbbell, Footprints, Moon, Play } from 'lucide-react-native';
import { memo } from 'react';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Button, Card, Text } from '@/ui';
import { enterAt } from '@/ui/listMotion';

import type { WorkoutView } from '../logic/view';

/**
 * Today's session with the screen's one primary action: Start workout (accent, 56dp, sheet 11).
 * Compact on purpose: eyebrow, title, one meta line, the button — so it sits above the fold and
 * in the thumb zone on a 360×640 screen, right under the brief.
 */
export const WorkoutCard = memo(function WorkoutCard({
  workout,
  onStart,
  onOpen,
  index = 1,
}: {
  workout: WorkoutView;
  onStart: () => void;
  onOpen: () => void;
  index?: number;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const meta = [
    workout.minutes > 0 ? `${workout.minutes} min` : null,
    `${workout.exercises} ${workout.exercises === 1 ? 'exercise' : 'exercises'}`,
    ...workout.muscles.slice(0, 2),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Animated.View entering={enterAt(index, reduceMotion)}>
      <Card testID="today-workout">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
          {workout.done ? (
            <CircleCheck color={t.colors.accentText} size={t.sizes.iconSmall} strokeWidth={t.sizes.iconStrokeBold} />
          ) : (
            <Dumbbell color={t.colors.textSecondary} size={t.sizes.iconSmall} strokeWidth={t.sizes.iconStroke} />
          )}
          <Text variant="caption" color={workout.done ? 'accentText' : 'textSecondary'} style={{ textTransform: 'uppercase' }}>
            {workout.done ? 'Workout done' : workout.inProgress ? 'In progress' : 'Today’s workout'}
          </Text>
        </View>
        <Text variant="title2" numberOfLines={2} style={{ marginTop: t.spacing.xxs }} testID="workout-title">
          {workout.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs, marginTop: t.spacing.xxs }}>
          <Clock color={t.colors.textSecondary} size={t.sizes.iconSmall} strokeWidth={t.sizes.iconStroke} />
          <Text variant="callout" color="textSecondary" tabular numberOfLines={1} style={{ flex: 1 }} testID="workout-meta">
            {meta}
          </Text>
        </View>
        <View style={{ marginTop: t.spacing.md }}>
          {workout.done ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
              <Text variant="headline" color="accentText" style={{ flex: 1 }}>
                Done. Great work.
              </Text>
              <Button label="View" variant="tertiary" onPress={onOpen} testID="workout-view" />
            </View>
          ) : (
            <Button
              label={workout.inProgress ? 'Resume workout' : 'Start workout'}
              accent
              icon={Play}
              onPress={onStart}
              accessibilityHint={`Opens ${workout.title}`}
              testID="start-workout"
            />
          )}
        </View>
      </Card>
    </Animated.View>
  );
});

/** Rest day state (sheet 10 S11). */
export function RestDayCard({ index = 4 }: { index?: number }) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View entering={enterAt(index, reduceMotion)}>
      <Card testID="today-rest">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <View
            style={{
              width: t.sizes.touch,
              height: t.sizes.touch,
              borderRadius: t.radius.pill,
              backgroundColor: t.colors.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Moon color={t.colors.textPrimary} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="title2">Rest day</Text>
            <Text variant="callout" color="textSecondary">
              Recovery is part of the plan.
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs, marginTop: t.spacing.md }}>
          <Footprints color={t.colors.textSecondary} size={t.sizes.iconSmall} strokeWidth={t.sizes.iconStroke} />
          <Text variant="callout" color="textSecondary" style={{ flex: 1 }}>
            A walk or some light stretching keeps you moving.
          </Text>
        </View>
      </Card>
    </Animated.View>
  );
}
