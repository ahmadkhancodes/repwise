/**
 * Local rows → engine `HistoryInput` (sessions, sets, meals, weights, block). Pure.
 * Only rows dated before `weekStart` matter to the engine; the caller passes the recent window.
 */
import type { BlockState, HistoryInput, SetType } from '../engine';

export type HistorySession = { id: string; date: string | null; status: string | null };
export type HistorySessionExercise = {
  id: string;
  sessionId: string;
  exerciseId: string;
  position: number;
};
export type HistorySet = {
  sessionExerciseId: string;
  type: string;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  doneAt: number | null;
};
export type HistoryMeal = { date: string; slot: string; recipeId: string | null; status: string };
export type HistoryWeight = { date: string; weightKg: number | null };

const SLOTS = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
const SET_TYPES = new Set<SetType>(['warmup', 'working', 'drop', 'failure', 'cardio']);

export function buildHistory(input: {
  sessions: readonly HistorySession[];
  sessionExercises: readonly HistorySessionExercise[];
  sets: readonly HistorySet[];
  meals: readonly HistoryMeal[];
  weights: readonly HistoryWeight[];
  block?: BlockState | null;
  neverShow?: readonly string[];
  moreLike?: readonly string[];
}): HistoryInput {
  const exBySession = new Map<string, HistorySessionExercise[]>();
  const exerciseOf = new Map<string, string>();
  for (const se of input.sessionExercises) {
    exerciseOf.set(se.id, se.exerciseId);
    const list = exBySession.get(se.sessionId) ?? [];
    list.push(se);
    exBySession.set(se.sessionId, list);
  }

  const sessions = input.sessions
    .filter((s) => s.date && s.status !== 'skipped')
    .map((s) => ({
      date: s.date as string,
      exerciseIds: [...(exBySession.get(s.id) ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((e) => e.exerciseId),
    }))
    .filter((s) => s.exerciseIds.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const sets = input.sets
    .filter((s) => s.doneAt != null && exerciseOf.has(s.sessionExerciseId))
    .map((s) => ({
      exerciseId: exerciseOf.get(s.sessionExerciseId) as string,
      doneAt: s.doneAt as number,
      type: SET_TYPES.has(s.type as SetType) ? (s.type as SetType) : ('working' as const),
      weightKg: Math.max(0, s.weightKg ?? 0),
      reps: Math.max(0, Math.round(s.reps ?? 0)),
      ...(s.rpe != null && s.rpe >= 1 && s.rpe <= 10 ? { rpe: s.rpe } : {}),
    }));

  const meals = input.meals
    .filter((m) => m.recipeId && m.status !== 'skipped' && SLOTS.has(m.slot))
    .map((m) => ({
      date: m.date,
      slot: m.slot as 'breakfast' | 'lunch' | 'dinner' | 'snack',
      recipeId: m.recipeId as string,
    }));

  const weights = input.weights
    .filter((w) => w.weightKg != null && w.weightKg >= 20 && w.weightKg <= 400)
    .map((w) => ({ date: w.date, kg: w.weightKg as number }));

  return {
    sessions,
    sets,
    meals,
    weights,
    ...(input.block ? { block: input.block } : {}),
    signals: { neverShow: [...(input.neverShow ?? [])], moreLike: [...(input.moreLike ?? [])] },
  };
}
