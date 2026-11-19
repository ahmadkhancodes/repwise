/**
 * Rules-only planner pipeline (sheet 28 steps 2 + 4, owner decision D2: the engine IS the v1 planner).
 *   buildContext → sessions (rotation + fingerprints + set allocation + progression)
 *               → meals (candidate pools + variety weights + portion solver)
 *               → validate.
 * Optional LLM variety layer: `planWeekWithVariety` asks a hook for picks; anything that does
 * not pass `validate` falls back to the rules plan.
 */
import { recipeCandidates, recipeSafe, slotCandidates } from './candidates';
import { buildContext, exercisePatternKey, dayTypeOf, type PlanningContext } from './context';
import { startOfWeek, weekdayMon0, daysBetween, type ISODate } from './dates';
import { meanRecovery, muscleHeatmap } from './heatmap';
import { solvePortions, totalsFor, type PortionItem } from './portion';
import { deloadSets, doubleProgression, roundToIncrement } from './progression';
import { createRng, type Rng } from './random';
import {
  LlmMealsOutputSchema,
  LlmWorkoutOutputSchema,
  type Cuisine,
  type Exercise,
  type HistoryInput,
  type MealSlot,
  type Muscle,
  type PastMeal,
  type PastSession,
  type ProfileInput,
  type Recipe,
} from './schemas';
import {
  SET_LIMITS,
  TEMPLATES,
  VOLUME_GROUP_KEYS,
  allocateSets,
  exercisesPerSession,
  groupContribution,
  isLowerBody,
  setsPerSession,
  weeklyVolume,
  type DayTemplate,
  type SlotDef,
  type SlotRole,
} from './split';
import type {
  Catalogues,
  DayMealPlan,
  LlmMealsInput,
  LlmVarietyHook,
  LlmWorkoutInput,
  PlanOptions,
  PlannedExercise,
  PlannedMeal,
  PlannedSession,
  PlanWarning,
  WeekPlan,
} from './types';
import { pastSessionRecords, sessionRecord, validateDays, validatePlan, validateSessions } from './validate';
import {
  blockedRecipes,
  countsAsProteinSource,
  exerciseWeight,
  fingerprintIsFresh,
  isStaple,
  lastVariantsByPattern,
  likedTraits,
  proteinShare,
  recipeWeight,
  sessionFingerprint,
  type SessionVariantRecord,
} from './variety';

// ---------------------------------------------------------------------------
// Prescription
// ---------------------------------------------------------------------------

const BODYWEIGHT_KIT = new Set(['bodyweight', 'pullup_bar', 'bench', 'band']);

export function repRangeFor(role: SlotRole, ex: Pick<Exercise, 'pattern'>, experience: string): [number, number] {
  if (role === 'main') return experience === 'beginner' ? [6, 10] : [5, 8];
  if (role === 'secondary') return [8, 12];
  return ex.pattern === 'core' ? [12, 20] : [10, 15];
}

const REST_S: Record<SlotRole, number> = { main: 150, secondary: 105, accessory: 75 };

/** Last session's working sets for an exercise (before `now`). */
function lastWorkingSets(ctx: PlanningContext, exerciseId: string): { weight: number; reps: number; rpe?: number }[] {
  let lastDay = -Infinity;
  for (const s of ctx.history.sets) {
    if (s.exerciseId === exerciseId && s.doneAt < ctx.now && (s.type === 'working' || s.type === 'failure')) {
      lastDay = Math.max(lastDay, Math.floor(s.doneAt / 86_400_000));
    }
  }
  if (lastDay === -Infinity) return [];
  return ctx.history.sets
    .filter((s) => s.exerciseId === exerciseId && Math.floor(s.doneAt / 86_400_000) === lastDay && (s.type === 'working' || s.type === 'failure'))
    .map((s) => (s.rpe !== undefined ? { weight: s.weightKg, reps: s.reps, rpe: s.rpe } : { weight: s.weightKg, reps: s.reps }));
}

