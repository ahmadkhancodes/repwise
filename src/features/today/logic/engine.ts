/**
 * The slice of `@repwise/engine` that Today and the weekly check-in use. All maths stays in the
 * engine; this file only re-exports it (plus two tiny guards for stored strings).
 */
import type { Goal, Sex } from '@repwise/engine';

export {
  addDays,
  bmrMifflin,
  calorieFloor,
  daysBetween,
  epley1RM,
  kgToLb,
  lbToKg,
  localDateFromEpoch,
  stalledSessions,
  startOfWeek,
  weekdayMon0,
  weeklyAdjustment,
  weightTrend,
  type AdjustmentReason,
  type Goal,
  type ISODate,
  type Sex,
  type WeeklyAdjustment,
  type WeeklyAdjustmentInput,
  type WeighIn,
} from '@repwise/engine';

export const GOALS: readonly Goal[] = ['fat_loss', 'muscle_gain', 'recomp', 'maintain'];
export function asGoal(v: string | null | undefined): Goal {
  return (GOALS as readonly string[]).includes(v ?? '') ? (v as Goal) : 'maintain';
}
export function asSex(v: string | null | undefined): Sex | null {
  return v === 'male' || v === 'female' ? v : null;
}
