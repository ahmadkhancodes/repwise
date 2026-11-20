/**
 * Golden tests: the real engine planner + recorded Anthropic Messages API responses
 * (test/fixtures/anthropic/*.json, full response bodies as the API returns them).
 *
 * - Valid recordings must ship as `source: "ai"` with the engine's numbers.
 * - Malformed recordings (fenced JSON, truncation, refusal, invented or misplaced IDs, banned copy,
 *   numbers in copy, extra/missing items, empty content) must ship the deterministic rules plan,
 *   byte-identical to the rules-only answer, and still book their cost.
 * - The exact request layout (cached system blocks, schema enums, no profile data) is pinned.
 *
 * Re-record after a content or prompt change (then re-run the prompt eval before shipping):
 *   GOLDEN_RECORD=1 npx vitest run test/golden.test.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { engineCatalogues } from '@repwise/content';
import { AnthropicProvider } from '../src/ai/anthropic';
import { createEnginePlanner } from '../src/ai/enginePlanner';
import { SYSTEM_PROMPT } from '../src/ai/prompts';
import { call, setup, signInEmail, T0 } from './helpers';

const DIR = new URL('./fixtures/anthropic/', import.meta.url);
const RECORD = process.env.GOLDEN_RECORD === '1';
const WEEK = '2026-11-23';
const MEAL_DATE = '2026-11-25';
const profile = {
  goal: 'muscle_gain',
  sex: 'female',
  birthYear: 1991,
  heightCm: 168,
  weightKg: 64,
  experience: 'intermediate',
  daysPerWeek: 4,
  sessionMin: 60,
  equipment: ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'pullup_bar', 'squat_rack', 'bodyweight', 'mat'],
  dietType: 'omnivore',
  allergies: ['nuts'],
  cuisines: ['pakistani', 'middle_eastern', 'mediterranean'],
  mealsPerDay: 3,
  budget: 2,
  cookMin: 45,
};
const cat = engineCatalogues();
const exIds = new Set(cat.exercises.map((e) => e.id));

type ApiBody = Record<string, any>;
interface Fixture {
  status?: number;
  body: ApiBody | string;
}

function apiMessage(text: string | null, opts: { stop?: string; usage?: Record<string, unknown>; stopDetails?: unknown } = {}): ApiBody {
  return {
    id: 'msg_01GoldenRecording0000000000',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'thinking', thinking: '', signature: 'EqQBCkgIBhABGAIiQGolden' }, ...(text === null ? [] : [{ type: 'text', text }])],
    stop_reason: opts.stop ?? 'end_turn',
    stop_sequence: null,
    stop_details: opts.stopDetails ?? null,
    usage: opts.usage ?? {
      input_tokens: 412,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 7350,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
      output_tokens: 389,
      service_tier: 'standard',
    },
  };
}

const read = (name: string): Fixture => JSON.parse(readFileSync(new URL(`${name}.json`, DIR), 'utf8')) as Fixture;
const write = (name: string, f: Fixture) => {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(new URL(`${name}.json`, DIR), `${JSON.stringify(f, null, 2)}\n`);
};

/** Recorder: answers a request the way a careful model would (used only with GOLDEN_RECORD=1). */
function goodAnswer(user: any): unknown {
  if (user.task === 'plan_week') {
    return {
      sessions: user.constraints.sessions.map((s: any, i: number) => {
        const ids: string[] = s.slots.map((p: string) => user.candidates[p][0]);
        if (i === 0) {
          // One alternative accessory, as the alt test does: still validates, but varied.
          const k = s.slots.findIndex((p: string) => user.candidates[p].length > 1 && !ids.includes(user.candidates[p][1]));
          if (k >= 0) ids[k] = user.candidates[s.slots[k]][1];
        }
        const deload = user.constraints.deload === true;
        return {
          day: s.day,
          title: deload ? 'Lighter week to recharge' : ['Lower body strength', 'Upper body push and pull', 'Legs and glutes, steady', 'Upper body, new angles'][i % 4],
          note: deload ? 'Same main lift, less work: move well and leave fresh.' : 'Own every rep on the main lift, then keep the accessories smooth.',
          exercise_ids: ids,
        };
      }),
    };
  }
  if (user.task === 'meals_day') {
    const notes = ['A warm, savoury start that keeps you going.', 'Hearty and easy to batch for the week.', 'A fresh, simple plate to round off the day.'];
    return { meals: user.constraints.meals.map((m: any, i: number) => ({ slot: m.slot, recipe_id: user.candidates[m.pool][0], note: notes[i % notes.length] })) };
  }
  return { options: [...user.candidates.options].reverse().slice(0, 3), note: 'Same movement pattern with a different setup.' };
}