export function prescribe(ctx: PlanningContext, ex: Exercise, slotKey: string, role: SlotRole): PlannedExercise {
  const repRange = repRangeFor(role, ex, ctx.profile.experience);
  const bodyweight = ex.equipment.every((e) => BODYWEIGHT_KIT.has(e));
  const last = lastWorkingSets(ctx, ex.id);
  const p = doubleProgression({ lastSets: last, repRange, lowerBody: isLowerBody(ex), bodyweight, unit: 'kg' });
  let loadKg = bodyweight ? null : p.weight;
  let targetReps = Math.min(30, p.targetReps);
  if (ctx.deload) {
    if (loadKg !== null) loadKg = roundToIncrement(loadKg * 0.9, 2.5, 'down');
    targetReps = repRange[0];
  }
  return {
    exerciseId: ex.id,
    slotKey,
    patternKey: exercisePatternKey(ex),
    role,
    sets: SET_LIMITS[role].initial,
    repRange,
    targetReps,
    rpe: ctx.deload ? 6 : role === 'accessory' ? 9 : 8,
    restS: ex.pattern === 'core' ? 60 : REST_S[role],
    loadKg,
  };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function recentUseMap(records: readonly SessionVariantRecord[], n = 3): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of records.slice(-n)) for (const id of r.exerciseIds) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

function likedMuscles(ctx: PlanningContext): Set<Muscle> {
  const s = new Set<Muscle>();
  for (const id of ctx.moreLike) ctx.exById.get(id)?.primaryMuscles.forEach((m) => s.add(m));
  return s;
}

/** Rotation start: continue after the last template done; otherwise the most recovered first session. */
function rotationStart(ctx: PlanningContext): number {
  const last = ctx.pastSessions[ctx.pastSessions.length - 1]?.templateKey;
  const idx = last ? ctx.rotation.indexOf(last) : -1;
  if (idx >= 0) return (idx + 1) % ctx.rotation.length;
  if (ctx.history.sets.length === 0) return 0;
  const heat = muscleHeatmap(ctx.history.sets, ctx.exById, ctx.now);
  let best = 0;
  let bestScore = -Infinity;
  ctx.rotation.forEach((t, j) => {
    const muscles: Muscle[] = [];
    for (const slot of TEMPLATES[t]?.slots ?? []) {
      if (slot.role !== 'main') continue;
      const id = ctx.block.mainLifts[slot.key];
      const ex = id ? ctx.exById.get(id) : undefined;
      if (ex) muscles.push(...ex.primaryMuscles);
    }
    const score = meanRecovery(heat, muscles);
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = j;
    }
  });
  return best;
}

function buildItems(
  ctx: PlanningContext,
  template: DayTemplate,
  prevVariants: Map<string, Set<string>>,
  recentUse: Map<string, number>,
  liked: Set<Muscle>,
  rng: Rng,
): { items: PlannedExercise[]; skipped: string[] } {
  const n = exercisesPerSession(ctx.profile.sessionMin);
  const items: PlannedExercise[] = [];
  const used = new Set<string>();
  const skipped: string[] = [];
  for (const slot of template.slots) {
    if (items.length >= n) break;
    let ex: Exercise | undefined;
    let role: SlotRole = slot.role;
    if (slot.role === 'main') {
      const id = ctx.block.mainLifts[slot.key];
      const e = id ? ctx.exById.get(id) : undefined;
      if (e && !used.has(e.id)) ex = e;
      else role = 'secondary';
    }
    if (!ex) {
      const cands = slotCandidates(ctx.exercisePool, slot).filter(
        (e) => !used.has(e.id) && !ctx.mainLiftIds.has(e.id) && !(prevVariants.get(exercisePatternKey(e))?.has(e.id) ?? false),
      );
      ex = rng.weighted(cands, (e) => exerciseWeight(e, { moreLike: ctx.moreLike, likedMuscles: liked, recentUse }));
    }
    if (!ex) {
      skipped.push(slot.key);
      continue;
    }
    used.add(ex.id);
    items.push(prescribe(ctx, ex, slot.key, role));
  }
  return { items, skipped };
}

function titleFor(ctx: PlanningContext, template: DayTemplate, items: PlannedExercise[]): string {
  const first = items[0] ? ctx.exById.get(items[0].exerciseId)?.name : undefined;
  return first ? `${template.name} · ${first}` : template.name;
}

