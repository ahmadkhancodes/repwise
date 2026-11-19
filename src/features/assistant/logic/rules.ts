/**
 * Assistant card rules (sheet 28 "Assistant suggestion cards", RW-41). Pure: every rule reads a
 * snapshot of the user's own data and returns a card or nothing. Numbers come from the user's data
 * and the engine; copy is rule-written (the Worker's card_copy may reword it later). No medical or
 * dosing advice, no guilt-trip copy.
 */
import { addDays, daysBetween, stalledSessions, type ISODate } from '@/features/today/logic/engine';
import { weekdayName, weekdaySun0 } from '@/features/today/logic/day';

export type RuleId = 'missed_workout' | 'checkin_due' | 'protein_low' | 'deload' | 'recovery' | 'streak';

export type CardAction =
  | { type: 'reschedule'; sessionId: string; toDate: ISODate }
  | { type: 'skip_session'; sessionId: string }
  | { type: 'open_eat' }
  | { type: 'open_checkin' }
  | { type: 'plan_deload' }
  | { type: 'rest_today'; sessionId: string };

export type CardCandidate = {
  ruleId: RuleId;
  /** Higher shows first; free users see only the top card (RW-41: Free 1/day). */
  priority: number;
  title: string;
  body: string;
  /** Longer explanation for the S12 detail sheet. */
  detail: string;
  actionLabel: string | null;
  action: CardAction | null;
};

export type RuleSession = {
  id: string;
  date: ISODate;
  title: string;
  status: 'planned' | 'active' | 'paused' | 'done' | 'skipped';
};

export type LiftHistory = {
  exerciseId: string;
  name: string;
  /** Best estimated 1RM per session, oldest first. */
  bestE1rmBySession: number[];
};

export type RuleContext = {
  today: ISODate;
  /** Local hour 0–23. */
  hour: number;
  /** Days since onboarding finished (null = not onboarded). */
  daysSinceOnboarding: number | null;
  /** Sessions from about two weeks back to a week ahead. */
  sessions: RuleSession[];
  protein: { eaten: number; target: number } | null;
  /** Dates with a finished workout or a logged meal. */
  activeDates: ISODate[];
  lastCheckinDate: ISODate | null;
  lifts: LiftHistory[];
  /** A lighter week is already requested for the coming week. */
  deloadRequested: boolean;
};

export const PRIORITY: Record<RuleId, number> = {
  missed_workout: 90,
  checkin_due: 80,
  protein_low: 70,
  deload: 60,
  recovery: 55,
  streak: 40,
};

export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];
/** Protein card fires below this share of the target, from 18:00 (C2). */
export const PROTEIN_SHARE = 0.8;
export const PROTEIN_HOUR = 18;
/** Missed sessions older than this are left alone. */
export const MISSED_LOOKBACK_DAYS = 3;

const openStatus = (s: RuleSession['status']) => s === 'planned';
const busy = (s: RuleSession['status']) => s !== 'skipped';

/** Where a missed session goes: today if free, else tomorrow if free, else nowhere. */
export function rescheduleTarget(today: ISODate, sessions: RuleSession[]): ISODate | null {
  const taken = new Set(sessions.filter((s) => busy(s.status)).map((s) => s.date));
  if (!taken.has(today)) return today;
  const tomorrow = addDays(today, 1);
  if (!taken.has(tomorrow)) return tomorrow;
  return null;
}

/** C3 missed workout. */
export function missedWorkoutRule(ctx: RuleContext): CardCandidate | null {
  const missed = ctx.sessions
    .filter((s) => {
      const ago = daysBetween(s.date, ctx.today);
      return openStatus(s.status) && ago >= 1 && ago <= MISSED_LOOKBACK_DAYS;
    })
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!missed) return null;
  const day = weekdayName(missed.date);
  const to = rescheduleTarget(ctx.today, ctx.sessions);
  if (to) {
    const when = to === ctx.today ? 'today' : 'tomorrow';
    return {
      ruleId: 'missed_workout',
      priority: PRIORITY.missed_workout,
      title: `Missed ${day}'s ${missed.title}`,
      body: `Move it to ${when}? The rest of your week stays as planned.`,
      detail: `${missed.title} was planned for ${day}. ${when === 'today' ? 'Today is free' : 'Tomorrow is free'}, so it can move there without changing your other sessions.`,
      actionLabel: `Move to ${when}`,
      action: { type: 'reschedule', sessionId: missed.id, toDate: to },
    };
  }
  return {
    ruleId: 'missed_workout',
    priority: PRIORITY.missed_workout,
    title: `Missed ${day}'s ${missed.title}`,
    body: 'No stress. Your next session is ready, so we can let this one go.',
    detail: `${missed.title} was planned for ${day}. Today and tomorrow already have sessions, so the best move is to skip it and keep the week on track.`,
    actionLabel: 'Skip it',
    action: { type: 'skip_session', sessionId: missed.id },
  };
}

