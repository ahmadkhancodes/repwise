/**
 * Custom exercises (RW-28): form draft ↔ `exercises` table row, and validation.
 */
import type { Equipment, Level, Muscle, PatternFamily } from '@repwise/content';

import { difficultyFromLevel, fromCustom, type CustomExerciseRow } from './libraryItem';

export type CustomExerciseDraft = {
  name: string;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  equipment: Equipment[];
  patternFamily: PatternFamily | null;
  level: Level | null;
  /** One step per line. */
  steps: string;
  /** One tip per line. */
  tips: string;
};

export const NAME_MAX = 60;
export const LINES_MAX = 8;
export const LINE_MAX = 200;

export const EMPTY_DRAFT: CustomExerciseDraft = {
  name: '',
  primaryMuscles: [],
  secondaryMuscles: [],
  equipment: [],
  patternFamily: null,
  level: 'beginner',
  steps: '',
  tips: '',
};

export type DraftErrors = Partial<
  Record<'name' | 'primaryMuscles' | 'equipment' | 'steps', string>
>;

export function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export function validateDraft(
  d: CustomExerciseDraft,
  /** Names of the user's other custom exercises (exclude the one being edited). */
  takenNames: readonly string[] = [],
): DraftErrors {
  const e: DraftErrors = {};
  const name = d.name.trim();
  if (!name) e.name = 'Give it a name.';
  else if (name.length > NAME_MAX) e.name = `Keep it under ${NAME_MAX} characters.`;
  else if (takenNames.some((n) => n.trim().toLowerCase() === name.toLowerCase())) {
    e.name = 'You already have an exercise with this name.';
  }
  if (!d.primaryMuscles.length) e.primaryMuscles = 'Pick at least one main muscle.';
  if (!d.equipment.length) e.equipment = 'Pick the equipment, or Bodyweight.';
  const steps = lines(d.steps);
  if (steps.length > LINES_MAX || steps.some((l) => l.length > LINE_MAX)) {
    e.steps = `Up to ${LINES_MAX} short steps.`;
  }
  return e;
}

export function isValid(errors: DraftErrors): boolean {
  return Object.keys(errors).length === 0;
}

/** Values for the repo insert/update (common columns are stamped by the repo). */
export function draftToRow(d: CustomExerciseDraft) {
  const primary = [...new Set(d.primaryMuscles)];
  return {
    name: d.name.trim(),
    primaryMuscles: primary,
    secondary: [...new Set(d.secondaryMuscles)].filter((m) => !primary.includes(m)),
    equipment: [...new Set(d.equipment)],
    pattern: d.patternFamily,
    difficulty: difficultyFromLevel(d.level),
    steps: lines(d.steps).slice(0, LINES_MAX),
    tips: lines(d.tips).slice(0, LINES_MAX),
    source: 'user',
    licence: null,
    isCustom: true,
  };
}

export function rowToDraft(row: CustomExerciseRow): CustomExerciseDraft {
  const item = fromCustom(row);
  return {
    name: item.name,
    primaryMuscles: item.primaryMuscles,
    secondaryMuscles: item.secondaryMuscles,
    equipment: item.equipment,
    patternFamily: item.patternFamily,
    level: item.level,
    steps: item.instructions.join('\n'),
    tips: item.cues.join('\n'),
  };
}
