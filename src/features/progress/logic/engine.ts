/**
 * The only door from the progress UI into @repwise/engine (the planner maths). Imported by
 * relative path to the workspace package so only the modules we need (heatmap, 1RM, weight
 * trend, units, dates) are type-checked and bundled — not the planner and its LLM schemas.
 * Never re-implement this maths in the UI.
 */
export {
  muscleHeatmap,
  meanRecovery,
  FATIGUE_SATURATION,
  type Heatmap,
  type MuscleState,
} from '../../../../packages/engine/src/heatmap';
export { epley1RM } from '../../../../packages/engine/src/progression';
export {
  weightTrend,
  kgToLb,
  lbToKg,
  cmToInches,
  KG_PER_LB,
  CM_PER_INCH,
} from '../../../../packages/engine/src/nutrition';
export {
  addDays,
  daysBetween,
  startOfWeek,
  toDayNumber,
  fromDayNumber,
  weekdayMon0,
  isValidISODate,
  type ISODate,
} from '../../../../packages/engine/src/dates';
export {
  MUSCLES,
  type Muscle,
  type Exercise as EngineExercise,
  type SetLog,
} from '../../../../packages/engine/src/schemas';
