import { useEffect, useMemo, useState } from 'react';

import { useProfile } from '@/features/settings/repo';
import { useCatalog } from '@/services/catalog';

import { localISODate } from '../logic/dates';
import type { EngineExercise, ISODate } from '../logic/engine';
import { engineExerciseMap, type MuscleSource } from '../logic/muscles';
import { unitSystem, type UnitSystem } from '../logic/units';
import { flattenSets, type LoggedSet } from '../logic/workouts';
import {
  useLiveCustomExercises,
  useLiveDoneSets,
  useLiveFoodLogs,
  useLiveMealPlans,
  useLiveMeals,
  useLiveSessionExercises,
  useLiveSessions,
} from '../repo';

/** Wall clock in ms that ticks once a minute (pass an override in tests). */
export function useNow(nowOverride?: number): number {
  const [now, setNow] = useState(() => nowOverride ?? Date.now());
  useEffect(() => {
    if (nowOverride != null) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [nowOverride]);
  return nowOverride ?? now;
}

/** Today's local date; rolls over at midnight while the screen stays open. */
export function useToday(nowOverride?: number): ISODate {
  return localISODate(useNow(nowOverride));
}

export function useUnits(): UnitSystem {
  return unitSystem(useProfile()?.units);
}

export type Training = {
  loading: boolean;
  error?: Error;
  sessions: ReturnType<typeof useLiveSessions>['data'];
  sets: LoggedSet[];
  exById: ReadonlyMap<string, EngineExercise>;
  exerciseName: (id: string) => string;
};

/** Every finished set joined to its session + exercise, live. */
export function useTraining(): Training {
  const s = useLiveSessions();
  const se = useLiveSessionExercises();
  const st = useLiveDoneSets();
  const custom = useLiveCustomExercises();
  const catalog = useCatalog();

  const sets = useMemo(() => flattenSets(s.data, se.data, st.data), [s.data, se.data, st.data]);
  const exById = useMemo(() => {
    const list: MuscleSource[] = [
      ...(catalog?.exercises ?? []),
      ...custom.data.map((c) => ({
        id: c.id,
        primaryMuscles: c.primaryMuscles,
        secondaryMuscles: c.secondary,
      })),
    ];
    return engineExerciseMap(list);
  }, [catalog, custom.data]);
  const exerciseName = useMemo(() => {
    const customNames = new Map(custom.data.map((c) => [c.id, c.name]));
    return (id: string) => catalog?.exerciseById.get(id)?.name ?? customNames.get(id) ?? 'Exercise';
  }, [catalog, custom.data]);

  return {
    loading: s.loading || se.loading || st.loading || catalog == null,
    error: s.error ?? se.error ?? st.error,
    sessions: s.data,
    sets,
    exById,
    exerciseName,
  };
}

export function useNutrition() {
  const logs = useLiveFoodLogs();
  const plans = useLiveMealPlans();
  const meals = useLiveMeals();
  return {
    loading: logs.loading || plans.loading || meals.loading,
    error: logs.error ?? plans.error ?? meals.error,
    logs: logs.data,
    mealPlans: plans.data,
    meals: meals.data,
  };
}
