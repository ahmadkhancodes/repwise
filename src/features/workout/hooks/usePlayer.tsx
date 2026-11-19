import { router } from 'expo-router';
import { ArrowUpDown, Info, Repeat, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getProfile } from '@/features/settings/repo';
import { haptics } from '@/services/haptics';
import { useCatalog } from '@/services/catalog';
import { showToast } from '@/ui';

import {
  finishWorkoutAction,
  logSetAction,
  pauseWorkoutAction,
  resumeWorkoutAction,
  startWorkoutAction,
  undoSetAction,
} from '../actions';
import { ExerciseMenuSheet, ReorderSheet, SetSheet, SwapSheet } from '../components/Sheets';
import { RestTimerSheet } from '../components/RestTimer';
import { exerciseMeta, type ExerciseMeta } from '../exerciseMeta';
import { moveItem } from '../logic/order';
import { swapAlternatives } from '../logic/swap';
import {
  addSet,
  discardWorkout,
  recentSessionExercises,
  removeExercise,
  removeSet,
  reorderExercises,
  swapExerciseRow,
  updateSet,
  type SetPatch,
  type WorkoutSet,
} from '../repo';
import { restTimer } from '../restTimerStore';
import { installRestNotifier } from '../restNotifier';
import { useRestTimer } from './useRestTimer';
import { useUnits } from './useUnits';
import { useWorkout, type PlayerItem } from './useWorkout';

/**
 * Shared controller for the player list (S13) and the exercise screen (S14): live data, every
 * handler, and the sheets (S15 swap, set type/RPE, reorder, rest timer). Screens stay layout-only.
 */
