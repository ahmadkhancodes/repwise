/**
 * Plan invariants for the property tests. Each check returns human-readable violations (empty =
 * pass) and is written against the profile and catalogues directly, not against the planner's
 * own context, so a bug shared by planner and validator still shows up here.
 */
import {
  type Cuisine,
  KCAL_CEILING,
  cuisineMatches,
  MAX_LEVEL,
  TEMPLATES,
  VOLUME_GROUPS,
  VOLUME_GROUP_KEYS,
  ageFromBirthYear,
  allergenOk,
  bmrMifflin,
  dietOk,
  dislikedIngredients,
  equipmentOk,
  injuryOk,
  kcalFromMacros,
  rotationFor,
  sessionFingerprint,
  weeklyVolume,
  type Catalogues,
  type Exercise,
  type MacroSet,
  type Muscle,
  type Profile,
  type ProfileInput,
  ProfileSchema,
  type Recipe,
  type VolumeGroup,
  type WeekPlan,
} from '../../src';

export interface Indexed {
  cat: Catalogues;
  exById: Map<string, Exercise>;
  recipeById: Map<string, Recipe>;
}

export function indexCatalogues(cat: Catalogues): Indexed {
  return { cat, exById: new Map(cat.exercises.map((e) => [e.id, e])), recipeById: new Map(cat.recipes.map((r) => [r.id, r])) };
}

/** Every number anywhere in the plan is finite and ≥ 0. */
export function checkNumbers(plan: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) out.push(`${path} = ${v}`);
      else if (v < 0) out.push(`${path} = ${v} < 0`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(plan, 'plan');
  return out;
}

/** Calorie floor recomputed from the bible: max(BMR × 1.1, 1200 ♀ / 1500 ♂). */
export function expectedFloor(p: Profile, weekStart: string): number {
  const age = Math.max(1, ageFromBirthYear(p.birthYear, weekStart));
  const bmr = bmrMifflin({ sex: p.sex, weightKg: p.weightKg, heightCm: p.heightCm, age });
  return Math.max(bmr * 1.1, p.sex === 'female' ? 1200 : 1500);
}

/** Macro energy within this of kcal (carbs/fat are rounded to whole grams). */
export const MACRO_KCAL_TOLERANCE = 10;

export function checkNutrition(profileIn: ProfileInput, plan: WeekPlan): string[] {
  const p = ProfileSchema.parse(profileIn);
  const out: string[] = [];
  const floor = expectedFloor(p, plan.weekStart);
  const sets: [string, MacroSet][] = [
    ['base', plan.nutrition.base],
    ['training', plan.nutrition.training],
    ['rest', plan.nutrition.rest],
  ];
  for (const [name, m] of sets) {
    if (m.kcal < floor - 1e-6) out.push(`${name} kcal ${m.kcal} below floor ${floor.toFixed(1)}`);
    if (m.kcal > KCAL_CEILING) out.push(`${name} kcal ${m.kcal} above ceiling ${KCAL_CEILING}`);
    const fromMacros = kcalFromMacros(m);
    if (Math.abs(fromMacros - m.kcal) > MACRO_KCAL_TOLERANCE) out.push(`${name} macros ${fromMacros} kcal ≠ ${m.kcal}`);
    if (![m.protein, m.carbs, m.fat].every((x) => Number.isInteger(x))) out.push(`${name} macros not whole grams`);
  }
  if (plan.nutrition.training.protein !== plan.nutrition.base.protein) out.push('training protein differs from base');
  return out;
}

/** Regional cuisines shown only when picked (D-CUISINE-DEFAULT), listed here independently of the engine. */
const OPT_IN_ONLY: ReadonlySet<Cuisine> = new Set<Cuisine>(['pakistani', 'indian', 'middle_eastern', 'gulf', 'north_african', 'arab', 'turkish', 'persian']);

