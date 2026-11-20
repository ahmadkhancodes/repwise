import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from '../src/ai/anthropic';
import { costMicros } from '../src/ai/cost';
import type { Planner, PlanRequest } from '../src/ai/planner';
import { budgetLevel } from '../src/ai/service';
import { DEFAULT_PRICES } from '../src/config';
import { call, setup, signInEmail, T0, type TestCtx } from './helpers';

const HAIKU = DEFAULT_PRICES['claude-haiku-5-5']!;

/** A tiny engine stand-in: candidates + rules plan + a validator that applies "maths". */
function fakePlanner(opts: { reject?: boolean } = {}): Planner & { seen: PlanRequest[] } {
  const seen: PlanRequest[] = [];
  return {
    name: 'fake-engine',
    seen,
    prepare(req) {
      seen.push(req);
      return {
        rulesPlan: { rules: true, kind: req.kind },
        candidates: { exercises: ['ex_squat', 'ex_bench', 'ex_row', 'ex_lunge'], recipes: ['r_oats', 'r_curry'] },
        constraints: { days: ['mon', 'thu'], perSession: 2, slots: ['breakfast', 'dinner'] },
        recent: ['ex_deadlift'],
      };
    },
    finalize(_req, _ctx, out) {
      if (opts.reject) return { ok: false, reason: 'kcal_out_of_range' };
      return { ok: true, plan: { ...out, setsAdded: true } };
    },
  };
}

const WEEK = {
  sessions: [
    { day: 'mon', title: 'Lower body strength', note: 'Steady tempo and full range today.', exercise_ids: ['ex_squat', 'ex_lunge'] },
    { day: 'thu', title: 'Upper body push and pull', note: 'Keep the rows smooth and controlled.', exercise_ids: ['ex_bench', 'ex_row'] },
  ],
};

interface Mock {
  fetch: typeof fetch;
  requests: { url: string; headers: Record<string, string>; body: any }[];
}

function anthropicMock(reply: (n: number) => Response | Promise<Response>): Mock {
  const requests: Mock['requests'] = [];
  const f = (async (url: string, init?: RequestInit) => {
    requests.push({ url, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    return reply(requests.length);
  }) as typeof fetch;
  return { fetch: f, requests };
}

const usage = { input_tokens: 220, output_tokens: 180, cache_read_input_tokens: 700, cache_creation_input_tokens: 0 };
const ok = (obj: unknown, extra: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      model: 'claude-haiku-5-5',
      stop_reason: 'end_turn',
      content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }],
      usage,
      ...extra,
    }),
  );

