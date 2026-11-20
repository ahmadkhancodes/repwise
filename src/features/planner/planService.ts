/**
 * Planner service (sheet 28 steps 1–5, app side).
 *
 * - Builds the week offline with `@repwise/engine` + the `@repwise/content` catalogues and writes
 *   it to plans, sessions, session_exercises, meal_plans and meals in ONE SQLite transaction.
 * - When online, asks the Worker (`POST /ai/plan/week`) for the AI-varied week in the background;
 *   a valid answer replaces the rules plan (`generated_by = 'ai'`), anything else keeps it.
 * - Never blocks the UI: heavy work runs after a yield, network work is fire-and-forget.
 *
 * Other slices use: `regenerateWeek`, `planToday`, `ensureWeekPlanned`, `swapExerciseOptions` /
 * `applyExerciseSwap`, `swapMealOptions` / `applyMealSwap`.
 */
import {
  addDays,
  buildContext,
  localDateFromEpoch,
  mealFromRecipe,
  planWeek,
  startOfWeek,
  swapExercise as engineSwapExercise,
  swapMeal as engineSwapMeal,
  validatePlan,
  weekdayMon0,
  type Catalogues,
  type DayMealPlan,
  type HistoryInput,
  type PlannedMeal,
  type PlannedSession,
  type ProfileInput,
  type WeekPlan,
} from './engine';
import { toEngineCatalogues } from '@repwise/content/toEngine';
import { and, asc, desc, eq, gte, inArray, lt } from 'drizzle-orm';

import { getRawDb } from '@/db/client';
import {
  bodyMetrics,
  mealPlans,
  meals,
  plans,
  sessionExercises,
  sessions,
  sets,
} from '@/db/schema';
import {
  mealPlansRepo,
  mealsRepo,
  sortBySlot,
  type Meal,
  type MealPlan,
} from '@/features/meals/repo';
import { getProfile } from '@/features/settings/repo';
import {
  sessionExercisesRepo,
  sessionsRepo,
  setsRepo,
  type Session,
  type SessionExercise,
} from '@/features/workout/repo';
import { bodyMetricsRepo } from '@/features/progress/repo';
import { track } from '@/services/analytics';
import { api } from '@/services/api';
import { ensureSession } from '@/services/auth';
import { getCatalog } from '@/services/catalog';

import { decideAiPlan, type AiWeekResponse } from './logic/aiPlan';
import { buildHistory } from './logic/history';
import {
  planToRows,
  sessionMatchesPlan,
  sessionRows,
  type NutritionPayload,
  type PlanSource,
  type SessionRows,
  type TrainingPayload,
  type WeekRows,
} from './logic/planRows';
import { spreadWeekdays, toEngineProfile } from './logic/profile';
import { plansRepo, type Plan } from './repo';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

let engineCatalogues: { src: unknown; cat: Catalogues } | null = null;

/** Engine catalogues via `@repwise/content`'s adapter, built once per loaded content catalogue. */
export function getEngineCatalogues(): Catalogues {
  const c = getCatalog();
  if (engineCatalogues?.src !== c) {
    const { exercises, recipes } = toEngineCatalogues(c);
    engineCatalogues = { src: c, cat: { exercises, recipes } };
  }
  return engineCatalogues.cat;
}

/** Today's date in the device's local time zone (YYYY-MM-DD). */
export function localToday(now: number = Date.now()): string {
  return localDateFromEpoch(now, -new Date(now).getTimezoneOffset());
}

const HISTORY_DAYS = 42;

function latestTrainingPayload(beforeWeek?: string): TrainingPayload | null {
  const rows = plansRepo
    .list(eq(plans.type, 'training'), desc(plans.weekStart))
    .filter((p) => !beforeWeek || (p.weekStart ?? '') <= beforeWeek)
    .sort(
      (a, b) =>
        (b.weekStart ?? '').localeCompare(a.weekStart ?? '') || (b.version ?? 0) - (a.version ?? 0),
    );
  const p = rows[0]?.payload as TrainingPayload | undefined;
  return p && p.kind === 'training' ? p : null;
}