export function planSessions(ctx: PlanningContext, warnings: PlanWarning[]): PlannedSession[] {
  const rng = createRng(`${ctx.seed}/workouts`);
  const records = pastSessionRecords(ctx);
  const fps = [...ctx.pastFingerprints];
  const liked = likedMuscles(ctx);
  const start = rotationStart(ctx);
  const sessions: PlannedSession[] = [];

  ctx.trainingDates.forEach((date, i) => {
    const templateKey = ctx.rotation[(start + i) % ctx.rotation.length] as string;
    const template = TEMPLATES[templateKey] as DayTemplate;
    const prevVariants = lastVariantsByPattern(records);
    const recentUse = recentUseMap(records);
    let chosen: { items: PlannedExercise[]; skipped: string[] } | undefined;
    for (let attempt = 0; attempt < 40; attempt++) {
      const arng = rng.fork(`${date}/${attempt}`);
      const built = buildItems(ctx, template, prevVariants, recentUse, liked, arng);
      if (attempt >= 10 && built.items.length > 2) {
        // Re-order the non-main tail: order is part of the fingerprint.
        const head = built.items.filter((it) => it.role === 'main');
        const tail = arng.shuffle(built.items.filter((it) => it.role !== 'main'));
        built.items = [...head, ...tail];
      }
      chosen = built;
      if (fingerprintIsFresh(sessionFingerprint(built.items.map((it) => it.exerciseId)), fps)) break;
    }
    const { items, skipped } = chosen as { items: PlannedExercise[]; skipped: string[] };
    if (skipped.length) warnings.push({ code: 'slot_skipped', message: `No suitable exercise for ${skipped.join(', ')}`, date });
    const fp = sessionFingerprint(items.map((it) => it.exerciseId));
    const session: PlannedSession = { date, weekday: weekdayMon0(date), templateKey, title: titleFor(ctx, template, items), items, fingerprint: fp, deload: ctx.deload };
    sessions.push(session);
    fps.push(fp);
    records.push(sessionRecord(ctx, session));
  });

  // Weekly set allocation against the (pre-deload) range, then deload cut.
  allocateSets(sessions, ctx.exById, ctx.allocationRange, setsPerSession(ctx.profile.sessionMin));
  dropOverVolume(ctx, sessions);
  if (ctx.deload) for (const s of sessions) for (const it of s.items) it.sets = deloadSets(it.sets);

  // What could not be reached becomes the enforced range (with a warning), so the rules plan is the feasible best.
  const vol = weeklyVolume(sessions, ctx.exById);
  for (const g of VOLUME_GROUP_KEYS) {
    if (vol[g] < ctx.volumeRange[g].min) {
      warnings.push({ code: 'volume_capped', message: `${g}: ${vol[g]} of ${ctx.volumeRange[g].min} weekly sets fit your days, time and equipment` });
      ctx.volumeRange[g] = { ...ctx.volumeRange[g], min: Math.floor(vol[g]) };
    }
    if (vol[g] > ctx.volumeRange[g].max) {
      warnings.push({ code: 'volume_capped', message: `${g}: ${vol[g]} weekly sets exceed ${ctx.volumeRange[g].max}` });
      ctx.volumeRange[g] = { ...ctx.volumeRange[g], max: Math.ceil(vol[g]) };
    }
  }
  return sessions;
}

/** If minimum sets still overshoot a group's max, drop accessories hitting it (sessions keep ≥ 3 items). */
function dropOverVolume(ctx: PlanningContext, sessions: PlannedSession[]): void {
  for (let guard = 0; guard < 50; guard++) {
    const vol = weeklyVolume(sessions, ctx.exById);
    const over = VOLUME_GROUP_KEYS.find((g) => vol[g] > ctx.allocationRange[g].max);
    if (!over) return;
    let target: { s: PlannedSession; idx: number; credit: number } | undefined;
    for (const s of sessions) {
      if (s.items.length <= 3) continue;
      s.items.forEach((it, idx) => {
        if (it.role === 'main') return;
        const ex = ctx.exById.get(it.exerciseId);
        const credit = ex ? groupContribution(ex)[over] : 0;
        if (credit > 0 && (!target || credit > target.credit)) target = { s, idx, credit };
      });
    }
    if (!target) return;
    target.s.items.splice(target.idx, 1);
    target.s.fingerprint = sessionFingerprint(target.s.items.map((it) => it.exerciseId));
  }
}

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

interface MealPlanResult {
  days: DayMealPlan[];
  failures: number;
  extraSnacks: ISODate[];
  relaxed: Set<string>;
}

