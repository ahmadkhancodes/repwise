/**
 * The whole local notification schedule, rebuilt from DB state (bible P-N1, sheet 17). PURE:
 * no device clock, no time zone of the test machine — everything comes from `ScheduleInput`.
 *
 * Every reminder is a one-off date trigger for the next `days` days. Rebuilding is cheap and
 * idempotent: the caller diffs by `key` + `hash` (see diff.ts) and only touches what changed.
 */
import { DEFAULT_QUIET_HOURS, trialReminderAt } from '@/features/billing/logic/trialReminder';

import { mealTitle, copy, slotLabel } from './copy';
import { FREE_KINDS, resolveMealTimes, type MealSlot, type NotificationPrefs } from './prefs';
import { addDays, localDateOf, parseHm, weekdayOf, zonedTimeToUtc, type LocalDate } from './zonedTime';

export type NotificationKind = 'brief' | 'meal' | 'workout' | 'fuel' | 'evening' | 'checkin' | 'trial';

/** Android channels (sheet 17). `timer` and the ongoing rest timer live in restTimer.ts. */
export type ChannelId = 'brief' | 'meals' | 'training' | 'timer' | 'timer-silent' | 'checkin' | 'account';

/** Notification categories = the action-button sets (registered in services/notifications.ts). */
export type CategoryId = 'meal' | 'workout' | 'checkin' | 'trial' | 'open';

export type NotificationData = {
  kind: NotificationKind | 'snooze' | 'rest';
  /** In-app route the tap opens. */
  url: string;
  mealId?: string;
  sessionId?: string;
  date?: LocalDate;
  slot?: string;
};

export type PlannedNotification = {
  /** Stable id: same reminder → same key across rebuilds. Used as the OS identifier. */
  key: string;
  kind: NotificationKind;
  /** ms since epoch. */
  at: number;
  title: string;
  body: string;
  channelId: ChannelId;
  categoryId: CategoryId;
  data: NotificationData;
};

export type PlannedWorkout = {
  sessionId: string;
  title: string;
  exercises: number;
  minutes: number | null;
  status: 'planned' | 'active' | 'paused' | 'done' | 'skipped' | null;
};

export type PlannedMeal = {
  mealId: string;
  slot: string;
  name: string;
  kcal: number;
  protein: number;
  status: 'planned' | 'eaten' | 'skipped' | 'swapped';
};

export type DayPlan = {
  date: LocalDate;
  workout: PlannedWorkout | null;
  meals: PlannedMeal[];
};

export type TrialInfo = { inTrial: boolean; expiresAt: number | null; autoRenew: boolean };

export type ScheduleInput = {
  now: number;
  timeZone: string;
  prefs: NotificationPrefs;
  /** OS permission granted. Without it nothing is scheduled. */
  permitted: boolean;
  /** `usePro().isPro` (true for everyone while payments are off). */
  isPro: boolean;
  /** Plans by local date; days without an entry have no data. */
  days: DayPlan[];
  /** `profile.meal_times` raw JSON value. */
  profileMealTimes?: unknown;
  trial?: TrialInfo | null;
  /** Days ahead to schedule (default 7, including today). */
  horizonDays?: number;
};

/** iOS keeps at most 64 pending local notifications; leave room for snooze + rest timer. */
export const MAX_SCHEDULED = 60;
export const BRIEF_AFTER_WAKE_MIN = 15;
export const FUEL_BEFORE_MIN = 60;
const MIN = 60_000;
/** Never schedule something due in the next 30 s (it would race the rebuild). */
const MIN_LEAD_MS = 30_000;

/** What to do when a reminder lands inside quiet hours. */
type QuietPolicy = 'later' | 'earlier' | 'drop';
const QUIET_POLICY: Record<NotificationKind, QuietPolicy> = {
  brief: 'later', // a morning brief at 06:15 waits until quiet hours end
  meal: 'drop', // a meal reminder at the wrong time is noise
  workout: 'drop',
  fuel: 'drop',
  evening: 'earlier', // still a preview of tomorrow, just before quiet hours
  checkin: 'earlier',
  trial: 'earlier', // never later than promised (billing D20)
};

export type QuietWindow = { start: number; end: number } | null;

export function quietWindow(prefs: NotificationPrefs): QuietWindow {
  if (!prefs.quietEnabled) return null;
  const start = parseHm(prefs.quietStart);
  const end = parseHm(prefs.quietEnd);
  if (start == null || end == null || start === end) return null;
  return { start, end };
}

