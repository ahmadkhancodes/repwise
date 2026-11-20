/**
 * Rules-only planner pipeline (sheet 28 steps 2 + 4, owner decision D2: the engine IS the v1 planner).
 *   buildContext → sessions (rotation + fingerprints + set allocation + progression)
 *               → meals (candidate pools + variety weights + portion solver)
 *               → validate.
 * Optional LLM variety layer: `planWeekWithVariety` asks a hook for picks; anything that does
 * not pass `validate` falls back to the rules plan.
 */
import { cuisinePreferred, recipeCandidates, recipeSafe, relaxPool, slotCandidates } from './candidates';
import { buildContext, exercisePatternKey, dayTypeOf, type PlanningContext } from './context';
import { DEFAULT_PROTEIN_G_PER_KG, computeTargets } from './nutrition';
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
  FILLER_SLOTS,
  MIN_SESSION_ITEMS,
  slotDef,
  VOLUME_GROUP_KEYS,
  allocateSets,
  exercisesPerSession,
  groupContribution,
  isLowerBody,
  setsPerSession,
  weeklyVolume,
  type DayTemplate,
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

/** Kit that adds no external load: exercises using only these are prescribed by reps (loadKg null). */
const BODYWEIGHT_KIT = new Set(['bodyweight', 'pullup_bar', 'bench', 'band', 'mat', 'dip_station', 'box', 'suspension_trainer', 'stability_ball', 'ab_wheel', 'foam_roller']);

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
  // Thin equipment lists can leave a session nearly empty: top it up with core work (D27).
  for (const slot of FILLER_SLOTS) {
    if (items.length >= Math.min(n, MIN_SESSION_ITEMS)) break;
    const cands = slotCandidates(ctx.exercisePool, slot).filter(
      (e) => !used.has(e.id) && !ctx.mainLiftIds.has(e.id) && !(prevVariants.get(exercisePatternKey(e))?.has(e.id) ?? false),
    );
    const ex = rng.weighted(cands, (e) => exerciseWeight(e, { moreLike: ctx.moreLike, likedMuscles: liked, recentUse }));
    if (!ex) break;
    used.add(ex.id);
    items.push(prescribe(ctx, ex, slot.key, slot.role));
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

  if (ctx.exercisePool.length === 0 && ctx.trainingDates.length > 0) {
    warnings.push({ code: 'no_candidates', message: 'No exercises match your equipment, injuries and level, so no workouts were planned' });
    return sessions;
  }

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
    if (items.length === 0) {
      // An empty "workout" is worse than none: the day stays a training day for nutrition only.
      warnings.push({ code: 'no_candidates', message: 'No exercise fits this session with your equipment, injuries and level', date });
      return;
    }
    const fp = sessionFingerprint(items.map((it) => it.exerciseId));
    const session: PlannedSession = { date, weekday: weekdayMon0(date), templateKey, title: titleFor(ctx, template, items), items, fingerprint: fp, deload: ctx.deload };
    sessions.push(session);
    fps.push(fp);
    records.push(sessionRecord(ctx, session));
  });

  coverGroups(ctx, sessions, rng.fork('cover'));
  // Weekly set allocation against the (pre-deload) range, then deload cut.
  allocateSets(sessions, ctx.exById, ctx.allocationRange, setsPerSession(ctx.profile.sessionMin));
  dropOverVolume(ctx, sessions);
  repairConsecutiveVariants(ctx, sessions, rng.fork('repair'));
  repairFingerprints(ctx, sessions, rng.fork('fingerprints'));
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

/**
 * The post-passes (coverage, over-volume drops, variant repairs) change items after the freshness
 * search, and tiny pools (bodyweight, 7 days) can exhaust it: two sessions could end up identical
 * (ENGINE_QA bug 5). Order is part of the fingerprint, so re-order the non-main tail until fresh.
 */