export function usePlayer(sessionId: string) {
  const catalog = useCatalog();
  const { unit } = useUnits();
  const live = useWorkout(sessionId, catalog);
  const rest = useRestTimer();
  const items = useMemo(() => live.data?.items ?? [], [live.data]);
  const session = live.data?.session ?? null;

  const [restOpen, setRestOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<PlayerItem | null>(null);
  const [swap, setSwap] = useState<{ item: PlayerItem; options: ExerciseMeta[] } | null>(null);
  const swapFor = swap?.item ?? null;
  const [setFor, setSetFor] = useState<{ item: PlayerItem; set: WorkoutSet } | null>(null);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [prSetIds, setPrSetIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    installRestNotifier();
    restTimer.check();
  }, []);

  const onToggle = useCallback(
    (item: PlayerItem, set: WorkoutSet, patch: SetPatch) => {
      if (set.doneAt != null) return undoSetAction(set);
      const pr = logSetAction({
        sessionId,
        set,
        patch,
        restS: item.se.restS,
        exerciseId: item.se.exerciseId,
        catalog,
        unit,
      });
      if (pr) setPrSetIds((prev) => new Set(prev).add(set.id));
    },
    [sessionId, catalog, unit],
  );

  const onCommit = useCallback((set: WorkoutSet, patch: SetPatch) => {
    updateSet(set.id, patch);
  }, []);

  const onAddSet = useCallback((item: PlayerItem) => {
    addSet(item.se.id);
  }, []);

  const openExercise = useCallback(
    (item: PlayerItem) => router.push(`/workout/${sessionId}/ex/${item.se.id}`),
    [sessionId],
  );

  /** W4: three alternatives, computed once when the sheet opens (engine via logic/swap). */
  const openSwap = useCallback(
    (item: PlayerItem) => {
      haptics.selection();
      let options: ExerciseMeta[] = [];
      if (catalog && session) {
        const ids = items.map((i) => i.se.exerciseId);
        const alt = swapAlternatives(
          {
            date: session.date ?? '',
            sessionExerciseIds: ids,
            index: items.findIndex((i) => i.se.id === item.se.id),
            recentSessions: recentSessionExercises(sessionId),
            now: Date.now(),
          },
          catalog.exercises,
          getProfile(),
        );
        options = alt.map((id) => exerciseMeta(id, catalog));
      }
      setSwap({ item, options });
    },
    [catalog, session, items, sessionId],
  );

  const pickSwap = (id: string) => {
    if (!swapFor) return;
    const meta = exerciseMeta(id, catalog);
    swapExerciseRow(swapFor.se.id, id, { cardio: meta.cardio });
    haptics.success();
    showToast({ message: `Swapped to ${meta.name}`, tone: 'success' });
    setSwap(null);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    reorderExercises(sessionId, moveItem(items.map((i) => i.se.id), from, to));
  };

  const start = () => startWorkoutAction(sessionId, catalog);
  const pause = () => pauseWorkoutAction(sessionId);
  const resume = () => resumeWorkoutAction(sessionId);
  const finish = () => {
    finishWorkoutAction(sessionId, catalog, unit);
    router.replace(`/workout/${sessionId}/summary`);
  };
  const discard = () => {
    restTimer.clearFor(sessionId);
    discardWorkout(sessionId);
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/train');
  };

  const menuItem = menuFor;
  const sheets = (
    <>
      <RestTimerSheet open={restOpen} view={rest} onClose={() => setRestOpen(false)} />
      <SetSheet
        set={setFor?.set ?? null}
        label={setFor ? (setFor.item.labels[setFor.item.sets.findIndex((s) => s.id === setFor.set.id)] ?? '') : ''}
        cardio={setFor?.item.meta.cardio ?? false}
        onClose={() => setSetFor(null)}
        onType={(type) => {
          if (!setFor) return;
          updateSet(setFor.set.id, { type });
          setSetFor({ ...setFor, set: { ...setFor.set, type } });
        }}
        onRpe={(rpe) => {
          if (!setFor) return;
          updateSet(setFor.set.id, { rpe });
          setSetFor({ ...setFor, set: { ...setFor.set, rpe } });
        }}
        onDelete={() => {
          if (!setFor) return;
          removeSet(setFor.set.id);
          setSetFor(null);
        }}
      />
      <SwapSheet
        open={swapFor !== null}
        current={swapFor?.meta ?? null}
        options={swap?.options ?? []}
        locked={swapFor?.sets.some((s) => s.doneAt != null) ?? false}
        onClose={() => setSwap(null)}
        onPick={pickSwap}
      />
      <ExerciseMenuSheet
        open={menuItem !== null}
        title={menuItem?.meta.name ?? ''}
        onClose={() => setMenuFor(null)}
        actions={
          menuItem
            ? [
                {
                  key: 'swap',
                  label: 'Swap exercise',
                  icon: Repeat,
                  onPress: () => {
                    setMenuFor(null);
                    openSwap(menuItem);
                  },
                },
                {
                  key: 'reorder',
                  label: 'Reorder exercises',
                  icon: ArrowUpDown,
                  onPress: () => {
                    setMenuFor(null);
                    setReorderOpen(true);
                  },
                },
                {
                  key: 'details',
                  label: 'Exercise details',
                  icon: Info,
                  onPress: () => {
                    setMenuFor(null);
                    openExercise(menuItem);
                  },
                },
                {
                  key: 'remove',
                  label: 'Remove from workout',
                  icon: Trash2,
                  destructive: true,
                  onPress: () => {
                    removeExercise(menuItem.se.id);
                    setMenuFor(null);
                    showToast({ message: `${menuItem.meta.name} removed` });
                  },
                },
              ]
            : []
        }
      />
      <ReorderSheet
        open={reorderOpen}
        items={items.map((i) => ({ id: i.se.id, name: i.meta.name }))}
        onMove={move}
        onClose={() => setReorderOpen(false)}
      />
    </>
  );

  return {
    catalog,
    unit,
    live,
    session,
    items,
    rest,
    prSetIds,
    sheets,
    openRest: () => setRestOpen(true),
    openReorder: () => setReorderOpen(true),
    handlers: {
      onOpen: openExercise,
      onMenu: (item: PlayerItem) => setMenuFor(item),
      onSwap: openSwap,
      onToggle,
      onCommit,
      onOpenSet: (item: PlayerItem, set: WorkoutSet) => setSetFor({ item, set }),
      onAddSet,
    },
    start,
    pause,
    resume,
    finish,
    discard,
  };
}

export type PlayerController = ReturnType<typeof usePlayer>;
