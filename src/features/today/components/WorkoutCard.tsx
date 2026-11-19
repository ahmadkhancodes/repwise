import { CircleCheck, Clock, Dumbbell, Footprints, Moon, Play } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Button, Card, Text } from '@/ui';

import type { WorkoutView } from '../logic/view';

import { enterAt } from './motion';

/** Today's session with the screen's one primary action: Start workout (accent, sheet 11). */
export function WorkoutCard({
  workout,
  onStart,
  onOpen,
  index = 2,
}: {
  workout: WorkoutView;
  onStart: () => void;
  onOpen: () => void;
  index?: number;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const icon = { color: t.colors.textSecondary, size: t.sizes.iconSmall, strokeWidth: t.sizes.iconStroke };
  return (
    <Animated.View entering={enterAt(index, reduceMotion)}>
      <Card testID="today-workout">
        <Text variant="caption" color="textSecondary">
          {workout.done ? 'WORKOUT DONE' : "TODAY'S WORKOUT"}
        </Text>
        <Text variant="title2" style={{ marginTop: t.spacing.xxs }} testID="workout-title">
          {workout.title}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.md, marginTop: t.spacing.xs }}>
          {workout.minutes > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs }}>
              <Clock {...icon} />
              <Text variant="callout" color="textSecondary" tabular>
                {workout.minutes} min
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs }}>
            <Dumbbell {...icon} />
            <Text variant="callout" color="textSecondary" tabular>
              {workout.exercises} {workout.exercises === 1 ? 'exercise' : 'exercises'}
            </Text>
          </View>
        </View>
        {workout.muscles.length > 0 ? (
          <Text variant="callout" color="textSecondary" style={{ marginTop: t.spacing.xxs }}>
            {workout.muscles.join(' · ')}
          </Text>
        ) : null}
        <View style={{ marginTop: t.spacing.md }}>
          {workout.done ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
              <CircleCheck color={t.colors.accentText} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
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
}

/** Rest day state (sheet 10 S11). */
export function RestDayCard({ index = 2 }: { index?: number }) {
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