function repairFingerprints(ctx: PlanningContext, sessions: PlannedSession[], rng: Rng): void {
  const fps = [...ctx.pastFingerprints];
  const records = pastSessionRecords(ctx);
  const fpOf = (s: PlannedSession) => sessionFingerprint(s.items.map((it) => it.exerciseId));
  sessions.forEach((s, si) => {
    let fp = fpOf(s);
    // Later sessions were built against this one: a swap must not hand them a repeated variant.
    const next = new Set(sessions.slice(si + 1).flatMap((x) => x.items.map((y) => y.exerciseId)));
    const head = s.items.filter((it) => it.role === 'main');
    const tail = s.items.filter((it) => it.role !== 'main');
    for (let attempt = 0; !fingerprintIsFresh(fp, fps) && tail.length > 1 && attempt < 30; attempt++) {
      s.items = [...head, ...rng.fork(`${s.date}/${attempt}`).shuffle(tail)];
      fp = fpOf(s);
    }
    // Every order already used (frequent full-body templates rotate few accessories): swap one
    // non-main item for another candidate of its slot that keeps the consecutive-variant rule.
    if (!fingerprintIsFresh(fp, fps)) {
      const prev = lastVariantsByPattern(records);
      swap: for (let idx = s.items.length - 1; idx >= 0; idx--) {
        const it = s.items[idx] as PlannedExercise;
        if (it.role === 'main' || ctx.mainLiftIds.has(it.exerciseId)) continue;
        const slot = slotDef(s.templateKey, it.slotKey);
        if (!slot) continue;
        const used = new Set(s.items.map((x) => x.exerciseId));
        const cands = slotCandidates(ctx.exercisePool, slot).filter(
          (e) => !used.has(e.id) && !next.has(e.id) && !ctx.mainLiftIds.has(e.id) && !(prev.get(exercisePatternKey(e))?.has(e.id) ?? false),
        );
        for (const e of rng.fork(`${s.date}/swap/${idx}`).shuffle(cands)) {
          const before = s.items[idx] as PlannedExercise;
          s.items[idx] = { ...prescribe(ctx, e, it.slotKey, it.role), sets: it.sets };
          fp = fpOf(s);
          if (fingerprintIsFresh(fp, fps)) break swap;
          s.items[idx] = before;
          fp = fpOf(s);
        }
      }
    }
    s.fingerprint = fp;
    fps.push(fp);
    records.push(sessionRecord(ctx, s));
  });
}

/**
 * Short sessions keep only their first template slots, so a group trained only by a later slot can
 * get no work all week (ENGINE_QA bug 4: biceps/hamstrings on 1-day and 30-min weeks). For each such
 * trainable group, swap a session's last non-main item that is not the only work for its own groups
 * for a candidate of an unused slot of that session's template that trains the group.
 */
function coverGroups(ctx: PlanningContext, sessions: PlannedSession[], rng: Rng): void {
  const trainable = ctx.trainableGroups;
  if (!trainable) return;
  for (const g of VOLUME_GROUP_KEYS) {
    if (!trainable.has(g) || weeklyVolume(sessions, ctx.exById)[g] > 0) continue;
    done: for (let si = sessions.length - 1; si >= 0; si--) {
      const s = sessions[si] as PlannedSession;
      const template = TEMPLATES[s.templateKey];
      if (!template) continue;
      const usedSlots = new Set(s.items.map((it) => it.slotKey));
      const used = new Set(s.items.map((it) => it.exerciseId));
      // Unused slots first; then a second exercise for a used slot (e.g. the squat main lift is
      // glute-dominant and the template has no other quad slot).
      const order = [...template.slots.filter((x) => !usedSlots.has(x.key)), ...template.slots.filter((x) => usedSlots.has(x.key))];
      for (const tslot of order) {
        const slot = tslot.role === 'main' && usedSlots.has(tslot.key) ? { ...tslot, role: 'secondary' as const } : tslot;
        const cands = slotCandidates(ctx.exercisePool, slot).filter((e) => !used.has(e.id) && !ctx.mainLiftIds.has(e.id) && groupContribution(e)[g] === 1);
        const pick = rng.fork(`${s.date}/${g}`).weighted(cands, (e) => exerciseWeight(e, { moreLike: ctx.moreLike }));
        if (!pick) continue;
        const vol = weeklyVolume(sessions, ctx.exById);
        let idx = -1;
        for (let k = s.items.length - 1; k >= 0; k--) {
          const it = s.items[k] as PlannedExercise;
          if (it.role === 'main') continue;
          const ex = ctx.exById.get(it.exerciseId);
          const c = ex ? groupContribution(ex) : undefined;
          if (c && VOLUME_GROUP_KEYS.every((h) => c[h] === 0 || vol[h] - c[h] * it.sets > 0)) {
            idx = k;
            break;
          }
        }
        const item = prescribe(ctx, pick, slot.key, slot.role);
        if (s.items.length < exercisesPerSession(ctx.profile.sessionMin)) s.items.push(item);
        else if (idx >= 0) s.items[idx] = item;
        else continue;
        s.fingerprint = sessionFingerprint(s.items.map((it) => it.exerciseId));
        break done;
      }
    }
  }
}

