/**
 * Plan validator (sheet 28 step 4). Checks a plan (rules- or LLM-made) against every hard
 * constraint: ids exist, equipment/injuries/level, never-show, volume in range, uniqueness
 * (fingerprints + consecutive variants), kcal ±5%, protein ±10 g, allergens, diet, dislikes,
 * no-repeat window, one protein source per day, portion bounds. Returns typed errors.
 */
import { allergenOk, dietOk, dislikedIngredients, equipmentOk, injuryOk } from './candidates';
import { dayTypeOf, exercisePatternKey, type PlanningContext } from './context';
import { daysBetween, type ISODate } from './dates';
import { KCAL_TOLERANCE, PROTEIN_TOLERANCE_G, totalsFor } from './portion';
import { VOLUME_GROUP_KEYS, weeklyVolume, type VolumeGroup } from './split';
import type { DayMealPlan, PlannedSession } from './types';
import {
  FINGERPRINT_WINDOW,
  consecutiveRepeats,
  countsAsProteinSource,
  lastVariantsByPattern,
  sessionFingerprint,
  type SessionVariantRecord,
} from './variety';

export type ValidationError =
  | { code: 'unknown_exercise'; date: ISODate; exerciseId: string }
  | { code: 'equipment_unavailable'; date: ISODate; exerciseId: string }
  | { code: 'injury_conflict'; date: ISODate; exerciseId: string }
  | { code: 'level_too_high'; date: ISODate; exerciseId: string }
  | { code: 'never_show'; date: ISODate; id: string }
  | { code: 'duplicate_exercise'; date: ISODate; exerciseId: string }
  | { code: 'invalid_prescription'; date: ISODate; exerciseId: string; detail: string }
  | { code: 'empty_session'; date: ISODate }
  | { code: 'session_outside_week'; date: ISODate }
  | { code: 'duplicate_session_date'; date: ISODate }
  | { code: 'fingerprint_mismatch'; date: ISODate }
  | { code: 'fingerprint_repeat'; date: ISODate; fingerprint: string }
  | { code: 'consecutive_variant_repeat'; date: ISODate; exerciseId: string }
  | { code: 'volume_below_range'; group: VolumeGroup; sets: number; min: number }
  | { code: 'volume_above_range'; group: VolumeGroup; sets: number; max: number }
  | { code: 'unknown_recipe'; date: ISODate; recipeId: string }
  | { code: 'slot_mismatch'; date: ISODate; recipeId: string; slot: string }
  | { code: 'allergen'; date: ISODate; recipeId: string; allergens: string[] }
  | { code: 'diet_mismatch'; date: ISODate; recipeId: string }
  | { code: 'disliked_ingredient'; date: ISODate; recipeId: string; ingredients: string[] }
  | { code: 'portion_out_of_bounds'; date: ISODate; recipeId: string; servings: number }
  | { code: 'kcal_out_of_range'; date: ISODate; kcal: number; target: number }
  | { code: 'protein_out_of_range'; date: ISODate; protein: number; target: number }
  | { code: 'protein_source_repeat'; date: ISODate; source: string }
  | { code: 'recipe_repeat_window'; date: ISODate; recipeId: string; previousDate: ISODate }
  | { code: 'day_outside_week'; date: ISODate }
  | { code: 'macro_mismatch'; date: ISODate; recipeId: string };

export type ValidationCode = ValidationError['code'];

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

const result = (errors: ValidationError[]): ValidationResult => ({ ok: errors.length === 0, errors });

/** Variant record of a planned session (for the consecutive rule). */
export function sessionRecord(ctx: PlanningContext, s: PlannedSession): SessionVariantRecord {
  return {
    exerciseIds: s.items.map((i) => i.exerciseId),
    patternKeys: s.items.map((i) => {
      const ex = ctx.exById.get(i.exerciseId);
      return ex ? exercisePatternKey(ex) : i.patternKey;
    }),
    mainExerciseIds: s.items.map((i) => i.exerciseId).filter((id) => ctx.mainLiftIds.has(id)),
  };
}

