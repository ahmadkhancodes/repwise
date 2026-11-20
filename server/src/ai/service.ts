import type { AiKind, Config } from '../config';
import { publicEntitlement } from '../billing/entitlement';
import type { AiUsageDelta, Db } from '../db/types';
import { canonicalJson, sha256Hex } from '../lib/crypto';
import { HttpError } from '../lib/http';
import type { Deps } from '../types';
import type { Logger } from '../lib/log';
import { costMicros, estimateTokens, monthKey, worstCaseMicros } from './cost';
import type { CatalogueKey, JsonObject, JsonValue, PlanRequest, Planner, PlannerContext } from './planner';
import { SYSTEM_PROMPT, catalogueBlock, userMessage } from './prompts';
import { LlmCallError, type LlmResult } from './provider';
import { MAX_TOKENS, checkOutput, outputSchema } from './schemas';

export const CONTRACT_VERSION = 1;
const DAY = 24 * 3600 * 1000;
const CACHE_TTL: Record<AiKind, number> = { plan_week: 3 * DAY, meals_day: DAY, swap: 6 * 3600 * 1000 };
/** Requests per user per kind per day beyond which the route itself answers 429 (abuse guard). */
const HARD_DAILY_CAP = 200;

export type BudgetLevel = 'ok' | 'pro_only' | 'exhausted';

export type FallbackReason =
  | 'provider_none'
  | 'no_candidates'
  | 'no_price'
  | 'budget_free_paused'
  | 'budget_exhausted'
  | 'daily_limit'
  | 'timeout'
  | 'provider_error'
  | 'invalid_json'
  | 'refusal'
  | 'max_tokens'
  | 'invalid_output'
  | 'validator_rejected';

export interface AiResponse {
  source: 'ai' | 'rules';
  kind: AiKind;
  contractVersion: number;
  engine: string;
  plan: JsonValue;
  model?: string;
  fallbackReason?: FallbackReason;
  cached: boolean;
  generatedAt: number;
}

/** Static per (planner, kind, catalogue): the catalogue block text and the output schema. */
const statics = new WeakMap<Planner, Map<string, { catalogue: string | undefined; schema: JsonObject }>>();

export function staticParts(planner: Planner, kind: AiKind, key: CatalogueKey | undefined, withCatalogue: boolean) {
  let m = statics.get(planner);
  if (!m) statics.set(planner, (m = new Map()));
  const id = `${kind}:${key ?? '-'}:${withCatalogue ? 1 : 0}`;
  let hit = m.get(id);
  if (!hit) {
    const cat = key && planner.catalogue ? planner.catalogue(key) : null;
    hit = { catalogue: cat && withCatalogue ? catalogueBlock(key!, cat) : undefined, schema: outputSchema(kind, cat?.ids) };
    m.set(id, hit);
  }
  return hit;
}

/** 80% of the monthly budget: free users drop to rules-only. 100%: everyone does. */
export function budgetLevel(spentMicros: number, budgetUsd: number, nextCallMicros = 0): BudgetLevel {
  const budget = budgetUsd * 1e6;
  if (budget <= 0 || spentMicros + nextCallMicros >= budget) return 'exhausted';
  if (spentMicros >= 0.8 * budget) return 'pro_only';
  return 'ok';
}

export async function usageReport(cfg: Config, db: Db, month: string) {
  const s = await db.getAiSpend(month);
  const spent = s?.usdMicros ?? 0;
  return {
    month,
    provider: cfg.ai.provider,
    model: cfg.ai.model,
    budgetUsd: cfg.ai.monthlyBudgetUsd,
    spentUsd: Math.round(spent) / 1e6,
    ratio: cfg.ai.monthlyBudgetUsd > 0 ? spent / (cfg.ai.monthlyBudgetUsd * 1e6) : 1,
    level: budgetLevel(spent, cfg.ai.monthlyBudgetUsd),
    calls: s?.calls ?? 0,
    fallbacks: s?.fallbacks ?? 0,
    tokens: {
      input: s?.inputTokens ?? 0,
      output: s?.outputTokens ?? 0,
      cacheRead: s?.cacheReadTokens ?? 0,
      cacheWrite: s?.cacheWriteTokens ?? 0,
    },
  };
}

