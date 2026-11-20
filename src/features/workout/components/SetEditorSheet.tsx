import { Check } from 'lucide-react-native';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, Chip, Sheet, Stepper, Text } from '@/ui';

import { distanceToMetres, metresToDisplay } from '../logic/cardio';
import type { WeightUnit } from '../logic/engine';
import { maxWeight, plateStep } from '../logic/player';
import { spokenSetName } from '../logic/sets';
import { formatWeight, fromDisplayWeight, toDisplayWeight, trimNumber } from '../logic/units';
import type { SetPatch, WorkoutSet } from '../repo';

export type SetEditorTarget = {
  set: WorkoutSet;
  label: string;
  exercise: string;
  equipment: string[];
  cardio: boolean;
  previous?: WorkoutSet;
  /** Shown as done right now (optimistic): the primary action saves instead of logging. */
  done: boolean;
};

type Draft = { weight: number; reps: number; minutes: number; distance: number };

function draftOf(target: SetEditorTarget, unit: WeightUnit): Draft {
  const { set, previous } = target;
  const units = unit === 'lb' ? 'imperial' : 'metric';
  const kg = set.weightKg ?? previous?.weightKg ?? null;
  return {
    weight: kg != null ? toDisplayWeight(kg, unit) : 0,
    reps: set.reps ?? previous?.reps ?? 0,
    minutes: Math.round(((set.durationS ?? previous?.durationS ?? 0) / 60) * 10) / 10,
    distance: metresToDisplay(set.distanceM ?? previous?.distanceM ?? null, units) ?? 0,
  };
}

/** Editor values → the set patch (kg and seconds stored). Pure. */
export function draftPatch(d: Draft, unit: WeightUnit, cardio: boolean): SetPatch {
  if (cardio) {
    return {
      durationS: d.minutes > 0 ? Math.round(d.minutes * 60) : null,
      distanceM:
        d.distance > 0 ? distanceToMetres(d.distance, unit === 'lb' ? 'imperial' : 'metric') : null,
    };
  }
  return {
    weightKg: d.weight > 0 ? fromDisplayWeight(d.weight, unit) : null,
    reps: d.reps > 0 ? d.reps : null,
  };
}

/**
 * The set editor (B2): weight and reps as gym Steppers (64dp ±, hold to repeat, tap the number
 * to type), plate-sized steps, quick jumps and "same as last time", and one 64dp "Log set" at the
 * bottom of the thumb zone. Closing the sheet keeps the edits.
 */
export function SetEditorSheet({
  target,
  unit,
  onSave,
  onLog,
  onClose,
}: {
  target: SetEditorTarget | null;
  unit: WeightUnit;
  onSave: (set: WorkoutSet, patch: SetPatch) => void;
  onLog: (set: WorkoutSet, patch: SetPatch) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={
        target ? `${spokenSetName(target.set.type, target.label)} · ${target.exercise}` : 'Set'
      }
      testID="set-editor"
    >
      {target ? (
        <Editor
          key={target.set.id}
          target={target}
          unit={unit}
          onSave={onSave}
          onLog={onLog}
          onClose={onClose}
        />
      ) : null}
    </Sheet>
  );
}

