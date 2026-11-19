import type { AiKind } from '../config';
import { isPlainObject } from '../lib/http';
import type { JsonObject, PlannerContext } from './planner';

const str = { type: 'string' } as const;
const strArr = { type: 'array', items: str } as const;
function obj(properties: Record<string, unknown>) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

/** Structured-output schemas (IDs + copy only; never numbers the LLM would have to calculate). */
export const OUTPUT_SCHEMAS: Record<AiKind, JsonObject> = {
  plan_week: obj({
    sessions: { type: 'array', items: obj({ day: str, title: str, note: str, exercise_ids: strArr }) },
  }) as JsonObject,
  meals_day: obj({
    meals: { type: 'array', items: obj({ slot: str, recipe_id: str, note: str }) },
  }) as JsonObject,
  swap: obj({ options: strArr, note: str }) as JsonObject,
};

export const MAX_TOKENS: Record<AiKind, number> = { plan_week: 3000, meals_day: 1500, swap: 600 };

const TITLE_MAX = 60;
const NOTE_MAX = 160;
/** Copy filter: no medical/dosing/supplement advice and none of the banned words (CLAUDE.md, sheet 28). */
const BANNED = /\b(cure[sd]?|treat(s|ed|ment|ing)?|diagnos\w*|dos(e|es|age|ing)|\d+\s?mg|supplement\w*|steroid\w*|medicat\w*|prescri\w*|drug\w*|insulin|pregnan\w*)\b/i;

function copyOk(s: unknown, max: number): s is string {
  return typeof s === 'string' && s.trim().length > 0 && s.length <= max && !BANNED.test(s) && !/[<>{}]/.test(s);
}

/**
 * Generic structural validation that runs before the engine's own validator: shape, copy length and
 * wording, and every ID must come from the candidate pools.
 */
export function checkOutput(kind: AiKind, out: unknown, ctx: PlannerContext): { ok: true; value: JsonObject } | { ok: false; reason: string } {
  if (!isPlainObject(out)) return { ok: false, reason: 'not_an_object' };
  const allowed = new Set(Object.values(ctx.candidates).flat());
  const idOk = (id: unknown) => typeof id === 'string' && allowed.has(id);
  const bad = (reason: string) => ({ ok: false as const, reason });
  if (kind === 'plan_week') {
    if (!Array.isArray(out.sessions) || out.sessions.length === 0 || out.sessions.length > 7) return bad('sessions');
    for (const s of out.sessions) {
      if (!isPlainObject(s) || typeof s.day !== 'string' || !copyOk(s.title, TITLE_MAX) || !copyOk(s.note, NOTE_MAX)) return bad('session_copy');
      if (!Array.isArray(s.exercise_ids) || s.exercise_ids.length === 0 || s.exercise_ids.length > 15) return bad('session_items');
      if (!s.exercise_ids.every(idOk) || new Set(s.exercise_ids).size !== s.exercise_ids.length) return bad('unknown_or_repeated_id');
    }
  } else if (kind === 'meals_day') {
    if (!Array.isArray(out.meals) || out.meals.length === 0 || out.meals.length > 8) return bad('meals');
    for (const m of out.meals) {
      if (!isPlainObject(m) || typeof m.slot !== 'string' || !copyOk(m.note, NOTE_MAX)) return bad('meal_copy');
      if (!idOk(m.recipe_id)) return bad('unknown_id');
    }
  } else {
    if (!Array.isArray(out.options) || out.options.length === 0 || out.options.length > 5 || !out.options.every(idOk)) return bad('options');
    if (!copyOk(out.note, NOTE_MAX)) return bad('swap_copy');
  }
  return { ok: true, value: out as JsonObject };
}
