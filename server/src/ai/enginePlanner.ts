/**
 * The real `Planner`: `@repwise/engine` over the `@repwise/content` catalogues (via the toEngine
 * adapter; the JSON is imported statically, so wrangler inlines it in the Worker bundle).
 *
 * - prepare(): the rules-only plan (the full engine output) plus compact candidate pools (IDs only)
 *   and the structure the LLM must fill. Deterministic for a given request: nothing reads the clock
 *   unless the request leaves out both `params.date` and `params.weekStart`.
 * - finalize(): turns the LLM's ID picks into engine input and runs it through
 *   `planWeekWithVariety`, which accepts it only if it parses AND passes `validate`. Every number
 *   (sets, reps, rest, portions, macros) comes from the engine; the LLM never supplies one.
 *
 * Request `params` (all optional unless noted):
 *   weekStart / date ('YYYY-MM-DD', user-local), now (epoch ms, for the recovery heatmap),
 *   utcOffsetMin (when the server must work out "today"), noRepeatDays (7–30), adjustmentKcal,
 *   swap only: item ('exercise' | 'meal', required), date (required), index (required), currentId.
 */
import { engineCatalogues } from '@repwise/content';
import {
  HistorySchema,
  ProfileSchema,
  blockedRecipes,
  buildContext,
  exercisePatternKey,
  exerciseWeight,
  lastVariantsByPattern,
  localDateFromEpoch,
  pastSessionRecords,
  planWeek,
  planWeekWithVariety,
  proteinShare,
  recipeCandidates,
  slotCandidates,
  slotDef,
  startOfWeek,
  swapExercise,
  swapMeal,
  type Catalogues,
  type DayMealPlan,
  type History,
  type LlmMealsOutput,
  type LlmWorkoutOutput,
  type PlannedMeal,
  type PlanOptions,
  type Profile,
  type WeekPlan,
} from '@repwise/engine';
import { HttpError, badRequest, isPlainObject } from '../lib/http';
import type { FinalizeResult, JsonObject, JsonValue, PlanRequest, Planner, PlannerContext } from './planner';

/** Pool size caps keep the prompt small (IDs only, ~8 tokens each). */
export const MAX_EXERCISE_POOL = 8;
export const MAX_RECIPE_POOL = 10;
export const SWAP_OPTIONS = 6;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

interface Parsed {
  profile: Profile;
  history: History;
  opts: PlanOptions;
  /** The target date (meals_day, swap). */
  date: string;
}

interface Internal {
  parsed: Parsed;
  rules: WeekPlan;
  /** plan_week: per training date, the pool name of each slot. meals_day: pool name per meal. */
  slotPools: Record<string, string[]>;
  /** swap: engine option objects by id. */
  swapById?: Map<string, string | PlannedMeal>;
  /** The candidate pools sent to the LLM. */
  pools?: Record<string, string[]>;
}

const toJson = (v: unknown): JsonValue => v as JsonValue;

function num(v: JsonValue | undefined, name: string, min: number, max: number, int = true): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) throw badRequest(`invalid_${name}`);
  return v;
}

function isoDate(v: JsonValue | undefined, name: string): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' || !ISO.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw badRequest(`invalid_${name}`);
  return v;
}

/** Stable pool names: identical pools share one name, so the prompt carries each list once. */
class PoolBook {
  readonly pools: Record<string, string[]> = {};
  private byKey = new Map<string, string>();
  constructor(private readonly prefix: string) {}
  add(ids: string[]): string {
    const key = ids.join(',');
    let name = this.byKey.get(key);
    if (!name) {
      name = `${this.prefix}${this.byKey.size + 1}`;
      this.byKey.set(key, name);
      this.pools[name] = ids;
    }
    return name;
  }
}

export interface EnginePlannerOptions {
  /** Used only when a request names no date: "today" for the user. */
  clock: () => number;
  /** Override for tests; defaults to the bundled content catalogues. */
  catalogues?: () => Catalogues;
}

