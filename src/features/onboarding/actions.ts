/**
 * Onboarding side effects: device context, saving the quiz to the profile row, and completion.
 * The UI calls these; they only touch local SQLite/MMKV (never the network).
 */
import { weekdayMon0 } from '@/features/planner/engine';
import { localToday } from '@/features/planner/planService';
import { getProfile, saveProfile } from '@/features/settings/repo';
import { track } from '@/services/analytics';

import { answersToProfile, type Answers } from './logic/answers';
import { durationSeconds } from './logic/flow';
import { useOnboarding } from './store';

export type DeviceContext = {
  today: string;
  todayWeekday: number;
  twelveHour: boolean;
  locale: string | null;
  timezone: string | null;
};

export function deviceContext(now: number = Date.now()): DeviceContext {
  let locale: string | null = null;
  let timezone: string | null = null;
  let twelveHour = false;
  try {
    const opts = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
    locale = opts.locale ?? null;
    timezone = opts.timeZone ?? null;
    twelveHour = Boolean(opts.hour12);
  } catch {
    // Intl missing: 24-hour clock, no locale
  }
  const today = localToday(now);
  return { today, todayWeekday: weekdayMon0(today), twelveHour, locale, timezone };
}

/** S05 finished: write the profile row (the user's first real data) in SQLite. */
export function saveQuiz(
  answers: Answers,
  ctx: Pick<DeviceContext, 'locale' | 'timezone'> = deviceContext(),
) {
  return saveProfile(answersToProfile(answers, ctx));
}

/** Home reached: stamp the profile, close onboarding and fire `onboarding_complete`. */
export function completeOnboarding(now: number = Date.now()): void {
  const s = useOnboarding.getState();
  saveProfile({ onboardedAt: now });
  s.complete(now);
  track('onboarding_complete', { duration_s: durationSeconds(s.startedAt, now) });
}

/** True once onboarding finished on this phone, or a restored profile says it was done before. */
export function isOnboarded(): boolean {
  if (useOnboarding.getState().phase === 'done') return true;
  try {
    return getProfile()?.onboardedAt != null;
  } catch {
    return false;
  }
}

/** `onboarding_step` (sheet 23): step name + position, no answers. */
export function trackStep(step: string, index: number): void {
  track('onboarding_step', { step, index });
}