/** Malformed recordings derived from a valid answer (written once, then replayed verbatim). */
function malformed(task: string, user: any, good: any): Record<string, Fixture> {
  const out: Record<string, Fixture> = {};
  const text = JSON.stringify(good);
  out[`${task}.fenced_json`] = { body: apiMessage('```json\n' + text + '\n```') };
  out[`${task}.truncated`] = { body: apiMessage(text.slice(0, Math.floor(text.length / 2)), { stop: 'max_tokens' }) };
  out[`${task}.refusal`] = { body: apiMessage(null, { stop: 'refusal', stopDetails: { type: 'refusal', category: null, explanation: 'Declined.' } }) };
  out[`${task}.empty_content`] = { body: { ...apiMessage(null), content: [] } };
  if (task === 'plan_week') {
    const invented = structuredClone(good);
    invented.sessions[0].exercise_ids[0] = 'super-mega-squat-9000';
    out['plan_week.invented_id'] = { body: apiMessage(JSON.stringify(invented)) };
    const misplaced = structuredClone(good);
    // A real catalogue ID that is in no pool for that slot.
    const used = new Set(Object.values(user.candidates).flat());
    misplaced.sessions[1].exercise_ids[1] = [...exIds].find((id) => !used.has(id));
    out['plan_week.id_outside_pool'] = { body: apiMessage(JSON.stringify(misplaced)) };
    const dosing = structuredClone(good);
    dosing.sessions[0].note = 'Take your pre-workout dose and push hard.';
    out['plan_week.banned_copy'] = { body: apiMessage(JSON.stringify(dosing)) };
    const numbers = structuredClone(good);
    numbers.sessions[0].note = 'Do three sets of 8 on the main lift.';
    out['plan_week.numbers_in_copy'] = { body: apiMessage(JSON.stringify(numbers)) };
    const extra = structuredClone(good);
    extra.sessions.push({ ...extra.sessions[0], day: '2026-11-29' });
    out['plan_week.extra_session'] = { body: apiMessage(JSON.stringify(extra)) };
    out['plan_week.extra_keys'] = { body: apiMessage(JSON.stringify({ ...good, commentary: 'Here is your plan!' })) };
    out['plan_week.http_529'] = { status: 529, body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } };
    out['plan_week.http_429'] = { status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'Rate limited' } } };
  }
  if (task === 'meals_day') {
    const swapped = structuredClone(good);
    swapped.meals.reverse();
    out['meals_day.wrong_slot_order'] = { body: apiMessage(JSON.stringify(swapped)) };
    const missing = structuredClone(good);
    missing.meals.pop();
    out['meals_day.missing_meal'] = { body: apiMessage(JSON.stringify(missing)) };
    const claim = structuredClone(good);
    claim.meals[0].note = 'Great for weight loss and your metabolism.';
    out['meals_day.banned_copy'] = { body: apiMessage(JSON.stringify(claim)) };
  }
  if (task === 'swap') {
    out['swap.duplicate_ids'] = { body: apiMessage(JSON.stringify({ options: [good.options[0], good.options[0]], note: good.note })) };
    out['swap.too_many'] = { body: apiMessage(JSON.stringify({ options: [...user.candidates.options], note: good.note })) };
  }
  return out;
}

const ROUTES = {
  plan_week: { path: '/ai/plan/week', body: { profile, params: { weekStart: WEEK } } },
  plan_week_deload: { path: '/ai/plan/week', body: { profile, params: { weekStart: WEEK, deload: true } } },
  meals_day: { path: '/ai/meals/day', body: { profile, params: { date: MEAL_DATE } } },
  swap: { path: '/ai/swap', body: { profile, params: { item: 'exercise', date: WEEK, index: 2 } } },
} as const;
type RouteName = keyof typeof ROUTES;

async function boot(reply: (req: ApiBody) => Fixture) {
  const requests: ApiBody[] = [];
  const f = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as ApiBody;
    requests.push(body);
    const fx = reply(body);
    return new Response(typeof fx.body === 'string' ? fx.body : JSON.stringify(fx.body), { status: fx.status ?? 200 });
  }) as typeof fetch;
  const t = await setup({
    env: { AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-test' },
    planner: createEnginePlanner({ clock: () => T0 }),
    llm: new AnthropicProvider('sk-ant-test', 'claude-haiku-5-5', f),
  });
  const s = await signInEmail(t, 'golden@example.com');
  return { t, s, requests };
}