const portionItem = (r: Recipe): PortionItem => ({ perServing: r.perServing, min: r.scalable.min, max: r.scalable.max });
const r1 = (x: number) => Math.round(x * 10) / 10;

export function mealFromRecipe(r: Recipe, slot: MealSlot, servings: number): PlannedMeal {
  return {
    slot,
    recipeId: r.id,
    servings,
    kcal: Math.round(r.perServing.kcal * servings),
    protein: r1(r.perServing.protein * servings),
    carbs: r1(r.perServing.carbs * servings),
    fat: r1(r.perServing.fat * servings),
  };
}

const safeCache = new WeakMap<PlanningContext, Recipe[]>();
/** Catalogue filtered by the hard safety rules, computed once per context. */
function safeRecipes(ctx: PlanningContext): Recipe[] {
  let list = safeCache.get(ctx);
  if (!list) {
    list = ctx.catalogues.recipes.filter((r) => recipeSafe(r, ctx.recConstraints));
    safeCache.set(ctx, list);
  }
  return list;
}

function pickDay(
  ctx: PlanningContext,
  slots: MealSlot[],
  date: ISODate,
  target: { kcal: number; protein: number },
  window: number,
  planned: PastMeal[],
  ingredientUse: Map<string, number>,
  prevCuisine: Cuisine | undefined,
  liked: ReturnType<typeof likedTraits>,
  relaxed: Set<string>,
  rng: Rng,
): { recipes: Recipe[]; slots: MealSlot[] } | null {
  const blockedBase = blockedRecipes([...ctx.pastMeals, ...planned], date, window);
  const chosen: Recipe[] = [];
  const chosenSlots: MealSlot[] = [];
  const sources = new Set<string>();
  const t = target.kcal > 0 ? (4 * target.protein) / target.kcal : 0.3;
  let lastCuisine = prevCuisine;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i] as MealSlot;
    const blocked = new Set([...blockedBase, ...chosen.map((r) => r.id)]);
    const { pool, relaxed: rel } = recipeCandidates(safeRecipes(ctx), ctx.recConstraints, slot, blocked, 4, true);
    rel.forEach((x) => relaxed.add(x));
    const eligible = pool.filter((r) => !countsAsProteinSource(r.proteinSource) || !sources.has(r.proteinSource));
    const remaining = slots.length - i;
    const sumShares = chosen.reduce((a, r) => a + proteinShare(r), 0);
    const want = Math.min(0.7, Math.max(0.05, (t * slots.length - sumShares) / remaining));
    const pick = rng.weighted(eligible, (r) =>
      recipeWeight(r, {
        moreLike: ctx.moreLike,
        likedCuisines: liked.cuisines,
        likedSources: liked.sources,
        preferredCuisines: ctx.profile.cuisines,
        ...(lastCuisine ? { previousCuisine: lastCuisine } : {}),
        ingredientUse,
        proteinShareTarget: want,
      }),
    );
    if (!pick) {
      // Snacks are optional: skip one that has no eligible recipe; main meals are not.
      if (slot === 'snack') continue;
      return null;
    }
    chosen.push(pick);
    chosenSlots.push(slot);
    if (countsAsProteinSource(pick.proteinSource)) sources.add(pick.proteinSource);
    lastCuisine = pick.cuisine;
  }
  return chosen.length ? { recipes: chosen, slots: chosenSlots } : null;
}

