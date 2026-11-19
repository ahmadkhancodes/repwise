import { Check, Trophy } from 'lucide-react-native';
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
import { PressableScale, Text } from '@/ui';

import { metresToDisplay, distanceToMetres } from '../logic/cardio';
import type { WeightUnit } from '../logic/engine';
import { spokenSetName } from '../logic/sets';
import { formatWeight, fromDisplayWeight, parseNumberInput, trimNumber } from '../logic/units';
import type { SetPatch, WorkoutSet } from '../repo';
import { NumberCell } from './NumberCell';

export type SetRowProps = {
  set: WorkoutSet;
  label: string;
  previous?: WorkoutSet;
  unit: WeightUnit;
  cardio?: boolean;
  isPR?: boolean;
  onToggle: (set: WorkoutSet, patch: SetPatch) => void;
  onCommit: (set: WorkoutSet, patch: SetPatch) => void;
  onOpenSet: (set: WorkoutSet) => void;
  testID?: string;
};

function previousText(p: WorkoutSet | undefined, unit: WeightUnit, cardio: boolean): string {
  if (!p) return '—';
  if (cardio) {
    const min = p.durationS ? `${Math.round(p.durationS / 60)} min` : '';
    const dist = p.distanceM ? `${trimNumber(metresToDisplay(p.distanceM, unit === 'lb' ? 'imperial' : 'metric') ?? 0)}` : '';
    return [min, dist].filter(Boolean).join(' · ') || '—';
  }
  const w = formatWeight(p.weightKg, unit);
  return w ? `${w} × ${p.reps ?? 0}` : `${p.reps ?? 0} reps`;
}

/**
 * SetRow (sheet 11): Set | Previous (ghosted) | Weight | Reps | ✓ — 56 high. Values are saved on
 * blur; the check saves the values shown and marks the set done in one tap (RW-20).
 */
