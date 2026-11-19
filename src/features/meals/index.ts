/**
 * meals domain (sheet 13): components/, hooks/, logic/ (pure, unit-tested), repo.ts (Drizzle),
 * service.ts (offline planner + actions). Screens are re-exported by thin routes in app/.
 *
 * Other slices (Today, notifications, widgets) should use these entry points so a tick always
 * writes the intake log and the week is planned the same way everywhere.
 */
export {
  addWater,
  applySwap,
  ensureWeekMeals,
  logOffPlan,
  markMealEaten,
  rebalanceDay,
  replanFrom,
  setMealOpen,
  swapChoices,
  undoLog,
} from './service';
export { toMealView, useEatDay, useEatWeek, type MealView } from './hooks/useEat';
export { MealTile } from './components/MealTile';
export { MacroRings } from './components/MacroRings';
export { SwapSheet } from './components/SwapSheet';
export { todayISO } from './logic/dates';
