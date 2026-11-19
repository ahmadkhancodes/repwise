import { MoreHorizontal, Plus } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Button, IconButton, PressableScale, Text } from '@/ui';

import type { PlayerItem } from '../hooks/useWorkout';
import type { WeightUnit } from '../logic/engine';
import type { SetPatch, WorkoutSet } from '../repo';
import { SetRow } from './SetRow';

export type ExerciseCardProps = {
  item: PlayerItem;
  index: number;
  unit: WeightUnit;
  prSetIds: ReadonlySet<string>;
  /** Pre-start overview: show targets, no set rows. */
  overview?: boolean;
  onOpen: (item: PlayerItem) => void;
  onMenu: (item: PlayerItem) => void;
  onSwap: (item: PlayerItem) => void;
  onToggle: (item: PlayerItem, set: WorkoutSet, patch: SetPatch) => void;
  onCommit: (set: WorkoutSet, patch: SetPatch) => void;
  onOpenSet: (item: PlayerItem, set: WorkoutSet) => void;
  onAddSet: (item: PlayerItem) => void;
};

function Columns({ cardio, unit }: { cardio: boolean; unit: WeightUnit }) {
  const t = useTheme();
  const cols = cardio ? ['Min', unit === 'lb' ? 'mi' : 'km'] : [unit, 'Reps'];
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ flexDirection: 'row', gap: t.spacing.xs, paddingHorizontal: t.spacing.xxs }}
    >
      <Text variant="caption" color="textTertiary" style={{ width: t.sizes.touch, textAlign: 'center' }}>
        Set
      </Text>
      <Text variant="caption" color="textTertiary" style={{ flex: 1.3 }}>
        Previous
      </Text>
      {cols.map((c) => (
        <Text key={c} variant="caption" color="textTertiary" align="center" style={{ flex: 1, minWidth: t.sizes.touch }}>
          {c}
        </Text>
      ))}
      <View style={{ width: t.sizes.touch }} />
    </View>
  );
}

/** One exercise in the player (S13): name, ghosted previous, set rows, add set. Long-press = swap (W4). */
export function ExerciseCard({
  item,
  index,
  unit,
  prSetIds,
  overview = false,
  onOpen,
  onMenu,
  onSwap,
  onToggle,
  onCommit,
  onOpenSet,
  onAddSet,
}: ExerciseCardProps) {
  const t = useTheme();
  const { se, meta, sets, labels, previous } = item;
  const doneCount = sets.filter((s) => s.doneAt != null).length;
  const target = se.targetSets ?? 3;
  const meta2 = overview
    ? meta.cardio
      ? `${target} ${target === 1 ? 'entry' : 'entries'}`
      : `${target} × ${se.targetReps ?? '8-12'}`
    : `${doneCount}/${sets.length || target} sets`;
  const testID = `exercise-${index}`;
  return (
    <Animated.View
      entering={FadeIn.duration(t.motion.duration.base).delay(index * t.motion.listStagger)}
      layout={LinearTransition.springify().damping(t.motion.spring.damping).stiffness(t.motion.spring.stiffness)}
      testID={testID}
      style={{
        backgroundColor: t.colors.surface,
        borderRadius: t.radius.card,
        padding: t.spacing.sm,
        gap: t.spacing.xs,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
        <PressableScale
          onPress={() => onOpen(item)}
          onLongPress={() => onSwap(item)}
          delayLongPress={350}
          accessibilityRole="button"
          accessibilityLabel={`${meta.name}, ${meta2}`}
          accessibilityHint="Opens the exercise. Long press to swap it."
          accessibilityActions={[{ name: 'longpress', label: 'Swap exercise' }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'longpress') onSwap(item);
          }}
          testID={`${testID}-open`}
          style={{ flex: 1, minHeight: t.sizes.touch, justifyContent: 'center', paddingHorizontal: t.spacing.xxs }}
        >
          <Text variant="headline" numberOfLines={2}>
            {meta.name}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {[meta2, meta.primaryMuscles.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
          </Text>
        </PressableScale>
        <IconButton
          icon={MoreHorizontal}
          accessibilityLabel={`More for ${meta.name}`}
          onPress={() => onMenu(item)}
          testID={`${testID}-menu`}
        />
      </View>

      {overview ? null : (
        <>
          <Columns cardio={meta.cardio} unit={unit} />
          {sets.map((s, i) => (
            <SetRow
              key={s.id}
              set={s}
              label={labels[i] ?? String(i + 1)}
              previous={previous[i]}
              unit={unit}
              cardio={meta.cardio}
              isPR={prSetIds.has(s.id)}
              onToggle={(set, patch) => onToggle(item, set, patch)}
              onCommit={onCommit}
              onOpenSet={(set) => onOpenSet(item, set)}
              testID={`${testID}-set-${i}`}
            />
          ))}
          <Button
            label="Add set"
            icon={Plus}
            variant="tertiary"
            onPress={() => onAddSet(item)}
            testID={`${testID}-add-set`}
          />
        </>
      )}
    </Animated.View>
  );
}
