/**
 * today domain (S11): the home screen and the core loop. Pure logic in logic/, the local
 * snapshot + core writes in repo.ts, the planner seam in plannerBridge.ts.
 */
export { TodayScreen } from './screens/TodayScreen';
export { registerPlanner, getPlanner, type Planner, type SwapOption, type RegenerateInput } from './plannerBridge';
