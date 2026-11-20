/**
 * Zod-free enum value lists. The app imports these (and `toEngine`, `media`) without evaluating zod
 * or the 1 MB catalogue JSON (perf audit r2 N1): keep this module free of runtime imports.
 */
export type PatternFamilyValue = (typeof PATTERN_FAMILIES)[number];

/** EU FIC Annex II — the 14 major allergens. */
export const ALLERGENS = [
  'celery',
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'lupin',
  'milk',
  'molluscs',
  'mustard',
  'nuts',
  'peanuts',
  'sesame',
  'soybeans',
  'sulphites',
] as const;

/** Coarse movement family — the values used in build bible sheet 29. */
export const PATTERN_FAMILIES = [
  'squat',
  'hinge',
  'lunge',
  'push_h',
  'push_v',
  'pull_h',
  'pull_v',
  'carry',
  'core',
  'isolation',
  'cardio',
  'mobility',
] as const;

/**
 * Rotation group used by the planner's uniqueness rules (sheet 28):
 * every pattern holds 6–20 interchangeable variants.
 */
export const PATTERNS = {
  squat: 'squat',
  hinge: 'hinge',
  lunge: 'lunge',
  push_h: 'push_h',
  push_v: 'push_v',
  pull_h: 'pull_h',
  pull_v: 'pull_v',
  carry: 'carry',
  core_anti_extension: 'core',
  core_anti_rotation: 'core',
  core_flexion: 'core',
  isolation_chest: 'isolation',
  isolation_shoulders: 'isolation',
  isolation_biceps: 'isolation',
  isolation_triceps: 'isolation',
  isolation_back: 'isolation',
  isolation_quads: 'isolation',
  isolation_hamstrings: 'isolation',
  isolation_glutes: 'isolation',
  isolation_calves: 'isolation',
  isolation_forearms: 'isolation',
  cardio: 'cardio',
  mobility: 'mobility',
} as const satisfies Record<string, PatternFamilyValue>;

/** Fixed muscle list (drives the recovery heatmap). */
export const MUSCLES = [
  'chest',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
  'upper_back',
  'lats',
  'traps',
  'lower_back',
  'abs',
  'obliques',
  'hip_flexors',
  'glutes',
  'abductors',
  'adductors',
  'quads',
  'hamstrings',
  'calves',
] as const;

export const EQUIPMENT = [
  'bodyweight',
  'dumbbell',
  'barbell',
  'ez_bar',
  'trap_bar',
  'kettlebell',
  'cable',
  'machine',
  'smith_machine',
  'band',
  'bench',
  'squat_rack',
  'pull_up_bar',
  'dip_station',
  'landmine',
  'box',
  'medicine_ball',
  'suspension_trainer',
  'ab_wheel',
  'stability_ball',
  'weight_plate',
  'sled',
  'jump_rope',
  'treadmill',
  'bike',
  'rower',
  'elliptical',
  'stair_climber',
  'foam_roller',
  'mat',
] as const;

export const CUISINES = [
  'american',
  'british',
  'mediterranean',
  'italian',
  'middle_eastern',
  'gulf',
  'north_african',
  'pakistani',
  'indian',
  'east_asian',
  'southeast_asian',
  'mexican',
  'global',
] as const;

export const DIET_TAGS = [
  'vegetarian',
  'vegan',
  'pescatarian',
  'halal_friendly',
  'high_protein',
  'low_carb',
  'gluten_free',
  'dairy_free',
] as const;
