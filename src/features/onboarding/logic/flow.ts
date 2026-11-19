/**
 * Onboarding flow (F1): welcome → quiz → notification primer → plan reveal → (paywall) → Home.
 * Pure helpers for resuming after the app was killed.
 */
import { isStepId, visibleSteps, type StepId } from './steps';
import type { Answers } from './answers';

export type Phase = 'welcome' | 'quiz' | 'notify' | 'plan' | 'done';

export type FlowState = {
  phase: Phase;
  step: StepId | null;
  answers: Pick<Answers, 'goal'>;
};

/** Where a (re)launch should land. */
export function resumeHref(s: FlowState): string {
  switch (s.phase) {
    case 'done':
      return '/today';
    case 'notify':
      return '/notify';
    case 'plan':
      return '/plan';
    case 'quiz': {
      const step =
        s.step && visibleSteps(s.answers).includes(s.step) ? s.step : visibleSteps(s.answers)[0]!;
      return `/q/${step}`;
    }
    default:
      return '/welcome';
  }
}

/** Route param → step id (unknown values fall back to the first step). */
export function stepFromParam(param: unknown): StepId {
  const v = Array.isArray(param) ? param[0] : param;
  return isStepId(v) ? v : 'goal';
}

export function durationSeconds(startedAt: number | null, now: number): number {
  return startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
}