/**
 * Dropping an accessory (dropOverVolume) can change which earlier session is "the previous one" for a
 * pattern key, so a variant chosen against the pre-drop session may now repeat. Re-check the final
 * sessions in order and swap such items for another candidate of the same slot (sets kept), or drop
 * them when the session keeps ≥ 3 items. Found on the real catalogue (6-day PPL), D27.
 */
function repairConsecutiveVariants(ctx: PlanningContext, sessions: PlannedSession[], rng: Rng): void {
  const records = pastSessionRecords(ctx);
  for (const s of sessions) {
    const prev = lastVariantsByPattern(records);
    for (let idx = 0; idx < s.items.length; idx++) {
      const it = s.items[idx] as PlannedExercise;
      if (ctx.mainLiftIds.has(it.exerciseId)) continue;
      const ex = ctx.exById.get(it.exerciseId);
      if (!ex || !(prev.get(exercisePatternKey(ex))?.has(ex.id) ?? false)) continue;
      const slot = slotDef(s.templateKey, it.slotKey);
      const used = new Set(s.items.map((x) => x.exerciseId));
      const cands = slot
        ? slotCandidates(ctx.exercisePool, slot).filter(
            (e) => !used.has(e.id) && !ctx.mainLiftIds.has(e.id) && !(prev.get(exercisePatternKey(e))?.has(e.id) ?? false),
          )
        : [];
      const pick = rng.fork(`${s.date}/${idx}`).weighted(cands, (e) => exerciseWeight(e, { moreLike: ctx.moreLike }));
      if (pick) {
        const p = prescribe(ctx, pick, it.slotKey, it.role);
        s.items[idx] = { ...p, sets: it.sets };
      } else if (s.items.length > 3) {
        s.items.splice(idx, 1);
        idx--;
      }
    }
    s.fingerprint = sessionFingerprint(s.items.map((x) => x.exerciseId));
    records.push(sessionRecord(ctx, s));
  }
}

