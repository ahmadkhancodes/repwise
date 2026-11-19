/**
 * Seam to the planner service (engine + Worker, built by the planner/onboarding slice). Today and
 * the weekly check-in call it; until a planner registers, the hooks degrade gracefully:
 * - no week regeneration → the check-in result is saved (see `latestCheckin`) and the planner
 *   applies it the next time it builds a week.
 *
 * TODO(planner): call `registerPlanner({...})` from the planner service at start-up.
 */
import type { VolumeStep } from '@/features/assistant/logic/checkin';

export type RegenerateInput = {
  /** Monday of the week to (re)build, 'YYYY-MM-DD'. */
  weekStart: string;
  /** Weekly check-in delta (engine `weeklyAdjustment`), applied to goal kcal. */
  adjustmentKcal: number;
  volume: VolumeStep;
};

export type Planner = {
  /** Rebuild a week with the check-in's adjustments (engine `planWeek` + Worker variety). */
  regenerateWeek?: (input: RegenerateInput) => Promise<void>;
  /** Ask for a lighter week next (assistant card C4). */
  requestDeload?: () => Promise<void>;
};

let planner: Planner = {};

export function registerPlanner(p: Planner): void {
  planner = p;
}

export function getPlanner(): Planner {
  return planner;
}

/** Tests only. */
export function resetPlannerForTests(): void {
  planner = {};
}