/** Weekly check-in due (RW-42): Sunday, or Monday if Sunday was missed. */
export function checkinDueRule(ctx: RuleContext): CardCandidate | null {
  if (ctx.daysSinceOnboarding == null || ctx.daysSinceOnboarding < 6) return null;
  const weekday = weekdaySun0(ctx.today);
  if (weekday !== 0 && weekday !== 1) return null;
  if (ctx.lastCheckinDate && daysBetween(ctx.lastCheckinDate, ctx.today) < 6) return null;
  return {
    ruleId: 'checkin_due',
    priority: PRIORITY.checkin_due,
    title: 'Your week in 30 seconds',
    body: 'Check in to tune next week’s calories, training and menus.',
    detail:
      'Log your weight and how you felt. Repwise compares your 7-day weight trend with your goal and adjusts next week’s calories (by 100–200 kcal when needed), training volume and menus.',
    actionLabel: 'Start check-in',
    action: { type: 'open_checkin' },
  };
}

/** C2 protein low by the evening. */
export function proteinLowRule(ctx: RuleContext): CardCandidate | null {
  const p = ctx.protein;
  if (!p || !(p.target > 0) || ctx.hour < PROTEIN_HOUR) return null;
  if (p.eaten >= p.target * PROTEIN_SHARE) return null;
  const gap = Math.round(p.target - p.eaten);
  return {
    ruleId: 'protein_low',
    priority: PRIORITY.protein_low,
    title: `${gap} g protein to go`,
    body: 'A high-protein snack, like Greek yogurt with nuts, could close the gap.',
    detail: `You have eaten ${Math.round(p.eaten)} g of your ${Math.round(p.target)} g protein target today. Your plan's snacks and the food search show protein per portion.`,
    actionLabel: 'See food ideas',
    action: { type: 'open_eat' },
  };
}

/** C4 stall on a lift for 2 sessions → suggest a lighter week. */
export function deloadRule(ctx: RuleContext): CardCandidate | null {
  if (ctx.deloadRequested) return null;
  const stalled = ctx.lifts
    .map((l) => ({ l, n: stalledSessions(l.bestE1rmBySession) }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.n - a.n || a.l.name.localeCompare(b.l.name))[0];
  if (!stalled) return null;
  return {
    ruleId: 'deload',
    priority: PRIORITY.deload,
    title: `${stalled.l.name} has stalled`,
    body: `No progress for ${stalled.n} sessions. A lighter week can help you come back stronger.`,
    detail: `Your best estimated 1RM on ${stalled.l.name} has not gone up for ${stalled.n} sessions. A deload week keeps the same exercises with about 40% fewer sets, then your block continues.`,
    actionLabel: 'Plan a lighter week',
    action: { type: 'plan_deload' },
  };
}

/** C5 five or more workouts in the last five days → suggest a recovery day. */
export function recoveryRule(ctx: RuleContext): CardCandidate | null {
  const from = addDays(ctx.today, -5);
  const done = ctx.sessions.filter(
    (s) => s.status === 'done' && s.date >= from && s.date < ctx.today,
  ).length;
  const todays = ctx.sessions.find((s) => s.date === ctx.today && s.status === 'planned');
  if (done < 5 || !todays) return null;
  return {
    ruleId: 'recovery',
    priority: PRIORITY.recovery,
    title: `${done} workouts in 5 days`,
    body: 'A recovery day is suggested: a light walk and some stretching.',
    detail: `You have trained ${done} times in the last 5 days. Making today a rest day moves nothing else; ${todays.title} is skipped for today.`,
    actionLabel: 'Make today a rest day',
    action: { type: 'rest_today', sessionId: todays.id },
  };
}

/** Consecutive active days ending today (or yesterday, while today is still open). */
export function streakLength(activeDates: ISODate[], today: ISODate): number {
  const set = new Set(activeDates);
  let day = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(day)) {
    n += 1;
    day = addDays(day, -1);
  }
  return n;
}

export function streakRule(ctx: RuleContext): CardCandidate | null {
  const n = streakLength(ctx.activeDates, ctx.today);
  if (!STREAK_MILESTONES.includes(n)) return null;
  return {
    ruleId: 'streak',
    priority: PRIORITY.streak,
    title: `${n}-day streak`,
    body: `${n} days in a row of training or logging meals. Keep it rolling.`,
    detail: `A day counts when you finish a workout or log a meal. You are on ${n} days in a row.`,
    actionLabel: null,
    action: null,
  };
}

export const RULES = [
  missedWorkoutRule,
  checkinDueRule,
  proteinLowRule,
  deloadRule,
  recoveryRule,
  streakRule,
] as const;

/** Every card that fires now, highest priority first. */
export function evaluateRules(ctx: RuleContext): CardCandidate[] {
  if (ctx.daysSinceOnboarding == null) return [];
  return RULES.map((r) => r(ctx))
    .filter((c): c is CardCandidate => c !== null)
    .sort((a, b) => b.priority - a.priority);
}