/** If minimum sets still overshoot a group's max, drop accessories hitting it (sessions keep ≥ 3 items). */
function dropOverVolume(ctx: PlanningContext, sessions: PlannedSession[]): void {
  for (let guard = 0; guard < 400; guard++) {
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
    if (!target) {
      // Short sessions (≤ 3 items) on many days can still overshoot with every item at its minimum
      // sets (ENGINE_QA bug 3: 6 × 20 min PPL gave 21 shoulder sets). Last resort: take single sets
      // off the biggest contributor, accessories before mains, never below 1 set.
      let cut: PlannedExercise | undefined;
      let cutScore = -Infinity;
      for (const s of sessions) for (const it of s.items) {
        const ex = ctx.exById.get(it.exerciseId);
        const credit = ex ? groupContribution(ex)[over] : 0;
        if (credit <= 0 || it.sets <= 1) continue;
        const score = credit * 10 + (it.role === 'main' ? 0 : it.role === 'secondary' ? 1 : 2) + it.sets / 100;
        if (score > cutScore) {
          cutScore = score;
          cut = it;
        }
      }
      if (!cut) return;
      cut.sets -= 1;
      continue;
    }
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
  skippedMeals: { date: ISODate; slot: MealSlot }[];
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

/**
 * Per-day search state shared by every menu attempt of that day (ENGINE_QA bug 1: these were
 * recomputed for every attempt and dominated the planner's run time).
 */
interface DaySearch {
  /** Safe recipes per slot, minus the no-repeat window. */
  hardBySlot: Map<MealSlot, Recipe[]>;
  /** recipeWeight factors that do not change within a day (same multiplication order). */
  dayWeight: Map<string, number>;
}

function staticWeights(ctx: PlanningContext, liked: ReturnType<typeof likedTraits>): Map<string, number> {
  const m = new Map<string, number>();
  const pref = ctx.profile.cuisines;
  for (const r of safeRecipes(ctx)) {
    let w = 1;
    if (ctx.moreLike.has(r.id)) w *= 3;
    if (liked.cuisines.has(r.cuisine)) w *= 1.3;
    if (liked.sources.has(r.proteinSource)) w *= 1.2;
    if (pref.length > 0 && cuisinePreferred(pref, r.cuisine)) w *= 1.5;
    m.set(r.id, w);
  }
  return m;
}

function daySearch(
  ctx: PlanningContext,
  date: ISODate,
  window: number,
  planned: PastMeal[],
  slots: readonly MealSlot[],
  ingredientUse: Map<string, number>,
): DaySearch {
  const blocked = blockedRecipes([...ctx.pastMeals, ...planned], date, window);
  const safe = safeRecipes(ctx);
  const hardBySlot = new Map<MealSlot, Recipe[]>();
  for (const slot of new Set(slots)) hardBySlot.set(slot, safe.filter((r) => r.slots.includes(slot) && !blocked.has(r.id)));
  const dayWeight = new Map<string, number>();
  for (const r of safe) {
    let shared = 0;
    for (const ing of r.ingredients) {
      if (isStaple(ing.id)) continue;
      const n = ingredientUse.get(ing.id) ?? 0;
      if (n >= 1 && n <= 2) shared += 1;
    }
    dayWeight.set(r.id, Math.min(2, 1 + 0.25 * shared));
  }
  return { hardBySlot, dayWeight };
}

function pickDay(
  ctx: PlanningContext,
  search: DaySearch,
  staticW: Map<string, number>,
  slots: MealSlot[],
  target: { kcal: number; protein: number },
  prevCuisine: Cuisine | undefined,
  relaxed: Set<string>,
  rng: Rng,
): { recipes: Recipe[]; slots: MealSlot[] } | null {
  const chosen: Recipe[] = [];
  const chosenSlots: MealSlot[] = [];
  const sources = new Set<string>();
  const t = target.kcal > 0 ? (4 * target.protein) / target.kcal : 0.3;
  let lastCuisine = prevCuisine;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i] as MealSlot;
    const hardAll = search.hardBySlot.get(slot) ?? [];
    const hard = chosen.length ? hardAll.filter((r) => !chosen.includes(r)) : hardAll;
    const sourceOk = (r: Recipe) => !countsAsProteinSource(r.proteinSource) || !sources.has(r.proteinSource);
    let { pool, relaxed: rel } = relaxPool(hard, ctx.recConstraints, 4);
    let eligible = pool.filter(sourceOk);
    // The one-protein-source-a-day rule can empty a pool that was big enough before it: relax the
    // soft filters (cuisine → time → budget) further until something eligible appears (D27).
    while (eligible.length === 0 && rel.length < 3) {
      const wider = relaxPool(hard, ctx.recConstraints, pool.length + 1);
      if (wider.relaxed.length === rel.length) break;
      ({ pool, relaxed: rel } = wider);
      eligible = pool.filter(sourceOk);
    }
    rel.forEach((x) => relaxed.add(x));
    const remaining = slots.length - i;
    const sumShares = chosen.reduce((a, r) => a + proteinShare(r), 0);
    const want = Math.min(0.7, Math.max(0.05, (t * slots.length - sumShares) / remaining));
    // Same factors and order as recipeWeight (variety.ts), with the per-context and per-day parts cached.
    const pick = rng.weighted(eligible, (r) => {
      let w = staticW.get(r.id) ?? 1;
      if (lastCuisine && lastCuisine === r.cuisine) w *= 0.35;
      w *= search.dayWeight.get(r.id) ?? 1;
      const d = (proteinShare(r) - want) / 0.1;
      return w * (Math.exp(-d * d) + 0.05);
    });
    if (!pick) {
      // Nothing safe is left for this slot even with every soft filter relaxed (e.g. a small
      // breakfast pool inside the no-repeat window): skip it and let the other meals carry the day,
      // which beats an empty day. The caller warns when a main meal was skipped (D27).
      continue;
    }
    chosen.push(pick);
    chosenSlots.push(slot);
    if (countsAsProteinSource(pick.proteinSource)) sources.add(pick.proteinSource);
    lastCuisine = pick.cuisine;
  }
  return chosen.filter((_, i) => chosenSlots[i] !== 'snack').length > 0 ? { recipes: chosen, slots: chosenSlots } : null;
}

/** Failures count of a meal plan that was abandoned because it could no longer beat the best one. */
const PRUNED = 1e9;

/**
 * `bound`: stop as soon as this run has more failures than `bound` (it can no longer win), so the
 * window / protein-step search does not plan whole weeks it will throw away (ENGINE_QA bug 1).
 */
