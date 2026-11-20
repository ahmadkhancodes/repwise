import type { Catalog } from '@/services/catalog';
import { customExercisesRepo } from '@/features/library/repo';

import { isCardioPattern } from './logic/cardio';

export type ExerciseMeta = {
  id: string;
  name: string;
  pattern: string | undefined;
  equipment: string[];
  primaryMuscles: string[];
  cues: string[];
  cardio: boolean;
  /** Cloudinary media id for the demo (ExerciseHero), null when none. */
  mediaId: string | null;
};

const pretty = (s: string) => s.replace(/_/g, ' ');

/** Catalogue exercise, else a user-created one, else a readable fallback (never throws). */
export function exerciseMeta(id: string, catalog: Catalog | null): ExerciseMeta {
  const c = catalog?.exerciseById.get(id);
  if (c) {
    return {
      id,
      name: c.name,
      pattern: c.pattern,
      equipment: c.equipment,
      primaryMuscles: c.primaryMuscles.map(pretty),
      cues: c.cues,
      cardio: isCardioPattern(c.pattern),
      mediaId: c.mediaId ?? null,
    };
  }
  let custom: ReturnType<typeof customExercisesRepo.get>;
  try {
    custom = customExercisesRepo.get(id);
  } catch {
    custom = undefined;
  }
  if (custom) {
    return {
      id,
      name: custom.name,
      pattern: custom.pattern ?? undefined,
      equipment: custom.equipment ?? [],
      primaryMuscles: (custom.primaryMuscles ?? []).map(pretty),
      cues: custom.tips ?? [],
      cardio: isCardioPattern(custom.pattern ?? undefined),
      mediaId: null,
    };
  }
  const name = id.replace(/[-_]+/g, ' ').replace(/^\w/, (m) => m.toUpperCase());
  return {
    id,
    name,
    pattern: undefined,
    equipment: [],
    primaryMuscles: [],
    cues: [],
    cardio: false,
    mediaId: null,
  };
}
