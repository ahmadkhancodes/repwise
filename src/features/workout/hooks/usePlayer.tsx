import { router } from 'expo-router';
import { ArrowUpDown, Info, Repeat, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { getProfile } from '@/features/settings/repo';
import { haptics } from '@/services/haptics';
import { useCatalogFor } from '@/services/catalog';
import { showToast, showUndoToast } from '@/ui';

import {
  discardWorkoutAction,
  finishWorkoutAction,
  flushSetWrites,
  pauseWorkoutAction,
  resumeWorkoutAction,
  retickSet,
  startWorkoutAction,
  tickSet,
  untickSet,
} from '../actions';
import type { ExerciseCardHandlers } from '../components/ExerciseCard';
import type { PRMoment } from '../components/PRCelebration';
import { RestTimerSheet } from '../components/RestTimer';
import { SetEditorSheet, type SetEditorTarget } from '../components/SetEditorSheet';
import type { SetField } from '../components/SetRow';
import { ExerciseMenuSheet, ReorderSheet, SetSheet, SwapSheet } from '../components/Sheets';
import { exerciseMeta, type ExerciseMeta } from '../exerciseMeta';
import { moveItem } from '../logic/order';
import { nextPending, prefillPatch } from '../logic/player';
import { swapAlternatives } from '../logic/swap';
import { formatWeight } from '../logic/units';
import { optimisticSets } from '../optimistic';
import {
  addSet,
  markRemainingDone,
  recentSessionExercises,
  removeExercise,
  removeSet,
  reorderExercises,
  restoreExercise,
  restoreSet,
  swapExerciseRow,
  undoDiscard,
  updateSet,
  type SetPatch,
  type WorkoutSet,
} from '../repo';
import { restTimer } from '../restTimerStore';
import { installRestNotifier } from '../restNotifier';
import { useUnits } from './useUnits';
import { useWorkout, type PlayerItem } from './useWorkout';

/**
 * Shared controller for the player list (S13) and the exercise screen (S14): live data, every
 * handler (stable identities so memoised rows never re-render for nothing, A1/A13) and the sheets.
 * The rest countdown is NOT here: only the rest bar / sheet leaves tick.
 */
export function usePlayer(sessionId: string) {
  const catalog = useCatalogFor('exercises');
  const { unit } = useUnits();
  const live = useWorkout(sessionId, catalog);
  const items = useMemo(() => live.data?.items ?? [], [live.data]);
  const session = live.data?.session ?? null;

  const [restOpen, setRestOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<PlayerItem | null>(null);
  const [swap, setSwap] = useState<{ item: PlayerItem; options: ExerciseMeta[] } | null>(null);
  const swapFor = swap?.item ?? null;
  const [setFor, setSetFor] = useState<{ item: PlayerItem; set: WorkoutSet } | null>(null);
  const [editor, setEditor] = useState<{ target: SetEditorTarget; item: PlayerItem } | null>(null);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [prSetIds, setPrSetIds] = useState<ReadonlySet<string>>(new Set());
  const [prMoment, setPrMoment] = useState<PRMoment | null>(null);

  // Latest values for the stable handlers below.
  const ref = useRef({ items, catalog, unit, session });
  useLayoutEffect(() => {
    ref.current = { items, catalog, unit, session };
  });

  useEffect(() => {
    installRestNotifier();
    restTimer.check();
  }, []);

  // Pending ticks are cleared once the live rows agree (no flicker between write and re-query).
  useEffect(() => {
    for (const it of items)
      for (const s of it.sets) {
        const p = optimisticSets.get(s.id);
        if (p && p.done === (s.doneAt != null)) optimisticSets.clear(s.id);
      }
  }, [items]);

  const tick = useCallback(
    (item: PlayerItem, set: WorkoutSet, patch: SetPatch) => {
      const { items: all, unit: u } = ref.current;
      void tickSet({ sessionId, item, items: all, set, patch, restS: item.se.restS, unit: u })
        .then(({ pr }) => {
          if (!pr) return;
          haptics.success();
          setPrSetIds((prev) => new Set(prev).add(set.id));
          setPrMoment({
            key: set.id,
            exercise: item.meta.name,
            value: formatWeight(pr.weightKg, u),
            unit: u,
            reps: pr.reps,
            kind: pr.kind,
          });
        })
        .catch(() => undefined);
    },
    [sessionId],
  );

  const untick = useCallback((item: PlayerItem, set: WorkoutSet) => {
    const label = item.labels[item.sets.findIndex((s) => s.id === set.id)] ?? '';
    void untickSet(set).then((prev) => {
      if (prev == null) return;
      showUndoToast(`${item.meta.name} · set ${label} un-ticked`, () => retickSet(set.id, prev));
    });
  }, []);

  const openExercise = useCallback(
    (item: PlayerItem) => router.push(`/workout/${sessionId}/ex/${item.se.id}`),
    [sessionId],
  );

  /** W4: three alternatives, computed once when the sheet opens (engine via logic/swap). */
  const openSwap = useCallback(
    (item: PlayerItem) => {
      const { catalog: c, session: s, items: all } = ref.current;
      haptics.selection();
      let options: ExerciseMeta[] = [];
      if (c && s) {
        const alt = swapAlternatives(
          {
            date: s.date ?? '',
            sessionExerciseIds: all.map((i) => i.se.exerciseId),
            index: all.findIndex((i) => i.se.id === item.se.id),
            recentSessions: recentSessionExercises(sessionId),
            now: Date.now(),
          },
          c.exercises,
          getProfile(),
        );
        options = alt.map((id) => exerciseMeta(id, c));
      }
      setSwap({ item, options });
    },
    [sessionId],
  );

  const handlers = useMemo<ExerciseCardHandlers>(
    () => ({
      onOpen: openExercise,
      onMenu: (item) => setMenuFor(item),
      onSwap: openSwap,
      onToggle: (item, set, done, patch) => (done ? tick(item, set, patch) : untick(item, set)),
      onEdit: (item: PlayerItem, set: WorkoutSet, _field: SetField) =>
        setEditor({
          item,
          target: {
            set,
            label: item.labels[item.sets.findIndex((s) => s.id === set.id)] ?? '',
            exercise: item.meta.name,
            equipment: item.meta.equipment,
            cardio: item.meta.cardio,
            previous: item.previous[item.sets.findIndex((s) => s.id === set.id)],
            done: optimisticSets.isDone(set.id, set.doneAt != null),
          },
        }),
      onOpenSet: (item, set) => setSetFor({ item, set }),
      onAddSet: (item) => {
        addSet(item.se.id);
      },
    }),
    [openExercise, openSwap, tick, untick],
  );

  /**
   * The footer's one big action: log the next set (of the workout, or of `only` on S14) with
   * what it shows, last time's values filling any gap (B7).
   */
  const logNext = useCallback(
    (only?: PlayerItem) => {
      const p = nextPending(only ? [only] : ref.current.items, (s) =>
        optimisticSets.isDone(s.id, s.doneAt != null),
      );
      if (!p) return;
      const item = p.item as PlayerItem;
      haptics.success();
      tick(item, p.set, prefillPatch(p.set, item.previous[p.setIndex], item.meta.cardio));
    },
    [tick],
  );

  const pickSwap = (id: string) => {
    if (!swapFor) return;
    const meta = exerciseMeta(id, catalog);
    swapExerciseRow(swapFor.se.id, id, { cardio: meta.cardio });
    haptics.success();
    showToast({ message: `Swapped to ${meta.name}`, tone: 'success', silent: true });
    setSwap(null);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    reorderExercises(
      sessionId,
      moveItem(
        items.map((i) => i.se.id),
        from,
        to,
      ),
    );
  };

  const start = () => {
    const res = startWorkoutAction(sessionId, catalog);
    // Another workout is running: take the user to it rather than orphaning it.
    if (!res.started) router.push(`/workout/${res.activeSessionId}`);
  };
  const pause = () => pauseWorkoutAction(sessionId);
  const resume = () => resumeWorkoutAction(sessionId);
  const finish = () => {
    finishWorkoutAction(sessionId, catalog, unit);
    router.replace(`/workout/${sessionId}/summary`);
  };
  /** Finish sheet: "Tick the rest and finish", so a set done but not ticked is never lost. */
  const finishMarkingDone = () => {
    flushSetWrites();
    markRemainingDone(sessionId);
    finish();
  };
  /** Discard (after its confirm sheet), with a 5 s undo that brings the whole workout back. */
  const discard = () => {
    const snap = discardWorkoutAction(sessionId);
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/train');
    if (snap) {
      showUndoToast('Workout discarded', () => {
        undoDiscard(snap);
        router.push(`/workout/${sessionId}`);
      });
    }
  };

  const menuItem = menuFor;
  const sheets = (
    <>
      <RestTimerSheet open={restOpen} onClose={() => setRestOpen(false)} />
      <SetEditorSheet
        target={editor?.target ?? null}
        unit={unit}
        onClose={() => setEditor(null)}
        onSave={(set, patch) => {
          updateSet(set.id, patch);
        }}
        onLog={(set, patch) => {
          if (editor) tick(editor.item, set, patch);
        }}
      />
      <SetSheet
        set={setFor?.set ?? null}
        label={
          setFor
            ? (setFor.item.labels[setFor.item.sets.findIndex((s) => s.id === setFor.set.id)] ?? '')
            : ''
        }
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
          const id = setFor.set.id;
          flushSetWrites();
          removeSet(id);
          setSetFor(null);
          showUndoToast('Set deleted', () => restoreSet(id));
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
                    flushSetWrites();
                    const removed = removeExercise(menuItem.se.id);
                    setMenuFor(null);
                    showUndoToast(`${menuItem.meta.name} removed`, () => restoreExercise(removed));
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
    prSetIds,
    prMoment,
    clearPrMoment: useCallback(() => setPrMoment(null), []),
    sheets,
    openRest: useCallback(() => setRestOpen(true), []),
    openReorder: () => setReorderOpen(true),
    handlers,
    logNext,
    start,
    pause,
    resume,
    finish,
    finishMarkingDone,
    discard,
  };
}

export type PlayerController = ReturnType<typeof usePlayer>;
