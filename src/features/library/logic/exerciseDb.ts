/**
 * ExerciseDB V1 (licensed, D-EXDB-LICENCE) → LibraryItem, pure and unit-tested.
 *
 * The library shows all ~1,500 V1 exercises (owner, 22 Nov 2026). The ones outside our curated
 * catalogue are BROWSE-ONLY: the planner never sees them, and they cannot be added to a workout.
 * V1 exercises that already back one of our engine exercises are skipped, so the curated version
 * (with our cues, records and alternatives) is the one the user finds.
 *
 * V1 vocab (muscles, equipment) is mapped onto ours; unknown values are dropped, never shown raw.
 */
import type { Equipment, Muscle } from '@repwise/content';

import type { LibraryItem } from './libraryItem';

export type ExerciseDbRaw = {
  exerciseId: string;
  name: string;
  gifUrl: string | null;
  bodyParts: string[];
  equipments: string[];
  targetMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
};

export const EXDB_ITEM_PREFIX = 'exercisedb-';

export const V1_MUSCLE: Readonly<Record<string, readonly Muscle[]>> = {
  abdominals: ['abs'],
  abs: ['abs'],
  core: ['abs'],
  obliques: ['obliques'],
  abductors: ['abductors'],
  adductors: ['adductors'],
  back: ['upper_back'],
  'upper back': ['upper_back'],
  rhomboids: ['upper_back'],
  'latissimus dorsi': ['lats'],
  lats: ['lats'],
  'erector spinae': ['lower_back'],
  biceps: ['biceps'],
  brachialis: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearms'],
  'grip muscles': ['forearms'],
  'wrist extensors': ['forearms'],
  'wrist flexors': ['forearms'],
  wrists: ['forearms'],
  hands: ['forearms'],
  calves: ['calves'],
  soleus: ['calves'],
  deltoids: ['front_delts', 'side_delts'],
  delts: ['front_delts', 'side_delts'],
  'rear deltoids': ['rear_delts'],
  'rotator cuff': ['rear_delts'],
  glutes: ['glutes'],
  hamstrings: ['hamstrings'],
  quadriceps: ['quads'],
  quads: ['quads'],
  'hip flexors': ['hip_flexors'],
  pectorals: ['chest'],
  chest: ['chest'],
  'serratus anterior': ['chest'],
  trapezius: ['traps'],
  traps: ['traps'],
  'levator scapulae': ['traps'],
};

export const V1_EQUIPMENT: Readonly<Record<string, Equipment>> = {
  bodyweight: 'bodyweight',
  assisted: 'machine',
  weighted: 'weight_plate',
  dumbbell: 'dumbbell',
  barbell: 'barbell',
  'olympic barbell': 'barbell',
  'ez bar': 'ez_bar',
  'trap bar': 'trap_bar',
  kettlebell: 'kettlebell',
  cable: 'cable',
  rope: 'cable',
  'leverage machine': 'machine',
  'sled machine': 'sled',
  'smith machine': 'smith_machine',
  'resistance band': 'band',
  band: 'band',
  'stability ball': 'stability_ball',
  'medicine ball': 'medicine_ball',
  'suspension trainer': 'suspension_trainer',
  'ab wheel': 'ab_wheel',
  roller: 'foam_roller',
  'elliptical machine': 'elliptical',
  'stationary bike': 'bike',
  'stepmill machine': 'stair_climber',
  'skierg machine': 'rower',
  'upper body ergometer': 'bike',
};

/** "dumbbell incline fly" → "Dumbbell incline fly"; keeps already-cased names. */
export function sentenceCase(name: string): string {
  const s = name.trim().replace(/\s+/g, ' ');
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** "Step:1 Lie on the bench." → "Lie on the bench." */
export function cleanStep(step: string): string {
  return step.replace(/^\s*step\s*:?\s*\d+\s*[:.)-]?\s*/i, '').trim();
}

function muscles(list: readonly string[]): Muscle[] {
  const out: Muscle[] = [];
  for (const m of list) {
    for (const ours of V1_MUSCLE[m.toLowerCase()] ?? []) if (!out.includes(ours)) out.push(ours);
  }
  return out;
}

/** One V1 record → a browse-only LibraryItem (`mediaId` only when V1 has a GIF). */
export function fromExerciseDb(raw: ExerciseDbRaw): LibraryItem {
  const primary = muscles(raw.targetMuscles);
  const equipment: Equipment[] = [];
  for (const e of raw.equipments) {
    const ours = V1_EQUIPMENT[e.toLowerCase()];
    if (ours && !equipment.includes(ours)) equipment.push(ours);
  }
  return {
    id: `${EXDB_ITEM_PREFIX}${raw.exerciseId}`,
    name: sentenceCase(raw.name),
    aliases: [],
    primaryMuscles: primary,
    secondaryMuscles: muscles(raw.secondaryMuscles).filter((m) => !primary.includes(m)),
    equipment: equipment.length ? equipment : ['bodyweight'],
    patternFamily: null,
    level: null,
    mediaId: raw.gifUrl ? `exercisedb/${raw.exerciseId}` : null,
    instructions: raw.instructions.map(cleanStep).filter(Boolean),
    cues: [],
    commonMistakes: [],
    alternatives: [],
    unilateral: false,
    custom: false,
    browseOnly: true,
  };
}

/**
 * All V1 records not already covered by an engine exercise, as items sorted by name.
 * `covered` = V1 ids used by our map (exercise_media.json values).
 */
export function exerciseDbItems(
  raws: readonly ExerciseDbRaw[],
  covered: ReadonlySet<string>,
): LibraryItem[] {
  const seen = new Set<string>();
  const out: LibraryItem[] = [];
  for (const r of raws) {
    if (covered.has(r.exerciseId) || seen.has(r.exerciseId)) continue;
    seen.add(r.exerciseId);
    out.push(fromExerciseDb(r));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function isExerciseDbItemId(id: string): boolean {
  return id.startsWith(EXDB_ITEM_PREFIX);
}