function Editor({
  target,
  unit,
  onSave,
  onLog,
  onClose,
}: {
  target: SetEditorTarget;
  unit: WeightUnit;
  onSave: (set: WorkoutSet, patch: SetPatch) => void;
  onLog: (set: WorkoutSet, patch: SetPatch) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const [initial] = useState<Draft>(() => draftOf(target, unit));
  const [d, setD] = useState<Draft>(initial);
  // Swiping the sheet away keeps what was dialled in (never lose an edit); Log/Save commit first.
  const latest = useRef({ d, committed: false });
  useLayoutEffect(() => {
    latest.current.d = d;
  });
  useEffect(
    () => () => {
      const { d: last, committed } = latest.current;
      const changed = (Object.keys(last) as (keyof Draft)[]).some((k) => last[k] !== initial[k]);
      if (!committed && changed) onSave(target.set, draftPatch(last, unit, target.cardio));
    },
    // Runs once on unmount with the latest draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const step = plateStep(unit, target.equipment);
  const prev = target.previous;
  const patch = () => draftPatch(d, unit, target.cardio);
  const prevText = prev
    ? target.cardio
      ? [
          prev.durationS ? `${Math.round(prev.durationS / 60)} min` : '',
          prev.distanceM
            ? `${trimNumber(metresToDisplay(prev.distanceM, unit === 'lb' ? 'imperial' : 'metric') ?? 0)} ${unit === 'lb' ? 'mi' : 'km'}`
            : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : `${formatWeight(prev.weightKg, unit) || '0'} ${unit} × ${prev.reps ?? 0}`
    : '';

  return (
    <View style={{ gap: t.spacing.md }}>
      {prevText ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: t.spacing.sm,
          }}
        >
          <Text variant="callout" color="textSecondary" testID="set-editor-previous">
            Last time {prevText}
          </Text>
          <Chip
            label="Same as last time"
            role="button"
            onPress={() =>
              setD(
                draftOf(
                  {
                    ...target,
                    set: {
                      ...target.set,
                      weightKg: null,
                      reps: null,
                      durationS: null,
                      distanceM: null,
                    },
                  },
                  unit,
                ),
              )
            }
            testID="set-editor-same"
          />
        </View>
      ) : null}
      {target.cardio ? (
        <>
          <Stepper
            label="Minutes"
            size="large"
            value={d.minutes}
            step={1}
            max={600}
            unit="min"
            format={trimNumber}
            onChange={(minutes) => setD({ ...d, minutes })}
            testID="set-editor-minutes"
          />
          <Stepper
            label="Distance"
            size="large"
            value={d.distance}
            step={0.1}
            max={500}
            unit={unit === 'lb' ? 'mi' : 'km'}
            format={trimNumber}
            onChange={(distance) => setD({ ...d, distance })}
            testID="set-editor-distance"
          />
        </>
      ) : (
        <>
          <Stepper
            label="Weight"
            size="large"
            value={d.weight}
            step={step}
            max={maxWeight(unit)}
            unit={unit}
            format={trimNumber}
            onChange={(weight) => setD({ ...d, weight })}
            testID="set-editor-weight"
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
            {[-2 * step, -step, step, 2 * step].map((delta) => (
              <Chip
                key={delta}
                role="button"
                label={`${delta > 0 ? '+' : '−'}${trimNumber(Math.abs(delta))}`}
                onPress={() =>
                  setD({ ...d, weight: Math.max(0, Math.round((d.weight + delta) * 1000) / 1000) })
                }
                testID={`set-editor-jump-${delta > 0 ? 'up' : 'down'}-${trimNumber(Math.abs(delta))}`}
              />
            ))}
          </View>
          <Stepper
            label="Reps"
            size="large"
            value={d.reps}
            step={1}
            max={200}
            unit="reps"
            onChange={(reps) => setD({ ...d, reps })}
            testID="set-editor-reps"
          />
        </>
      )}
      {target.done ? (
        <Button
          label="Save"
          onPress={() => {
            latest.current.committed = true;
            onSave(target.set, patch());
            onClose();
          }}
          testID="set-editor-save"
          style={{ minHeight: t.sizes.hitGymLarge }}
        />
      ) : (
        <Button
          label="Log set"
          icon={Check}
          accent
          onPress={() => {
            latest.current.committed = true;
            onLog(target.set, patch());
            onClose();
          }}
          testID="set-editor-log"
          style={{ minHeight: t.sizes.hitGymLarge }}
        />
      )}
      {target.done ? null : (
        <Button
          label="Save without logging"
          variant="tertiary"
          onPress={() => {
            latest.current.committed = true;
            onSave(target.set, patch());
            onClose();
          }}
          testID="set-editor-save"
        />
      )}
    </View>
  );
}