export function inQuiet(minuteOfDay: number, q: QuietWindow): boolean {
  if (!q) return false;
  return q.start > q.end
    ? minuteOfDay >= q.start || minuteOfDay < q.end
    : minuteOfDay >= q.start && minuteOfDay < q.end;
}

/**
 * Apply quiet hours to a wall time on `date`. Returns the (date, minute) to use, or null to drop.
 * 'later' → quiet end (same morning, or the next morning when quiet starts before midnight);
 * 'earlier' → one minute before quiet starts (that evening, or the previous one after midnight).
 */
export function applyQuiet(
  date: LocalDate,
  minute: number,
  q: QuietWindow,
  policy: QuietPolicy,
): { date: LocalDate; minute: number } | null {
  if (!inQuiet(minute, q) || !q) return { date, minute };
  if (policy === 'drop') return null;
  const wraps = q.start > q.end;
  if (policy === 'later') {
    const nextDay = wraps && minute >= q.start;
    return { date: nextDay ? addDays(date, 1) : date, minute: q.end };
  }
  const prevDay = wraps && minute < q.end;
  const m = q.start - 1;
  if (m < 0) return { date: addDays(prevDay ? addDays(date, -1) : date, -1), minute: 1439 };
  return { date: prevDay ? addDays(date, -1) : date, minute: m };
}

function allowed(prefs: NotificationPrefs, isPro: boolean, pref: keyof NotificationPrefs): boolean {
  if (!prefs[pref]) return false;
  return isPro || (FREE_KINDS as readonly string[]).includes(pref);
}

const isMainMeal = (slot: string) => slot === 'lunch' || slot === 'dinner';

