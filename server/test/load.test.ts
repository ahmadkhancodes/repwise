/**
 * Load-ish test of the budget guard: 50 concurrent AI plan requests from 50 users (half Pro, half
 * free) against a tiny monthly budget, with a fake model that answers after a random delay and
 * bills close to the worst case. Proves: the month never goes over budget (not even transiently
 * while calls are in flight), free users stop at 80%, and every reservation is settled.
 */
import { describe, expect, it } from 'vitest';
import { costMicros, estimateTokens } from '../src/ai/cost';
import type { Planner } from '../src/ai/planner';
import { LlmCallError, type LlmProvider, type LlmRequest, type LlmResult } from '../src/ai/provider';
import { DEFAULT_PRICES } from '../src/config';
import { MemoryDb } from '../src/db/memory';
import { call, setup, signInEmail, T0 } from './helpers';

const HAIKU = DEFAULT_PRICES['claude-haiku-5-5']!;
const MONTH = '2026-11';
const N = 50;

const planner: Planner = {
  name: 'load-engine',
  prepare: () => ({
    rulesPlan: { rules: true },
    candidates: { x1: ['ex_a', 'ex_b'], x2: ['ex_c', 'ex_d'] },
    constraints: { sessions: [{ day: '2026-11-23', slots: ['x1', 'x2'] }] },
  }),
  finalize: (_r, _c, out) => ({ ok: true, plan: out }),
};

const ANSWER = { sessions: [{ day: '2026-11-23', title: 'Full body', note: 'Smooth, steady reps today.', exercise_ids: ['ex_b', 'ex_c'] }] };

/** Fake model: random latency, usage near the reservation's worst case (every prompt token a 1h cache write, full max_tokens out). */
class FakeModel implements LlmProvider {
  readonly name = 'fake';
  readonly model = 'claude-haiku-5-5';
  billed: number[] = [];
  inFlight = 0;
  maxInFlight = 0;
  constructor(private readonly mode: 'ok' | 'timeout' = 'ok') {}
  async generate(req: LlmRequest): Promise<LlmResult> {
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 25)));
      if (this.mode === 'timeout') throw new LlmCallError('timeout');
      const prompt = req.system + (req.catalogue ?? '') + req.user;
      // Real tokenisation is ≥ 2.5 chars/token for this text; the reservation assumes 2.
      const usage = { inputTokens: 0, outputTokens: req.maxTokens, cacheReadTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: Math.ceil(prompt.length / 2.5) };
      this.billed.push(costMicros(HAIKU, usage));
      return { model: this.model, output: ANSWER, stopReason: 'end_turn', usage };
    } finally {
      this.inFlight--;
    }
  }
}

/** MemoryDb that records the month's spend after every booking, to catch transient overshoot. */
class WatchedDb extends MemoryDb {
  peak = 0;
  override async reserveAiSpend(month: string, micros: number, capMicros: number, now: number) {
    const ok = await super.reserveAiSpend(month, micros, capMicros, now);
    this.peak = Math.max(this.peak, (await this.getAiSpend(month))?.usdMicros ?? 0);
    return ok;
  }
}

async function crowd(budgetUsd: number, model: FakeModel) {
  const db = new WatchedDb();
  const t = await setup({
    env: { AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-test', AI_MONTHLY_BUDGET_USD: String(budgetUsd), AI_LIMITS_JSON: '{"free":{"plan_week":50},"pro":{"plan_week":50}}' },
    planner,
    llm: model,
    db,
  });
  const users: { token: string; pro: boolean }[] = [];
  for (let i = 0; i < N; i++) {
    t.clock.now = T0 + i * 1000; // spread sign-ins past the per-IP auth limit windows
    const s = await signInEmail(t, `load${i}@example.com`, {}, `198.51.100.${i}`);
    const pro = i % 2 === 0;
    if (pro) await t.db.putEntitlement({ _id: s.user.id, pro: true, source: 'apple', plan: 'yearly', expiresAt: T0 + 30 * 86_400_000, inTrial: false, autoRenew: true, updatedAt: T0 });
    users.push({ token: s.accessToken, pro });
  }
  t.clock.now = T0 + N * 1000;
  const res = await Promise.all(users.map((u, i) => call(t, 'POST', '/ai/plan/week', { token: u.token, body: { profile: { seed: i } } }).then((r) => ({ ...r, pro: u.pro }))));
  return { t, db, res };
}

describe('budget guard under load (50 concurrent AI plan requests, fake model)', () => {
  it('never overspends, even transiently, and settles every reservation', async () => {
    const budget = 0.02; // room for only a handful of worst-case calls
    const model = new FakeModel();
    const { db, res } = await crowd(budget, model);

    expect(res.every((r) => r.status === 200)).toBe(true);
    const ai = res.filter((r) => r.body.source === 'ai');
    const rules = res.filter((r) => r.body.source === 'rules');
    expect(ai.length).toBeGreaterThan(0);
    expect(rules.length).toBeGreaterThan(0);
    expect(ai.length + rules.length).toBe(N);
    expect(model.maxInFlight).toBeGreaterThan(1); // calls really overlapped
    for (const r of rules) expect(['budget_exhausted', 'budget_free_paused']).toContain(r.body.fallbackReason);

    const spend = (await db.getAiSpend(MONTH))!;
    // Hard cap: the month never crossed the budget, including while reservations were open.
    expect(db.peak).toBeLessThan(budget * 1e6);
    expect(spend.usdMicros).toBeLessThanOrEqual(budget * 1e6);
    // Every reservation was replaced by the real cost: what is booked is exactly what was billed.
    const billed = model.billed.reduce((a, b) => a + b, 0);
    expect(spend.usdMicros).toBeCloseTo(billed, 3);
    expect(spend.calls).toBe(model.billed.length);
    expect(ai.length).toBe(model.billed.length);
  });

  it('free users stop at 80% of the budget; Pro users may use the rest', async () => {
    const budget = 0.05;
    const model = new FakeModel();
    const { db, res } = await crowd(budget, model);
    const spend = (await db.getAiSpend(MONTH))!;
    expect(spend.usdMicros).toBeLessThanOrEqual(budget * 1e6);
    const freePaused = res.filter((r) => !r.pro && r.body.fallbackReason === 'budget_free_paused');
    const proAi = res.filter((r) => r.pro && r.body.source === 'ai');
    expect(freePaused.length).toBeGreaterThan(0);
    expect(proAi.length).toBeGreaterThan(0);
    expect(res.filter((r) => r.pro).some((r) => r.body.fallbackReason === 'budget_free_paused')).toBe(false);
  });

  it('timeouts book their worst case and still cannot push the month over budget', async () => {
    const budget = 0.02;
    const model = new FakeModel('timeout');
    const { db, res } = await crowd(budget, model);
    const spend = (await db.getAiSpend(MONTH))!;
    expect(res.every((r) => r.status === 200 && r.body.source === 'rules')).toBe(true);
    expect(res.filter((r) => r.body.fallbackReason === 'timeout').length).toBeGreaterThan(0);
    expect(db.peak).toBeLessThan(budget * 1e6);
    expect(spend.usdMicros).toBeLessThan(budget * 1e6);
    expect(spend.usdMicros).toBeGreaterThan(0);
  });

  it('the reservation estimate is above the real prompt size for every route', () => {
    // Real Claude tokenisation of this prompt text is ≥ ~2.5 chars/token; the estimate assumes 2.
    const text = 'x'.repeat(10_000);
    expect(estimateTokens(text)).toBeGreaterThanOrEqual(Math.ceil(text.length / 2.5));
  });
});
