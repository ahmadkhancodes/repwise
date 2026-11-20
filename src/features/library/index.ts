/**
 * library domain (sheet 13): components/, hooks/, logic/ (pure, unit-tested), repo.ts (Drizzle).
 * Screens are re-exported by thin routes in app/. Other features may reuse the exports below
 * (exercise media for the player, the body map for the heatmap, exercise lookup).
 */
export {
  BodyFigure,
  BodyHeatmap,
  BodyMap,
  MuscleLegend,
  MuscleThumb,
  type BodyHeat,
  type BodyHeatmapProps,
  type BodyMapProps,
} from './components/BodyMap';
export {
  ExerciseHero,
  ExerciseThumb,
  type ExerciseHeroProps,
  type ExerciseThumbProps,
  type HeroExercise,
} from './components/ExerciseMedia';
export { resolveItem, useCatalogState, useCustomItems } from './hooks/useLibrary';
export {
  BODY_OUTLINE,
  MUSCLE_REGIONS,
  VIEW_H,
  VIEW_W,
  bestView,
  hitTest,
  viewMuscles,
  type BodyView,
} from './logic/bodyMap';
export { bodyPalette, heatColor, heatLegend, type BodyPalette } from './logic/bodyPalette';
export { mixColor } from './logic/color';
export { MUSCLE_LABEL, EQUIPMENT_LABEL, PATTERN_LABEL, LEVEL_LABEL } from './logic/labels';
export { fromCatalog, fromCustom, type LibraryItem } from './logic/libraryItem';
export { exerciseMediaUrls, type MediaUrls } from './logic/media';
export { computeRecords, summariseSessions, type ExerciseRecords } from './logic/records';
export { openExercise } from './screens/LibraryScreen';
