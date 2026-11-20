/**
 * Property runner: plans one week per generated profile on the REAL catalogues (via
 * @repwise/content's toEngine adapter) and collects every invariant violation, so each property can
 * be asserted (and reported) separately.
 */
import { engineCatalogues } from '@repwise/content';
import {
  FINGERPRINT_WINDOW,
  ProfileSchema,
  addDays,
  buildContext,
  planSessions,
  planWeekWithVariety,
  sessionFingerprint,
  type Catalogues,
  type HistoryInput,
  type PastSession,
  type ProfileInput,
  type WeekPlan,
} from '../../src';
import { profiles } from './gen';
import { bodyweightVarietyGap, checkMeals, checkNumbers, checkNutrition, checkSessions, dayHitsTargets, indexCatalogues, missedGroups, type Indexed } from './invariants';

const real = engineCatalogues();
export const CATALOGUES: Catalogues = { exercises: real.exercises, recipes: real.recipes };
export const IX: Indexed = indexCatalogues(CATALOGUES);
export const NOW = Date.UTC(2026, 10, 23, 8, 0, 0);
export const WEEK = '2026-11-23';
const DAY = 86_400_000;

export type Property = 'finite' | 'nutrition' | 'meals' | 'sessions' | 'coverage' | 'deterministic' | 'no_throw';

export interface RunStats {
  plans: number;
  ms: number[];
  days: number;
  daysOnTarget: number;
  emptyDays: number;
  /** Validation errors seen (meal macro misses are content gaps, reported not asserted). */
  validation: Record<string, number>;
  violations: Record<Property, string[]>;
}

/** Every n-th profile is planned twice end to end (meals included). */
export const FULL_REPLAN_EVERY = 10;

const fmt = (i: number, p: ProfileInput, msg: string) => `#${i} ${msg} :: ${JSON.stringify(p)}`;

/** Plans `n` random profiles from `seed` and checks every property on each plan. */
export async function runPlanProperties(seed: number, n: number): Promise<RunStats> {
  const stats: RunStats = {
    plans: 0,
    ms: [],
    days: 0,
    daysOnTarget: 0,
    emptyDays: 0,
    validation: {},
    violations: { finite: [], nutrition: [], meals: [], sessions: [], coverage: [], deterministic: [], no_throw: [] },
  };
  const v = stats.violations;
  for (const [i, p] of profiles(seed, n).entries()) {
    let plan: WeekPlan;
    try {
      const t = Date.now();
      plan = await planWeekWithVariety(p, {}, CATALOGUES, { now: NOW, weekStart: WEEK });
      stats.ms.push(Date.now() - t);
    } catch (e) {
      v.no_throw.push(fmt(i, p, String(e)));
      continue;
    }
    stats.plans += 1;
    for (const m of checkNumbers(plan)) v.finite.push(fmt(i, p, m));
    for (const m of checkNutrition(p, plan)) v.nutrition.push(fmt(i, p, m));
    for (const m of checkMeals(p, plan, IX)) v.meals.push(fmt(i, p, m));
    for (const m of checkSessions(p, plan, IX)) v.sessions.push(fmt(i, p, m));
    // Validation of the session half must always pass (only meal macro misses are content gaps).
    for (const e of plan.validation.errors) {
      stats.validation[e.code] = (stats.validation[e.code] ?? 0) + 1;
      if (e.code === 'fingerprint_repeat' && bodyweightVarietyGap(p)) continue;
      if (e.code !== 'kcal_out_of_range' && e.code !== 'protein_out_of_range') v.sessions.push(fmt(i, p, `validation ${JSON.stringify(e)}`));
    }
    // Short sessions (≤ 30 min, 4 exercises) cannot always reach all 8 groups; longer ones must.
    if (ProfileSchema.parse(p).sessionMin > 30) for (const g of missedGroups(p, plan, IX)) v.coverage.push(fmt(i, p, `${g} untrained`));
    for (const d of plan.days) {
      stats.days += 1;
      if (dayHitsTargets(plan, d.date)) stats.daysOnTarget += 1;
      if (d.meals.length === 0) {
        stats.emptyDays += 1;
        // An empty day must always come with a reason.
        if (!plan.warnings.some((w) => w.code === 'no_candidates' || (w.code === 'slot_skipped' && w.date === d.date))) {
          v.meals.push(fmt(i, p, `${d.date} has no meals and no warning`));
        }
      }
    }
    // Determinism: the training half (context + sessions) is re-derived for every profile; the
    // whole plan (meals included, the expensive half) for every FULL_REPLAN_EVERY-th profile.
    const ctx = buildContext(p, {}, CATALOGUES, { now: NOW, weekStart: WEEK });
    if (JSON.stringify(planSessions(ctx, [])) !== JSON.stringify(plan.sessions)) v.deterministic.push(fmt(i, p, 'sessions differ on a second run'));
    if (i % FULL_REPLAN_EVERY === 0) {
      const again = await planWeekWithVariety(p, {}, CATALOGUES, { now: NOW, weekStart: WEEK });
      if (JSON.stringify(again) !== JSON.stringify(plan)) v.deterministic.push(fmt(i, p, 'second run differs'));
    }
  }
  return stats;
}

