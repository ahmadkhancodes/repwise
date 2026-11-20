import type { AiKind } from '../config';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type JsonObject = { [k: string]: JsonValue };

/** The compact request the app sends (no names/emails; PII keys are stripped before this point). */
export interface PlanRequest {
  kind: AiKind;
  profile: JsonObject;
  history: JsonObject | null;
  params: JsonObject | null;
}

/** What the deterministic engine prepares before any LLM call (sheet 28, step 2). */
export interface PlannerContext {
  /** The complete rules-only result. Shipped as-is whenever the LLM is skipped or fails. */
  rulesPlan: JsonValue;
  /**
   * Candidate pools, IDs only, e.g. { exercises: [...], recipes: [...] }. These are the only IDs the
   * LLM may choose from. Empty pools mean there is nothing for the LLM to vary: no call is made.
   */
  candidates: Record<string, string[]>;
  /** Small, number-free-for-the-LLM constraints, e.g. { days: [1,3,5], sessionSize: 6, slots: [...] }. */
  constraints: JsonObject;
  /** IDs used recently (no-repeat rules); the LLM is told to avoid them. */
  recent?: string[];
  /** Which static catalogue describes the candidate IDs (sent as a cached system block). */
  catalogue?: CatalogueKey;
}

export type CatalogueKey = 'exercises' | 'recipes';

/**
 * A static, byte-stable description of every ID the LLM could be offered (one compact line each).
 * It never changes between requests, so it is sent as a cached system block, and its ID list becomes
 * the `enum` of the structured-output schema (the model cannot emit an ID outside the catalogue).
 */
export interface Catalogue {
  text: string;
  ids: string[];
}

export type FinalizeResult = { ok: true; plan: JsonValue } | { ok: false; reason: string };

/**
 * The seam `@repwise/engine` satisfies. The engine owns ALL maths (targets, sets/reps, portions,
 * progression) and all safety rules; the LLM only picks/orders candidate IDs and writes short copy.
 */
export interface Planner {
  readonly name: string;
  /** Targets + candidate pools + the rules-only plan. Must be deterministic for a given request. */
  prepare(req: PlanRequest): PlannerContext | Promise<PlannerContext>;
  /**
   * Validate the LLM's picks against the constraints (IDs exist, allergens, equipment, volume,
   * no repeats, kcal ±5% / protein ±10 g after the portion solver) and turn them into a full plan.
   * Any failure returns { ok: false } and the rules-only plan ships instead.
   */
  finalize(req: PlanRequest, ctx: PlannerContext, llmOutput: JsonObject): FinalizeResult | Promise<FinalizeResult>;
  /** The static catalogue for `key` (memoised by the implementation). Optional. */
  catalogue?(key: CatalogueKey): Catalogue | null;
}

/**
 * Placeholder until `@repwise/engine` is wired in: no candidates, so no LLM call, and `plan: null`
 * which tells the app to build the plan on-device with the same engine (offline-first).
 */
export const stubPlanner: Planner = {
  name: 'stub',
  prepare: () => ({ rulesPlan: null, candidates: {}, constraints: {} }),
  finalize: () => ({ ok: false, reason: 'engine_unavailable' }),
};
