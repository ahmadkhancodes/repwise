/**
 * Planning context = everything the rules compute before choosing items (sheet 28 step 2):
 * targets, split, block/deload state, volume ranges, candidate constraints, history windows.
 * Shared by the planner and the validator so both apply exactly the same rules.
 */
import { exerciseCandidates, exerciseConstraints, recipeConstraints, slotCandidates, type ExerciseConstraints, type RecipeConstraints } from './candidates';
import { daysBetween, startOfWeek, weekDates, weekdayMon0, type ISODate } from './dates';
import { computeTargets, type NutritionTargets } from './nutrition';
import { BLOCK_WEEKS, deloadDecision, epley1RM, stalledSessions, type DeloadReason } from './progression';
import { createRng, hashHex } from './random';
import {
  HistorySchema,
  ProfileSchema,
  type BlockState,
  type Exercise,
  type History,
  type HistoryInput,
  type MealSlot,
  type PastMeal,
  type PastSession,
  type Profile,
  type ProfileInput,
  type Recipe,
  type SplitType,
} from './schemas';
import {
  SPLIT_ROTATIONS,
  TEMPLATES,
  VOLUME_GROUP_KEYS,
  chooseSplit,
  groupContribution,
  isCompound,
  patternKey,
  trainingWeekdays,
  volumeTargets,
  type SlotDef,
  type VolumeGroup,
  type VolumeRange,
} from './split';
import type { Catalogues, PlanOptions } from './types';
import { clampNoRepeatDays, sessionFingerprint } from './variety';

export interface PlanningContext {
  profile: Profile;
  history: History;
  catalogues: Catalogues;
  now: number;
  weekStart: ISODate;
  dates: ISODate[];
  seed: string;
  exById: Map<string, Exercise>;
  recipeById: Map<string, Recipe>;
  exConstraints: ExerciseConstraints;
  recConstraints: RecipeConstraints;
  exercisePool: Exercise[];
  nutrition: NutritionTargets;
  split: SplitType;
  rotation: string[];
  trainingDates: ISODate[];
  block: BlockState;
  blockWeeks: number;
  weekInBlock: number;
  deload: boolean;
  deloadReason: DeloadReason;
  /** Range used for set allocation (pre-deload). */
  allocationRange: VolumeRange;
  /** Range the validator enforces (deload-adjusted, capped to what is feasible). */
  volumeRange: VolumeRange;
  noRepeatDays: number;
  mealSlots: MealSlot[];
  neverShow: Set<string>;
  moreLike: Set<string>;
  mainLiftIds: Set<string>;
  /** History strictly before weekStart, chronological. */
  pastSessions: PastSession[];
  pastMeals: PastMeal[];
  pastFingerprints: string[];
}

/** Candidate exercises per slot key across a rotation's templates. */
export function candidatesForSlots(rotation: readonly string[], pool: readonly Exercise[]): Map<string, Exercise[]> {
  const out = new Map<string, Exercise[]>();
  for (const t of rotation) for (const s of TEMPLATES[t]?.slots ?? []) {
    if (!out.has(s.key)) out.set(s.key, slotCandidates(pool, s));
  }
  return out;
}

/** Meal slots by meals per day. */
export function mealSlotsFor(mealsPerDay: number): MealSlot[] {
  const base: MealSlot[] = mealsPerDay <= 2 ? ['lunch', 'dinner'] : ['breakfast', 'lunch', 'dinner'];
  const snacks = Math.max(0, Math.min(6, mealsPerDay) - base.length);
  return [...base, ...Array.from({ length: snacks }, () => 'snack' as const)];
}

/** Rotation key for an exercise: its pattern, isolation split by first primary muscle. */
export function exercisePatternKey(ex: Pick<Exercise, 'pattern' | 'primaryMuscles'>): string {
  return patternKey(ex.pattern, ex.primaryMuscles[0]);
}

export function defaultSeed(profile: Profile, weekStart: ISODate): string {
  const key = JSON.stringify([profile.goal, profile.sex, profile.birthYear, profile.heightCm, profile.weightKg, profile.experience, profile.daysPerWeek, profile.dietType]);
  return `${weekStart}:${hashHex(key)}`;
}