export interface RepeatStats {
  sessions: number;
  /** Fingerprint equal to one of the previous FINGERPRINT_WINDOW sessions (the rule). */
  windowRepeats: string[];
  /** Window repeats on the known bodyweight-only 4+ day content gap (reported, not asserted). */
  gapRepeats: number;
  /** Fingerprint equal to ANY earlier session within the simulated weeks (reported). */
  anyRepeats: number;
  /** Non-main exercise repeating the previous variant of its pattern key. */
  consecutive: string[];
}

/** Sessions-only simulation over `weeks` weeks per profile (history fed back like the app does). */
export function runRepeatProperty(seed: number, n: number, weeks: number): RepeatStats {
  const out: RepeatStats = { sessions: 0, windowRepeats: [], gapRepeats: 0, anyRepeats: 0, consecutive: [] };
  for (const [i, p] of profiles(seed, n).entries()) {
    let history: HistoryInput = {};
    const fps: string[] = [];
    const last = new Map<string, Set<string>>();
    for (let w = 0; w < weeks; w++) {
      const weekStart = addDays(WEEK, 7 * w);
      const ctx = buildContext(p, history, CATALOGUES, { now: NOW + w * 7 * DAY, weekStart });
      const sessions = planSessions(ctx, []);
      for (const s of sessions) {
        out.sessions += 1;
        const fp = sessionFingerprint(s.items.map((it) => it.exerciseId));
        if (fps.slice(-FINGERPRINT_WINDOW).includes(fp)) {
          if (bodyweightVarietyGap(p)) out.gapRepeats += 1;
          else out.windowRepeats.push(fmt(i, p, `${s.date} repeats a recent session`));
        }
        if (fps.includes(fp)) out.anyRepeats += 1;
        fps.push(fp);
        const local = new Map<string, Set<string>>();
        for (const it of s.items) {
          if (it.role === 'main' || ctx.mainLiftIds.has(it.exerciseId)) continue;
          if (last.get(it.patternKey)?.has(it.exerciseId)) out.consecutive.push(fmt(i, p, `${s.date} ${it.exerciseId} repeats its pattern's previous variant`));
          if (!local.has(it.patternKey)) local.set(it.patternKey, new Set());
          local.get(it.patternKey)?.add(it.exerciseId);
        }
        for (const [k, val] of local) last.set(k, val);
      }
      const past: PastSession[] = sessions.map((s) => ({
        date: s.date,
        exerciseIds: s.items.map((it) => it.exerciseId),
        patternKeys: s.items.map((it) => it.patternKey),
        mainExerciseIds: s.items.filter((it) => ctx.mainLiftIds.has(it.exerciseId)).map((it) => it.exerciseId),
        templateKey: s.templateKey,
        fingerprint: s.fingerprint,
        deload: s.deload,
      }));
      history = { ...history, sessions: [...(history.sessions ?? []), ...past], block: ctx.block };
    }
  }
  return out;
}

export function summarise(ms: number[]): { mean: number; p50: number; p95: number; max: number } {
  const s = [...ms].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  return { mean: s.reduce((a, b) => a + b, 0) / Math.max(1, s.length), p50: at(0.5), p95: at(0.95), max: s[s.length - 1] ?? 0 };
}
