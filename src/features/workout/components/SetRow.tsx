import { Trophy } from 'lucide-react-native';
import { memo, useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { PressableScale, Text, Tick } from '@/ui';

import { metresToDisplay } from '../logic/cardio';
import type { WeightUnit } from '../logic/engine';
import { prefillPatch } from '../logic/player';
import { spokenSetName } from '../logic/sets';
import { formatWeight, trimNumber } from '../logic/units';
import { useOptimisticSet } from '../optimistic';
import type { SetPatch, WorkoutSet } from '../repo';

export type SetField = 'weight' | 'reps' | 'minutes' | 'distance';

export type SetRowProps = {
  set: WorkoutSet;
  label: string;
  previous?: WorkoutSet;
  unit: WeightUnit;
  cardio?: boolean;
  isPR?: boolean;
  /** The next set to do: highlighted so the eye lands on it from standing height (B3). */
  active?: boolean;
  /** Tick (done = true) or un-tick; `patch` = values taken over with the tick. */
  onToggle: (set: WorkoutSet, done: boolean, patch: SetPatch) => void;
  /** Open the gym-size editor for this set (tap a value). */
  onEdit: (set: WorkoutSet, field: SetField) => void;
  onOpenSet: (set: WorkoutSet) => void;
  testID?: string;
};

function Cell({
  value,
  ghost,
  unit,
  done,
  onPress,
  accessibilityLabel,
  testID,
}: {
  value: string;
  ghost: string;
  unit: string;
  done: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
}) {
  const t = useTheme();
  const shown = value || ghost || '–';
  return (
    <PressableScale
      feedback="none"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}, ${value ? `${value} ${unit}` : ghost ? `last time ${ghost}` : 'empty'}`}
      accessibilityHint="Opens the editor"
      testID={testID}
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: t.sizes.hitGym,
        borderRadius: t.radius.input,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: t.spacing.xxs,
        paddingHorizontal: t.spacing.xxs,
        backgroundColor: done ? 'transparent' : t.colors.bg,
        borderWidth: done ? 0 : t.sizes.hairline,
        borderColor: t.colors.border,
      }}
    >
      <Text
        variant="title2"
        tabular
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        color={value ? 'textPrimary' : 'textSecondary'}
        style={{ flexShrink: 1 }}
      >
        {shown}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {unit}
      </Text>
    </PressableScale>
  );
}

/**
 * SetRow (sheet 11, gym-grade): set label · weight · reps · tick, 64dp tall. Values are big
 * buttons that open the stepper editor (no keyboard mid-set); the tick is the shared gym Tick
 * (56dp, 64dp effective) and paints green in the same frame (optimistic, A3). An empty row takes
 * last time's values when ticked. Done = an accent sweep across the row.
 */
function SetRowImpl({
  set,
  label,
  previous,
  unit,
  cardio = false,
  isPR = false,
  active = false,
  onToggle,
  onEdit,
  onOpenSet,
  testID,
}: SetRowProps) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const pending = useOptimisticSet(set.id);
  const done = pending?.done ?? set.doneAt != null;
  const v = { ...set, ...(pending?.patch ?? {}) };
  const spoken = spokenSetName(set.type, label);
  const units = unit === 'lb' ? 'imperial' : 'metric';

  // Set-complete micro-interaction: an accent sweep left → right behind the row.
  const sweep = useSharedValue(done ? 1 : 0);
  useEffect(() => {
    const to = done ? 1 : 0;
    sweep.set(reduce ? to : withTiming(to, { duration: t.motion.duration.slow }));
  }, [done, reduce, sweep, t.motion.duration.slow]);
  const sweepStyle = useAnimatedStyle(() => ({ width: `${sweep.value * 100}%` }));

  const toggle = (next: boolean) => {
    if (!next) return onToggle(set, false, {});
    onToggle(set, true, prefillPatch(set, previous, cardio));
  };

  const prevWeight = formatWeight(previous?.weightKg, unit);
  const cells = cardio
    ? [
        {
          field: 'minutes' as const,
          value: v.durationS != null ? trimNumber(Math.round((v.durationS / 60) * 10) / 10) : '',
          ghost: previous?.durationS ? trimNumber(Math.round(previous.durationS / 60)) : '',
          unit: 'min',
          label: `${spoken} minutes`,
        },
        {
          field: 'distance' as const,
          value: v.distanceM != null ? trimNumber(metresToDisplay(v.distanceM, units) ?? 0) : '',
          ghost: previous?.distanceM
            ? trimNumber(metresToDisplay(previous.distanceM, units) ?? 0)
            : '',
          unit: units === 'imperial' ? 'mi' : 'km',
          label: `${spoken} distance`,
        },
      ]
    : [
        {
          field: 'weight' as const,
          value: formatWeight(v.weightKg, unit),
          ghost: prevWeight,
          unit,
          label: `${spoken} weight`,
        },
        {
          field: 'reps' as const,
          value: v.reps != null ? String(v.reps) : '',
          ghost: previous?.reps != null ? String(previous.reps) : '',
          unit: 'reps',
          label: `${spoken} reps`,
        },
      ];

  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: t.sizes.hitGymLarge,
        gap: t.spacing.xs,
        paddingHorizontal: t.spacing.xxs,
        paddingVertical: t.spacing.xxs,
        borderRadius: t.radius.button,
        overflow: 'hidden',
        backgroundColor: active && !done ? t.colors.surface2 : 'transparent',
        borderLeftWidth: t.sizes.borderThick,
        borderLeftColor: active && !done ? t.colors.accent : 'transparent',
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            backgroundColor: t.colors.accentSoft,
          },
          sweepStyle,
        ]}
      />
      <PressableScale
        feedback="selection"
        onPress={() => onOpenSet(set)}
        accessibilityRole="button"
        accessibilityLabel={`${spoken}${set.rpe != null ? `, RPE ${set.rpe}` : ''}${isPR ? ', new personal record' : ''}`}
        accessibilityHint="Set type, RPE or delete"
        testID={testID ? `${testID}-type` : undefined}
        style={{
          width: t.sizes.touch,
          minHeight: t.sizes.hitGym,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: t.radius.button,
        }}
      >
        {isPR ? (
          <Trophy
            color={t.colors.accentText}
            size={t.sizes.iconMedium}
            strokeWidth={t.sizes.iconStroke}
            testID={testID ? `${testID}-pr` : undefined}
          />
        ) : (
          <Text
            variant="headline"
            tabular
            color={set.type === 'working' ? 'textPrimary' : 'accentText'}
          >
            {label}
          </Text>
        )}
        {set.rpe != null ? (
          <Text variant="caption" color="textSecondary" tabular>
            @{trimNumber(set.rpe)}
          </Text>
        ) : null}
      </PressableScale>

      {cells.map((c) => (
        <Cell
          key={c.field}
          value={c.value}
          ghost={c.ghost}
          unit={c.unit}
          done={done}
          onPress={() => onEdit(set, c.field)}
          accessibilityLabel={c.label}
          testID={testID ? `${testID}-${c.field}` : undefined}
        />
      ))}

      <Tick
        checked={done}
        onChange={toggle}
        size="gym"
        accessibilityLabel={`${spoken} done`}
        testID={testID ? `${testID}-check` : undefined}
      />
    </View>
  );
}

/** Re-renders only when this row's data changes (A1): not on rest ticks or other rows' edits. */
export const SetRow = memo(
  SetRowImpl,
  (a, b) =>
    (a.set === b.set || (a.set.id === b.set.id && a.set.updatedAt === b.set.updatedAt)) &&
    a.label === b.label &&
    a.previous === b.previous &&
    a.unit === b.unit &&
    a.cardio === b.cardio &&
    a.isPR === b.isPR &&
    a.active === b.active &&
    a.onToggle === b.onToggle &&
    a.onEdit === b.onEdit &&
    a.onOpenSet === b.onOpenSet &&
    a.testID === b.testID,
);
