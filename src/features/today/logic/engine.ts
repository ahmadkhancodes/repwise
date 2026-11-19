/**
 * The slice of `@repwise/engine` that Today and the weekly check-in use. All maths stays in the
 * engine; this file only re-exports it.
 *
 * `dates` has no imports, so it is imported with its own types. `nutrition` and `progression`
 * import types from the engine's zod schemas, which are written for zod 3 while the app resolves
 * zod 4, so `tsc` would fail on the engine's schemas file. Those two modules are therefore loaded
 * at runtime (their runtime imports never touch zod, so zod stays out of the bundle, see D31) and
 * typed here with the engine's own signatures. Switch to plain imports once the engine compiles
 * against zod 4.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { ISODate } from '@repwise/engine/src/dates';

export {
  addDays,
  daysBetween,
  localDateFromEpoch,
  startOfWeek,
  weekdayMon0,
  type ISODate,
} from '@repwise/engine/src/dates';

export type Goal = 'fat_loss' | 'muscle_gain' | 'recomp' | 'maintain';
export type Sex = 'male' | 'female';
export type WeighIn = { date: ISODate; kg: number };
export type AdjustmentReason =
  | 'insufficient_data'
  | 'on_track'
  | 'slower_than_expected'
  | 'faster_than_expected'
  | 'floor';

export type WeeklyAdjustmentInput = {
  weights: WeighIn[];
  goal: Goal;
  onDate: ISODate;
  currentKcal: number;
  floor: number;
  expectedKgPerWeek?: number;
  minWeighIns?: number;
};

export type WeeklyAdjustment = {
  deltaKcal: number;
  newKcal: number;
  reason: AdjustmentReason;
  trendKgPerWeek: number | null;
  expectedKgPerWeek: number;
};

type NutritionModule = {
  weeklyAdjustment(input: WeeklyAdjustmentInput): WeeklyAdjustment;
  weightTrend(weights: WeighIn[]): { date: ISODate; avgKg: number }[];
  bmrMifflin(input: { sex: Sex; weightKg: number; heightCm: number; age: number }): number;
  calorieFloor(bmr: number, sex: Sex): number;
  kgToLb(kg: number): number;
  lbToKg(lb: number): number;
};

type ProgressionModule = {
  epley1RM(weight: number, reps: number): number;
  stalledSessions(bestE1rmPerSession: number[]): number;
};

const nutrition = require('@repwise/engine/src/nutrition') as NutritionModule;
const progression = require('@repwise/engine/src/progression') as ProgressionModule;

export const weeklyAdjustment = nutrition.weeklyAdjustment;
export const weightTrend = nutrition.weightTrend;
export const bmrMifflin = nutrition.bmrMifflin;
export const calorieFloor = nutrition.calorieFloor;
export const kgToLb = nutrition.kgToLb;
export const lbToKg = nutrition.lbToKg;
export const epley1RM = progression.epley1RM;
export const stalledSessions = progression.stalledSessions;

export const GOALS: readonly Goal[] = ['fat_loss', 'muscle_gain', 'recomp', 'maintain'];
export function asGoal(v: string | null | undefined): Goal {
  return (GOALS as readonly string[]).includes(v ?? '') ? (v as Goal) : 'maintain';
}
export function asSex(v: string | null | undefined): Sex | null {
  return v === 'male' || v === 'female' ? v : null;
}
