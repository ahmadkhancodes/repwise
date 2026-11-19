/**
 * The real Planner (@repwise/engine over the @repwise/content catalogues) behind the /ai routes,
 * with the Anthropic Messages API mocked at fetch level.
 */
import { describe, expect, it } from 'vitest';
import { engineCatalogues } from '@repwise/content';
import { AnthropicProvider } from '../src/ai/anthropic';
import { createEnginePlanner } from '../src/ai/enginePlanner';
import { call, setup, signInEmail, T0 } from './helpers';

const WEEK = '2026-11-23';
const profile = {
  goal: 'muscle_gain',
  sex: 'male',
  birthYear: 1994,
  heightCm: 180,
  weightKg: 80,
  experience: 'intermediate',
  daysPerWeek: 4,
  sessionMin: 60,
  equipment: ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'pullup_bar', 'squat_rack', 'bodyweight', 'mat'],
  dietType: 'halal',
  allergies: ['nuts'],
  cuisines: ['pakistani', 'middle_eastern'],
  mealsPerDay: 3,
  budget: 2,
  cookMin: 45,
};
const cat = engineCatalogues();
const exIds = new Set(cat.exercises.map((e) => e.id));
const recipeById = new Map(cat.recipes.map((r) => [r.id, r]));

type Picker = (user: { task: string; constraints: any; candidates: Record<string, string[]> }) => unknown;

/** The model's answer is computed from the request it receives, like a real (well-behaved) model. */
const echoRules: Picker = ({ task, constraints, candidates }) => {
  if (task === 'plan_week') {
    return {
      sessions: constraints.sessions.map((s: any) => ({ day: s.day, title: 'Strong and steady', note: 'Smooth reps and full range today.', exercise_ids: s.slots.map((p: string) => candidates[p]![0]) })),
    };
  }
  if (task === 'meals_day') {
    return { meals: constraints.meals.map((m: any) => ({ slot: m.slot, recipe_id: candidates[m.pool]![0], note: 'A warm, simple plate for today.' })) };
  }
  return { options: [...candidates.options!].reverse().slice(0, 3), note: 'Same movement, different kit.' };
};

function anthropic(pick: Picker, status = 200) {
  const requests: any[] = [];
  const f = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    const user = JSON.parse(body.messages[0].content);
    if (status !== 200) return new Response('{"type":"error"}', { status });
    return new Response(
      JSON.stringify({
        model: 'claude-haiku-5-5',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(pick(user)) }],
        usage: { input_tokens: 900, output_tokens: 400, cache_read_input_tokens: 700, cache_creation_input_tokens: 0 },
      }),
    );
  }) as typeof fetch;
  return { fetch: f, requests };
}

