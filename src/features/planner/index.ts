/**
 * planner domain (sheet 13): components/, hooks/, logic/ (pure, unit-tested), repo.ts (Drizzle).
 * Screens are re-exported by thin routes in app/.
 */
export {
  applyExerciseSwap,
  applyMealSwap,
  ensureWeekPlanned,
  generateInitialPlan,
  localToday,
  planToday,
  regenerateWeek,
  swapExerciseOptions,
  swapMealOptions,
  type PlanResult,
  type TodayPlan,
} from './planService';
