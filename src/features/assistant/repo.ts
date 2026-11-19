/**
 * assistant domain data: the rule snapshot (RuleContext) from local SQLite, card rows
 * (cards table) and the weekly check-in record. Local and synchronous.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { bodyMetrics, cards, foodLogs, mealPlans, meals, sessionExercises, sessions, sets } from '@/db/schema';
import { bodyMetricsRepo } from '@/features/progress/repo';
import { cardsRepo, type Card } from '@/features/planner/repo';
import { addDays, daysBetween, epley1RM, type ISODate } from '@/features/today/logic/engine';
import { humanize } from '@/features/today/logic/workout';
import { WATER_SLOT } from '@/features/today/logic/water';
import { sessionsRepo } from '@/features/workout/repo';
import { peekCatalog } from '@/services/catalog';
import { kv } from '@/services/storage';

import {
  encodeAction,
  encodeCopy,
  formatState,
  missingRows,
  snoozeState,
  type StoredCard,
} from './logic/cardState';
import type { Energy, Sleep, VolumeStep } from './logic/checkin';
import { PRIORITY, type CardCandidate, type LiftHistory, type RuleContext, type RuleSession } from './logic/rules';

export const RULE_IDS = Object.keys(PRIORITY);
/** cards.rule_id of the weekly check-in record (not a visible card). */
export const CHECKIN_RULE_ID = 'weekly_checkin';
const DELOAD_KEY = 'assistant.deloadRequestedAt';
/** A lighter-week request stays pending for this long (until the next check-in uses it). */
const DELOAD_PENDING_DAYS = 10;
const STREAK_LOOKBACK_DAYS = 400;
const LIFT_LOOKBACK_DAYS = 56;

// ---------------------------------------------------------------------------
// Rule context
// ---------------------------------------------------------------------------

function ruleSessions(today: ISODate): RuleSession[] {
  return sessionsRepo
    .list(and(gte(sessions.date, addDays(today, -14)), lte(sessions.date, addDays(today, 7))), asc(sessions.date))
    .filter((s): s is typeof s & { date: string } => s.date != null)
    .map((s) => ({ id: s.id, date: s.date, title: s.title ?? 'Workout', status: s.status ?? 'planned' }));
}

/** Dates with a finished workout or a logged meal (water does not count). */
export function activeDates(today: ISODate): ISODate[] {
  const from = addDays(today, -STREAK_LOOKBACK_DAYS);
  const db = getDb();
  const logDates = db
    .selectDistinct({ date: foodLogs.date })
    .from(foodLogs)
    .where(and(isNull(foodLogs.deletedAt), gte(foodLogs.date, from), lte(foodLogs.date, today), ne(foodLogs.slot, WATER_SLOT)))
    .all()
    .map((r) => r.date);
  // ne() skips NULL slots, so add logs without a slot.
  const unslotted = db
    .selectDistinct({ date: foodLogs.date })
    .from(foodLogs)
    .where(and(isNull(foodLogs.deletedAt), gte(foodLogs.date, from), lte(foodLogs.date, today), isNull(foodLogs.slot)))
    .all()
    .map((r) => r.date);
  const doneDates = db
    .selectDistinct({ date: sessions.date })
    .from(sessions)
    .where(and(isNull(sessions.deletedAt), eq(sessions.status, 'done'), gte(sessions.date, from), lte(sessions.date, today)))
    .all()
    .map((r) => r.date)
    .filter((d): d is string => d != null);
  return [...new Set([...logDates, ...unslotted, ...doneDates])].sort();
}

function exerciseName(id: string): string {
  return peekCatalog()?.exerciseById.get(id)?.name ?? humanize(id);
}

