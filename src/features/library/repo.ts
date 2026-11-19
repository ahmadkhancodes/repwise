import { asc } from 'drizzle-orm';

import { createRepo, type Row } from '@/db/repo';
import { exercises, routines } from '@/db/schema';

/** User-created exercises (the catalogue is @repwise/content via src/services/catalog.ts). */
export const customExercisesRepo = createRepo(exercises, 'exercises');
export const routinesRepo = createRepo(routines, 'routines');
export type CustomExercise = Row<typeof exercises>;
export type Routine = Row<typeof routines>;

export function useCustomExercises(): CustomExercise[] {
  return customExercisesRepo.useLive(undefined, asc(exercises.name)).data;
}

export function useRoutines(): Routine[] {
  return routinesRepo.useLive(undefined, asc(routines.name)).data;
}
