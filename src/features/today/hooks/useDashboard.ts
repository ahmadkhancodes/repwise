import { useMemo } from 'react';

import { addDays, startOfWeek } from '@/features/meals/logic/dates';
import { weekStreak } from '@/features/progress/logic/streak';
import { unitSystem } from '@/features/progress/logic/units';

import { DASHBOARD_TABLES, loadDashboard } from '../dashboardRepo';
import { localDate } from '../logic/day';
import type { DayTargets, Nutrients } from '../logic/meals';
import { buildStats, weekVolumeKg, weightTrend } from '../logic/stats';
import { useStepsGoal } from '../stepsGoal';
import { useDbSnapshot } from './useDbSnapshot';
import { useSteps } from './useSteps';

/** Weight trend window (days) on the dashboard tile. */
export const WEIGHT_WINDOW_DAYS = 30;

/** Everything the Home dashboard stats grid shows, from SQLite + the step counter. */
export function useDashboard(input: {
  now: number;
  eaten: Nutrients | null;
  targets: DayTargets | null;
  week: { planned: number; done: number } | null;
  units: string | null | undefined;
}) {
  const date = localDate(input.now);
  const weekFrom = startOfWeek(date);
  const weekTo = addDays(weekFrom, 6);
  const weightFrom = addDays(date, -WEIGHT_WINDOW_DAYS);
  const { data } = useDbSnapshot(
    DASHBOARD_TABLES,
    () => loadDashboard(date, weekFrom, weekTo, weightFrom),
    [date, weekFrom, weekTo, weightFrom],
  );
  const steps = useSteps(date, data?.steps ?? null, input.now);
  const stepsGoal = useStepsGoal((s) => s.goal);
  const units = unitSystem(input.units);

  const weight = useMemo(() => weightTrend(data?.weights ?? [], date, weightFrom), [data?.weights, date, weightFrom]);
  const volumeKg = useMemo(() => weekVolumeKg(data?.weekSets ?? [], weekFrom, weekTo), [data?.weekSets, weekFrom, weekTo]);
  const streakWeeks = useMemo(() => weekStreak(data?.doneDates ?? [], date).current, [data?.doneDates, date]);

  const { eaten, targets, week } = input;
  const tiles = useMemo(
    () =>
      buildStats({
        eatenKcal: eaten?.kcal ?? 0,
        targetKcal: targets?.kcal ?? null,
        eatenProtein: eaten?.p ?? 0,
        targetProtein: targets?.p ?? null,
        steps: steps.state,
        stepsGoal,
        week: week ?? { planned: 0, done: 0 },
        streakWeeks,
        volumeKg,
        weight,
        units,
      }),
    [eaten, targets, week, steps.state, stepsGoal, streakWeeks, volumeKg, weight, units],
  );

  return { tiles, weightValues: weight.values, enableSteps: steps.enable };
}