function planMealsWithWindow(ctx: PlanningContext, window: number): MealPlanResult {
  const rng = createRng(`${ctx.seed}/meals/w${window}`);
  const planned: PastMeal[] = [];
  const ingredientUse = new Map<string, number>();
  const liked = likedTraits(ctx.moreLike, ctx.recipeById);
  const relaxed = new Set<string>();
  const days: DayMealPlan[] = [];
  const extraSnacks: ISODate[] = [];
  let failures = 0;
  let prevCuisine: Cuisine | undefined;

  for (const date of ctx.dates) {
    const dayType = dayTypeOf(ctx, date);
    const target = dayType === 'training' ? ctx.nutrition.training : ctx.nutrition.rest;
    let best: { recipes: Recipe[]; slots: MealSlot[]; servings: number[]; ok: boolean; score: number } | undefined;
    outer: for (let extra = 0; extra <= 2; extra++) {
      const slots: MealSlot[] = [...ctx.mealSlots, ...Array.from({ length: extra }, () => 'snack' as const)];
      for (let attempt = 0; attempt < 30; attempt++) {
        const picked = pickDay(ctx, slots, date, target, window, planned, ingredientUse, prevCuisine, liked, relaxed, rng.fork(`${date}/${extra}/${attempt}`));
        if (!picked) continue;
        const res = solvePortions(picked.recipes.map(portionItem), target);
        const score = Math.abs(res.kcalError) / (target.kcal * 0.05) + Math.abs(res.proteinError) / 10 + extra;
        if (!best || (res.ok && !best.ok) || (res.ok === best.ok && score < best.score)) {
          best = { recipes: picked.recipes, slots: picked.slots, servings: res.servings, ok: res.ok, score };
        }
        if (res.ok) break outer;
      }
    }
    if (!best) {
      failures += 1;
      days.push({ date, dayType, targets: target, meals: [], totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 } });
      continue;
    }
    if (!best.ok) failures += 1;
    if (best.slots.length > ctx.mealSlots.length) extraSnacks.push(date);
    const meals = best.recipes.map((r, i) => mealFromRecipe(r, best!.slots[i] as MealSlot, best!.servings[i] as number));
    days.push({ date, dayType, targets: target, meals, totals: totalsFor(best.recipes.map(portionItem), best.servings) });
    for (const [i, r] of best.recipes.entries()) {
      planned.push({ date, slot: best.slots[i] as MealSlot, recipeId: r.id });
      for (const ing of r.ingredients) if (!isStaple(ing.id)) ingredientUse.set(ing.id, (ingredientUse.get(ing.id) ?? 0) + 1);
    }
    prevCuisine = best.recipes[best.recipes.length - 1]?.cuisine;
  }
  return { days, failures, extraSnacks, relaxed };
}