export function buildSchedule(input: ScheduleInput): PlannedNotification[] {
  const { now, timeZone, prefs, isPro } = input;
  if (!input.permitted) return [];
  const q = quietWindow(prefs);
  const mealTimes = resolveMealTimes(prefs, input.profileMealTimes);
  const horizon = input.horizonDays ?? 7;
  const today = localDateOf(now, timeZone);
  const byDate = new Map(input.days.map((d) => [d.date, d]));
  const out: PlannedNotification[] = [];

  const push = (
    kind: NotificationKind,
    date: LocalDate,
    minute: number,
    rest: Omit<PlannedNotification, 'kind' | 'at'>,
  ) => {
    const placed = applyQuiet(date, minute, q, QUIET_POLICY[kind]);
    if (!placed) return;
    const at = zonedTimeToUtc(placed.date, placed.minute, timeZone);
    if (at < now + MIN_LEAD_MS) return;
    out.push({ ...rest, kind, at });
  };

  const workoutMin = parseHm(prefs.workoutTime) ?? 18 * 60;
  const upcomingWorkout = (d: DayPlan | undefined) =>
    d?.workout && (d.workout.status == null || d.workout.status === 'planned') ? d.workout : null;

  for (let i = 0; i < horizon; i++) {
    const date = addDays(today, i);
    const day = byDate.get(date);
    const workout = upcomingWorkout(day);
    const planned = (day?.meals ?? []).filter((m) => m.status === 'planned');

    // N-1 Morning brief: only when there is something to brief.
    if (allowed(prefs, isPro, 'brief') && day && (day.workout || day.meals.length)) {
      const wake = parseHm(prefs.wakeTime) ?? 7 * 60;
      const lunch = day.meals.find((m) => m.slot === 'lunch') ?? day.meals.find((m) => isMainMeal(m.slot));
      push('brief', date, wake + BRIEF_AFTER_WAKE_MIN, {
        key: `rw:brief:${date}`,
        title: copy.briefTitle(day.workout),
        body: copy.briefBody(day.workout, lunch ?? day.meals[0] ?? null),
        channelId: 'brief',
        categoryId: 'open',
        data: { kind: 'brief', url: '/today', date },
      });
    }

    // N-2 Meal time (each planned slot).
    if (allowed(prefs, isPro, 'meals')) {
      for (const meal of planned) {
        const t = parseHm(mealTimes[meal.slot as MealSlot]);
        if (t == null) continue;
        push('meal', date, t, {
          key: `rw:meal:${date}:${meal.slot}`,
          title: mealTitle(meal.slot),
          body: copy.mealBody(meal),
          channelId: 'meals',
          categoryId: 'meal',
          data: { kind: 'meal', url: '/eat', mealId: meal.mealId, date, slot: meal.slot },
        });
      }
    }

    if (workout) {
      // N-3 Workout reminder.
      if (allowed(prefs, isPro, 'workout')) {
        push('workout', date, workoutMin - prefs.workoutLeadMin, {
          key: `rw:workout:${date}`,
          title: copy.workoutTitle(workout.title, prefs.workoutLeadMin),
          body: copy.workoutBody(workout),
          channelId: 'training',
          categoryId: 'workout',
          data: { kind: 'workout', url: '/train', sessionId: workout.sessionId, date },
        });
      }
      // N-4 Pre-workout meal: only when a snack is planned.
      const snack = planned.find((m) => m.slot === 'snack');
      if (snack && allowed(prefs, isPro, 'fuel')) {
        push('fuel', date, workoutMin - FUEL_BEFORE_MIN, {
          key: `rw:fuel:${date}`,
          title: copy.fuelTitle,
          body: copy.fuelBody(snack.name),
          channelId: 'meals',
          categoryId: 'open',
          data: { kind: 'fuel', url: '/eat', mealId: snack.mealId, date, slot: 'snack' },
        });
      }
    }

    // Evening preview of tomorrow.
    const tomorrow = byDate.get(addDays(date, 1));
    if (allowed(prefs, isPro, 'evening') && tomorrow && (tomorrow.workout || tomorrow.meals.length)) {
      const t = parseHm(prefs.eveningTime) ?? 20 * 60 + 30;
      const breakfast = tomorrow.meals.find((m) => m.slot === 'breakfast') ?? tomorrow.meals[0] ?? null;
      push('evening', date, t, {
        key: `rw:evening:${date}`,
        title: copy.eveningTitle(tomorrow.workout),
        body: copy.eveningBody(tomorrow.workout, breakfast ? `${slotLabel(breakfast.slot)}: ${breakfast.name}` : null),
        channelId: 'brief',
        categoryId: 'open',
        data: { kind: 'evening', url: '/today', date: tomorrow.date },
      });
    }

    // N-6 Weekly check-in.
    if (allowed(prefs, isPro, 'checkin') && weekdayOf(date) === prefs.checkinDay) {
      push('checkin', date, parseHm(prefs.checkinTime) ?? 18 * 60, {
        key: `rw:checkin:${date}`,
        title: copy.checkinTitle,
        body: copy.checkinBody,
        channelId: 'checkin',
        categoryId: 'checkin',
        data: { kind: 'checkin', url: '/today?checkin=1', date },
      });
    }
  }

  // N-T5 Trial ends in 2 days — only while trialling and still renewing (sheet 17 notes).
  const trial = input.trial;
  if (allowed(prefs, true, 'trial') && trial?.inTrial && trial.autoRenew && trial.expiresAt) {
    const quiet = q
      ? { start: q.start / 60, end: q.end / 60 }
      : { start: DEFAULT_QUIET_HOURS.start, end: DEFAULT_QUIET_HOURS.start };
    const at = trialReminderAt(trial.expiresAt, { now: now + MIN_LEAD_MS, quietHours: quiet });
    if (at) {
      out.push({
        key: `rw:trial:${trial.expiresAt}`,
        kind: 'trial',
        at: at.getTime(),
        title: copy.trialTitle,
        body: copy.trialBody,
        channelId: 'account',
        categoryId: 'trial',
        data: { kind: 'trial', url: '/settings/subscription' },
      });
    }
  }

  // Soonest first; the trial reminder always survives the iOS cap.
  out.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
  const trialItems = out.filter((n) => n.kind === 'trial');
  const rest = out.filter((n) => n.kind !== 'trial').slice(0, MAX_SCHEDULED - trialItems.length);
  return [...rest, ...trialItems].sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}

/** Change detector for one notification (content + time). */
export function notificationHash(n: PlannedNotification): string {
  return [n.at, n.title, n.body, n.channelId, n.categoryId, JSON.stringify(n.data)].join('|');
}

/** Minutes are fine-grained enough for display; used by the settings "Next up" card. */
export function nextUp(list: PlannedNotification[], now: number): PlannedNotification | null {
  return list.find((n) => n.at > now - MIN) ?? null;
}