function planMealsWithWindow(ctx: PlanningContext, window: number, bound = Infinity): MealPlanResult {
  const rng = createRng(`${ctx.seed}/meals/w${window}`);
  const planned: PastMeal[] = [];
  const ingredientUse = new Map<string, number>();
  const liked = likedTraits(ctx.moreLike, ctx.recipeById);
  const relaxed = new Set<string>();
  const days: DayMealPlan[] = [];
  const extraSnacks: ISODate[] = [];
  const skippedMeals: { date: ISODate; slot: MealSlot }[] = [];
  let failures = 0;
  let prevCuisine: Cuisine | undefined;

  const staticW = staticWeights(ctx, liked);
  for (const date of ctx.dates) {
    const dayType = dayTypeOf(ctx, date);
    const target = dayType === 'training' ? ctx.nutrition.training : ctx.nutrition.rest;
    const search = daySearch(ctx, date, window, planned, [...ctx.mealSlots, 'snack'], ingredientUse);
    let best: { recipes: Recipe[]; slots: MealSlot[]; servings: number[]; ok: boolean; score: number } | undefined;
    const maxExtra = Math.max(2, 8 - ctx.mealSlots.length); // up to 8 eating occasions for very high targets
    outer: for (let extra = 0; extra <= maxExtra; extra++) {
      const slots: MealSlot[] = [...ctx.mealSlots, ...Array.from({ length: extra }, () => 'snack' as const)];
      // The planned slots get the full search; each added snack gets a shorter one (ENGINE_QA bug 1:
      // infeasible days used to cost 30 attempts × every snack count × window × protein step).
      const attempts = extra === 0 ? MEAL_ATTEMPTS : EXTRA_SNACK_ATTEMPTS;
      let allOver = true;
      let any = false;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const picked = pickDay(ctx, search, staticW, slots, target, prevCuisine, relaxed, rng.fork(`${date}/${extra}/${attempt}`));
        if (!picked) continue;
        any = true;
        const res = solvePortions(picked.recipes.map(portionItem), target);
        if (res.kcalError <= target.kcal * 0.05) allOver = false;
        const score = Math.abs(res.kcalError) / (target.kcal * 0.05) + Math.abs(res.proteinError) / 10 + extra;
        if (!best || (res.ok && !best.ok) || (res.ok === best.ok && score < best.score)) {
          best = { recipes: picked.recipes, slots: picked.slots, servings: res.servings, ok: res.ok, score };
        }
        if (res.ok) break outer;
      }
      // Every menu already overshoots kcal at its smallest portions: another snack only adds more.
      if (any && allOver) break;
    }
    if (!best) {
      failures += 1;
      for (const main of ctx.mealSlots) if (main !== 'snack') skippedMeals.push({ date, slot: main });
      days.push({ date, dayType, targets: target, meals: [], totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 } });
      if (failures + skippedMeals.length > bound) return { days, failures: PRUNED, extraSnacks, skippedMeals, relaxed };
      continue;
    }
    if (!best.ok) failures += 1;
    if (best.slots.filter((x) => x === 'snack').length > ctx.mealSlots.filter((x) => x === 'snack').length) extraSnacks.push(date);
    for (const main of ctx.mealSlots) if (main !== 'snack' && !best.slots.includes(main)) skippedMeals.push({ date, slot: main });
    const meals = best.recipes.map((r, i) => mealFromRecipe(r, best!.slots[i] as MealSlot, best!.servings[i] as number));
    days.push({ date, dayType, targets: target, meals, totals: totalsFor(best.recipes.map(portionItem), best.servings) });
    for (const [i, r] of best.recipes.entries()) {
      planned.push({ date, slot: best.slots[i] as MealSlot, recipeId: r.id });
      for (const ing of r.ingredients) if (!isStaple(ing.id)) ingredientUse.set(ing.id, (ingredientUse.get(ing.id) ?? 0) + 1);
    }
    prevCuisine = best.recipes[best.recipes.length - 1]?.cuisine;
    if (failures + skippedMeals.length > bound) return { days, failures: PRUNED, extraSnacks, skippedMeals, relaxed };
  }
  return { days, failures: failures + skippedMeals.length, extraSnacks, skippedMeals, relaxed };
}

/** Menu attempts per day with the planned meal slots, and per extra snack count after that. */
export const MEAL_ATTEMPTS = 30;
export const EXTRA_SNACK_ATTEMPTS = 10;

