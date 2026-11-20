import type { AiKind } from '../config';
import { isPlainObject } from '../lib/http';
import type { JsonObject, JsonValue, PlannerContext } from './planner';

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

function obj(properties: Record<string, unknown>, description?: string) {
  return { type: 'object', ...(description ? { description } : {}), properties, required: Object.keys(properties), additionalProperties: false };
}

/** An ID field: an `enum` of the whole static catalogue when there is one (the model cannot invent an ID). */
function idSchema(ids: readonly string[] | undefined, description: string): JsonObject {
  return ids && ids.length > 0 ? { type: 'string', enum: [...ids], description } : { type: 'string', description };
}

const TITLE_DESC = 'Short session name, at most 40 characters, no numbers.';
const NOTE_DESC = 'One encouraging sentence, at most 120 characters, no numbers.';

/**
 * Structured-output schemas (IDs + copy only; never a number the model would have to calculate).
 * `ids` is the static catalogue for this route, so the schema is identical on every request and
 * its compiled grammar is reused (a per-request schema would recompile every time). Membership in
 * each slot's own pool is checked after the call, in `checkOutput` and the engine.
 */
export function outputSchema(kind: AiKind, ids?: readonly string[]): JsonObject {
  if (kind === 'plan_week') {
    return obj({
      sessions: {
        type: 'array',
        description: 'One entry per training day in constraints.sessions, same order.',
        items: obj({
          day: { type: 'string', format: 'date', description: 'The training day (YYYY-MM-DD) from constraints.sessions.' },
          title: { type: 'string', description: TITLE_DESC },
          note: { type: 'string', description: NOTE_DESC },
          exercise_ids: { type: 'array', description: "Exactly one ID per slot, in slot order, each from that slot's pool.", items: idSchema(ids, 'An exercise ID from the slot pool.') },
        }),
      },
    }) as JsonObject;
  }
  if (kind === 'meals_day') {
    return obj({
      meals: {
        type: 'array',
        description: 'One entry per meal in constraints.meals, same order.',
        items: obj({
          slot: { type: 'string', enum: [...MEAL_SLOTS] },
          recipe_id: idSchema(ids, "A recipe ID from that meal's pool."),
          note: { type: 'string', description: NOTE_DESC },
        }),
      },
    }) as JsonObject;
  }
  return obj({
    options: { type: 'array', description: 'Up to three IDs from the options pool, best first, no repeats.', items: idSchema(ids, 'An ID from the options pool.') },
    note: { type: 'string', description: NOTE_DESC },
  }) as JsonObject;
}

/** Back-compat: schemas without a catalogue (planners that provide none). */
export const OUTPUT_SCHEMAS: Record<AiKind, JsonObject> = {
  plan_week: outputSchema('plan_week'),
  meals_day: outputSchema('meals_day'),
  swap: outputSchema('swap'),
};

export const MAX_TOKENS: Record<AiKind, number> = { plan_week: 3000, meals_day: 1500, swap: 600 };

export const TITLE_MAX = 60;
export const NOTE_MAX = 160;
export const SWAP_MAX = 3;
/** Copy filter: no medical/dosing/supplement advice and none of the banned words (CLAUDE.md, sheet 28). */
const BANNED =
  /\b(cure[sd]?|curing|treat(s|ed|ment|ments|ing)?|diagnos\w*|dos(e|es|age|ing)|\d+\s?mg|supplement\w*|steroid\w*|medicat\w*|medicine\w*|prescri\w*|drug\w*|insulin|pregnan\w*|injur(y|ies|ed)|pain\w*|rehab\w*|therap\w*|disease\w*|calorie\w*|kcal|macros?|fat[- ]?burn\w*|detox\w*|weight[- ]?loss|lose weight|skinny|body ?fat|bmi)\b/i;
