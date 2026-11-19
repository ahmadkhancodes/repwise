/**
 * Library filters (S18, RW-27): muscle, equipment, pattern and level. Values are OR'ed inside a
 * group and AND'ed across groups. Muscles and equipment are grouped into the names people use in
 * the gym ("Back", "Machine") so the filter sheet stays short.
 */
import type { Equipment, Level, Muscle, PatternFamily } from '@repwise/content';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'core'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'inner_thighs'
  | 'calves';

export const MUSCLE_GROUPS: Record<MuscleGroup, { label: string; muscles: Muscle[] }> = {
  chest: { label: 'Chest', muscles: ['chest'] },
  back: { label: 'Back', muscles: ['upper_back', 'lats', 'traps', 'lower_back'] },
  shoulders: { label: 'Shoulders', muscles: ['front_delts', 'side_delts', 'rear_delts'] },
  biceps: { label: 'Biceps', muscles: ['biceps'] },
  triceps: { label: 'Triceps', muscles: ['triceps'] },
  forearms: { label: 'Forearms', muscles: ['forearms'] },
  core: { label: 'Core', muscles: ['abs', 'obliques', 'hip_flexors'] },
  glutes: { label: 'Glutes', muscles: ['glutes', 'abductors'] },
  quads: { label: 'Quads', muscles: ['quads'] },
  hamstrings: { label: 'Hamstrings', muscles: ['hamstrings'] },
  inner_thighs: { label: 'Inner thighs', muscles: ['adductors'] },
  calves: { label: 'Calves', muscles: ['calves'] },
};

export type EquipmentGroup =
  | 'bodyweight'
  | 'dumbbell'
  | 'barbell'
  | 'kettlebell'
  | 'cable'
  | 'machine'
  | 'band'
  | 'cardio'
  | 'other';

/** Bench and squat rack are accessories: they never decide a group on their own. */
export const EQUIPMENT_GROUPS: Record<EquipmentGroup, { label: string; items: Equipment[] }> = {
  bodyweight: {
    label: 'Bodyweight',
    items: ['bodyweight', 'pull_up_bar', 'dip_station', 'suspension_trainer', 'ab_wheel', 'mat'],
  },
  dumbbell: { label: 'Dumbbell', items: ['dumbbell'] },
  barbell: { label: 'Barbell', items: ['barbell', 'ez_bar', 'trap_bar', 'landmine'] },
  kettlebell: { label: 'Kettlebell', items: ['kettlebell'] },
  cable: { label: 'Cable', items: ['cable'] },
  machine: { label: 'Machine', items: ['machine', 'smith_machine', 'sled'] },
  band: { label: 'Band', items: ['band'] },
  cardio: {
    label: 'Cardio machine',
    items: ['treadmill', 'bike', 'rower', 'elliptical', 'stair_climber', 'jump_rope'],
  },
  other: {
    label: 'Other',
    items: ['weight_plate', 'medicine_ball', 'stability_ball', 'box', 'foam_roller'],
  },
};

export type LibraryFilters = {
  muscles: MuscleGroup[];
  equipment: EquipmentGroup[];
  patterns: PatternFamily[];
  levels: Level[];
};

export const EMPTY_FILTERS: LibraryFilters = {
  muscles: [],
  equipment: [],
  patterns: [],
  levels: [],
};

/** The fields a filter looks at (catalogue exercises and library items both have them). */
export type Filterable = {
  primaryMuscles: readonly Muscle[];
  equipment: readonly Equipment[];
  patternFamily: PatternFamily | null;
  level: Level | null;
};

export function activeFilterCount(f: LibraryFilters): number {
  return f.muscles.length + f.equipment.length + f.patterns.length + f.levels.length;
}

export function hasFilters(f: LibraryFilters): boolean {
  return activeFilterCount(f) > 0;
}

/** Add or remove one value (immutable). */
export function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Groups an exercise uses; accessory-only kit (a bench) counts as bodyweight. */
export function equipmentGroupsOf(equipment: readonly Equipment[]): EquipmentGroup[] {
  const groups = (Object.keys(EQUIPMENT_GROUPS) as EquipmentGroup[]).filter((g) =>
    EQUIPMENT_GROUPS[g].items.some((i) => equipment.includes(i)),
  );
  return groups.length ? groups : ['bodyweight'];
}

export function matchesFilters(ex: Filterable, f: LibraryFilters): boolean {
  if (
    f.muscles.length &&
    !f.muscles.some((g) => MUSCLE_GROUPS[g].muscles.some((m) => ex.primaryMuscles.includes(m)))
  ) {
    return false;
  }
  if (f.equipment.length) {
    const groups = equipmentGroupsOf(ex.equipment);
    if (!f.equipment.some((g) => groups.includes(g))) return false;
  }
  if (f.patterns.length && (!ex.patternFamily || !f.patterns.includes(ex.patternFamily))) {
    return false;
  }
  if (f.levels.length && (!ex.level || !f.levels.includes(ex.level))) return false;
  return true;
}

/** Removable chips for the active filters, in sheet order. */
export function activeFilterChips(
  f: LibraryFilters,
  labels: { pattern: Record<PatternFamily, string>; level: Record<Level, string> },
): { key: string; label: string; remove: (f: LibraryFilters) => LibraryFilters }[] {
  return [
    ...f.muscles.map((m) => ({
      key: `m:${m}`,
      label: MUSCLE_GROUPS[m].label,
      remove: (x: LibraryFilters) => ({ ...x, muscles: x.muscles.filter((v) => v !== m) }),
    })),
    ...f.equipment.map((e) => ({
      key: `e:${e}`,
      label: EQUIPMENT_GROUPS[e].label,
      remove: (x: LibraryFilters) => ({ ...x, equipment: x.equipment.filter((v) => v !== e) }),
    })),
    ...f.patterns.map((p) => ({
      key: `p:${p}`,
      label: labels.pattern[p],
      remove: (x: LibraryFilters) => ({ ...x, patterns: x.patterns.filter((v) => v !== p) }),
    })),
    ...f.levels.map((l) => ({
      key: `l:${l}`,
      label: labels.level[l],
      remove: (x: LibraryFilters) => ({ ...x, levels: x.levels.filter((v) => v !== l) }),
    })),
  ];
}