function bestE1rmByDay(history: History, exerciseId: string, beforeMs: number): number[] {
  const byDay = new Map<number, number>();
  for (const s of history.sets) {
    if (s.exerciseId !== exerciseId || s.doneAt >= beforeMs) continue;
    if (s.type === 'warmup' || s.type === 'cardio' || s.reps < 1 || s.weightKg <= 0) continue;
    const day = Math.floor(s.doneAt / 86_400_000);
    const e = epley1RM(s.weightKg, Math.min(s.reps, 30));
    byDay.set(day, Math.max(byDay.get(day) ?? 0, e));
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

function chooseMainLifts(
  rotation: string[],
  pool: Exercise[],
  existing: Record<string, string>,
  previousBlock: Record<string, string> | undefined,
  moreLike: Set<string>,
  seed: string,
): Record<string, string> {
  const mainSlots = new Map<string, SlotDef>();
  for (const t of rotation) for (const s of TEMPLATES[t]?.slots ?? []) if (s.role === 'main' && !mainSlots.has(s.key)) mainSlots.set(s.key, s);
  const out: Record<string, string> = {};
  const taken = new Set<string>();
  for (const [key, slot] of mainSlots) {
    const cands = slotCandidates(pool, slot).filter((e) => !taken.has(e.id));
    const keep = existing[key];
    if (keep && cands.some((c) => c.id === keep)) {
      out[key] = keep;
      taken.add(keep);
      continue;
    }
    if (cands.length === 0) continue;
    const prev = previousBlock?.[key];
    const fresh = cands.length > 1 && prev ? cands.filter((c) => c.id !== prev) : cands;
    const rng = createRng(`${seed}/main/${key}`);
    const pick = rng.weighted(fresh, (e) => (isCompound(e) ? 2 : 1) * (e.unilateral ? 0.3 : 1) * (moreLike.has(e.id) ? 3 : 1));
    if (pick) {
      out[key] = pick.id;
      taken.add(pick.id);
    }
  }
  return out;
}

export function buildContext(profileIn: ProfileInput, historyIn: HistoryInput, catalogues: Catalogues, opts: PlanOptions): PlanningContext {
  const profile = ProfileSchema.parse(profileIn);
  const history = HistorySchema.parse(historyIn);
  const weekStart = startOfWeek(opts.weekStart);
  const dates = weekDates(weekStart);
  const seed = opts.seed ?? defaultSeed(profile, weekStart);
  const exById = new Map(catalogues.exercises.map((e) => [e.id, e]));
  const recipeById = new Map(catalogues.recipes.map((r) => [r.id, r]));
  const neverShow = new Set(history.signals.neverShow);
  const moreLike = new Set(history.signals.moreLike);
  const exConstraints = exerciseConstraints(profile, neverShow);
  const recConstraints = recipeConstraints(profile, neverShow);
  const exercisePool = exerciseCandidates(catalogues.exercises, exConstraints).filter((e) => e.pattern !== 'cardio');

  const pastSessions = history.sessions.filter((s) => s.date < weekStart).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const pastMeals = history.meals.filter((m) => m.date < weekStart);
  const pastFingerprints = pastSessions.map((s) => s.fingerprint ?? sessionFingerprint(s.exerciseIds));

  const nutrition = computeTargets(profile, weekStart, opts.adjustmentKcal !== undefined ? { adjustmentKcal: opts.adjustmentKcal } : {});
  const split = chooseSplit(profile.daysPerWeek, profile.splitPreference);
  const rotation = SPLIT_ROTATIONS[split];
  const weekdays = trainingWeekdays(profile.daysPerWeek, profile.trainingWeekdays);
  const trainingDates = dates.filter((d) => weekdays.includes(weekdayMon0(d)));

  // Block state
  const blockWeeks = BLOCK_WEEKS[profile.experience];
  const prev = history.block;
  const offset = prev ? daysBetween(prev.startDate, weekStart) : -1;
  const continuing = prev !== undefined && offset >= 0 && offset < blockWeeks * 7;
  const blockNo = continuing ? prev.blockNo : (prev?.blockNo ?? 0) + 1;
  const weekInBlock = continuing ? Math.floor(offset / 7) : 0;
  const mainLifts = chooseMainLifts(rotation, exercisePool, continuing ? prev.mainLifts : {}, continuing ? undefined : prev?.mainLifts, moreLike, `${seed}/block${blockNo}`);
  const mainLiftIds = new Set(Object.values(mainLifts));

  const beforeMs = opts.now;
  const stalls = Math.max(0, ...[...mainLiftIds].map((id) => stalledSessions(bestE1rmByDay(history, id, beforeMs).slice(-3))));
  const lastDeload = continuing ? prev.lastDeloadWeekStart : undefined;
  const weeksSinceDeload = lastDeload ? Math.floor(daysBetween(lastDeload, weekStart) / 7) : undefined;
  const dd = deloadDecision({ weekInBlock, blockWeeks, stalledSessions: stalls, ...(weeksSinceDeload !== undefined ? { weeksSinceDeload } : {}) });
  const alreadyDeloadedThisWeek = lastDeload === weekStart;
  const deload = dd.deload || alreadyDeloadedThisWeek;
  const block: BlockState = {
    startDate: continuing ? prev.startDate : weekStart,
    blockNo,
    mainLifts,
    ...(deload ? { lastDeloadWeekStart: weekStart } : lastDeload ? { lastDeloadWeekStart: lastDeload } : {}),
  };

  // Volume ranges: groups with no primary exercise for any slot of the rotation get min 0.
  const slotPools = candidatesForSlots(rotation, exercisePool);
  const trainable = new Set<VolumeGroup>();
  for (const cands of slotPools.values()) for (const e of cands) {
    const c = groupContribution(e);
    for (const g of VOLUME_GROUP_KEYS) if (c[g] === 1) trainable.add(g);
  }
  const base = { experience: profile.experience, daysPerWeek: trainingDates.length, sessionMin: profile.sessionMin, weekInBlock, trainableGroups: trainable };
  const allocationRange = volumeTargets(base);
  const volumeRange = volumeTargets({ ...base, deload });

  return {
    profile,
    history,
    catalogues,
    now: opts.now,
    weekStart,
    dates,
    seed,
    exById,
    recipeById,
    exConstraints,
    recConstraints,
    exercisePool,
    nutrition,
    split,
    rotation,
    trainingDates,
    block,
    blockWeeks,
    weekInBlock,
    deload,
    deloadReason: deload ? dd.reason ?? 'stall' : null,
    allocationRange,
    volumeRange,
    noRepeatDays: clampNoRepeatDays(opts.noRepeatDays),
    mealSlots: mealSlotsFor(profile.mealsPerDay),
    neverShow,
    moreLike,
    mainLiftIds,
    pastSessions,
    pastMeals,
    pastFingerprints,
  };
}

/** Day type for a date under this context. */
export function dayTypeOf(ctx: Pick<PlanningContext, 'trainingDates'>, date: ISODate): 'training' | 'rest' {
  return ctx.trainingDates.includes(date) ? 'training' : 'rest';
}