/** Engine history from the last 6 weeks of local rows (before `weekStart`). */
export function loadHistory(weekStart: string): HistoryInput {
  const from = addDays(weekStart, -HISTORY_DAYS);
  const sess = sessionsRepo.list(and(gte(sessions.date, from), lt(sessions.date, weekStart)));
  const ids = sess.map((s) => s.id);
  const ses = ids.length ? sessionExercisesRepo.list(inArray(sessionExercises.sessionId, ids)) : [];
  const seIds = ses.map((s) => s.id);
  const setRows = seIds.length ? setsRepo.list(inArray(sets.sessionExerciseId, seIds)) : [];
  const plansBefore = mealPlansRepo.list(
    and(gte(mealPlans.date, from), lt(mealPlans.date, weekStart)),
  );
  const dateOf = new Map(plansBefore.map((p) => [p.id, p.date]));
  const mealRows = plansBefore.length
    ? mealsRepo.list(
        inArray(
          meals.mealPlanId,
          plansBefore.map((p) => p.id),
        ),
      )
    : [];
  const weights = bodyMetricsRepo.list(gte(bodyMetrics.date, from), asc(bodyMetrics.date));
  const prev = latestTrainingPayload(addDays(weekStart, -1));
  return buildHistory({
    sessions: sess,
    sessionExercises: ses,
    sets: setRows,
    meals: mealRows
      .map((m) => ({ ...m, date: dateOf.get(m.mealPlanId) ?? '' }))
      .filter((m) => m.date),
    weights,
    block: prev?.block ?? null,
  });
}

