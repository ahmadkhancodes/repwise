import { CircleCheck, MoreHorizontal, Plus } from 'lucide-react-native';
import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Badge, Button, IconButton, PressableScale, Text } from '@/ui';

import type { PlayerItem } from '../hooks/useWorkout';
import type { WeightUnit } from '../logic/engine';
import { setTarget } from '../logic/player';
import { useOptimisticVersion, optimisticSets } from '../optimistic';
import type { SetPatch, WorkoutSet } from '../repo';
import { SetRow, type SetField } from './SetRow';

/** Long press on a card name opens the swap sheet (W4). */
export const LONG_PRESS_MS = 350;

export type ExerciseCardHandlers = {
  onOpen: (item: PlayerItem) => void;
  onMenu: (item: PlayerItem) => void;
  onSwap: (item: PlayerItem) => void;
  onToggle: (item: PlayerItem, set: WorkoutSet, done: boolean, patch: SetPatch) => void;
  onEdit: (item: PlayerItem, set: WorkoutSet, field: SetField) => void;
  onOpenSet: (item: PlayerItem, set: WorkoutSet) => void;
  onAddSet: (item: PlayerItem) => void;
};

export type ExerciseCardProps = {
  item: PlayerItem;
  index: number;
  unit: WeightUnit;
  prSetIds: ReadonlySet<string>;
  /** Pre-start overview: show targets, no set rows. */
  overview?: boolean;
  /** Id of the next set to do anywhere in the workout (highlighted row). */
  activeSetId?: string | null;
  handlers: ExerciseCardHandlers;
  /** Set rows only (S14, where the screen title already names the exercise). */
  bare?: boolean;
  /** testID prefix (default `exercise-<index>`). */
  testID?: string;
};

/** Best set of a finished exercise for the collapsed summary ("80 kg × 8"). */
function bestLine(sets: WorkoutSet[], unit: WeightUnit, cardio: boolean): string {
  const done = sets.filter((s) => s.doneAt != null);
  if (cardio) return done[0] ? setTarget(done[0], unit, true) : '';
  const top = [...done].sort(
    (a, b) => (b.weightKg ?? 0) - (a.weightKg ?? 0) || (b.reps ?? 0) - (a.reps ?? 0),
  )[0];
  return top ? setTarget(top, unit) : '';
}

/**
 * One exercise in the player (S13): name, set rows, add set. A finished exercise collapses to a
 * one-line summary so the next set is always near the top (B7). Long-press the name = swap (W4).
 */
