/**
 * @repwise/engine — deterministic planner engine (pure TypeScript; no React, Expo or network).
 * Runs on the device (offline planner) and in the Cloudflare Worker.
 */
export * from './schemas';
export * from './dates';
export * from './random';
export * from './nutrition';
export * from './met';
export * from './progression';
export * from './split';
export * from './heatmap';
export * from './candidates';
export * from './portion';
export {
  NO_REPEAT_DEFAULT,
  NO_REPEAT_MAX,
  NO_REPEAT_MIN,
  FINGERPRINT_WINDOW,
  blockedRecipes,
  clampNoRepeatDays,
  consecutiveRepeats,
  countsAsProteinSource,
  exerciseWeight,
  fingerprintIsFresh,
  isStaple,
  lastVariantsByPattern,
  likedTraits,
  proteinShare,
  recipeWeight,
  sessionFingerprint,
  sharedIngredientCount,
  type ExerciseWeightContext,
  type RecipeWeightContext,
  type SessionVariantRecord,
} from './variety';
export * from './context';
export * from './validate';
export * from './planner';
export * from './types';
