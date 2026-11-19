/**
 * Quiz steps (S03 goal & body, S04 training, S05 food): order, visibility, defaults and validation.
 * Pure: every function takes the answers (and "today") and returns data.
 */
import { spreadWeekdays } from '@/features/planner/logic/profile';

import { bodyDefaults, presetFor, type Answers } from './answers';
import { defaultMealTimes } from './mealTimes';

export const STEP_IDS = [
  'goal',
  'about',
  'body',
  'target',
  'experience',
  'days',
  'length',
  'equipment',
  'injuries',
  'activity',
  'diet',
  'avoid',
  'cuisines',
  'kitchen',
  'meals',
] as const;
export type StepId = (typeof STEP_IDS)[number];

export function isStepId(v: unknown): v is StepId {
  return typeof v === 'string' && (STEP_IDS as readonly string[]).includes(v);
}

/** Single-choice tile steps advance on tap (fewer taps; quiz under 3 min). */
export const AUTO_ADVANCE: ReadonlySet<StepId> = new Set([
  'goal',
  'experience',
  'length',
  'activity',
  'diet',
]);

/** Steps the user may skip with sensible defaults (F1 edge case). */
export const OPTIONAL: ReadonlySet<StepId> = new Set(['target', 'injuries', 'avoid', 'cuisines']);

export const MIN_AGE = 13;
export const MAX_AGE = 90;
export const HEIGHT_CM = { min: 130, max: 220 } as const;
export const WEIGHT_KG = { min: 35, max: 250 } as const;
export const SESSION_LENGTHS = [30, 45, 60, 75, 90] as const;
export const COOK_TIMES = [10, 20, 30, 45, 60] as const;

/** Target weight only matters when the goal changes weight. */
export function visibleSteps(a: Pick<Answers, 'goal'>): StepId[] {
  const hideTarget = a.goal === 'maintain' || a.goal === 'recomp';
  return STEP_IDS.filter((s) => !(s === 'target' && hideTarget));
}

export function stepIndex(step: StepId, a: Pick<Answers, 'goal'>): number {
  return visibleSteps(a).indexOf(step);
}

export function nextStep(step: StepId, a: Pick<Answers, 'goal'>): StepId | null {
  const list = visibleSteps(a);
  const i = list.indexOf(step);
  return i >= 0 && i < list.length - 1 ? list[i + 1]! : null;
}

export function prevStep(step: StepId, a: Pick<Answers, 'goal'>): StepId | null {
  const list = visibleSteps(a);
  const i = list.indexOf(step);
  return i > 0 ? list[i - 1]! : null;
}

/** 0..1 progress for the bar: share of visible steps completed when `step` is on screen. */
export function progressFor(step: StepId, a: Pick<Answers, 'goal'>): number {
  const list = visibleSteps(a);
  const i = list.indexOf(step);
  return i < 0 ? 0 : (i + 1) / list.length;
}

function yearOf(today: string): number {
  return Number(today.slice(0, 4));
}

/**
 * Defaults applied when a step opens so every control starts on a real value (wheels never start
 * empty). Only fills what is missing; never overwrites an answer.
 */
export function withStepDefaults(
  step: StepId,
  a: Answers,
  today: string,
  todayWeekday: number,
): Answers {
  switch (step) {
    case 'about':
      return a.birthYear ? a : { ...a, birthYear: yearOf(today) - 30 };
    case 'body': {
      const d = bodyDefaults(a.sex);
      return { ...a, heightCm: a.heightCm ?? d.heightCm, weightKg: a.weightKg ?? d.weightKg };
    }
    case 'days': {
      const days = a.daysPerWeek ?? 3;
      const weekdays =
        a.trainingWeekdays.length === days
          ? a.trainingWeekdays
          : spreadWeekdays(days, todayWeekday);
      return { ...a, daysPerWeek: days, trainingWeekdays: weekdays };
    }
    case 'equipment':
      return a.location ? a : { ...a, location: 'gym', equipment: presetFor('gym') };
    case 'kitchen':
      return { ...a, budget: a.budget ?? 2, cookMin: a.cookMin ?? 30 };
    case 'meals': {
      const n = a.mealsPerDay ?? 3;
      return {
        ...a,
        mealsPerDay: n,
        mealTimes: a.mealTimes.length === n ? a.mealTimes : defaultMealTimes(n),
      };
    }
    default:
      return a;
  }
}

/** Readable reason the step can't continue, or null when it can. */
export function validateStep(step: StepId, a: Answers, today: string): string | null {
  switch (step) {
    case 'goal':
      return a.goal ? null : 'Choose a goal to continue.';
    case 'about': {
      if (!a.sex) return 'Choose the option that fits you best.';
      if (!a.birthYear) return 'Pick your year of birth.';
      const age = yearOf(today) - a.birthYear;
      if (age < MIN_AGE || age > MAX_AGE) return `Repwise is for ages ${MIN_AGE} to ${MAX_AGE}.`;
      return null;
    }
    case 'body':
      if (a.heightCm == null || a.heightCm < HEIGHT_CM.min || a.heightCm > HEIGHT_CM.max) {
        return 'Pick your height.';
      }
      if (a.weightKg == null || a.weightKg < WEIGHT_KG.min || a.weightKg > WEIGHT_KG.max) {
        return 'Pick your weight.';
      }
      return null;
    case 'target': {
      if (a.targetKg == null) return null; // optional
      if (a.targetKg < WEIGHT_KG.min || a.targetKg > WEIGHT_KG.max) return 'Pick a target weight.';
      if (a.weightKg != null && a.goal === 'fat_loss' && a.targetKg >= a.weightKg) {
        return 'For fat loss, pick a target below your current weight.';
      }
      if (a.weightKg != null && a.goal === 'muscle_gain' && a.targetKg <= a.weightKg) {
        return 'To build muscle, pick a target above your current weight.';
      }
      return null;
    }
    case 'experience':
      return a.experience ? null : 'Choose your experience.';
    case 'days':
      if (!a.daysPerWeek || a.daysPerWeek < 2 || a.daysPerWeek > 6)
        return 'Train 2 to 6 days a week.';
      if (a.trainingWeekdays.length !== a.daysPerWeek) {
        return `Pick ${a.daysPerWeek} days (${a.trainingWeekdays.length} selected).`;
      }
      return null;
    case 'length':
      return a.sessionMin ? null : 'Choose a session length.';
    case 'equipment':
      if (!a.location) return 'Choose where you train.';
      return a.equipment.length ? null : 'Pick at least one piece of equipment.';
    case 'activity':
      return a.lifestyle ? null : 'Choose how active your days are.';
    case 'diet':
      return a.dietType ? null : 'Choose how you eat.';
    case 'kitchen':
      return a.budget && a.cookMin ? null : 'Choose a budget and cooking time.';
    case 'meals':
      return a.mealsPerDay && a.mealTimes.length === a.mealsPerDay
        ? null
        : 'Choose your meals per day.';
    case 'injuries':
    case 'avoid':
    case 'cuisines':
      return null;
  }
}

/** First visible step that is not valid yet (resume target), or null when the quiz is complete. */
export function firstIncomplete(a: Answers, today: string): StepId | null {
  return visibleSteps(a).find((s) => validateStep(s, a, today) !== null) ?? null;
}
