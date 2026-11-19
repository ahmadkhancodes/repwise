/**
 * Projected goal date for the plan reveal ("72 kg by 14 Mar"). Pure; uses the engine's expected
 * weekly rate (fat loss −0.5 %/wk, gain +0.25 %/wk of body weight). Returns null when there is no
 * target, the target is the wrong way for the goal, or the goal has no expected change.
 */
import { EXPECTED_WEEKLY_RATE, addDays, type Goal } from '../engine';

export const MAX_GOAL_WEEKS = 104;

export function projectGoalDate(input: {
  goal: Goal;
  weightKg: number;
  targetKg: number | null | undefined;
  today: string;
}): { date: string; weeks: number } | null {
  const { goal, weightKg, targetKg, today } = input;
  if (targetKg == null || !Number.isFinite(targetKg) || weightKg <= 0) return null;
  const rate = EXPECTED_WEEKLY_RATE[goal];
  if (!rate) return null;
  const delta = targetKg - weightKg;
  if (delta === 0 || Math.sign(delta) !== Math.sign(rate)) return null;
  const weeks = Math.ceil(Math.abs(delta) / Math.abs(rate * weightKg));
  if (weeks > MAX_GOAL_WEEKS) return null;
  return { date: addDays(today, weeks * 7), weeks };
}