async function boot(opts: { pick?: Picker; status?: number; provider?: 'none' } = {}) {
  const mock = anthropic(opts.pick ?? echoRules, opts.status);
  const t = await setup({
    env: opts.provider === 'none' ? { AI_PROVIDER: 'none' } : { AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-test' },
    planner: createEnginePlanner({ clock: () => T0 }),
    llm: opts.provider === 'none' ? null : new AnthropicProvider('sk-ant-test', 'claude-haiku-5-5', mock.fetch),
  });
  const s = await signInEmail(t, 'planner@example.com');
  return { t, s, mock };
}

const post = (b: Awaited<ReturnType<typeof boot>>, path: string, body: unknown) => call(b.t, 'POST', path, { token: b.s.accessToken, body });

describe('engine planner: rules-only (AI_PROVIDER=none)', () => {
  it('/ai/plan/week returns a real, valid week from the content catalogue', async () => {
    const b = await boot({ provider: 'none' });
    const r = await post(b, '/ai/plan/week', { profile, params: { weekStart: WEEK } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ source: 'rules', fallbackReason: 'provider_none', engine: 'repwise-engine', contractVersion: 1 });
    const week = r.body.plan.week;
    expect(week.validation).toEqual({ ok: true, errors: [] });
    expect(week.weekStart).toBe(WEEK);
    expect(week.sessions).toHaveLength(4);
    for (const s of week.sessions) for (const it of s.items) expect(exIds.has(it.exerciseId)).toBe(true);
    expect(week.days).toHaveLength(7);
    for (const d of week.days) {
      for (const m of d.meals) {
        const rec = recipeById.get(m.recipeId)!;
        expect(rec.dietTags).toContain('halal');
        expect(rec.allergens).not.toContain('nuts');
      }
    }
    expect(b.mock.requests).toHaveLength(0);
  });

  it('/ai/meals/day and /ai/swap return real rules output', async () => {
    const b = await boot({ provider: 'none' });
    const day = await post(b, '/ai/meals/day', { profile, params: { date: '2026-11-25' } });
    expect(day.body).toMatchObject({ source: 'rules', plan: { date: '2026-11-25' } });
    expect(day.body.plan.day.meals.length).toBeGreaterThanOrEqual(3);

    const ex = await post(b, '/ai/swap', { profile, params: { item: 'exercise', date: WEEK, index: 2 } });
    expect(ex.body.source).toBe('rules');
    expect(ex.body.plan.options.length).toBeGreaterThan(0);
    for (const id of ex.body.plan.options) expect(exIds.has(id)).toBe(true);

    const meal = await post(b, '/ai/swap', { profile, params: { item: 'meal', date: WEEK, index: 1 } });
    for (const m of meal.body.plan.options) expect(recipeById.get(m.recipeId)!.dietTags).toContain('halal');
  });

  it('is deterministic for the same request and defaults the week from the clock', async () => {
    const b = await boot({ provider: 'none' });
    const a1 = await post(b, '/ai/plan/week', { profile });
    const a2 = await post(b, '/ai/plan/week', { profile, params: { weekStart: '2026-11-16' } });
    expect(a1.body.plan.week.weekStart).toBe('2026-11-16'); // T0 = Thu 19 Nov 2026
    expect(a1.body.plan).toEqual(a2.body.plan);
  });

  it('rejects an invalid profile, history or params with 400 / 404', async () => {
    const b = await boot({ provider: 'none' });
    expect((await post(b, '/ai/plan/week', { profile: { ...profile, weightKg: 5 } })).body).toEqual({ error: 'invalid_profile' });
    expect((await post(b, '/ai/plan/week', { profile, history: { sessions: 'x' } })).body).toEqual({ error: 'invalid_history' });
    expect((await post(b, '/ai/meals/day', { profile, params: { date: '2026-13-01' } })).status).toBe(400);
    expect((await post(b, '/ai/swap', { profile, params: { item: 'car', date: WEEK, index: 0 } })).body).toEqual({ error: 'invalid_item' });
    expect((await post(b, '/ai/swap', { profile, params: { item: 'exercise', date: '2026-11-25', index: 0 } })).status).toBe(404); // rest day (Wed)
  });
});

describe('engine planner: Anthropic (mocked fetch)', () => {
  it('plan_week: the prompt carries IDs only; the LLM picks go through planWeekWithVariety', async () => {
    const b = await boot();
    const r = await post(b, '/ai/plan/week', { profile, params: { weekStart: WEEK } });
    expect(r.body).toMatchObject({ source: 'ai', engine: 'repwise-engine', model: 'claude-haiku-5-5' });
    const week = r.body.plan.week;
    expect(week.generatedBy).toBe('llm');
    expect(week.validation.ok).toBe(true);
    expect(week.sessions.every((s: any) => s.title === 'Strong and steady')).toBe(true);
    expect(Object.keys(r.body.plan.notes)).toEqual(week.trainingDates);

    const user = JSON.parse(b.mock.requests[0].messages[0].content);
    expect(user.task).toBe('plan_week');
    expect(Object.values(user.candidates).flat().every((id) => exIds.has(id as string))).toBe(true);
    const text = b.mock.requests[0].messages[0].content as string;
    expect(text).not.toMatch(/weightKg|heightCm|birthYear|halal|nuts|kcal|protein/);
    expect(text.length).toBeLessThan(6000);
  });

  it('plan_week: alternative accessories are accepted when they validate; sets stay the engine’s', async () => {
    const alt: Picker = (u) => {
      const out = echoRules(u) as any;
      const s0 = u.constraints.sessions[0];
      const i = s0.slots.findIndex((p: string) => u.candidates[p]!.length > 1);
      out.sessions[0].exercise_ids[i] = u.candidates[s0.slots[i]]![1];
      return out;
    };
    const b = await boot({ pick: alt });
    const rules = await boot({ provider: 'none' });
    const base = (await post(rules, '/ai/plan/week', { profile, params: { weekStart: WEEK } })).body.plan.week;
    const r = await post(b, '/ai/plan/week', { profile, params: { weekStart: WEEK } });
    expect(r.body.source).toBe('ai');
    const week = r.body.plan.week;
    expect(week.validation.ok).toBe(true);
    expect(week.sessions[0].items.map((i: any) => i.exerciseId)).not.toEqual(base.sessions[0].items.map((i: any) => i.exerciseId));
    expect(week.sessions[0].items.map((i: any) => i.sets)).toEqual(base.sessions[0].items.map((i: any) => i.sets));
  });

  it('plan_week: an ID from the wrong slot pool, or a missing session, falls back to rules', async () => {
    const wrongSlot: Picker = (u) => {
      const out = echoRules(u) as any;
      const ids = out.sessions[0].exercise_ids;
      [ids[0], ids[1]] = [ids[1], ids[0]];
      return out;
    };
    const b = await boot({ pick: wrongSlot });
    const r = await post(b, '/ai/plan/week', { profile, params: { weekStart: WEEK } });
    expect(r.body).toMatchObject({ source: 'rules', fallbackReason: 'validator_rejected' });
    expect(r.body.plan.week.generatedBy).toBe('rules');

    const missing: Picker = (u) => ({ sessions: (echoRules(u) as any).sessions.slice(1) });
    const b2 = await boot({ pick: missing });
    expect((await post(b2, '/ai/plan/week', { profile, params: { weekStart: WEEK } })).body.fallbackReason).toBe('validator_rejected');
  });

  it('meals_day: picks are portioned and validated by the engine; wrong slot order falls back', async () => {
    const b = await boot();
    const r = await post(b, '/ai/meals/day', { profile, params: { date: '2026-11-25' } });
    expect(r.body).toMatchObject({ source: 'ai', plan: { date: '2026-11-25' } });
    const day = r.body.plan.day;
    expect(r.body.plan.notes).toHaveLength(day.meals.length);
    const kcal = day.meals.reduce((a: number, m: any) => a + recipeById.get(m.recipeId)!.perServing.kcal * m.servings, 0);
    expect(Math.abs(kcal - day.targets.kcal)).toBeLessThanOrEqual(day.targets.kcal * 0.05 + 0.5);

    const reversed: Picker = (u) => ({ meals: (echoRules(u) as any).meals.reverse() });
    const b2 = await boot({ pick: reversed });
    expect((await post(b2, '/ai/meals/day', { profile, params: { date: '2026-11-25' } })).body).toMatchObject({ source: 'rules', fallbackReason: 'validator_rejected' });
  });

  it('swap: the LLM orders engine options; meal options keep engine portions', async () => {
    const b = await boot();
    const ex = await post(b, '/ai/swap', { profile, params: { item: 'exercise', date: WEEK, index: 2 } });
    expect(ex.body, JSON.stringify(ex.body).slice(0, 300)).toMatchObject({ source: 'ai' });
    expect(ex.body.plan.note).toBe('Same movement, different kit.');
    for (const id of ex.body.plan.options) expect(exIds.has(id)).toBe(true);

    const meal = await post(b, '/ai/swap', { profile, params: { item: 'meal', date: WEEK, index: 0 } });
    expect(meal.body, JSON.stringify(meal.body).slice(0, 400)).toMatchObject({ source: 'ai' });
    for (const m of meal.body.plan.options) {
      const rec = recipeById.get(m.recipeId)!;
      expect(m.kcal).toBe(Math.round(rec.perServing.kcal * m.servings));
    }
  });

  it('LLM failure and budget exhaustion ship the real rules plan', async () => {
    const b = await boot({ status: 529 });
    const r = await post(b, '/ai/plan/week', { profile, params: { weekStart: WEEK } });
    expect(r.body.source).toBe('rules');
    expect(r.body.plan.week.validation.ok).toBe(true);

    const b2 = await boot();
    await b2.t.db.addAiSpend('2026-11', { usdMicros: 50e6, calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, fallbacks: 0 }, T0);
    const r2 = await post(b2, '/ai/meals/day', { profile, params: { date: WEEK } });
    expect(r2.body).toMatchObject({ source: 'rules', fallbackReason: 'budget_exhausted' });
    expect(r2.body.plan.day.meals.length).toBeGreaterThan(0);
    expect(b2.mock.requests).toHaveLength(0);
  });
});