/** No markup, links or numbers in copy (numbers come from the engine, never from the model). */
const BAD_CHARS = /[<>{}[\]`*#|\\]|https?:|www\.|\d/i;

export function copyOk(s: unknown, max: number): s is string {
  return typeof s === 'string' && s.trim().length > 0 && s.length <= max && s === s.trim() && !BANNED.test(s) && !BAD_CHARS.test(s) && !/\n/.test(s);
}

type Check = { ok: true; value: JsonObject } | { ok: false; reason: string };
const bad = (reason: string): Check => ({ ok: false, reason });
/** Exactly these keys (the schema says additionalProperties: false; a non-conforming reply is suspect). */
const keysExactly = (o: Record<string, unknown>, keys: string[]) => {
  const k = Object.keys(o);
  return k.length === keys.length && keys.every((x) => k.includes(x));
};
const strs = (v: JsonValue | undefined): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null);

/**
 * Structural validation before the engine's own validator: shape, copy, and every ID must come
 * from the pool it was offered for. When the constraints name a pool per slot (the engine planner
 * does), each ID is checked against ITS slot's pool, in order; otherwise against all pools.
 */
export function checkOutput(kind: AiKind, out: unknown, ctx: PlannerContext): Check {
  if (!isPlainObject(out)) return bad('not_an_object');
  const allowed = new Set(Object.values(ctx.candidates).flat());
  const inPool = (pool: unknown, id: unknown) => typeof pool === 'string' && typeof id === 'string' && (ctx.candidates[pool]?.includes(id) ?? false);
  const c = ctx.constraints;
  const top = { plan_week: ['sessions'], meals_day: ['meals'], swap: ['options', 'note'] }[kind];
  if (!keysExactly(out, top)) return bad('unexpected_keys');
  if (kind === 'plan_week') {
    if (!Array.isArray(out.sessions) || out.sessions.length === 0 || out.sessions.length > 7) return bad('sessions');
    const planned = Array.isArray(c.sessions) ? (c.sessions as JsonObject[]) : null;
    if (planned && out.sessions.length !== planned.length) return bad('session_count');
    const days = new Set<string>();
    for (const [i, s] of out.sessions.entries()) {
      if (!isPlainObject(s) || !keysExactly(s, ['day', 'title', 'note', 'exercise_ids'])) return bad('session_shape');
      if (typeof s.day !== 'string' || !copyOk(s.title, TITLE_MAX) || !copyOk(s.note, NOTE_MAX)) return bad('session_copy');
      if (days.has(s.day)) return bad('duplicate_day');
      days.add(s.day);
      const ids = strs(s.exercise_ids as JsonValue);
      if (!ids || ids.length === 0 || ids.length > 15) return bad('session_items');
      if (new Set(ids).size !== ids.length) return bad('repeated_id');
      const want = planned?.[i];
      const slots = want ? strs(want.slots) : null;
      if (want && slots) {
        if (s.day !== want.day) return bad('day_order');
        if (ids.length !== slots.length) return bad('slot_count');
        if (!ids.every((id, k) => inPool(slots[k], id))) return bad('id_not_in_slot_pool');
      } else if (!ids.every((id) => allowed.has(id))) return bad('unknown_id');
    }
  } else if (kind === 'meals_day') {
    if (!Array.isArray(out.meals) || out.meals.length === 0 || out.meals.length > 8) return bad('meals');
    const planned = Array.isArray(c.meals) ? (c.meals as JsonObject[]) : null;
    if (planned && out.meals.length !== planned.length) return bad('meal_count');
    for (const [i, m] of out.meals.entries()) {
      if (!isPlainObject(m) || !keysExactly(m, ['slot', 'recipe_id', 'note'])) return bad('meal_shape');
      if (typeof m.slot !== 'string' || !copyOk(m.note, NOTE_MAX)) return bad('meal_copy');
      const want = planned?.[i];
      if (want && typeof want.pool === 'string') {
        if (m.slot !== want.slot) return bad('slot_order');
        if (!inPool(want.pool, m.recipe_id)) return bad('id_not_in_slot_pool');
      } else if (typeof m.recipe_id !== 'string' || !allowed.has(m.recipe_id)) return bad('unknown_id');
    }
  } else {
    const ids = strs(out.options as JsonValue);
    if (!ids || ids.length === 0 || ids.length > SWAP_MAX) return bad('options');
    if (new Set(ids).size !== ids.length) return bad('repeated_id');
    const pool = ctx.candidates.options ? 'options' : null;
    if (!ids.every((id) => (pool ? inPool(pool, id) : allowed.has(id)))) return bad('unknown_id');
    if (!copyOk(out.note, NOTE_MAX)) return bad('swap_copy');
  }
  return { ok: true, value: out as JsonObject };
}