function ExerciseCardImpl({
  item,
  index,
  unit,
  prSetIds,
  overview = false,
  activeSetId,
  handlers,
  bare = false,
  testID: testIDProp,
}: ExerciseCardProps) {
  const t = useTheme();
  useOptimisticVersion(); // done counts follow pending ticks
  const { se, meta, sets, labels, previous } = item;
  const doneCount = sets.filter((s) => optimisticSets.isDone(s.id, s.doneAt != null)).length;
  const complete = !overview && sets.length > 0 && doneCount === sets.length;
  const [expanded, setExpanded] = useState(false);
  const collapsed = complete && !expanded && !bare;
  const target = se.targetSets ?? 3;
  const meta2 = overview
    ? meta.cardio
      ? `${target} ${target === 1 ? 'entry' : 'entries'}`
      : `${target} × ${se.targetReps ?? '8-12'}`
    : `${doneCount} of ${sets.length || target} sets`;
  const testID = testIDProp ?? `exercise-${index}`;
  const hasPR = sets.some((s) => prSetIds.has(s.id));

  return (
    <View
      testID={testID}
      style={
        bare
          ? { gap: t.spacing.xs }
          : {
              backgroundColor: t.colors.surface,
              borderRadius: t.radius.card,
              padding: t.spacing.card,
              gap: t.spacing.xs,
            }
      }
    >
      {bare ? null : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
          <PressableScale
            onPress={() => (complete ? setExpanded((e) => !e) : handlers.onOpen(item))}
            onLongPress={() => handlers.onSwap(item)}
            delayLongPress={LONG_PRESS_MS}
            accessibilityRole="button"
            accessibilityLabel={`${meta.name}, ${meta2}`}
            accessibilityHint={
              complete
                ? collapsed
                  ? 'Shows the sets'
                  : 'Hides the sets'
                : 'Opens the exercise. Long press to swap it.'
            }
            accessibilityState={complete ? { expanded: !collapsed } : undefined}
            accessibilityActions={[{ name: 'longpress', label: 'Swap exercise' }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'longpress') handlers.onSwap(item);
            }}
            testID={`${testID}-open`}
            style={{
              flex: 1,
              minHeight: t.sizes.touch,
              justifyContent: 'center',
              gap: t.spacing.xxs,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
              {complete ? (
                <CircleCheck
                  color={t.colors.accentText}
                  size={t.sizes.iconMedium}
                  strokeWidth={t.sizes.iconStroke}
                />
              ) : null}
              <Text variant="headline" numberOfLines={2} style={{ flexShrink: 1 }}>
                {meta.name}
              </Text>
              {hasPR ? <Badge label="PR" tone="accent" testID={`${testID}-pr`} /> : null}
            </View>
            <Text variant="callout" color="textSecondary" numberOfLines={1} tabular>
              {collapsed
                ? [meta2, bestLine(sets, unit, meta.cardio)].filter(Boolean).join(' · ')
                : [meta2, meta.primaryMuscles.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
            </Text>
          </PressableScale>
          <IconButton
            icon={MoreHorizontal}
            accessibilityLabel={`More for ${meta.name}`}
            onPress={() => handlers.onMenu(item)}
            testID={`${testID}-menu`}
          />
        </View>
      )}

      {overview || collapsed ? null : (
        <>
          {sets.map((s, i) => (
            <SetRowFor
              key={s.id}
              item={item}
              set={s}
              label={labels[i] ?? String(i + 1)}
              previous={previous[i]}
              unit={unit}
              isPR={prSetIds.has(s.id)}
              active={s.id === activeSetId}
              handlers={handlers}
              testID={`${testID}-set-${i}`}
            />
          ))}
          <Button
            label="Add set"
            icon={Plus}
            variant="tertiary"
            onPress={() => handlers.onAddSet(item)}
            testID={`${testID}-add-set`}
          />
        </>
      )}
    </View>
  );
}

/** Binds the card's item to stable row callbacks, so SetRow's memo holds. */
const SetRowFor = memo(function SetRowFor({
  item,
  set,
  label,
  previous,
  unit,
  isPR,
  active,
  handlers,
  testID,
}: {
  item: PlayerItem;
  set: WorkoutSet;
  label: string;
  previous?: WorkoutSet;
  unit: WeightUnit;
  isPR: boolean;
  active: boolean;
  handlers: ExerciseCardHandlers;
  testID: string;
}) {
  const itemRef = useRef(item);
  const handlersRef = useRef(handlers);
  useLayoutEffect(() => {
    itemRef.current = item;
    handlersRef.current = handlers;
  });
  const onToggle = useCallback(
    (s: WorkoutSet, done: boolean, patch: SetPatch) =>
      handlersRef.current.onToggle(itemRef.current, s, done, patch),
    [],
  );
  const onEdit = useCallback(
    (s: WorkoutSet, field: SetField) => handlersRef.current.onEdit(itemRef.current, s, field),
    [],
  );
  const onOpenSet = useCallback(
    (s: WorkoutSet) => handlersRef.current.onOpenSet(itemRef.current, s),
    [],
  );
  return (
    <SetRow
      set={set}
      label={label}
      previous={previous}
      unit={unit}
      cardio={item.meta.cardio}
      isPR={isPR}
      active={active}
      onToggle={onToggle}
      onEdit={onEdit}
      onOpenSet={onOpenSet}
      testID={testID}
    />
  );
});

/** Memoised (A1): a card re-renders only when its own rows, PRs or the active set change. */
export const ExerciseCard = memo(ExerciseCardImpl);