export function SetRow({
  set,
  label,
  previous,
  unit,
  cardio = false,
  isPR = false,
  onToggle,
  onCommit,
  onOpenSet,
  testID,
}: SetRowProps) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const done = set.doneAt != null;
  const spoken = spokenSetName(set.type, label);
  const units = unit === 'lb' ? 'imperial' : 'metric';
  const pop = useSharedValue(1);
  useEffect(() => {
    if (done && !reduce) pop.set(withSequence(withSpring(1.18, t.motion.spring), withSpring(1, t.motion.spring)));
  }, [done, reduce, pop, t.motion.spring]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const weightText = formatWeight(set.weightKg, unit);
  const prevWeight = formatWeight(previous?.weightKg, unit);
  const minutes = set.durationS != null ? trimNumber(Math.round((set.durationS / 60) * 10) / 10) : '';
  const distance = set.distanceM != null ? trimNumber(metresToDisplay(set.distanceM, units) ?? 0) : '';

  const commitWeight = (text: string) => {
    const n = parseNumberInput(text);
    onCommit(set, { weightKg: n == null ? null : fromDisplayWeight(n, unit) });
  };
  const commitReps = (text: string) => {
    const n = parseNumberInput(text);
    onCommit(set, { reps: n == null ? null : Math.round(n) });
  };
  const commitMinutes = (text: string) => {
    const n = parseNumberInput(text);
    onCommit(set, { durationS: n == null ? null : Math.round(n * 60) });
  };
  const commitDistance = (text: string) => {
    const n = parseNumberInput(text);
    onCommit(set, { distanceM: n == null ? null : distanceToMetres(n, units) });
  };

  /** Ticking an empty row takes the ghosted previous values, like a coach would. */
  const toggle = () => {
    if (done) return onToggle(set, {});
    const patch: SetPatch = {};
    if (!cardio) {
      if (set.weightKg == null && previous?.weightKg != null) patch.weightKg = previous.weightKg;
      if (set.reps == null && previous?.reps != null) patch.reps = previous.reps;
    } else {
      if (set.durationS == null && previous?.durationS != null) patch.durationS = previous.durationS;
      if (set.distanceM == null && previous?.distanceM != null) patch.distanceM = previous.distanceM;
    }
    onToggle(set, patch);
  };

  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: t.sizes.row,
        gap: t.spacing.xs,
        paddingHorizontal: t.spacing.xxs,
        borderRadius: t.radius.button,
        backgroundColor: done ? t.colors.accentSoft : 'transparent',
      }}
    >
      <PressableScale
        feedback="selection"
        onPress={() => onOpenSet(set)}
        accessibilityRole="button"
        accessibilityLabel={`${spoken}${set.rpe != null ? `, RPE ${set.rpe}` : ''}`}
        accessibilityHint="Set type and RPE"
        testID={testID ? `${testID}-type` : undefined}
        style={{
          width: t.sizes.touch,
          minHeight: t.sizes.touch,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: t.radius.button,
        }}
      >
        <Text variant="headline" tabular color={set.type === 'working' ? 'textPrimary' : 'accentText'}>
          {label}
        </Text>
        {set.rpe != null ? (
          <Text variant="caption" color="textSecondary" tabular>
            @{trimNumber(set.rpe)}
          </Text>
        ) : null}
      </PressableScale>

      <View style={{ flex: 1.3, flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs }}>
        {isPR ? (
          <Trophy color={t.colors.accentText} size={t.sizes.iconSmall} strokeWidth={t.sizes.iconStroke} />
        ) : null}
        <Text
          variant="callout"
          color="textTertiary"
          tabular
          numberOfLines={1}
          style={{ flexShrink: 1 }}
          accessibilityLabel={`Previous ${previousText(previous, unit, cardio)}`}
        >
          {previousText(previous, unit, cardio)}
        </Text>
      </View>

      {cardio ? (
        <>
          <NumberCell
            value={minutes}
            placeholder={previous?.durationS ? String(Math.round(previous.durationS / 60)) : 'min'}
            onCommit={commitMinutes}
            accessibilityLabel={`${spoken} minutes`}
            done={done}
            testID={testID ? `${testID}-minutes` : undefined}
          />
          <NumberCell
            value={distance}
            placeholder={units === 'imperial' ? 'mi' : 'km'}
            onCommit={commitDistance}
            accessibilityLabel={`${spoken} distance in ${units === 'imperial' ? 'miles' : 'kilometres'}`}
            done={done}
            testID={testID ? `${testID}-distance` : undefined}
          />
        </>
      ) : (
        <>
          <NumberCell
            value={weightText}
            placeholder={prevWeight || unit}
            onCommit={commitWeight}
            accessibilityLabel={`${spoken} weight in ${unit === 'lb' ? 'pounds' : 'kilograms'}`}
            done={done}
            testID={testID ? `${testID}-weight` : undefined}
          />
          <NumberCell
            value={set.reps != null ? String(set.reps) : ''}
            placeholder={previous?.reps != null ? String(previous.reps) : 'reps'}
            onCommit={commitReps}
            decimal={false}
            accessibilityLabel={`${spoken} reps`}
            done={done}
            testID={testID ? `${testID}-reps` : undefined}
          />
        </>
      )}

      <PressableScale
        feedback="light"
        onPress={toggle}
        accessibilityRole="checkbox"
        accessibilityLabel={`${spoken} done`}
        accessibilityState={{ checked: done }}
        testID={testID ? `${testID}-check` : undefined}
        style={{ width: t.sizes.touch, height: t.sizes.touch, alignItems: 'center', justifyContent: 'center' }}
      >
        <Animated.View
          style={[
            {
              width: t.spacing.xxl,
              height: t.spacing.xxl,
              borderRadius: t.radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: done ? t.colors.accent : t.colors.surface2,
            },
            popStyle,
          ]}
        >
          <Check
            color={done ? t.colors.onAccent : t.colors.textTertiary}
            size={t.sizes.iconSmall + t.spacing.xxs}
            strokeWidth={2.5}
          />
        </Animated.View>
      </PressableScale>
    </View>
  );
}
