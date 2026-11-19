/**
 * library domain (sheet 13): components/, hooks/, logic/ (pure, unit-tested), repo.ts (Drizzle).
 * Screens are re-exported by thin routes in app/. Other features may reuse the exports below
 * (exercise media for the player, the body map for the heatmap, exercise lookup).
 */
export { BodyMap, type BodyMapProps } from './components/BodyMap';
export { ExerciseHero, ExerciseThumb } from './components/ExerciseMedia';
export { resolveItem, useCatalogState, useCustomItems } from './hooks/useLibrary';
export { BODY_OUTLINE, MUSCLE_REGIONS, VIEW_H, VIEW_W, type BodyView } from './logic/bodyMap';
export { MUSCLE_LABEL, EQUIPMENT_LABEL, PATTERN_LABEL, LEVEL_LABEL } from './logic/labels';
export { fromCatalog, fromCustom, type LibraryItem } from './logic/libraryItem';
export { exerciseMediaUrls, type MediaUrls } from './logic/media';
export { computeRecords, summariseSessions, type ExerciseRecords } from './logic/records';
export { openExercise } from './screens/LibraryScreen';
