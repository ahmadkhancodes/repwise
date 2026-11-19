/**
 * Seam to the planner service (engine + Worker, built by the planner/onboarding slice). Today and
 * the weekly check-in call it. The planner registers itself at start-up
 * (`registerPlannerBridge()` in src/features/planner/bridge.ts, called from services/bootstrap);
 * until then the hooks degrade gracefully: the check-in result is saved (see `latestCheckin`).
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