export function regionalPicked(picked: readonly Cuisine[], recipeCuisine: Cuisine): boolean {
  if (!OPT_IN_ONLY.has(recipeCuisine)) return true;
  return picked.some((c) => c !== 'global' && c !== 'other' && cuisineMatches(c, recipeCuisine));
}

export function checkMeals(profileIn: ProfileInput, plan: WeekPlan, ix: Indexed, neverShow: ReadonlySet<string> = new Set()): string[] {
  const p = ProfileSchema.parse(profileIn);
  const out: string[] = [];
  for (const d of plan.days) {
    let kcal = 0;
    let protein = 0;
    for (const m of d.meals) {
      const r = ix.recipeById.get(m.recipeId);
      if (!r) {
        out.push(`${d.date}: unknown recipe ${m.recipeId}`);
        continue;
      }
      if (!allergenOk(r, p.allergies)) out.push(`${d.date}: ${r.id} has allergen ${r.allergens.filter((a) => p.allergies.includes(a))}`);
      if (!dietOk(r, p.dietType)) out.push(`${d.date}: ${r.id} breaks diet ${p.dietType}`);
      if (p.dietType === 'halal' && r.proteinSource === 'pork') out.push(`${d.date}: pork on halal`);
      if (dislikedIngredients(r, p.dislikes).length) out.push(`${d.date}: ${r.id} has a disliked ingredient`);
      if (neverShow.has(r.id)) out.push(`${d.date}: never-show recipe ${r.id}`);
      if (!regionalPicked(p.cuisines, r.cuisine)) out.push(`${d.date}: ${r.id} is ${r.cuisine}, which the user did not pick`);
      if (!r.slots.includes(m.slot)) out.push(`${d.date}: ${r.id} in wrong slot ${m.slot}`);
      if (m.servings < r.scalable.min - 1e-9 || m.servings > r.scalable.max + 1e-9) out.push(`${d.date}: ${r.id} servings ${m.servings}`);
      if (Math.abs(m.kcal - r.perServing.kcal * m.servings) > 1) out.push(`${d.date}: ${r.id} kcal ${m.kcal} ≠ perServing × servings`);
      kcal += r.perServing.kcal * m.servings;
      protein += r.perServing.protein * m.servings;
    }
    if (Math.abs(kcal - d.totals.kcal) > 1 || Math.abs(protein - d.totals.protein) > 1) out.push(`${d.date}: totals do not add up`);
    const ids = d.meals.map((m) => m.recipeId);
    if (new Set(ids).size !== ids.length) out.push(`${d.date}: recipe twice in a day`);
  }
  return out;
}

/** Day hits kcal ±5% and protein ±10 g (reported as a rate: content gaps can make this infeasible). */
export function dayHitsTargets(plan: WeekPlan, date: string): boolean {
  const d = plan.days.find((x) => x.date === date);
  if (!d) return false;
  const t = d.dayType === 'training' ? plan.nutrition.training : plan.nutrition.rest;
  return Math.abs(d.totals.kcal - t.kcal) <= t.kcal * 0.05 + 0.5 && Math.abs(d.totals.protein - t.protein) <= 10.05;
}

/** Usable for the profile: equipment, injuries, level (and not cardio/mobility, which strength templates never use). */
export function usable(p: Profile, ex: Exercise, neverShow: ReadonlySet<string> = new Set()): boolean {
  return equipmentOk(ex, p.equipment) && injuryOk(ex, p.injuries) && ex.level <= MAX_LEVEL[p.experience] && !neverShow.has(ex.id) && ex.pattern !== 'cardio';
}

/**
 * Volume groups some slot of this week's templates can train with a primary muscle, given the
 * profile's kit ("per the split rules": a 2-day upper/lower week never sees Upper B's chest slot).
 */
