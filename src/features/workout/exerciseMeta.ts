import type { Equipment, Muscle } from '@repwise/content';

import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '@/features/library/logic/labels';
import type { HeroExercise } from '@/features/library/logic/hero';
import { customExercisesRepo } from '@/features/library/repo';
import type { Catalog } from '@/services/catalog';

import { isCardioPattern } from './logic/cardio';

export type ExerciseMeta = {
  id: string;
  name: string;
  pattern: string | undefined;
  equipment: string[];
  /** Display labels, title case ("Front delts"), from the library's MUSCLE_LABEL. */
  primaryMuscles: string[];
  cues: string[];
  cardio: boolean;
  /** Cloudinary media id for the demo (ExerciseHero), null when none. */
  mediaId: string | null;
  /** Muscle ids etc. for the library thumb / muscle map; null when unknown. */
  hero: HeroExercise | null;
};

const pretty = (s: string) => {
  const words = s.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** "front_delts" → "Front delts" (library labels; readable fallback for unknown ids). Pure. */
export function muscleLabel(id: string): string {
  return MUSCLE_LABEL[id as Muscle] ?? pretty(id);
}

/** "ez_bar" → "EZ bar" (library labels; readable fallback for unknown ids). Pure. */
export function equipmentLabel(id: string): string {
  return EQUIPMENT_LABEL[id as Equipment] ?? pretty(id);
}

/** Catalogue exercise, else a user-created one, else a readable fallback (never throws). */
export function exerciseMeta(id: string, catalog: Catalog | null): ExerciseMeta {
  const c = catalog?.exerciseById.get(id);
  if (c) {
    return {
      id,
      name: c.name,
      pattern: c.pattern,
      equipment: c.equipment,
      primaryMuscles: c.primaryMuscles.map(muscleLabel),
      cues: c.cues,
      cardio: isCardioPattern(c.pattern),
      mediaId: c.mediaId ?? null,
      hero: c,
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
      primaryMuscles: (custom.primaryMuscles ?? []).map(muscleLabel),
      cues: custom.tips ?? [],
      cardio: isCardioPattern(custom.pattern ?? undefined),
      mediaId: null,
      hero: {
        primaryMuscles: (custom.primaryMuscles ?? []) as Muscle[],
        secondaryMuscles: [],
      },
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
    hero: null,
  };
}
