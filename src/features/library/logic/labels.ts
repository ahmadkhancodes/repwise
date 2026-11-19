/**
 * Display labels for catalogue enums (@repwise/content). Typed as full Records so a new enum value
 * in the content package fails the type check until it gets a label. Only types are imported, so
 * zod never reaches the bundle.
 */
import type { Equipment, Level, Muscle, PatternFamily } from '@repwise/content';

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  upper_back: 'Upper back',
  lats: 'Lats',
  traps: 'Traps',
  lower_back: 'Lower back',
  abs: 'Abs',
  obliques: 'Obliques',
  hip_flexors: 'Hip flexors',
  glutes: 'Glutes',
  abductors: 'Outer hips',
  adductors: 'Inner thighs',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
};

export const MUSCLES = Object.keys(MUSCLE_LABEL) as Muscle[];

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  bodyweight: 'Bodyweight',
  dumbbell: 'Dumbbell',
  barbell: 'Barbell',
  ez_bar: 'EZ bar',
  trap_bar: 'Trap bar',
  kettlebell: 'Kettlebell',
  cable: 'Cable',
  machine: 'Machine',
  smith_machine: 'Smith machine',
  band: 'Band',
  bench: 'Bench',
  squat_rack: 'Squat rack',
  pull_up_bar: 'Pull-up bar',
  dip_station: 'Dip station',
  landmine: 'Landmine',
  box: 'Box',
  medicine_ball: 'Medicine ball',
  suspension_trainer: 'Suspension trainer',
  ab_wheel: 'Ab wheel',
  stability_ball: 'Stability ball',
  weight_plate: 'Weight plate',
  sled: 'Sled',
  jump_rope: 'Jump rope',
  treadmill: 'Treadmill',
  bike: 'Bike',
  rower: 'Rower',
  elliptical: 'Elliptical',
  stair_climber: 'Stair climber',
  foam_roller: 'Foam roller',
  mat: 'Mat',
};

export const EQUIPMENT = Object.keys(EQUIPMENT_LABEL) as Equipment[];

export const PATTERN_LABEL: Record<PatternFamily, string> = {
  squat: 'Squat',
  hinge: 'Hinge',
  lunge: 'Lunge',
  push_h: 'Horizontal push',
  push_v: 'Vertical push',
  pull_h: 'Horizontal pull',
  pull_v: 'Vertical pull',
  carry: 'Carry',
  core: 'Core',
  isolation: 'Isolation',
  cardio: 'Cardio',
  mobility: 'Mobility',
};

export const PATTERN_FAMILIES = Object.keys(PATTERN_LABEL) as PatternFamily[];

export const LEVEL_LABEL: Record<Level, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const LEVELS = Object.keys(LEVEL_LABEL) as Level[];

/** "Quads, Glutes" — at most `max` names, then "+2". */
export function muscleList(muscles: readonly Muscle[], max = 2): string {
  const names = muscles.map((m) => MUSCLE_LABEL[m]);
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} +${names.length - max}`;
}