/** Training weekdays: the latest plan's choice, else spread from today. */
function currentWeekdays(
  profile: ProfileInput,
  today: string,
  picked?: readonly number[],
): number[] {
  const chosen = [...new Set((picked ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  if (chosen.length === profile.daysPerWeek) return chosen.sort((a, b) => a - b);
  const saved = latestTrainingPayload()?.trainingWeekdays;
  if (saved && saved.length === profile.daysPerWeek) return saved;
  return spreadWeekdays(profile.daysPerWeek, weekdayMon0(today));
}

// ---------------------------------------------------------------------------
// Persisting a week (one transaction)
// ---------------------------------------------------------------------------

export type PlanResult = {
  weekStart: string;
  trainingPlanId: string;
  nutritionPlanId: string;
  version: number;
  source: PlanSource;
  sessions: number;
  days: number;
  warnings: string[];
};

function nextVersion(weekStart: string): number {
  const rows = plansRepo.list(eq(plans.weekStart, weekStart));
  return rows.reduce((m, p) => Math.max(m, p.version ?? 0), 0) + 1;
}

function weekVersion(weekStart: string): number {
  return nextVersion(weekStart) - 1;
}

/** What the planner wrote for this session (from its plan row's payload), if anything. */
function plannedRowsFor(s: Session): SessionRows | undefined {
  if (!s.planId || !s.date) return undefined;
  const p = plansRepo.get(s.planId)?.payload as TrainingPayload | undefined;
  const ps = p?.kind === 'training' ? p.sessions.find((x) => x.date === s.date) : undefined;
  return ps ? sessionRows(ps) : undefined;
}

function liveExercises(sessionId: string): SessionExercise[] {
  return sessionExercisesRepo.list(
    eq(sessionExercises.sessionId, sessionId),
    asc(sessionExercises.position),
  );
}

/**
 * A planned session the user has not touched: not started, from a plan, and its exercises are
 * exactly what that plan wrote (no swap, add, remove, reorder or edited target). Only these are
 * ever rewritten by a regenerate or the AI upgrade.
 */
export function isUntouchedSession(s: Session): boolean {
  if (s.status && s.status !== 'planned') return false;
  return sessionMatchesPlan(plannedRowsFor(s), liveExercises(s.id));
}

/** Dates (≥ fromDate) whose workout or meals the user has already touched; those are kept. */
function touchedDates(dates: string[]) {
  const keepSessions = new Set<string>();
  const keepMeals = new Set<string>();
  const sess = dates.length ? sessionsRepo.list(inArray(sessions.date, dates)) : [];
  for (const s of sess) if (!isUntouchedSession(s)) keepSessions.add(s.date ?? '');
  const mps = dates.length ? mealPlansRepo.list(inArray(mealPlans.date, dates)) : [];
  const mealRows = mps.length
    ? mealsRepo.list(
        inArray(
          meals.mealPlanId,
          mps.map((p) => p.id),
        ),
      )
    : [];
  const dateOf = new Map(mps.map((p) => [p.id, p.date]));
  for (const m of mealRows) {
    if (m.status !== 'planned' || m.swappedFrom) keepMeals.add(dateOf.get(m.mealPlanId) ?? '');
  }
  return { keepSessions, keepMeals, sess, mps, mealRows };
}

/** Update a session's exercise rows position by position (keeping ids), adding or removing extras. */
function rewriteExercises(sessionId: string, next: SessionRows['exercises'], now: number) {
  const live = liveExercises(sessionId);
  next.forEach((e, i) => {
    const row = live[i];
    if (row) sessionExercisesRepo.update(row.id, { ...e, supersetGroup: null }, now);
    else sessionExercisesRepo.insert({ sessionId, ...e }, now);
  });
  for (const extra of live.slice(next.length)) sessionExercisesRepo.remove(extra.id, now);
}

function writeWeek(
  plan: WeekPlan,
  opts: { fromDate: string; trainingWeekdays: number[]; source: PlanSource; now: number },
): PlanResult {
  const dates = plan.dates.filter((d) => d >= opts.fromDate);
  let result!: PlanResult;
  getRawDb().withTransactionSync(() => {
    const touched = touchedDates(dates);
    const rows: WeekRows = planToRows(plan, {
      fromDate: opts.fromDate,
      trainingWeekdays: opts.trainingWeekdays,
      keepSessionDates: touched.keepSessions,
      keepMealDates: touched.keepMeals,
    });
    const now = opts.now;
    // Untouched planned sessions on the dates we are rewriting are updated IN PLACE (same ids, so
    // an open overview keeps working); touched dates are left alone entirely.
    const reusable = new Map<string, Session[]>();
    for (const s of touched.sess) {
      const date = s.date ?? '';
      if (touched.keepSessions.has(date)) continue;
      reusable.set(date, [...(reusable.get(date) ?? []), s]);
    }
    for (const mp of touched.mps) {
      if (touched.keepMeals.has(mp.date)) continue;
      for (const m of touched.mealRows) if (m.mealPlanId === mp.id) mealsRepo.remove(m.id, now);
      mealPlansRepo.remove(mp.id, now);
    }

    const version = nextVersion(plan.weekStart);
    const training = plansRepo.insert(
      {
        type: 'training',
        blockNo: rows.blockNo,
        weekStart: rows.weekStart,
        payload: rows.training,
        version,
        generatedBy: opts.source,
      },
      now,
    );
    const nutrition = plansRepo.insert(
      {
        type: 'nutrition',
        blockNo: rows.blockNo,
        weekStart: rows.weekStart,
        payload: rows.nutrition,
        version,
        generatedBy: opts.source,
      },
      now,
    );
    for (const s of rows.sessions) {
      const existing = reusable.get(s.date)?.shift();
      if (existing) {
        sessionsRepo.update(
          existing.id,
          { planId: training.id, title: s.title, dayIndex: s.dayIndex },
          now,
        );
        rewriteExercises(existing.id, s.exercises, now);
        continue;
      }
      const row = sessionsRepo.insert(
        {
          planId: training.id,
          date: s.date,
          title: s.title,
          dayIndex: s.dayIndex,
          status: 'planned',
        },
        now,
      );
      for (const e of s.exercises) sessionExercisesRepo.insert({ sessionId: row.id, ...e }, now);
    }
    // Untouched sessions on days that are no longer training days (soft delete, so it syncs).
    for (const left of reusable.values()) {
      for (const s of left) {
        for (const se of liveExercises(s.id)) sessionExercisesRepo.remove(se.id, now);
        sessionsRepo.remove(s.id, now);
      }
    }
    for (const d of rows.mealPlans) {
      const mp = mealPlansRepo.insert(
        { date: d.date, dayType: d.dayType, kcalTarget: d.kcalTarget, macros: d.macros },
        now,
      );
      for (const m of d.meals)
        mealsRepo.insert({ mealPlanId: mp.id, ...m, status: 'planned' }, now);
    }
    result = {
      weekStart: plan.weekStart,
      trainingPlanId: training.id,
      nutritionPlanId: nutrition.id,
      version,
      source: opts.source,
      sessions: rows.sessions.length,
      days: rows.mealPlans.length,
      warnings: plan.warnings.map((w) => w.code),
    };
  });
  return result;
}

// ---------------------------------------------------------------------------
// Generating
// ---------------------------------------------------------------------------

/** Let the first frame paint (and UI-thread animations start) before heavy JS work. */
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

export class PlannerError extends Error {
  constructor(readonly code: 'no_profile' | 'engine_failed') {
    super(code);
    this.name = 'PlannerError';
  }
}

export type GenerateOptions = {
  /** Any date in the target week (default: today). Dates before `fromDate` are not rewritten. */
  date?: string;
  /** First date to (re)write; default today (or the week start for a future week). */
  fromDate?: string;
  /** Ask the Worker for an AI-varied plan afterwards (default true). */
  ai?: boolean;
  /** Weekly check-in kcal delta (engine `weeklyAdjustment`), passed to `planWeek`. */
  adjustmentKcal?: number;
  /** The user asked for a lighter week: the engine plans it as a deload. */
  deload?: boolean;
  /**
   * Training weekdays (0 = Monday) the user picked (onboarding S04, Settings → Profile & plan).
   * Used when it has exactly `daysPerWeek` valid days; otherwise the saved/spread days apply.
   */
  trainingWeekdays?: readonly number[];
  now?: number;
  /** Test seam: replaces the Worker call. */
  fetchAi?: AiFetcher;
};

export type AiFetcher = (body: {
  profile: ProfileInput;
  history: HistoryInput;
  params: { weekStart: string; now: number; trainingWeekdays: number[]; adjustmentKcal?: number };
}) => Promise<AiWeekResponse | null>;

type WeekTweaks = Pick<GenerateOptions, 'adjustmentKcal' | 'deload'>;

/** Only the tweaks that are set (engine options are exact-optional). */
function tweaks(opts: WeekTweaks): WeekTweaks {
  return {
    ...(opts.adjustmentKcal !== undefined ? { adjustmentKcal: opts.adjustmentKcal } : {}),
    ...(opts.deload ? { deload: true } : {}),
  };
}

function planFor(
  profile: ProfileInput,
  weekStart: string,
  now: number,
  weekdays: number[],
  extra: WeekTweaks = {},
) {
  const history = loadHistory(weekStart);
  const p = { ...profile, trainingWeekdays: weekdays };
  const plan = planWeek(p, history, getEngineCatalogues(), { now, weekStart, ...tweaks(extra) });
  return { plan, history, profile: p };
}

/** Synchronous core (used by planToday when a week is missing). */
function generateSync(opts: GenerateOptions = {}): {
  result: PlanResult;
  profile: ProfileInput;
  history: HistoryInput;
  weekdays: number[];
} {
  const now = opts.now ?? Date.now();
  const today = localToday(now);
  const date = opts.date ?? today;
  const weekStart = startOfWeek(date);
  const row = getProfile();
  const base = toEngineProfile(row);
  if (!base) throw new PlannerError('no_profile');
  const weekdays = currentWeekdays(base, today, opts.trainingWeekdays);
  let built;
  try {
    built = planFor(base, weekStart, now, weekdays, opts);
  } catch {
    throw new PlannerError('engine_failed');
  }
  const fromDate = opts.fromDate ?? (weekStart > today ? weekStart : today);
  const result = writeWeek(built.plan, {
    fromDate,
    trainingWeekdays: weekdays,
    source: 'rules',
    now,
  });
  return { result, profile: built.profile, history: built.history, weekdays };
}

/**
 * (Re)build the week containing `date` from local data. Resolves once the rules plan is saved;
 * the AI upgrade (if any) lands later and live queries pick it up.
 */
export async function regenerateWeek(opts: GenerateOptions = {}): Promise<PlanResult> {
  await yieldToUi();
  const out = generateSync(opts);
  // The Worker cannot be asked for a deload, so a requested deload week stays rules-only.
  if (opts.ai !== false && !opts.deload) {
    void upgradeWithAi(out.result, out.profile, out.history, out.weekdays, opts);
  }
  return out.result;
}

/**
 * First plan after onboarding: this week from today, plus next week when fewer than 4 days of this
 * week remain, so Today and the week strip are never empty.
 */
export async function generateInitialPlan(opts: Omit<GenerateOptions, 'date' | 'fromDate'> = {}) {
  const now = opts.now ?? Date.now();
  const today = localToday(now);
  const first = await regenerateWeek({ ...opts, now, date: today });
  const remaining = 7 - weekdayMon0(today);
  let next: PlanResult | null = null;
  if (remaining < 4) {
    next = await regenerateWeek({ ...opts, now, date: addDays(startOfWeek(today), 7) });
  }
  return { first, next };
}

/** Make sure the week containing `date` has a plan (no-op when one exists). */
export function ensureWeekPlanned(
  date: string = localToday(),
  now: number = Date.now(),
): PlanResult | null {
  const weekStart = startOfWeek(date);
  if (plansRepo.first(and(eq(plans.type, 'training'), eq(plans.weekStart, weekStart)))) return null;
  if (!toEngineProfile(getProfile())) return null;
  return generateSync({ date, now, fromDate: date < localToday(now) ? weekStart : undefined })
    .result;
}

export type TodayPlan = {
  date: string;
  session: Session | null;
  exercises: SessionExercise[];
  mealPlan: MealPlan | null;
  meals: Meal[];
};

/** Today's workout and meals from SQLite (plans the week first if it is missing). */
export function planToday(date: string = localToday(), now: number = Date.now()): TodayPlan {
  try {
    ensureWeekPlanned(date, now);
  } catch {
    // Planning failed: show whatever is stored (empty states handle the rest).
  }
  const session = sessionsRepo.first(eq(sessions.date, date), asc(sessions.createdAt)) ?? null;
  const exercises = session
    ? sessionExercisesRepo.list(
        eq(sessionExercises.sessionId, session.id),
        asc(sessionExercises.position),
      )
    : [];
  const mealPlan = mealPlansRepo.first(eq(mealPlans.date, date), desc(mealPlans.updatedAt)) ?? null;
  const mealRows = mealPlan ? sortBySlot(mealsRepo.list(eq(meals.mealPlanId, mealPlan.id))) : [];
  return { date, session, exercises, mealPlan, meals: mealRows };
}

// ---------------------------------------------------------------------------
// AI upgrade (background, never blocking)
// ---------------------------------------------------------------------------

const AI_TIMEOUT_MS = 12_000;

const workerFetch: AiFetcher = async (body) => {
  if (!process.env.EXPO_PUBLIC_API_URL) return null; // no Worker configured: rules only
  await ensureSession(); // silent anonymous account (sheet 15, RW-03)
  return api.post<AiWeekResponse>('/ai/plan/week', body, {
    auth: 'required',
    timeoutMs: AI_TIMEOUT_MS,
  });
};

export function validatesLocally(
  plan: WeekPlan,
  profile: ProfileInput,
  history: HistoryInput,
  now: number,
  extra: WeekTweaks = {},
): boolean {
  const ctx = buildContext(profile, history, getEngineCatalogues(), {
    now,
    weekStart: plan.weekStart,
    ...tweaks(extra),
  });
  ctx.volumeRange = plan.volumeRange;
  ctx.noRepeatDays = plan.noRepeatDays;
  return validatePlan(ctx, plan).ok;
}

export async function upgradeWithAi(
  rules: PlanResult,
  profile: ProfileInput,
  history: HistoryInput,
  weekdays: number[],
  opts: Pick<GenerateOptions, 'fetchAi' | 'now' | 'fromDate' | 'adjustmentKcal'> = {},
): Promise<PlanResult | null> {
  const now = opts.now ?? Date.now();
  const fetchAi = opts.fetchAi ?? workerFetch;
  let res: AiWeekResponse | null = null;
  try {
    res = await fetchAi({
      profile,
      history,
      params: {
        weekStart: rules.weekStart,
        now,
        trainingWeekdays: weekdays,
        ...tweaks({ adjustmentKcal: opts.adjustmentKcal }),
      },
    });
  } catch {
    return null; // offline, timeout, 4xx/5xx, no session: the rules plan stays
  }
  const decision = decideAiPlan(res, rules.weekStart, (p) =>
    validatesLocally(p, profile, history, now, { adjustmentKcal: opts.adjustmentKcal }),
  );
  track('ai_plan_result', {
    accepted: decision.accept,
    reason: decision.accept ? 'ok' : decision.reason,
  });
  if (!decision.accept) return null;
  // Something newer was written meanwhile (another regenerate): never overwrite it.
  if (weekVersion(rules.weekStart) !== rules.version) return null;
  const today = localToday(now);
  const fromDate = opts.fromDate ?? (rules.weekStart > today ? rules.weekStart : today);
  return writeWeek(decision.plan, {
    fromDate,
    trainingWeekdays: weekdays,
    source: 'ai',
    now: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Swaps (thin wrappers over the engine; the other slices own the UI)
// ---------------------------------------------------------------------------

function planRowFor(
  type: Plan['type'],
  id: string | null | undefined,
  weekStart: string,
): Plan | undefined {
  if (id) {
    const p = plansRepo.get(id);
    if (p) return p;
  }
  return plansRepo.first(
    and(eq(plans.type, type), eq(plans.weekStart, weekStart)),
    desc(plans.version),
  );
}

/** Up to 3 alternative exercise ids for one exercise of a session (RW-13). */
export function swapExerciseOptions(sessionExerciseId: string, now: number = Date.now()): string[] {
  const se = sessionExercisesRepo.get(sessionExerciseId);
  const session = se ? sessionsRepo.get(se.sessionId) : undefined;
  if (!se || !session?.date) return [];
  const profile = toEngineProfile(getProfile());
  if (!profile) return [];
  const weekStart = startOfWeek(session.date);
  const payload = planRowFor('training', session.planId, weekStart)?.payload as
    TrainingPayload | undefined;
  const planned = payload?.sessions?.find((s) => s.date === session.date);
  const rows = sessionExercisesRepo.list(
    eq(sessionExercises.sessionId, session.id),
    asc(sessionExercises.position),
  );
  const index = rows.findIndex((r) => r.id === se.id);
  if (index < 0) return [];
  const engineSession: PlannedSession = {
    date: session.date,
    weekday: weekdayMon0(session.date),
    templateKey: planned?.templateKey ?? 'custom',
    title: session.title ?? '',
    fingerprint: planned?.fingerprint ?? '',
    deload: planned?.deload ?? false,
    items: rows.map((r, i) => {
      const orig = planned?.items.find((it) => it.exerciseId === r.exerciseId) ?? planned?.items[i];
      return {
        exerciseId: r.exerciseId,
        slotKey: orig?.slotKey ?? `slot${i}`,
        patternKey: orig?.patternKey ?? '',
        role: orig?.role ?? 'accessory',
        sets: r.targetSets ?? 3,
        repRange: orig?.repRange ?? [8, 12],
        targetReps: orig?.targetReps ?? 10,
        rpe: orig?.rpe ?? 8,
        restS: r.restS ?? 90,
        loadKg: r.targetLoad ?? null,
      };
    }),
  };
  try {
    return engineSwapExercise({
      profile: {
        ...profile,
        ...(payload?.trainingWeekdays ? { trainingWeekdays: payload.trainingWeekdays } : {}),
      },
      history: loadHistory(weekStart),
      catalogues: getEngineCatalogues(),
      session: engineSession,
      index,
      now,
    });
  } catch {
    return [];
  }
}

/** Apply a swap: the row keeps its position, sets and rest; the load is re-calibrated. */
export function applyExerciseSwap(
  sessionExerciseId: string,
  exerciseId: string,
  now: number = Date.now(),
) {
  return sessionExercisesRepo.update(
    sessionExerciseId,
    { exerciseId, targetLoad: null, notes: null },
    now,
  );
}

/** Up to 3 alternatives for a planned meal: same kcal and protein ±10 % (RW-33). */
export function swapMealOptions(mealId: string, now: number = Date.now()): PlannedMeal[] {
  const meal = mealsRepo.get(mealId);
  const mp = meal ? mealPlansRepo.get(meal.mealPlanId) : undefined;
  if (!meal || !mp) return [];
  const profile = toEngineProfile(getProfile());
  if (!profile) return [];
  const weekStart = startOfWeek(mp.date);
  const payload = planRowFor('nutrition', null, weekStart)?.payload as NutritionPayload | undefined;
  const plannedDay = payload?.days?.find((d) => d.date === mp.date);
  const rows = sortBySlot(mealsRepo.list(eq(meals.mealPlanId, mp.id)));
  const index = rows.filter((r) => r.recipeId).findIndex((r) => r.id === meal.id);
  const cat = getEngineCatalogues();
  const byId = new Map(cat.recipes.map((r) => [r.id, r]));
  const day: DayMealPlan = {
    date: mp.date,
    dayType: mp.dayType ?? plannedDay?.dayType ?? 'rest',
    targets: plannedDay?.targets ?? {
      kcal: mp.kcalTarget ?? 0,
      protein: mp.macros?.protein ?? 0,
      carbs: mp.macros?.carbs ?? 0,
      fat: mp.macros?.fat ?? 0,
    },
    totals: plannedDay?.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    meals: rows.flatMap((r) => {
      const rec = r.recipeId ? byId.get(r.recipeId) : undefined;
      return rec ? [mealFromRecipe(rec, r.slot as PlannedMeal['slot'], r.portion)] : [];
    }),
  };
  if (index < 0 || !day.meals[index]?.recipeId) return [];
  try {
    return engineSwapMeal({
      profile,
      history: loadHistory(weekStart),
      catalogues: cat,
      day,
      index,
      now,
      ...(payload?.noRepeatDays ? { noRepeatDays: payload.noRepeatDays } : {}),
    });
  } catch {
    return [];
  }
}

/** Apply a meal swap: recipe + portion from the engine option; the old recipe is remembered. */
export function applyMealSwap(
  mealId: string,
  option: Pick<PlannedMeal, 'recipeId' | 'servings'>,
  now: number = Date.now(),
) {
  const m = mealsRepo.get(mealId);
  if (!m) return undefined;
  return mealsRepo.update(
    mealId,
    {
      recipeId: option.recipeId,
      portion: option.servings,
      swappedFrom: m.recipeId,
      status: 'planned',
      eatenAt: null,
    },
    now,
  );
}