export function createEnginePlanner(options: EnginePlannerOptions): Planner {
  const internals = new WeakMap<PlannerContext, Internal>();
  const catalogues = options.catalogues ?? (() => engineCatalogues());

  function parse(req: PlanRequest): Parsed {
    const profile = ProfileSchema.safeParse(req.profile);
    if (!profile.success) throw badRequest('invalid_profile');
    const history = HistorySchema.safeParse(req.history ?? {});
    if (!history.success) throw badRequest('invalid_history');
    const p = req.params ?? {};
    const utcOffsetMin = num(p.utcOffsetMin, 'utcOffsetMin', -840, 840) ?? 0;
    const date = isoDate(p.date, 'date') ?? isoDate(p.weekStart, 'weekStart') ?? localDateFromEpoch(options.clock(), utcOffsetMin);
    const weekStart = startOfWeek(isoDate(p.weekStart, 'weekStart') ?? date);
    if (startOfWeek(date) !== weekStart) throw badRequest('date_outside_week');
    const now = num(p.now, 'now', 0, 8.64e15) ?? Date.parse(`${weekStart}T00:00:00Z`);
    const noRepeatDays = num(p.noRepeatDays, 'noRepeatDays', 7, 30);
    const adjustmentKcal = num(p.adjustmentKcal, 'adjustmentKcal', -1000, 1000);
    const opts: PlanOptions = {
      now,
      weekStart,
      ...(noRepeatDays !== undefined ? { noRepeatDays } : {}),
      ...(adjustmentKcal !== undefined ? { adjustmentKcal } : {}),
    };
    return { profile: profile.data, history: history.data, opts, date };
  }

  function prepareWeek(parsed: Parsed): { ctx: PlannerContext; internal: Internal } {
    const cat = catalogues();
    const rules = planWeek(parsed.profile, parsed.history, cat, parsed.opts);
    const ectx = buildContext(parsed.profile, parsed.history, cat, parsed.opts);
    const prev = lastVariantsByPattern(pastSessionRecords(ectx));
    const book = new PoolBook('x');
    const slotPools: Record<string, string[]> = {};
    const sessions: JsonObject[] = [];
    for (const s of rules.sessions) {
      const names: string[] = [];
      for (const it of s.items) {
        let ids: string[];
        if (it.role === 'main') {
          ids = [it.exerciseId]; // the block's main lift is fixed (progression)
        } else {
          const slot = slotDef(s.templateKey, it.slotKey);
          const others = (slot ? slotCandidates(ectx.exercisePool, slot) : [])
            .filter((e) => e.id !== it.exerciseId && !ectx.mainLiftIds.has(e.id) && !(prev.get(exercisePatternKey(e))?.has(e.id) ?? false))
            .map((e) => ({ id: e.id, w: exerciseWeight(e, { moreLike: ectx.moreLike }) }))
            .sort((a, b) => b.w - a.w || (a.id < b.id ? -1 : 1))
            .map((e) => e.id);
          ids = [it.exerciseId, ...others].slice(0, MAX_EXERCISE_POOL);
        }
        names.push(book.add(ids));
      }
      slotPools[s.date] = names;
      sessions.push({ day: s.date, template: s.templateKey, slots: names });
    }
    const ctx: PlannerContext = {
      rulesPlan: toJson({ week: rules, notes: {} }),
      candidates: book.pools,
      constraints: { sessions, rule: 'one exercise_id per slot, in slot order, from that slot pool' },
    };
    return { ctx, internal: { parsed, rules, slotPools } };
  }

  function prepareMeals(parsed: Parsed): { ctx: PlannerContext; internal: Internal } {
    const cat = catalogues();
    const rules = planWeek(parsed.profile, parsed.history, cat, parsed.opts);
    const day = rules.days.find((d) => d.date === parsed.date) as DayMealPlan;
    const ectx = buildContext(parsed.profile, parsed.history, cat, { ...parsed.opts, noRepeatDays: rules.noRepeatDays });
    const otherDays = rules.days.filter((d) => d.date !== parsed.date).flatMap((d) => d.meals.map((m) => ({ date: d.date, slot: m.slot, recipeId: m.recipeId })));
    const blocked = blockedRecipes([...ectx.pastMeals, ...otherDays], parsed.date, rules.noRepeatDays);
    const share = day.targets.kcal > 0 ? (4 * day.targets.protein) / day.targets.kcal : 0.3;
    const book = new PoolBook('r');
    const names = day.meals.map((m) => {
      const { pool } = recipeCandidates(cat.recipes, ectx.recConstraints, m.slot, blocked);
      const others = pool
        .filter((r) => r.id !== m.recipeId)
        .sort((a, b) => Math.abs(proteinShare(a) - share) - Math.abs(proteinShare(b) - share) || (a.id < b.id ? -1 : 1))
        .map((r) => r.id);
      return book.add([m.recipeId, ...others].slice(0, MAX_RECIPE_POOL));
    });
    const ctx: PlannerContext = {
      rulesPlan: toJson({ date: parsed.date, day, notes: [] }),
      candidates: book.pools,
      constraints: { date: parsed.date, meals: day.meals.map((m, i) => ({ slot: m.slot, pool: names[i] as string })), rule: 'one recipe_id per meal, in order, from that meal pool' },
    };
    return { ctx, internal: { parsed, rules, slotPools: { [parsed.date]: names } } };
  }

  function prepareSwap(parsed: Parsed, params: JsonObject): { ctx: PlannerContext; internal: Internal } {
    const item = params.item;
    if (item !== 'exercise' && item !== 'meal') throw badRequest('invalid_item');
    if (!isoDate(params.date, 'date')) throw badRequest('date_required');
    const index = num(params.index, 'index', 0, 20);
    if (index === undefined) throw badRequest('index_required');
    const currentId = typeof params.currentId === 'string' ? params.currentId : undefined;
    const cat = catalogues();
    const rules = planWeek(parsed.profile, parsed.history, cat, parsed.opts);
    const base = { profile: parsed.profile, history: parsed.history, catalogues: cat, index, now: parsed.opts.now, count: SWAP_OPTIONS };
    let options: (string | PlannedMeal)[];
    if (item === 'exercise') {
      const session = rules.sessions.find((s) => s.date === parsed.date);
      const target = session?.items[index];
      if (!session || !target) throw new HttpError(404, 'swap_target_not_found');
      const items = [...session.items];
      if (currentId && currentId !== target.exerciseId && cat.exercises.some((e) => e.id === currentId)) items[index] = { ...target, exerciseId: currentId };
      options = swapExercise({ ...base, session: { ...session, items } });
    } else {
      const day = rules.days.find((d) => d.date === parsed.date);
      const target = day?.meals[index];
      if (!day || !target) throw new HttpError(404, 'swap_target_not_found');
      const meals = [...day.meals];
      if (currentId && currentId !== target.recipeId && cat.recipes.some((r) => r.id === currentId)) meals[index] = { ...target, recipeId: currentId };
      options = swapMeal({ ...base, day: { ...day, meals }, ...(parsed.opts.noRepeatDays !== undefined ? { noRepeatDays: parsed.opts.noRepeatDays } : {}) });
    }
    const idOf = (o: string | PlannedMeal) => (typeof o === 'string' ? o : o.recipeId);
    const swapById = new Map(options.map((o) => [idOf(o), o]));
    const ctx: PlannerContext = {
      rulesPlan: toJson({ item, date: parsed.date, index, options: options.slice(0, 3), note: null }),
      candidates: { options: options.map(idOf) },
      constraints: { item, pick: 'up to 3 options from the options pool, best first' },
    };
    return { ctx, internal: { parsed, rules, slotPools: {}, swapById } };
  }

  async function finalizeWeek(internal: Internal, out: JsonObject): Promise<FinalizeResult> {
    const { parsed, rules, slotPools } = internal;
    const sessions = Array.isArray(out.sessions) ? (out.sessions as JsonObject[]) : [];
    const ctxPools = internal.pools ?? {};
    const llm: LlmWorkoutOutput = { sessions: [] };
    const notes: Record<string, string> = {};
    for (const s of rules.sessions) {
      const pick = sessions.find((x) => x.day === s.date);
      const ids = pick && Array.isArray(pick.exercise_ids) ? (pick.exercise_ids as string[]) : null;
      const names = slotPools[s.date] ?? [];
      if (!pick || !ids || ids.length !== names.length) return { ok: false, reason: 'slot_count' };
      if (!ids.every((id, i) => ctxPools[names[i] as string]?.includes(id))) return { ok: false, reason: 'slot_pool' };
      llm.sessions.push({
        day: s.date,
        title: String(pick.title),
        items: ids.map((id, i) => {
          const it = s.items[i]!;
          // Numbers come from the rules prescription for that slot, never from the LLM.
          return { exercise_id: id, sets: Math.min(8, Math.max(1, it.sets)), reps: it.targetReps, rest_s: it.restS };
        }),
      });
      notes[s.date] = String(pick.note);
    }
    if (sessions.length !== rules.sessions.length) return { ok: false, reason: 'session_count' };
    const plan = await planWeekWithVariety(parsed.profile, parsed.history, catalogues(), { ...parsed.opts, hook: { planWorkouts: async () => llm } });
    if (plan.generatedBy !== 'llm' || !plan.validation.ok) return { ok: false, reason: 'engine_rejected' };
    return { ok: true, plan: toJson({ week: plan, notes }) };
  }

  async function finalizeMeals(internal: Internal, out: JsonObject): Promise<FinalizeResult> {
    const { parsed, rules } = internal;
    const names = internal.slotPools[parsed.date] ?? [];
    const pools = internal.pools ?? {};
    const day = rules.days.find((d) => d.date === parsed.date) as DayMealPlan;
    const meals = Array.isArray(out.meals) ? (out.meals as JsonObject[]) : [];
    if (meals.length !== day.meals.length) return { ok: false, reason: 'meal_count' };
    for (const [i, m] of meals.entries()) {
      if (m.slot !== day.meals[i]!.slot) return { ok: false, reason: 'slot_order' };
      if (!pools[names[i] as string]?.includes(String(m.recipe_id))) return { ok: false, reason: 'meal_pool' };
    }
    const llm: LlmMealsOutput = {
      days: rules.days.map((d) =>
        d.date === parsed.date
          ? { date: d.date, meals: meals.map((m, i) => ({ slot: d.meals[i]!.slot, recipe_id: String(m.recipe_id) })) }
          : { date: d.date, meals: d.meals.map((m) => ({ slot: m.slot, recipe_id: m.recipeId })) },
      ),
    };
    const plan = await planWeekWithVariety(parsed.profile, parsed.history, catalogues(), { ...parsed.opts, hook: { planMeals: async () => llm } });
    if (plan.generatedBy !== 'llm' || !plan.validation.ok) return { ok: false, reason: 'engine_rejected' };
    const newDay = plan.days.find((d) => d.date === parsed.date) as DayMealPlan;
    return { ok: true, plan: toJson({ date: parsed.date, day: newDay, notes: meals.map((m) => String(m.note)) }) };
  }

  function finalizeSwap(internal: Internal, req: PlanRequest, out: JsonObject): FinalizeResult {
    const byId = internal.swapById ?? new Map();
    const ids = Array.isArray(out.options) ? (out.options as string[]) : [];
    const picked = ids.map((id) => byId.get(id)).filter((x): x is string | PlannedMeal => x !== undefined);
    if (picked.length === 0 || picked.length !== ids.length || new Set(ids).size !== ids.length) return { ok: false, reason: 'swap_options' };
    const p = req.params ?? {};
    return { ok: true, plan: toJson({ item: p.item, date: internal.parsed.date, index: p.index, options: picked.slice(0, 3), note: String(out.note) }) };
  }

  return {
    name: 'repwise-engine',
    prepare(req) {
      const parsed = parse(req);
      let r: { ctx: PlannerContext; internal: Internal };
      if (req.kind === 'plan_week') r = prepareWeek(parsed);
      else if (req.kind === 'meals_day') r = prepareMeals(parsed);
      else {
        if (!isPlainObject(req.params)) throw badRequest('params_required');
        r = prepareSwap(parsed, req.params as JsonObject);
      }
      internals.set(r.ctx, { ...r.internal, pools: r.ctx.candidates });
      return r.ctx;
    },
    async finalize(req, ctx, out) {
      const internal = internals.get(ctx);
      if (!internal) return { ok: false, reason: 'unknown_context' };
      if (req.kind === 'plan_week') return finalizeWeek(internal, out);
      if (req.kind === 'meals_day') return finalizeMeals(internal, out);
      return finalizeSwap(internal, req, out);
    },
  };
}