export function planMeals(ctx: PlanningContext, warnings: PlanWarning[]): DayMealPlan[] {
  const requested = ctx.noRepeatDays;
  const windows = [...new Set([requested, Math.max(7, Math.ceil((requested + 7) / 2)), 7])].sort((a, b) => b - a);
  let chosen: { res: MealPlanResult; window: number } | undefined;
  for (const w of windows) {
    const res = planMealsWithWindow(ctx, w);
    if (!chosen || res.failures < chosen.res.failures) chosen = { res, window: w };
    if (res.failures === 0) break;
  }
  const { res, window } = chosen as { res: MealPlanResult; window: number };
  if (window < requested) {
    warnings.push({ code: 'repeat_window_relaxed', message: `Not enough matching recipes for a ${requested}-day no-repeat window; using ${window} days` });
  }
  ctx.noRepeatDays = window;
  if (res.relaxed.size) warnings.push({ code: 'recipe_filters_relaxed', message: `Relaxed: ${[...res.relaxed].join(', ')}` });
  for (const d of res.extraSnacks) warnings.push({ code: 'extra_snack_added', message: 'Added a snack to reach your targets', date: d });
  return res.days;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function assemble(ctx: PlanningContext, sessions: PlannedSession[], days: DayMealPlan[], warnings: PlanWarning[], generatedBy: 'rules' | 'llm'): WeekPlan {
  return {
    version: 1,
    weekStart: ctx.weekStart,
    dates: ctx.dates,
    seed: ctx.seed,
    generatedBy,
    split: ctx.split,
    trainingDates: ctx.trainingDates,
    block: ctx.block,
    weekInBlock: ctx.weekInBlock,
    deload: ctx.deload,
    deloadReason: ctx.deloadReason,
    nutrition: ctx.nutrition,
    volume: weeklyVolume(sessions, ctx.exById),
    volumeRange: ctx.volumeRange,
    noRepeatDays: ctx.noRepeatDays,
    sessions,
    days,
    warnings,
    validation: validatePlan(ctx, { sessions, days }),
  };
}

function rulesPlan(ctx: PlanningContext): WeekPlan {
  const warnings: PlanWarning[] = [];
  if (ctx.nutrition.consultProfessional) {
    warnings.push({ code: 'safety_general_plan', message: `General plan (${ctx.nutrition.flags.join(', ')})` });
  }
  const sessions = planSessions(ctx, warnings);
  const days = planMeals(ctx, warnings);
  return assemble(ctx, sessions, days, warnings, 'rules');
}

/** A week of sessions + daily meal plans that pass `validate` (see `plan.validation`). Deterministic per seed. */
export function planWeek(profile: ProfileInput, history: HistoryInput, catalogues: Catalogues, opts: PlanOptions): WeekPlan {
  return rulesPlan(buildContext(profile, history, catalogues, opts));
}

export interface DayPlan {
  date: ISODate;
  session: PlannedSession | null;
  meals: DayMealPlan;
  plan: WeekPlan;
}

/** One day, taken from the week plan containing it (so the preview always matches the week). */
export function planDay(
  profile: ProfileInput,
  history: HistoryInput,
  catalogues: Catalogues,
  opts: Omit<PlanOptions, 'weekStart'> & { date: ISODate },
): DayPlan {
  const plan = planWeek(profile, history, catalogues, { ...opts, weekStart: startOfWeek(opts.date) });
  const meals = plan.days.find((d) => d.date === opts.date) as DayMealPlan;
  return { date: opts.date, session: plan.sessions.find((s) => s.date === opts.date) ?? null, meals, plan };
}

/** Append a plan to history as if it was done (used by the app after a week and by simulations). */
export function appendPlanToHistory(history: HistoryInput, plan: WeekPlan): HistoryInput {
  const sessions: PastSession[] = plan.sessions.map((s) => ({
    date: s.date,
    exerciseIds: s.items.map((i) => i.exerciseId),
    patternKeys: s.items.map((i) => i.patternKey),
    mainExerciseIds: s.items.filter((i) => i.role === 'main').map((i) => i.exerciseId),
    templateKey: s.templateKey,
    fingerprint: s.fingerprint,
    deload: s.deload,
  }));
  const meals: PastMeal[] = plan.days.flatMap((d) => d.meals.map((m) => ({ date: d.date, slot: m.slot, recipeId: m.recipeId })));
  return {
    ...history,
    sessions: [...(history.sessions ?? []).filter((s) => s.date < plan.weekStart), ...sessions],
    meals: [...(history.meals ?? []).filter((m) => m.date < plan.weekStart), ...meals],
    block: plan.block,
  };
}

// ---------------------------------------------------------------------------
// Swaps
// ---------------------------------------------------------------------------

function sampleWithoutReplacement<T>(rng: Rng, items: T[], weight: (t: T) => number, count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < count && pool.length) {
    const pick = rng.weighted(pool, weight);
    if (pick === undefined) break;
    out.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}

export interface SwapExerciseArgs {
  profile: ProfileInput;
  history: HistoryInput;
  catalogues: Catalogues;
  session: PlannedSession;
  index: number;
  now: number;
  seed?: string;
  count?: number;
}

/** RW-13: up to 3 alternatives — same pattern, available equipment, injury-safe, not recently used. */
export function swapExercise(args: SwapExerciseArgs): string[] {
  const ctx = buildContext(args.profile, args.history, args.catalogues, { now: args.now, weekStart: args.session.date, ...(args.seed ? { seed: args.seed } : {}) });
  const item = args.session.items[args.index];
  if (!item) throw new RangeError('index out of range');
  const current = ctx.exById.get(item.exerciseId);
  if (!current) return [];
  const inSession = new Set(args.session.items.map((i) => i.exerciseId));
  const recent = new Set(ctx.pastSessions.filter((s) => daysBetween(s.date, args.session.date) > 0).slice(-2).flatMap((s) => s.exerciseIds));
  const key = exercisePatternKey(current);
  const ok = (e: Exercise) => !inSession.has(e.id) && !recent.has(e.id) && (item.role === 'main' || !ctx.mainLiftIds.has(e.id));
  let cands = ctx.exercisePool.filter((e) => exercisePatternKey(e) === key && ok(e));
  if (cands.length < (args.count ?? 3)) {
    const extra = slotCandidates(ctx.exercisePool, { pattern: current.pattern }).filter(
      (e) => ok(e) && !cands.includes(e) && e.primaryMuscles.some((m) => current.primaryMuscles.includes(m)),
    );
    cands = [...cands, ...extra];
  }
  const rng = createRng(`${ctx.seed}/swap/${args.session.date}/${args.index}`);
  return sampleWithoutReplacement(rng, cands, (e) => exerciseWeight(e, { moreLike: ctx.moreLike }), args.count ?? 3).map((e) => e.id);
}

export interface SwapMealArgs {
  profile: ProfileInput;
  history: HistoryInput;
  catalogues: Catalogues;
  day: DayMealPlan;
  index: number;
  now: number;
  seed?: string;
  count?: number;
  noRepeatDays?: number;
}

/** RW-33: up to 3 alternatives with the same kcal and protein ±10%, safe and outside the no-repeat window. */
export function swapMeal(args: SwapMealArgs): PlannedMeal[] {
  const ctx = buildContext(args.profile, args.history, args.catalogues, {
    now: args.now,
    weekStart: args.day.date,
    ...(args.seed ? { seed: args.seed } : {}),
    ...(args.noRepeatDays !== undefined ? { noRepeatDays: args.noRepeatDays } : {}),
  });
  const meal = args.day.meals[args.index];
  if (!meal) throw new RangeError('index out of range');
  const others = args.day.meals.filter((_, i) => i !== args.index);
  const otherSources = new Set(
    others.map((m) => ctx.recipeById.get(m.recipeId)?.proteinSource).filter((s): s is NonNullable<typeof s> => !!s && countsAsProteinSource(s)),
  );
  const blocked = blockedRecipes(
    args.history.meals?.filter((m) => m.date !== args.day.date) ?? [],
    args.day.date,
    ctx.noRepeatDays,
  );
  args.day.meals.forEach((m) => blocked.add(m.recipeId));
  const { pool } = recipeCandidates(ctx.catalogues.recipes, ctx.recConstraints, meal.slot, blocked, 1);
  const options: PlannedMeal[] = [];
  const byId = new Map<string, Recipe>();
  for (const r of pool) {
    if (countsAsProteinSource(r.proteinSource) && otherSources.has(r.proteinSource)) continue;
    if (r.perServing.kcal <= 0) continue;
    const s = Math.min(r.scalable.max, Math.max(r.scalable.min, roundToIncrement(meal.kcal / r.perServing.kcal, 0.25)));
    const m = mealFromRecipe(r, meal.slot, s);
    if (Math.abs(m.kcal - meal.kcal) > meal.kcal * 0.1) continue;
    if (Math.abs(m.protein - meal.protein) > Math.max(meal.protein * 0.1, 3)) continue;
    options.push(m);
    byId.set(r.id, r);
  }
  const rng = createRng(`${ctx.seed}/swapmeal/${args.day.date}/${args.index}`);
  return sampleWithoutReplacement(rng, options, (m) => recipeWeight(byId.get(m.recipeId) as Recipe, { moreLike: ctx.moreLike }), args.count ?? 3);
}

// ---------------------------------------------------------------------------
// Optional LLM variety layer
// ---------------------------------------------------------------------------

function llmWorkoutInput(ctx: PlanningContext, rules: WeekPlan): LlmWorkoutInput {
  return {
    weekStart: ctx.weekStart,
    recentFingerprints: ctx.pastFingerprints.slice(-10),
    sessions: rules.sessions.map((s) => ({
      day: s.date,
      templateKey: s.templateKey,
      slots: s.items.map((it) => {
        const slot = TEMPLATES[s.templateKey]?.slots.find((x) => x.key === it.slotKey) as SlotDef | undefined;
        const cands = slot ? slotCandidates(ctx.exercisePool, slot) : [];
        return {
          slotKey: it.slotKey,
          role: it.role,
          candidates: it.role === 'main' ? [it.exerciseId] : cands.filter((e) => !ctx.mainLiftIds.has(e.id)).map((e) => e.id),
          sets: it.sets,
          reps: it.targetReps,
        };
      }),
    })),
  };
}

function llmMealsInput(ctx: PlanningContext, rules: WeekPlan): LlmMealsInput {
  return {
    recentRecipeIds: [...new Set(ctx.pastMeals.map((m) => m.recipeId))],
    days: rules.days.map((d) => ({
      date: d.date,
      dayType: d.dayType,
      targets: d.targets,
      slots: d.meals.map((m) => ({
        slot: m.slot,
        candidates: recipeCandidates(ctx.catalogues.recipes, ctx.recConstraints, m.slot, blockedRecipes(ctx.pastMeals, d.date, ctx.noRepeatDays)).pool.map((r) => r.id),
      })),
    })),
  };
}

function mapLlmSessions(ctx: PlanningContext, out: ReturnType<typeof LlmWorkoutOutputSchema.parse>, rules: WeekPlan): PlannedSession[] | null {
  const sessions: PlannedSession[] = [];
  for (const s of out.sessions) {
    if (!ctx.trainingDates.includes(s.day)) return null;
    const rulesSession = rules.sessions.find((x) => x.date === s.day);
    const items: PlannedExercise[] = [];
    for (const it of s.items) {
      const ex = ctx.exById.get(it.exercise_id);
      if (!ex) return null;
      const role: SlotRole = ctx.mainLiftIds.has(ex.id) ? 'main' : ex.pattern === 'isolation' || ex.pattern === 'core' ? 'accessory' : 'secondary';
      const p = prescribe(ctx, ex, `llm_${items.length}`, role);
      const [lo, hi] = p.repRange;
      items.push({ ...p, sets: it.sets, targetReps: Math.min(hi, Math.max(lo, it.reps)), restS: it.rest_s });
    }
    sessions.push({
      date: s.day,
      weekday: weekdayMon0(s.day),
      templateKey: rulesSession?.templateKey ?? 'llm',
      title: s.title,
      items,
      fingerprint: sessionFingerprint(items.map((i) => i.exerciseId)),
      deload: ctx.deload,
    });
  }
  if (sessions.length !== ctx.trainingDates.length) return null;
  return sessions.sort((a, b) => (a.date < b.date ? -1 : 1));
}

function mapLlmMeals(ctx: PlanningContext, out: ReturnType<typeof LlmMealsOutputSchema.parse>): DayMealPlan[] | null {
  const days: DayMealPlan[] = [];
  for (const date of ctx.dates) {
    const d = out.days.find((x) => x.date === date);
    if (!d) return null;
    const recipes: Recipe[] = [];
    for (const m of d.meals) {
      const r = ctx.recipeById.get(m.recipe_id);
      if (!r) return null;
      recipes.push(r);
    }
    const dayType = dayTypeOf(ctx, date);
    const target = dayType === 'training' ? ctx.nutrition.training : ctx.nutrition.rest;
    const res = solvePortions(recipes.map(portionItem), target);
    days.push({
      date,
      dayType,
      targets: target,
      meals: recipes.map((r, i) => mealFromRecipe(r, (d.meals[i] as { slot: MealSlot }).slot, res.servings[i] as number)),
      totals: res.totals,
    });
  }
  return days;
}

/**
 * Rules plan + optional LLM variety picks. Each part (workouts, meals) is accepted only if its
 * output parses and passes `validate`; otherwise the rules part ships (warning 'llm_rejected').
 */
export async function planWeekWithVariety(
  profile: ProfileInput,
  history: HistoryInput,
  catalogues: Catalogues,
  opts: PlanOptions & { hook?: LlmVarietyHook },
): Promise<WeekPlan> {
  const ctx = buildContext(profile, history, catalogues, opts);
  const rules = rulesPlan(ctx);
  const hook = opts.hook;
  if (!hook) return rules;
  const warnings = [...rules.warnings];
  let sessions = rules.sessions;
  let days = rules.days;
  let usedLlm = false;
  if (hook.planWorkouts) {
    try {
      const parsed = LlmWorkoutOutputSchema.safeParse(await hook.planWorkouts(llmWorkoutInput(ctx, rules)));
      const mapped = parsed.success ? mapLlmSessions(ctx, parsed.data, rules) : null;
      if (mapped && validateSessions(ctx, mapped).ok) {
        sessions = mapped;
        usedLlm = true;
      } else warnings.push({ code: 'llm_rejected', message: 'LLM workouts failed validation; using rules plan' });
    } catch (e) {
      warnings.push({ code: 'llm_error', message: `LLM workouts error: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  if (hook.planMeals) {
    try {
      const parsed = LlmMealsOutputSchema.safeParse(await hook.planMeals(llmMealsInput(ctx, rules)));
      const mapped = parsed.success ? mapLlmMeals(ctx, parsed.data) : null;
      if (mapped && validateDays(ctx, mapped).ok) {
        days = mapped;
        usedLlm = true;
      } else warnings.push({ code: 'llm_rejected', message: 'LLM meals failed validation; using rules plan' });
    } catch (e) {
      warnings.push({ code: 'llm_error', message: `LLM meals error: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return assemble(ctx, sessions, days, warnings, usedLlm ? 'llm' : 'rules');
}