export function trainableGroups(p: Profile, plan: WeekPlan, ix: Indexed): Set<VolumeGroup> {
  const out = new Set<VolumeGroup>();
  const keys = plan.sessions.length ? [...new Set(plan.sessions.map((s) => s.templateKey))] : rotationFor(plan.split, p.daysPerWeek);
  const slots = keys.flatMap((t) => TEMPLATES[t]?.slots ?? []);
  for (const ex of ix.cat.exercises) {
    if (!usable(p, ex)) continue;
    if (!slots.some((s) => s.pattern === ex.pattern && (s.pattern !== 'isolation' || !s.muscle || ex.primaryMuscles.includes(s.muscle)))) continue;
    for (const g of VOLUME_GROUP_KEYS) if (ex.primaryMuscles.some((m) => (VOLUME_GROUPS[g] as readonly Muscle[]).includes(m))) out.add(g);
  }
  return out;
}

export function checkSessions(profileIn: ProfileInput, plan: WeekPlan, ix: Indexed): string[] {
  const p = ProfileSchema.parse(profileIn);
  const out: string[] = [];
  const fps = new Set<string>();
  for (const s of plan.sessions) {
    if (!plan.trainingDates.includes(s.date)) out.push(`${s.date}: session on a rest day`);
    const ids = s.items.map((i) => i.exerciseId);
    if (new Set(ids).size !== ids.length) out.push(`${s.date}: duplicate exercise`);
    if (sessionFingerprint(ids) !== s.fingerprint) out.push(`${s.date}: stale fingerprint`);
    if (fps.has(s.fingerprint) && !bodyweightVarietyGap(profileIn)) out.push(`${s.date}: repeat fingerprint in the week`);
    fps.add(s.fingerprint);
    for (const it of s.items) {
      const ex = ix.exById.get(it.exerciseId);
      if (!ex) {
        out.push(`${s.date}: unknown exercise ${it.exerciseId}`);
        continue;
      }
      if (!equipmentOk(ex, p.equipment)) out.push(`${s.date}: ${ex.id} needs ${ex.equipment}`);
      if (!injuryOk(ex, p.injuries)) out.push(`${s.date}: ${ex.id} contraindicated`);
      if (ex.level > MAX_LEVEL[p.experience]) out.push(`${s.date}: ${ex.id} level ${ex.level}`);
      if (ex.pattern === 'cardio') out.push(`${s.date}: cardio in a strength session`);
      if (!(Number.isInteger(it.sets) && it.sets >= 1 && it.sets <= 8)) out.push(`${s.date}: ${ex.id} sets ${it.sets}`);
      const [lo, hi] = it.repRange;
      if (!(lo >= 1 && hi >= lo && it.targetReps >= lo && it.targetReps <= Math.max(hi, 30))) out.push(`${s.date}: ${ex.id} reps ${lo}-${hi}/${it.targetReps}`);
      if (it.loadKg !== null && !(it.loadKg >= 0 && it.loadKg <= 500)) out.push(`${s.date}: ${ex.id} load ${it.loadKg}`);
    }
  }
  const vol = weeklyVolume(plan.sessions, ix.exById);
  for (const g of VOLUME_GROUP_KEYS) if (vol[g] > 20 + 1e-9) out.push(`${g}: ${vol[g]} weekly sets > 20`);
  return out;
}

/** Trainable groups with no weekly credit at all. */
export function missedGroups(profileIn: ProfileInput, plan: WeekPlan, ix: Indexed): VolumeGroup[] {
  const p = ProfileSchema.parse(profileIn);
  if (plan.sessions.length === 0) return [];
  const vol = weeklyVolume(plan.sessions, ix.exById);
  return [...trainableGroups(p, plan, ix)].filter((g) => vol[g] <= 0);
}

/**
 * Known content gap: a kit that adds nothing to bodyweight, trained 4+ days a week, has too few
 * exercise variants for "no repeat in the last 10 sessions" (see docs/ENGINE_QA.md). Those repeats
 * are reported (the validator flags them as fingerprint_repeat), not asserted.
 */
export function bodyweightVarietyGap(profileIn: ProfileInput): boolean {
  const p = ProfileSchema.parse(profileIn);
  return p.daysPerWeek >= 4 && p.equipment.every((e) => e === 'bodyweight' || e === 'mat');
}