export function pastSessionRecords(ctx: PlanningContext): SessionVariantRecord[] {
  return ctx.pastSessions.map((p) => {
    const keys = p.exerciseIds.map((id) => {
      const ex = ctx.exById.get(id);
      return ex ? exercisePatternKey(ex) : `unknown:${id}`;
    });
    return { exerciseIds: p.exerciseIds, patternKeys: p.patternKeys ?? keys, mainExerciseIds: p.mainExerciseIds ?? [] };
  });
}

export function validateSessions(ctx: PlanningContext, sessions: readonly PlannedSession[]): ValidationResult {
  const errors: ValidationError[] = [];
  const fps = [...ctx.pastFingerprints];
  const records = pastSessionRecords(ctx);
  const seenDates = new Set<string>();
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const s of sorted) {
    if (!ctx.dates.includes(s.date)) errors.push({ code: 'session_outside_week', date: s.date });
    if (seenDates.has(s.date)) errors.push({ code: 'duplicate_session_date', date: s.date });
    seenDates.add(s.date);
    if (s.items.length === 0) errors.push({ code: 'empty_session', date: s.date });
    const inSession = new Set<string>();
    for (const it of s.items) {
      const ex = ctx.exById.get(it.exerciseId);
      if (!ex) {
        errors.push({ code: 'unknown_exercise', date: s.date, exerciseId: it.exerciseId });
        continue;
      }
      if (!equipmentOk(ex, ctx.profile.equipment)) errors.push({ code: 'equipment_unavailable', date: s.date, exerciseId: ex.id });
      if (!injuryOk(ex, ctx.profile.injuries)) errors.push({ code: 'injury_conflict', date: s.date, exerciseId: ex.id });
      if (ex.level > ctx.exConstraints.maxLevel) errors.push({ code: 'level_too_high', date: s.date, exerciseId: ex.id });
      if (ctx.neverShow.has(ex.id)) errors.push({ code: 'never_show', date: s.date, id: ex.id });
      if (inSession.has(ex.id)) errors.push({ code: 'duplicate_exercise', date: s.date, exerciseId: ex.id });
      inSession.add(ex.id);
      const [lo, hi] = it.repRange;
      if (!(Number.isInteger(it.sets) && it.sets >= 1 && it.sets <= 8)) errors.push({ code: 'invalid_prescription', date: s.date, exerciseId: ex.id, detail: `sets ${it.sets}` });
      if (!(lo >= 1 && hi >= lo && hi <= 30 && it.targetReps >= 1 && it.targetReps <= 30)) {
        errors.push({ code: 'invalid_prescription', date: s.date, exerciseId: ex.id, detail: `reps ${lo}-${hi}/${it.targetReps}` });
      }
      if (it.loadKg !== null && !(it.loadKg >= 0 && it.loadKg <= 500)) errors.push({ code: 'invalid_prescription', date: s.date, exerciseId: ex.id, detail: `load ${it.loadKg}` });
    }
    const fp = sessionFingerprint(s.items.map((i) => i.exerciseId));
    if (fp !== s.fingerprint) errors.push({ code: 'fingerprint_mismatch', date: s.date });
    if (fps.slice(-FINGERPRINT_WINDOW).includes(fp)) errors.push({ code: 'fingerprint_repeat', date: s.date, fingerprint: fp });
    fps.push(fp);
    const rec = sessionRecord(ctx, s);
    for (const id of consecutiveRepeats(rec, lastVariantsByPattern(records))) {
      errors.push({ code: 'consecutive_variant_repeat', date: s.date, exerciseId: id });
    }
    records.push(rec);
  }
  if (sessions.length > 0) {
    const vol = weeklyVolume(sessions, ctx.exById);
    for (const g of VOLUME_GROUP_KEYS) {
      const r = ctx.volumeRange[g];
      if (vol[g] < r.min - 1e-9) errors.push({ code: 'volume_below_range', group: g, sets: vol[g], min: r.min });
      if (vol[g] > r.max + 1e-9) errors.push({ code: 'volume_above_range', group: g, sets: vol[g], max: r.max });
    }
  }
  return result(errors);
}