async function run(route: RouteName, fixture: Fixture) {
  const b = await boot(() => fixture);
  const r = await call(b.t, 'POST', ROUTES[route].path, { token: b.s.accessToken, body: ROUTES[route].body });
  return { ...b, r };
}

async function rulesOnly(route: RouteName) {
  const t = await setup({ env: { AI_PROVIDER: 'none' }, planner: createEnginePlanner({ clock: () => T0 }) });
  const s = await signInEmail(t, 'rules@example.com');
  return (await call(t, 'POST', ROUTES[route].path, { token: s.accessToken, body: ROUTES[route].body })).body;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe.runIf(RECORD)('golden: record', () => {
  it('records valid and malformed responses from the current engine and prompt', async () => {
    for (const route of Object.keys(ROUTES) as RouteName[]) {
      let user: any;
      const b = await boot((req) => {
        user = JSON.parse(req.messages[0].content);
        return { body: apiMessage(JSON.stringify(goodAnswer(user))) };
      });
      const r = await call(b.t, 'POST', ROUTES[route].path, { token: b.s.accessToken, body: ROUTES[route].body });
      expect(r.body.source, `${route}: ${JSON.stringify(r.body).slice(0, 300)}`).toBe('ai');
      const good = goodAnswer(user);
      write(`${route}.valid`, { body: apiMessage(JSON.stringify(good)) });
      if (route !== 'plan_week_deload') for (const [name, fx] of Object.entries(malformed(route, user, good))) write(name, fx);
    }
    write('prompt', { body: { system_sha256: sha(SYSTEM_PROMPT) } });
  });
});

describe.skipIf(RECORD)('golden: recorded Anthropic responses', () => {
  it('the system prompt matches the recording (re-run the eval and re-record when it changes)', () => {
    expect((read('prompt').body as ApiBody).system_sha256, 'SYSTEM_PROMPT changed: run the prompt eval, then GOLDEN_RECORD=1').toBe(sha(SYSTEM_PROMPT));
  });

  it('pins the request layout: cached instructions + catalogue, enum schema, IDs only', async () => {
    const { requests, r } = await run('plan_week', read('plan_week.valid'));
    expect(r.body.source).toBe('ai');
    const req = requests[0]!;
    expect(req.model).toBe('claude-haiku-5-5');
    expect(req.output_config.effort).toBe('low');
    expect(req.thinking).toBeUndefined(); // model default (adaptive); pinned so the cache holds
    expect(req.temperature).toBeUndefined();
    expect(req.system).toHaveLength(2);
    expect(req.system[0]).toEqual({ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral', ttl: '1h' } });
    expect(req.system[1].text.startsWith('Catalogue: exercises')).toBe(true);
    expect(req.system[1].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    const idEnum = req.output_config.format.schema.properties.sessions.items.properties.exercise_ids.items.enum as string[];
    expect(new Set(idEnum)).toEqual(exIds);
    const user = req.messages[0].content as string;
    expect(user).not.toMatch(/weightKg|heightCm|birthYear|female|nuts|kcal|golden@/);

    // Byte-stable static parts: a second request carries identical system blocks (cache hits).
    const again = await run('plan_week', read('plan_week.valid'));
    expect(again.requests[0]!.system).toEqual(req.system);
    const meals = await run('meals_day', read('meals_day.valid'));
    expect(meals.requests[0]!.system[0]).toEqual(req.system[0]); // instructions shared across routes
    expect(meals.requests[0]!.system[1].text.startsWith('Catalogue: recipes')).toBe(true);
  });

  it('valid recordings ship as AI plans with engine numbers', async () => {
    const week = await run('plan_week', read('plan_week.valid'));
    expect(week.r.body).toMatchObject({ source: 'ai', model: 'claude-haiku-5-5', cached: false });
    expect(week.r.body.plan.week.validation.ok).toBe(true);
    expect(week.r.body.plan.week.generatedBy).toBe('llm');
    const rules = (await rulesOnly('plan_week')).plan.week;
    // Sets come from the engine, never from the model.
    expect(week.r.body.plan.week.sessions.map((s: any) => s.items.map((i: any) => i.sets))).toEqual(rules.sessions.map((s: any) => s.items.map((i: any) => i.sets)));

    const meals = await run('meals_day', read('meals_day.valid'));
    expect(meals.r.body).toMatchObject({ source: 'ai', plan: { date: MEAL_DATE } });
    expect(meals.r.body.plan.notes.length).toBe(meals.r.body.plan.day.meals.length);

    const swap = await run('swap', read('swap.valid'));
    expect(swap.r.body.source).toBe('ai');
    expect(swap.r.body.plan.options.length).toBeLessThanOrEqual(3);
    expect(swap.requests[0]!.system[1].text.startsWith('Catalogue: exercises')).toBe(true);
  });

  it('deload weeks get AI variety too: the prompt says so and the engine keeps the deload volume', async () => {
    const d = await run('plan_week_deload', read('plan_week_deload.valid'));
    const user = JSON.parse(d.requests[0]!.messages[0].content);
    expect(user.constraints.deload).toBe(true);
    expect(d.r.body.source).toBe('ai');
    const week = d.r.body.plan.week;
    expect(week.deload).toBe(true);
    expect(week.validation.ok).toBe(true);
    expect(week.sessions.every((s: any) => s.deload === true)).toBe(true);
    const normal = (await rulesOnly('plan_week')).plan.week;
    const sets = (w: any) => w.sessions.flatMap((s: any) => s.items.map((i: any) => i.sets)).reduce((a: number, b: number) => a + b, 0);
    expect(sets(week)).toBeLessThan(sets(normal));
    const deloadRules = (await rulesOnly('plan_week_deload')).plan.week;
    expect(sets(week)).toBe(sets(deloadRules));
  });

  const CASES: [string, RouteName, string][] = [
    ['plan_week.fenced_json', 'plan_week', 'invalid_json'],
    ['plan_week.truncated', 'plan_week', 'max_tokens'],
    ['plan_week.refusal', 'plan_week', 'refusal'],
    ['plan_week.empty_content', 'plan_week', 'invalid_json'],
    ['plan_week.invented_id', 'plan_week', 'invalid_output'],
    ['plan_week.id_outside_pool', 'plan_week', 'invalid_output'],
    ['plan_week.banned_copy', 'plan_week', 'invalid_output'],
    ['plan_week.numbers_in_copy', 'plan_week', 'invalid_output'],
    ['plan_week.extra_session', 'plan_week', 'invalid_output'],
    ['plan_week.extra_keys', 'plan_week', 'invalid_output'],
    ['plan_week.http_529', 'plan_week', 'provider_error'],
    ['plan_week.http_429', 'plan_week', 'provider_error'],
    ['meals_day.fenced_json', 'meals_day', 'invalid_json'],
    ['meals_day.truncated', 'meals_day', 'max_tokens'],
    ['meals_day.refusal', 'meals_day', 'refusal'],
    ['meals_day.wrong_slot_order', 'meals_day', 'invalid_output'],
    ['meals_day.missing_meal', 'meals_day', 'invalid_output'],
    ['meals_day.banned_copy', 'meals_day', 'invalid_output'],
    ['swap.fenced_json', 'swap', 'invalid_json'],
    ['swap.refusal', 'swap', 'refusal'],
    ['swap.duplicate_ids', 'swap', 'invalid_output'],
    ['swap.too_many', 'swap', 'invalid_output'],
  ];

  it.each(CASES)('%s falls back to the exact rules plan (%s → %s)', async (name, route, reason) => {
    const { r, t } = await run(route, read(name));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ source: 'rules', fallbackReason: reason, cached: false });
    expect(r.body.plan).toEqual((await rulesOnly(route)).plan);
    // Billed responses are booked; HTTP failures book nothing; no reservation is left behind.
    const spend = (await t.db.getAiSpend('2026-11'))!;
    expect(spend.fallbacks).toBe(1);
    if (reason === 'provider_error') expect(spend.usdMicros).toBe(0);
    else expect(spend.usdMicros).toBeGreaterThan(0);
    expect(spend.usdMicros).toBeLessThan(5000); // well under a cent: the reservation was settled
  });

  it('logs outcomes without prompt content, IDs or user data', async () => {
    const { t } = await run('plan_week', read('plan_week.invented_id'));
    const text = t.log.lines.map((l) => l.line).join('\n');
    expect(text).toContain('"msg":"ai_output_rejected"');
    expect(text).toContain('"check":"id_not_in_slot_pool"');
    expect(text).not.toMatch(/super-mega-squat|golden@example|sk-ant-test|weightKg/);
  });
});
