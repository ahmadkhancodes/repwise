/**
 * The one boundary between the workout UI and @repwise/engine (all training maths lives there;
 * the UI never re-implements it). Only zod-free engine modules are imported eagerly; the planner
 * (which parses with zod) is required lazily by logic/swap.ts.
 *
 * Imported by relative path (not the package name) so the app type-checks and bundles the engine
 * from this checkout; see docs/DECISIONS.md (workout).
 */
export {
  DEFAULT_BAR,
  DEFAULT_PLATES,
  LOAD_INCREMENTS,
  brzycki1RM,
  doubleProgression,
  epley1RM,
  percentTable,
  platesPerSide,
  roundToIncrement,
  type PerformedSet,
  type PlateResult,
  type Prescription,
  type WeightUnit,
} from '../../../../packages/engine/src/progression';
export { DEFAULT_MET, metKcal } from '../../../../packages/engine/src/met';
export {
  addDays,
  daysBetween,
  localDateFromEpoch,
  startOfWeek,
  weekDates,
  weekdayMon0,
} from '../../../../packages/engine/src/dates';
export { kgToLb, lbToKg } from '../../../../packages/engine/src/nutrition';