/** Best estimated 1RM (engine Epley) per finished session for each lift, oldest first. */
export function liftHistory(today: ISODate): LiftHistory[] {
  const rows = getDb()
    .select({
      date: sessions.date,
      sessionId: sessions.id,
      exerciseId: sessionExercises.exerciseId,
      weightKg: sets.weightKg,
      reps: sets.reps,
      type: sets.type,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(sessions, eq(sessionExercises.sessionId, sessions.id))
    .where(
      and(
        isNull(sets.deletedAt),
        isNull(sessionExercises.deletedAt),
        isNull(sessions.deletedAt),
        eq(sessions.status, 'done'),
        gte(sessions.date, addDays(today, -LIFT_LOOKBACK_DAYS)),
      ),
    )
    .all();
  const best = new Map<string, Map<string, { date: string; e1rm: number }>>();
  for (const r of rows) {
    if (r.type !== 'working' || !r.weightKg || !r.reps || r.weightKg <= 0 || r.reps <= 0 || !r.date) continue;
    const e = epley1RM(r.weightKg, r.reps);
    const perSession = best.get(r.exerciseId) ?? new Map<string, { date: string; e1rm: number }>();
    const prev = perSession.get(r.sessionId);
    if (!prev || e > prev.e1rm) perSession.set(r.sessionId, { date: r.date, e1rm: e });
    best.set(r.exerciseId, perSession);
  }
  return [...best.entries()]
    .map(([exerciseId, m]) => ({
      exerciseId,
      name: exerciseName(exerciseId),
      bestE1rmBySession: [...m.values()].sort((a, b) => a.date.localeCompare(b.date)).map((x) => x.e1rm),
    }))
    .filter((l) => l.bestE1rmBySession.length >= 3);
}

export function deloadRequested(today: ISODate): boolean {
  const at = kv.getString(DELOAD_KEY);
  if (!at) return false;
  const ago = daysBetween(at, today);
  return ago >= 0 && ago <= DELOAD_PENDING_DAYS;
}

export function setDeloadRequested(today: ISODate | null): void {
  if (today) kv.set(DELOAD_KEY, today);
  else kv.remove(DELOAD_KEY);
}

export function lastCheckin(): Card | undefined {
  return cardsRepo.first(eq(cards.ruleId, CHECKIN_RULE_ID), desc(cards.date));
}

export function loadRuleContext(input: {
  today: ISODate;
  hour: number;
  onboardedAt: number | null | undefined;
  onboardedDate: ISODate | null;
  protein: RuleContext['protein'];
}): RuleContext {
  return {
    today: input.today,
    hour: input.hour,
    daysSinceOnboarding: input.onboardedDate ? Math.max(0, daysBetween(input.onboardedDate, input.today)) : null,
    sessions: ruleSessions(input.today),
    protein: input.protein,
    activeDates: activeDates(input.today),
    lastCheckinDate: lastCheckin()?.date ?? null,
    lifts: liftHistory(input.today),
    deloadRequested: deloadRequested(input.today),
  };
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export function cardsForDate(date: ISODate): Card[] {
  return cardsRepo.list(and(eq(cards.date, date), inArray(cards.ruleId, RULE_IDS)), asc(cards.createdAt));
}

/** Insert rows for newly fired rules (one per rule per day; free users one a day). */
export function materializeCards(date: ISODate, candidates: CardCandidate[], isPro: boolean): number {
  const stored: StoredCard[] = cardsForDate(date);
  const add = missingRows(candidates, stored, isPro);
  for (const c of add) {
    cardsRepo.insert({
      ruleId: c.ruleId,
      date,
      text: encodeCopy(c),
      action: encodeAction(c.action),
      state: formatState({ kind: 'active' }),
    });
  }
  return add.length;
}

export function dismissCard(id: string): void {
  cardsRepo.update(id, { state: 'dismissed' });
}

export function snoozeCard(id: string, now: number = Date.now()): void {
  cardsRepo.update(id, { state: snoozeState(now) });
}

export function markCardApplied(id: string): void {
  cardsRepo.update(id, { state: 'applied' });
}

export function getCard(id: string): Card | undefined {
  return cardsRepo.get(id);
}

/** C3: move a missed session to another date (it keeps its plan, exercises and status). */
export function rescheduleSession(sessionId: string, toDate: ISODate): void {
  sessionsRepo.update(sessionId, { date: toDate });
}

export function skipSession(sessionId: string): void {
  sessionsRepo.update(sessionId, { status: 'skipped' });
}

// ---------------------------------------------------------------------------
// Weekly check-in
// ---------------------------------------------------------------------------

export type CheckinRecord = {
  energy: Energy;
  sleep: Sleep;
  weighedIn: boolean;
  deltaKcal: number;
  newKcal: number;
  volume: VolumeStep;
  /** Monday the adjustment applies from. */
  appliesFrom: ISODate;
  /** True once the planner rebuilt the week with it. */
  applied: boolean;
};

export function weightsSince(from: ISODate): { date: string; weightKg: number | null }[] {
  return bodyMetricsRepo.list(gte(bodyMetrics.date, from), asc(bodyMetrics.date));
}

/** Upsert today's weigh-in (one body_metrics row per date). */
export function saveWeighIn(date: ISODate, kg: number): void {
  const existing = bodyMetricsRepo.first(eq(bodyMetrics.date, date), desc(bodyMetrics.updatedAt));
  if (existing) bodyMetricsRepo.update(existing.id, { weightKg: kg });
  else bodyMetricsRepo.insert({ date, weightKg: kg });
}

/** Sessions and meals (with their plan date) of the 7 days ending on `date`. */
export function weekActivity(date: ISODate) {
  const from = addDays(date, -6);
  const ss = sessionsRepo
    .list(and(gte(sessions.date, from), lte(sessions.date, date)))
    .map((s) => ({ date: s.date, status: s.status }));
  const ms = getDb()
    .select({ date: mealPlans.date, status: meals.status })
    .from(meals)
    .innerJoin(mealPlans, eq(meals.mealPlanId, mealPlans.id))
    .where(and(isNull(meals.deletedAt), isNull(mealPlans.deletedAt), gte(mealPlans.date, from), lte(mealPlans.date, date)))
    .all();
  return { sessions: ss, meals: ms };
}

/** Current daily kcal target: the latest meal plan on or before `date`. */
export function currentKcalTarget(date: ISODate): number | null {
  const row = getDb()
    .select({ kcal: mealPlans.kcalTarget })
    .from(mealPlans)
    .where(and(isNull(mealPlans.deletedAt), lte(mealPlans.date, date)))
    .orderBy(desc(mealPlans.date))
    .limit(1)
    .get();
  return row?.kcal ?? null;
}

export function saveCheckin(date: ISODate, rec: CheckinRecord): Card {
  const existing = cardsRepo.first(and(eq(cards.ruleId, CHECKIN_RULE_ID), eq(cards.date, date)));
  const values = { text: JSON.stringify(rec), state: rec.applied ? 'applied' : 'pending' };
  if (existing) return cardsRepo.update(existing.id, values) ?? existing;
  return cardsRepo.insert({ ruleId: CHECKIN_RULE_ID, date, action: null, ...values });
}

/** For the planner: the latest check-in and whether its adjustment is still waiting to be applied. */
export function latestCheckin(): (CheckinRecord & { date: ISODate; pending: boolean }) | null {
  const row = lastCheckin();
  if (!row) return null;
  try {
    const rec = JSON.parse(row.text ?? '') as CheckinRecord;
    return { ...rec, date: row.date, pending: row.state !== 'applied' };
  } catch {
    return null;
  }
}