async function aiSetup(reply: (n: number) => Response | Promise<Response>, opts: { reject?: boolean; env?: Record<string, string> } = {}) {
  const mock = anthropicMock(reply);
  const planner = fakePlanner(opts);
  const t = await setup({
    env: { AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-test', AI_ADMIN_TOKEN: 'admin-token-0123456789', ...opts.env },
    planner,
    llm: new AnthropicProvider('sk-ant-test', 'claude-haiku-5-5', mock.fetch),
  });
  const s = await signInEmail(t, 'ai@example.com');
  return { t, mock, planner, s };
}

const week = (t: TestCtx, token: string, profile: Record<string, unknown> = { goal: 'gain', days: 2 }) =>
  call(t, 'POST', '/ai/plan/week', { token, body: { profile, history: { adherence: 0.9 } } });

async function makePro(t: TestCtx, userId: string) {
  await t.db.putEntitlement({ _id: userId, pro: true, source: 'apple', plan: 'yearly', expiresAt: T0 + 30 * 86_400_000, inTrial: false, autoRenew: true, updatedAt: T0 });
}

async function setSpend(t: TestCtx, usd: number, month = '2026-11') {
  await t.db.addAiSpend(month, { usdMicros: usd * 1e6, calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, fallbacks: 0 }, T0);
}

describe('AI planner pipeline (Anthropic, mocked fetch)', () => {
  it('happy path: LLM picks IDs, engine finalizes, cost is booked', async () => {
    const { t, mock, planner, s } = await aiSetup(() => ok(WEEK));
    const r = await week(t, s.accessToken, { goal: 'gain', name: 'Ann', email: 'ann@example.com', nested: { Email: 'x', ok: 1 } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ source: 'ai', kind: 'plan_week', engine: 'fake-engine', model: 'claude-haiku-5-5', cached: false });
    expect(r.body.plan).toMatchObject({ setsAdded: true, sessions: WEEK.sessions });

    // Request shape: Messages API, cached static system prompt, JSON schema output, capped tokens.
    const req = mock.requests[0]!;
    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.headers).toMatchObject({ 'x-api-key': 'sk-ant-test', 'anthropic-version': '2026-10-21' });
    expect(req.body.model).toBe('claude-haiku-5-5');
    expect(req.body.max_tokens).toBe(3000);
    expect(req.body.system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(req.body.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } });
    expect(req.body.temperature).toBeUndefined();
    const user = JSON.parse(req.body.messages[0].content);
    expect(user).toEqual({
      task: 'plan_week',
      constraints: { days: ['mon', 'thu'], perSession: 2, slots: ['breakfast', 'dinner'] },
      candidates: { exercises: ['ex_squat', 'ex_bench', 'ex_row', 'ex_lunge'], recipes: ['r_oats', 'r_curry'] },
      recent: ['ex_deadlift'],
    });
    // PII never reaches the engine or the prompt.
    expect(JSON.stringify(planner.seen)).not.toMatch(/Ann|ann@example|Email/);
    expect(JSON.stringify(req.body)).not.toMatch(/ann@example|ai@example/);

    const spend = await t.db.getAiSpend('2026-11');
    expect(spend).toMatchObject({ calls: 1, inputTokens: 220, outputTokens: 180, cacheReadTokens: 700, fallbacks: 0 });
    expect(spend!.usdMicros).toBeCloseTo(220 * 0.1 + 180 * 0.5 + 700 * 0.01, 6);
  });

  it('invalid JSON from the model falls back to the rules plan (and is still billed)', async () => {
    const { t, s } = await aiSetup(() => ok('{"sessions": [ oops'));
    const r = await week(t, s.accessToken);
    expect(r.body).toMatchObject({ source: 'rules', fallbackReason: 'invalid_json', plan: { rules: true } });
    expect((await t.db.getAiSpend('2026-11'))).toMatchObject({ calls: 1, fallbacks: 1 });
  });

  it('a validator failure falls back to rules', async () => {
    const { t, s } = await aiSetup(() => ok(WEEK), { reject: true });
    expect((await week(t, s.accessToken)).body).toMatchObject({ source: 'rules', fallbackReason: 'validator_rejected' });
  });

  it('invented IDs, banned wording and wrong shapes are rejected before the engine sees them', async () => {
    const bad = [
      { sessions: [{ ...WEEK.sessions[0], exercise_ids: ['ex_made_up'] }] },
      { sessions: [{ ...WEEK.sessions[0], note: 'Take 5 mg of creatine supplement first.' }] },
      { sessions: [{ ...WEEK.sessions[0], exercise_ids: ['ex_squat', 'ex_squat'] }] },
      { sessions: [] },
      { meals: [] },
    ];
    let i = 0;
    const { t, s } = await aiSetup(() => ok(bad[i++]));
    await makePro(t, s.user.id);
    for (let k = 0; k < bad.length; k++) {
      const r = await week(t, s.accessToken, { goal: 'gain', k });
      expect(r.body.fallbackReason, `case ${k}`).toBe('invalid_output');
    }
  });

  it('refusal, max_tokens, HTTP errors and timeouts all fall back to rules', async () => {
    const replies = [
      () => ok(WEEK, { stop_reason: 'refusal' }),
      () => ok(WEEK, { stop_reason: 'max_tokens' }),
      () => new Response('{"type":"error"}', { status: 529 }),
    ];
    let i = 0;
    const { t, s } = await aiSetup(() => replies[i++]!());
    await makePro(t, s.user.id);
    expect((await week(t, s.accessToken, { k: 1 })).body.fallbackReason).toBe('refusal');
    expect((await week(t, s.accessToken, { k: 2 })).body.fallbackReason).toBe('max_tokens');
    const before = (await t.db.getAiSpend('2026-11'))!.usdMicros;
    expect((await week(t, s.accessToken, { k: 3 })).body.fallbackReason).toBe('provider_error');
    expect((await t.db.getAiSpend('2026-11'))!.usdMicros).toBe(before); // HTTP errors are not billed
  });

  it('times out after AI_TIMEOUT_MS and books the worst case so the cap stays hard', async () => {
    const mock = anthropicMock(() => new Promise<Response>(() => undefined));
    const slowFetch = ((url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        void mock.fetch(url, init);
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as typeof fetch;
    const t = await setup({
      env: { AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', AI_TIMEOUT_MS: '50' },
      planner: fakePlanner(),
      llm: new AnthropicProvider('k', 'claude-haiku-5-5', slowFetch),
    });
    const s = await signInEmail(t, 'slow@example.com');
    const r = await week(t, s.accessToken);
    expect(r.body).toMatchObject({ source: 'rules', fallbackReason: 'timeout' });
    const spend = await t.db.getAiSpend('2026-11');
    expect(spend!.fallbacks).toBe(1);
    expect(spend!.usdMicros).toBeGreaterThanOrEqual(3000 * HAIKU.output); // max_tokens at the output rate
  });

  it('budget ≥80%: free users get rules-only, Pro users still get AI', async () => {
    const { t, mock, s } = await aiSetup(() => ok(WEEK));
    await setSpend(t, 40.5);
    const free = await week(t, s.accessToken);
    expect(free.body).toMatchObject({ source: 'rules', fallbackReason: 'budget_free_paused' });
    expect(mock.requests).toHaveLength(0);
    await makePro(t, s.user.id);
    const pro = await week(t, s.accessToken);
    expect(pro.body.source).toBe('ai');
    expect(mock.requests).toHaveLength(1);
  });

  it('budget ≥100%: everyone gets rules-only until the month resets', async () => {
    const { t, mock, s } = await aiSetup(() => ok(WEEK));
    await makePro(t, s.user.id);
    await setSpend(t, 50);
    expect((await week(t, s.accessToken)).body).toMatchObject({ source: 'rules', fallbackReason: 'budget_exhausted' });
    // Just under the cap: the worst case of the next call would cross it, so it is refused too.
    const t2 = await aiSetup(() => ok(WEEK));
    await makePro(t2.t, t2.s.user.id);
    await setSpend(t2.t, 50 - 0.0005);
    expect((await week(t2.t, t2.s.accessToken)).body.fallbackReason).toBe('budget_exhausted');
    expect(mock.requests).toHaveLength(0);
    // New month: budget is fresh.
    t.clock.now = Date.UTC(2026, 11, 1, 0, 5);
    const again = await signInEmail(t, 'ai@example.com');
    await makePro(t, s.user.id);
    expect((await week(t, again.accessToken)).body.source).toBe('ai');
  });

  it('concurrent calls at the cap cannot overspend: the worst case is reserved before calling', async () => {
    const { t, mock, s } = await aiSetup(() => new Promise<Response>((r) => setTimeout(() => r(ok(WEEK)), 10)));
    await makePro(t, s.user.id);
    // Room for two worst-case calls (~1.8k micro-USD each), not five.
    await setSpend(t, 50 - 0.004);
    const res = await Promise.all([0, 1, 2, 3, 4].map((k) => week(t, s.accessToken, { k })));
    const ai = res.filter((r) => r.body.source === 'ai').length;
    expect(ai).toBeGreaterThanOrEqual(1);
    expect(mock.requests.length).toBe(ai);
    expect(ai).toBeLessThanOrEqual(2);
    expect(res.filter((r) => r.body.fallbackReason === 'budget_exhausted').length).toBe(5 - ai);
    // Reservations were reconciled to the real (small) usage, and the month never crossed $50.
    expect((await t.db.getAiSpend('2026-11'))!.usdMicros).toBeLessThan(50e6);
  });

  it('a refused daily-limit call releases its reservation', async () => {
    const { t, s } = await aiSetup(() => ok(WEEK));
    for (let k = 0; k < 3; k++) await week(t, s.accessToken, { k });
    const spend = (await t.db.getAiSpend('2026-11'))!;
    expect(spend.calls).toBe(2);
    expect(spend.usdMicros).toBeCloseTo(2 * costMicros(HAIKU, { inputTokens: 220, outputTokens: 180, cacheReadTokens: 700, cacheWriteTokens: 0 }), 6);
  });

  it('the client clock in params.now does not defeat the cache (same UTC day hits)', async () => {
    const { t, mock, s } = await aiSetup(() => ok(WEEK));
    const body = (now: number) => ({ profile: { goal: 'gain', days: 2 }, history: null, params: { weekStart: '2026-11-16', now } });
    const a = await call(t, 'POST', '/ai/plan/week', { token: s.accessToken, body: body(T0) });
    const b = await call(t, 'POST', '/ai/plan/week', { token: s.accessToken, body: body(T0 + 3_600_000) });
    expect(a.body.cached).toBe(false);
    expect(b.body.cached).toBe(true);
    expect(mock.requests).toHaveLength(1);
    const nextDay = await call(t, 'POST', '/ai/plan/week', { token: s.accessToken, body: body(T0 + 86_400_000) });
    expect(nextDay.body.cached).toBe(false);
  });

  it('per-user daily limits: free lower than Pro', async () => {
    const { t, mock, s } = await aiSetup(() => ok(WEEK));
    const res = [];
    for (let k = 0; k < 3; k++) res.push((await week(t, s.accessToken, { k })).body);
    expect(res.map((r) => r.source)).toEqual(['ai', 'ai', 'rules']);
    expect(res[2].fallbackReason).toBe('daily_limit');
    expect(mock.requests).toHaveLength(2);
    await makePro(t, s.user.id);
    // Pro: 6 LLM attempts/day (the refused free attempt counted as one).
    for (let k = 3; k < 6; k++) expect((await week(t, s.accessToken, { k })).body.source).toBe('ai');
    expect((await week(t, s.accessToken, { k: 99 })).body.fallbackReason).toBe('daily_limit');
    t.clock.now += 86_400_000;
    const next = await signInEmail(t, 'ai@example.com');
    await makePro(t, s.user.id);
    expect((await week(t, next.accessToken, { k: 100 })).body.source).toBe('ai');
  });

  it('caches AI results by request hash (profile + history)', async () => {
    const { t, mock, s } = await aiSetup(() => ok(WEEK));
    const a = await week(t, s.accessToken, { goal: 'gain', days: 2 });
    const b = await week(t, s.accessToken, { days: 2, goal: 'gain' }); // same content, different key order
    expect(a.body.cached).toBe(false);
    expect(b.body).toMatchObject({ cached: true, source: 'ai', plan: a.body.plan });
    expect(mock.requests).toHaveLength(1);
    const c = await call(t, 'POST', '/ai/plan/week', { token: s.accessToken, body: { profile: { goal: 'gain', days: 2 }, history: { adherence: 0.5 } } });
    expect(c.body.cached).toBe(false);
    expect(mock.requests).toHaveLength(2);
  });

  it('meals and swap routes use their own schemas and token caps', async () => {
    const replies = [
      ok({ meals: [{ slot: 'breakfast', recipe_id: 'r_oats', note: 'Warm and filling.' }, { slot: 'dinner', recipe_id: 'r_curry', note: 'A mild, cosy curry.' }] }),
      ok({ options: ['ex_row', 'ex_bench'], note: 'Same muscles, different tool.' }),
    ];
    let i = 0;
    const { t, mock, s } = await aiSetup(() => replies[i++]!);
    const meals = await call(t, 'POST', '/ai/meals/day', { token: s.accessToken, body: { profile: { diet: 'any' } } });
    expect(meals.body.source).toBe('ai');
    const swap = await call(t, 'POST', '/ai/swap', { token: s.accessToken, body: { profile: {}, params: { item: 'exercise' } } });
    expect(swap.body.source).toBe('ai');
    expect(mock.requests.map((r) => r.body.max_tokens)).toEqual([1500, 600]);
    expect(Object.keys(mock.requests[1]!.body.output_config.format.schema.properties)).toEqual(['options', 'note']);
    expect((await call(t, 'POST', '/ai/swap', { token: s.accessToken, body: { profile: {} } })).status).toBe(400);
    expect((await call(t, 'POST', '/ai/plan/week', { token: s.accessToken, body: { history: {} } })).status).toBe(400);
  });

  it('AI_PROVIDER=none (or no engine candidates) returns the rules stub contract', async () => {
    const t = await setup();
    const anon = await call(t, 'POST', '/auth/anonymous', { body: {} });
    const r = await call(t, 'POST', '/ai/plan/week', { token: anon.body.accessToken, body: { profile: {} } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ source: 'rules', kind: 'plan_week', contractVersion: 1, engine: 'stub', plan: null, fallbackReason: 'provider_none' });
    const t2 = await setup({ llm: new AnthropicProvider('k', 'claude-haiku-5-5', (async () => ok(WEEK)) as typeof fetch) });
    const anon2 = await call(t2, 'POST', '/auth/anonymous', { body: {} });
    expect((await call(t2, 'POST', '/ai/plan/week', { token: anon2.body.accessToken, body: { profile: {} } })).body.fallbackReason).toBe('no_candidates');
  });

  it('GET /ai/usage needs the admin token and reports the month', async () => {
    const { t, s } = await aiSetup(() => ok(WEEK));
    await week(t, s.accessToken);
    expect((await call(t, 'GET', '/ai/usage')).status).toBe(401);
    expect((await call(t, 'GET', '/ai/usage', { token: s.accessToken })).status).toBe(401);
    const r = await call(t, 'GET', '/ai/usage', { token: 'admin-token-0123456789' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ month: '2026-11', provider: 'anthropic', model: 'claude-haiku-5-5', budgetUsd: 50, calls: 1, level: 'ok' });
    expect(r.body.spentUsd).toBeGreaterThan(0);
    const none = await setup();
    expect((await call(none, 'GET', '/ai/usage', { token: 'anything' })).status).toBe(404);
  });
});

describe('cost accounting', () => {
  it('prices tokens per million, including cache reads/writes', () => {
    const u = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheWriteTokens: 600 };
    // 1000×0.10 + 500×0.50 + 2000×0.01 + 600×0.125 = 445 micro-USD
    expect(costMicros(HAIKU, u)).toBeCloseTo(445, 9);
    expect(costMicros(HAIKU, u, { batch: true })).toBeCloseTo(222.5, 9);
  });

  it('switches to long-context rates above 100K prompt tokens', () => {
    const u = { inputTokens: 90_000, outputTokens: 1000, cacheReadTokens: 20_000, cacheWriteTokens: 0 };
    expect(costMicros(HAIKU, u)).toBeCloseTo(90_000 * 0.5 + 1000 * 2.5 + 20_000 * 0.05, 6);
  });

  it('budget levels at 80% and 100%', () => {
    expect(budgetLevel(0, 50)).toBe('ok');
    expect(budgetLevel(39_999_999, 50)).toBe('ok');
    expect(budgetLevel(40_000_000, 50)).toBe('pro_only');
    expect(budgetLevel(49_999_000, 50, 2000)).toBe('exhausted');
    expect(budgetLevel(50_000_000, 50)).toBe('exhausted');
    expect(budgetLevel(0, 0)).toBe('exhausted');
  });

  it('Batch API helpers post params and key results by custom_id', async () => {
    const calls: string[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/batches')) {
        expect(JSON.parse(String(init?.body)).requests[0]).toMatchObject({ custom_id: 'u1', params: { model: 'claude-haiku-5-5', max_tokens: 100 } });
        return new Response(JSON.stringify({ id: 'msgbatch_1' }));
      }
      if (url.endsWith('/msgbatch_1')) return new Response(JSON.stringify({ processing_status: 'ended', results_url: 'https://api.anthropic.com/v1/messages/batches/msgbatch_1/results' }));
      return new Response(
        [
          JSON.stringify({ custom_id: 'u2', result: { type: 'errored', error: {} } }),
          JSON.stringify({ custom_id: 'u1', result: { type: 'succeeded', message: { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"a":1}' }], usage } } }),
        ].join('\n'),
      );
    }) as typeof fetch;
    const p = new AnthropicProvider('k', 'claude-haiku-5-5', f);
    const id = await p.createBatch([{ customId: 'u1', req: { system: 's', user: 'u', schema: {}, maxTokens: 100 } }]);
    const b = await p.getBatch(id);
    const res = await p.batchResults(b.resultsUrl!);
    expect(res.get('u1')?.output).toEqual({ a: 1 });
    expect(res.get('u2')).toBeNull();
    expect(calls[0]).toBe('POST https://api.anthropic.com/v1/messages/batches');
  });
});
