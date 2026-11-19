/**
 * nutrition domain (sheet 13): food logs, day intake, water. logic/ is pure and unit-tested;
 * repo.ts is Drizzle. Screens are re-exported by thin routes in app/.
 */
export { dayIntake } from './logic/intake';
export { totalWaterMl, formatWater } from './logic/water';
export { getWaterGoal, setWaterGoal } from './waterGoal';