/** Validate one day of meals. `otherMeals` = meals on other dates (history + rest of plan) for the window rule. */
export function validateDay(
  ctx: PlanningContext,
  day: DayMealPlan,
  otherMeals: readonly { date: ISODate; recipeId: string }[],
): ValidationResult {
  const errors: ValidationError[] = [];
  if (!ctx.dates.includes(day.date)) errors.push({ code: 'day_outside_week', date: day.date });
  const sources = new Set<string>();
  const items: { perServing: { kcal: number; protein: number; carbs: number; fat: number }; min: number; max: number }[] = [];
  const servings: number[] = [];
  const todayIds: string[] = [];
  for (const m of day.meals) {
    const r = ctx.recipeById.get(m.recipeId);
    if (!r) {
      errors.push({ code: 'unknown_recipe', date: day.date, recipeId: m.recipeId });
      continue;
    }
    if (!r.slots.includes(m.slot)) errors.push({ code: 'slot_mismatch', date: day.date, recipeId: r.id, slot: m.slot });
    if (!allergenOk(r, ctx.profile.allergies)) {
      errors.push({ code: 'allergen', date: day.date, recipeId: r.id, allergens: r.allergens.filter((a) => ctx.profile.allergies.includes(a)) });
    }
    if (!dietOk(r, ctx.profile.dietType)) errors.push({ code: 'diet_mismatch', date: day.date, recipeId: r.id });
    const disliked = dislikedIngredients(r, ctx.profile.dislikes);
    if (disliked.length) errors.push({ code: 'disliked_ingredient', date: day.date, recipeId: r.id, ingredients: disliked });
    if (ctx.neverShow.has(r.id)) errors.push({ code: 'never_show', date: day.date, id: r.id });
    if (!(m.servings >= r.scalable.min - 1e-9 && m.servings <= r.scalable.max + 1e-9)) {
      errors.push({ code: 'portion_out_of_bounds', date: day.date, recipeId: r.id, servings: m.servings });
    }
    if (Math.abs(m.kcal - r.perServing.kcal * m.servings) > 1 || Math.abs(m.protein - r.perServing.protein * m.servings) > 1) {
      errors.push({ code: 'macro_mismatch', date: day.date, recipeId: r.id });
    }
    if (countsAsProteinSource(r.proteinSource)) {
      if (sources.has(r.proteinSource)) errors.push({ code: 'protein_source_repeat', date: day.date, source: r.proteinSource });
      sources.add(r.proteinSource);
    }
    if (todayIds.includes(r.id)) errors.push({ code: 'recipe_repeat_window', date: day.date, recipeId: r.id, previousDate: day.date });
    todayIds.push(r.id);
    for (const o of otherMeals) {
      if (o.recipeId === r.id && o.date !== day.date && Math.abs(daysBetween(o.date, day.date)) < ctx.noRepeatDays) {
        errors.push({ code: 'recipe_repeat_window', date: day.date, recipeId: r.id, previousDate: o.date });
        break;
      }
    }
    items.push({ perServing: r.perServing, min: r.scalable.min, max: r.scalable.max });
    servings.push(m.servings);
  }
  const target = dayTypeOf(ctx, day.date) === 'training' ? ctx.nutrition.training : ctx.nutrition.rest;
  const totals = totalsFor(items, servings);
  if (Math.abs(totals.kcal - target.kcal) > target.kcal * KCAL_TOLERANCE + 1e-9) {
    errors.push({ code: 'kcal_out_of_range', date: day.date, kcal: totals.kcal, target: target.kcal });
  }
  if (Math.abs(totals.protein - target.protein) > PROTEIN_TOLERANCE_G + 1e-9) {
    errors.push({ code: 'protein_out_of_range', date: day.date, protein: totals.protein, target: target.protein });
  }
  return result(errors);
}

export function validateDays(ctx: PlanningContext, days: readonly DayMealPlan[]): ValidationResult {
  const all = [
    ...ctx.pastMeals.map((m) => ({ date: m.date, recipeId: m.recipeId })),
    ...days.flatMap((d) => d.meals.map((m) => ({ date: d.date, recipeId: m.recipeId }))),
  ];
  const errors: ValidationError[] = [];
  for (const d of days) {
    errors.push(...validateDay(ctx, d, all.filter((m) => m.date !== d.date)).errors);
  }
  return result(errors);
}

export function validatePlan(ctx: PlanningContext, plan: { sessions: readonly PlannedSession[]; days: readonly DayMealPlan[] }): ValidationResult {
  return result([...validateSessions(ctx, plan.sessions).errors, ...validateDays(ctx, plan.days).errors]);
}
