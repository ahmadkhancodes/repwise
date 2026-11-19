/** Shared progress fixtures: a small, hand-checked training + nutrition history (Nov 2026). */
import type { SessionExerciseLike, SessionLike, SetLike } from '../logic/workouts';

export const at = (d: number, h = 18, m = 0, month = 10, year = 2026) =>
  new Date(year, month, d, h, m).getTime();

export const exercises = [
  { id: 'bench', primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts'] },
  { id: 'squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes', 'hip_flexors'] },
  { id: 'curl', primaryMuscles: ['biceps'], secondaryMuscles: [] },
];

type S = SessionLike & { id: string };
const session = (
  id: string,
  date: string,
  status: string,
  start: number | null,
  end: number | null,
  title = 'Push',
): S => ({
  id,
  date,
  title,
  status,
  startedAt: start,
  endedAt: end,
  pausedMs: 0,
});

export const sessions: S[] = [
  session('s1', '2026-11-02', 'done', at(2, 18), at(2, 18, 50)),
  session('s2', '2026-11-05', 'done', at(5, 18), at(5, 19, 0), 'Legs'),
  session('s3', '2026-11-09', 'done', at(9, 18), at(9, 18, 45)),
  session('s4', '2026-11-12', 'skipped', null, null),
  session('s5', '2026-11-16', 'planned', null, null),
];

export const sessionExercises: SessionExerciseLike[] = [
  { id: 'se1', sessionId: 's1', exerciseId: 'bench', position: 0 },
  { id: 'se2', sessionId: 's2', exerciseId: 'bench', position: 0 },
  { id: 'se3', sessionId: 's2', exerciseId: 'squat', position: 1 },
  { id: 'se4', sessionId: 's3', exerciseId: 'bench', position: 0 },
  { id: 'se5', sessionId: 's3', exerciseId: 'squat', position: 1 },
  { id: 'se6', sessionId: 's4', exerciseId: 'curl', position: 0 },
];

let n = 0;
const set = (
  se: string,
  weightKg: number,
  reps: number,
  doneAt: number | null,
  type = 'working',
): SetLike => ({
  id: `x${++n}`,
  sessionExerciseId: se,
  idx: n,
  type,
  weightKg,
  reps,
  doneAt,
});

export const sets: SetLike[] = [
  set('se1', 40, 10, at(2, 18, 5), 'warmup'),
  set('se1', 60, 8, at(2, 18, 10)),
  set('se1', 60, 8, at(2, 18, 15)),
  set('se2', 62.5, 8, at(5, 18, 10)),
  set('se3', 100, 5, at(5, 18, 30)),
  set('se4', 62.5, 10, at(9, 18, 10)),
  set('se5', 100, 5, at(9, 18, 30)),
  set('se6', 20, 10, at(12, 18, 10)), // skipped session: ignored
  set('se5', 120, 5, null), // never ticked: ignored
];
