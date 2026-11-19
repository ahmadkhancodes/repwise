import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { setRowOwner } from '@/db/owner';
import {
  createSession,
  exercisesForSession,
  finishWorkout,
  setDone,
  setsFor,
  startWorkout,
  type Session,
} from '@/features/workout/repo';
import { localDate } from '@/features/workout/logic/dates';
import { getCatalog } from '@/services/catalog';

export async function freshDb(): Promise<void> {
  resetDbForTests();
  setRowOwner(null);
  await migrateDb();
  getCatalog(); // load the content catalogue synchronously (it is lazy in the app)
}

export const TODAY = () => localDate();

/** A planned session for today: back squat (3 × 5 @ 100 kg) + bench press (3 × 8-12). */
export function plannedSession(date = TODAY(), title = 'Push day'): Session {
  return createSession({
    date,
    title,
    exercises: [
      { exerciseId: 'barbell-back-squat', targetSets: 3, targetReps: '5', targetLoad: 100, restS: 120 },
      { exerciseId: 'barbell-bench-press', targetSets: 3, targetReps: '8-12', targetLoad: null, restS: 90 },
    ],
  });
}

/** A finished bench session in the past (for "Previous" and PR history). */
export function finishedBench(date: string, weightKg: number, reps: number, now: number): Session {
  const s = createSession(
    { date, title: 'Old bench', exercises: [{ exerciseId: 'barbell-bench-press', targetSets: 2, targetReps: '8-12' }] },
    now,
  );
  startWorkout(s.id, () => false, now);
  for (const st of setsFor(exercisesForSession(s.id)[0]!.id)) setDone(st.id, true, { weightKg, reps }, now + 1);
  finishWorkout(s.id, now + 60 * 60_000);
  return s;
}