/**
 * What the response cache is keyed on. Wall-clock fields the client sends (`params.now`) change on
 * every call, so only their UTC day counts: same day, same inputs, same cached plan.
 */
export function cacheKeyInput(req: PlanRequest): PlanRequest {
  const params = req.params;
  if (!params || !('now' in params)) return req;
  const { now: raw, ...rest } = params;
  const day = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw / DAY) : raw;
  return { ...req, params: { ...rest, nowDay: day ?? null } };
}

/**
 * Sheet 28 pipeline: engine prepares targets + candidate pools + a rules-only plan; the LLM (if
 * allowed by provider, budget and the user's daily limit) picks IDs and writes copy; the output is
 * checked structurally and by the engine's validator; any failure ships the rules-only plan.
 */
export async function runPlanner(deps: Deps, db: Db, userId: string, req: PlanRequest, log: Logger = deps.log): Promise<AiResponse> {
  const started = Date.now();
  const res = await runPlannerInner(deps, db, userId, req, log);
  // One line per AI request: outcome and cost signals only, never user data or prompt content.
  log.info('ai', { kind: req.kind, source: res.source, fallbackReason: res.fallbackReason ?? null, cached: res.cached, model: res.model ?? null, ms: Date.now() - started });
  return res;
}

async function runPlannerInner(deps: Deps, db: Db, userId: string, req: PlanRequest, log: Logger): Promise<AiResponse> {
  const cfg = deps.config;
  const now = deps.now();
  const kind = req.kind;
  const hash = await sha256Hex(canonicalJson({ v: CONTRACT_VERSION, model: cfg.ai.model, req: cacheKeyInput(req) }));
  const cacheKey = `${userId}:${kind}:${hash}`;
  const hit = await db.getAiCache(cacheKey, now);
  if (hit) return { ...(hit.response as AiResponse), cached: true };

  const dayCount = await db.hit(`ai:${kind}:${userId}`, DAY, now);
  if (dayCount > HARD_DAILY_CAP) throw new HttpError(429, 'rate_limited');

  const ctx: PlannerContext = await deps.planner.prepare(req);
  const base = { kind, contractVersion: CONTRACT_VERSION, engine: deps.planner.name, cached: false, generatedAt: now };
  const rules = (fallbackReason: FallbackReason): AiResponse => ({ ...base, source: 'rules', plan: ctx.rulesPlan, fallbackReason });

  const llm = deps.llm;
  if (!llm) return rules('provider_none');
  if (Object.values(ctx.candidates).every((p) => p.length === 0)) return rules('no_candidates');
  const price = cfg.ai.prices[llm.model];
  if (!price) return rules('no_price'); // never spend without a price to account it

  const isPro = publicEntitlement(await db.getEntitlement(userId), now).pro;
  const user = userMessage(kind, ctx);
  const maxTokens = MAX_TOKENS[kind];
  const { catalogue, schema } = staticParts(deps.planner, kind, ctx.catalogue, cfg.ai.catalogueContext);
  // Worst case for this call: a deliberately high token estimate of everything sent (instructions,
  // catalogue, request, schema) at the dearest prompt rate, plus the full max_tokens of output.
  const promptTokens = estimateTokens(SYSTEM_PROMPT + (catalogue ?? '') + user + JSON.stringify(schema));
  const worstCase = worstCaseMicros(price, promptTokens, maxTokens);
  const month = monthKey(now);
  const budget = cfg.ai.monthlyBudgetUsd * 1e6;
  // Reserve the worst case atomically BEFORE calling: concurrent calls cannot overspend the cap.
  // Free users may only spend up to 80% of the month; Pro users up to 100%.
  const reserved = budget > 0 && (await db.reserveAiSpend(month, worstCase, isPro ? budget : 0.8 * budget, now));
  if (!reserved) {
    const spent = (await db.getAiSpend(month))?.usdMicros ?? 0;
    return rules(budgetLevel(spent, cfg.ai.monthlyBudgetUsd, worstCase) === 'exhausted' || isPro ? 'budget_exhausted' : 'budget_free_paused');
  }
  /** Book the real usage: `actualMicros` replaces the reservation. */
  const settle = (actualMicros: number, extra: Partial<AiUsageDelta>) =>
    db.addAiSpend(month, { ...extra, usdMicros: actualMicros - worstCase }, now);

  const limit = cfg.ai.limits[isPro ? 'pro' : 'free'][kind];
  const aiCount = await db.hit(`ai-llm:${kind}:${userId}`, DAY, now);
  if (aiCount > limit) {
    await settle(0, {});
    return rules('daily_limit');
  }

  let result: LlmResult;
  try {
    result = await llm.generate({ kind, system: SYSTEM_PROMPT, catalogue, cacheTtl: cfg.ai.cacheTtl, user, schema, maxTokens, timeoutMs: cfg.ai.timeoutMs });
  } catch (e) {
    const reason: FallbackReason = e instanceof LlmCallError && e.reason === 'timeout' ? 'timeout' : 'provider_error';
    log.warn('ai_call_failed', { kind, reason, statusCode: e instanceof LlmCallError ? (e.status ?? null) : null });
    // A timed-out request may still be billed: keep the worst case so the cap stays hard.
    await settle(reason === 'timeout' ? worstCase : 0, { calls: 1, fallbacks: 1 });
    return rules(reason);
  }

  const outcome = await (async (): Promise<{ ok: true; plan: JsonValue } | { ok: false; reason: FallbackReason }> => {
    if (result.error) return { ok: false, reason: result.error === 'no_text' ? 'invalid_json' : result.error };
    const shape = checkOutput(kind, result.output, ctx);
    if (!shape.ok) {
      log.warn('ai_output_rejected', { kind, check: shape.reason });
      return { ok: false, reason: 'invalid_output' };
    }
    try {
      const fin = await deps.planner.finalize(req, ctx, shape.value);
      if (!fin.ok) log.warn('ai_output_rejected', { kind, check: fin.reason, stage: 'engine' });
      return fin.ok ? { ok: true, plan: fin.plan } : { ok: false, reason: 'validator_rejected' };
    } catch {
      return { ok: false, reason: 'validator_rejected' };
    }
  })();

  const actual = costMicros(price, result.usage);
  // Never expected (the estimate is deliberately high); if it happens, the estimate needs raising.
  if (actual > worstCase) log.error('ai_cost_over_reservation', { kind, actualMicros: Math.round(actual), reservedMicros: worstCase });
  log.info('ai_usage', {
    kind,
    costMicros: Math.round(actual),
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cacheReadTokens: result.usage.cacheReadTokens,
    cacheWriteTokens: result.usage.cacheWriteTokens + (result.usage.cacheWrite1hTokens ?? 0),
    stopReason: result.stopReason,
  });
  await settle(actual, {
    calls: 1,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cacheReadTokens: result.usage.cacheReadTokens,
    cacheWriteTokens: result.usage.cacheWriteTokens + (result.usage.cacheWrite1hTokens ?? 0),
    fallbacks: outcome.ok ? 0 : 1,
  });
  if (!outcome.ok) return rules(outcome.reason);

  const response: AiResponse = { ...base, source: 'ai', plan: outcome.plan, model: result.model };
  // Only AI results are cached: rules output is free to recompute, and budget fallbacks must not stick.
  await db.putAiCache({ _id: cacheKey, userId, kind, response, createdAt: now, expiresAt: now + CACHE_TTL[kind] });
  return response;
}
