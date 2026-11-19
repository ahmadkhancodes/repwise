import type { AiKind, Config } from '../config';
import { publicEntitlement } from '../billing/entitlement';
import type { Db } from '../db/types';
import { canonicalJson, sha256Hex } from '../lib/crypto';
import { HttpError } from '../lib/http';
import type { Deps } from '../types';
import { costMicros, estimateTokens, monthKey } from './cost';
import type { JsonValue, PlanRequest, PlannerContext } from './planner';
import { SYSTEM_PROMPT, userMessage } from './prompts';
import { LlmCallError, type LlmResult } from './provider';
import { MAX_TOKENS, OUTPUT_SCHEMAS, checkOutput } from './schemas';

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
 * Sheet 28 pipeline: engine prepares targets + candidate pools + a rules-only plan; the LLM (if
 * allowed by provider, budget and the user's daily limit) picks IDs and writes copy; the output is
 * checked structurally and by the engine's validator; any failure ships the rules-only plan.
 */
export async function runPlanner(deps: Deps, db: Db, userId: string, req: PlanRequest): Promise<AiResponse> {
  const cfg = deps.config;
  const now = deps.now();
  const kind = req.kind;
  const hash = await sha256Hex(canonicalJson({ v: CONTRACT_VERSION, model: cfg.ai.model, req }));
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
  // Worst case for this call, so concurrent calls cannot push the month past 100%.
  const worstCase = costMicros(price, {
    inputTokens: estimateTokens(SYSTEM_PROMPT + user),
    outputTokens: maxTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
  const month = monthKey(now);
  const spent = (await db.getAiSpend(month))?.usdMicros ?? 0;
  const level = budgetLevel(spent, cfg.ai.monthlyBudgetUsd, worstCase);
  if (level === 'exhausted') return rules('budget_exhausted');
  if (level === 'pro_only' && !isPro) return rules('budget_free_paused');

  const limit = cfg.ai.limits[isPro ? 'pro' : 'free'][kind];
  const aiCount = await db.hit(`ai-llm:${kind}:${userId}`, DAY, now);
  if (aiCount > limit) return rules('daily_limit');

  let result: LlmResult;
  try {
    result = await llm.generate({ kind, system: SYSTEM_PROMPT, user, schema: OUTPUT_SCHEMAS[kind], maxTokens, timeoutMs: cfg.ai.timeoutMs });
  } catch (e) {
    const reason: FallbackReason = e instanceof LlmCallError && e.reason === 'timeout' ? 'timeout' : 'provider_error';
    // A timed-out request may still be billed: book the worst case so the cap stays hard.
    const usd = reason === 'timeout' ? worstCase : 0;
    await db.addAiSpend(month, { usdMicros: usd, calls: 1, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, fallbacks: 1 }, now);
    return rules(reason);
  }

  const outcome = await (async (): Promise<{ ok: true; plan: JsonValue } | { ok: false; reason: FallbackReason }> => {
    if (result.error) return { ok: false, reason: result.error === 'no_text' ? 'invalid_json' : result.error };
    const shape = checkOutput(kind, result.output, ctx);
    if (!shape.ok) return { ok: false, reason: 'invalid_output' };
    try {
      const fin = await deps.planner.finalize(req, ctx, shape.value);
      return fin.ok ? { ok: true, plan: fin.plan } : { ok: false, reason: 'validator_rejected' };
    } catch {
      return { ok: false, reason: 'validator_rejected' };
    }
  })();

  await db.addAiSpend(
    month,
    {
      usdMicros: costMicros(price, result.usage),
      calls: 1,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
      fallbacks: outcome.ok ? 0 : 1,
    },
    now,
  );
  if (!outcome.ok) return rules(outcome.reason);

  const response: AiResponse = { ...base, source: 'ai', plan: outcome.plan, model: result.model };
  // Only AI results are cached: rules output is free to recompute, and budget fallbacks must not stick.
  await db.putAiCache({ _id: cacheKey, userId, kind, response, createdAt: now, expiresAt: now + CACHE_TTL[kind] });
  return response;
}