function planMealsBestWindow(ctx: PlanningContext, bound = Infinity): { res: MealPlanResult; window: number } {
  const requested = ctx.noRepeatDays;
  const windows = [...new Set([requested, Math.max(7, Math.ceil((requested + 7) / 2)), 7])].sort((a, b) => b - a);
  let chosen: { res: MealPlanResult; window: number } | undefined;
  for (const w of windows) {
    const res = planMealsWithWindow(ctx, w, Math.min(bound, chosen ? chosen.res.failures - 1 : Infinity));
    if (!chosen || res.failures < chosen.res.failures) chosen = { res, window: w };
    if (res.failures === 0) break;
  }
  return chosen as { res: MealPlanResult; window: number };
}

/** Protein g/kg step used when the catalogue cannot reach the default target (stays inside 1.6–2.2, D27). */
export const PROTEIN_STEP_G_PER_KG = 0.2;

/** Alternative protein g/kg values, nearest to the default first, lower before higher. */
export function proteinAlternatives(defaultPerKg: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= 3; k++) {
    for (const v of [defaultPerKg - k * PROTEIN_STEP_G_PER_KG, defaultPerKg + k * PROTEIN_STEP_G_PER_KG]) {
      const r = Math.round(v * 10) / 10;
      if (r >= 1.6 - 1e-9 && r <= 2.2 + 1e-9) out.push(r);
    }
  }
  return out;
}

export function planMeals(ctx: PlanningContext, warnings: PlanWarning[]): DayMealPlan[] {
  const requested = ctx.noRepeatDays;
  let chosen = planMealsBestWindow(ctx);
  // If the safe recipes cannot reach the default protein target (plant-based diets on a fat-loss
  // target, or a big surplus), move it step by step inside the 1.6–2.2 g/kg range: the best
  // feasible plan wins, like volume capping does for training.
  const defaultPerKg = DEFAULT_PROTEIN_G_PER_KG[ctx.nutrition.goal];
  if (chosen.res.failures > 0 && ctx.profile.dietType !== 'keto') {
    let best = { ...chosen, nutrition: ctx.nutrition, perKg: defaultPerKg };
    for (const perKg of proteinAlternatives(defaultPerKg)) {
      if (best.res.failures === 0) break;
      ctx.noRepeatDays = requested;
      ctx.nutrition = computeTargets(ctx.profile, ctx.weekStart, {
        proteinGPerKg: perKg,
        ...(ctx.adjustmentKcal !== undefined ? { adjustmentKcal: ctx.adjustmentKcal } : {}),
      });
      const attempt = planMealsBestWindow(ctx, best.res.failures - 1);
      if (attempt.res.failures < best.res.failures) best = { ...attempt, nutrition: ctx.nutrition, perKg };
    }
    ctx.nutrition = best.nutrition;
    chosen = best;
    if (best.perKg !== defaultPerKg) {
      warnings.push({ code: 'protein_target_adjusted', message: `Protein target set to ${best.perKg} g/kg so the matching recipes can reach it` });
    }
  }
  const { res, window } = chosen;
  const safe = safeRecipes(ctx);
  const mains = ctx.mealSlots.filter((x) => x !== 'snack');
  const emptyMains = mains.filter((slot) => !safe.some((r) => r.slots.includes(slot)));
  if (emptyMains.length === mains.length) {
    warnings.push({ code: 'no_candidates', message: 'No recipes match your diet, allergies and dislikes, so no meals were planned' });
  } else if (emptyMains.length > 0) {
    warnings.push({ code: 'no_candidates', message: `No ${emptyMains.join(' or ')} recipes match your diet, allergies and dislikes` });
  }
  if (window < requested) {
    warnings.push({ code: 'repeat_window_relaxed', message: `Not enough matching recipes for a ${requested}-day no-repeat window; using ${window} days` });
  }
  ctx.noRepeatDays = window;
  if (res.relaxed.size) warnings.push({ code: 'recipe_filters_relaxed', message: `Relaxed: ${[...res.relaxed].join(', ')}` });
  for (const d of res.extraSnacks) warnings.push({ code: 'extra_snack_added', message: 'Added a snack to reach your targets', date: d });
  for (const m of res.skippedMeals) warnings.push({ code: 'slot_skipped', message: `No matching ${m.slot} recipe left in the no-repeat window`, date: m.date });
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
        const slot = slotDef(s.templateKey, it.slotKey);
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
