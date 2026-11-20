/// <reference types="node" />
/**
 * Smoke test against a DEPLOYED Worker. Read-only by default; `--write` also creates one anonymous
 * account (rate limited to 10/hour/IP) and asks for one AI plan, then deletes the account.
 *
 *   npx tsx server/scripts/smoke.ts https://repwise-api.<account>.workers.dev
 *   npx tsx server/scripts/smoke.ts https://api.repwise.app --write
 *
 * Exits 0 when every check passes, 1 otherwise. Prints no secrets (it never needs any).
 */
const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? process.env.API_URL ?? '').replace(/\/+$/, '');
const write = args.includes('--write');

type Check = { name: string; ok: boolean; detail?: string };
const results: Check[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, ...(detail ? { detail } : {}) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

async function req(method: string, path: string, opts: { body?: unknown; token?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { 'x-request-id': `smoke-${Date.now().toString(36)}`, ...(opts.headers ?? {}) };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const started = Date.now();
  const res = await fetch(`${base}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: res.status, headers: res.headers, json, text, ms: Date.now() - started };
}

const SAMPLE_PROFILE = {
  goal: 'muscle_gain', sex: 'male', birthYear: 1994, heightCm: 180, weightKg: 80, experience: 'intermediate', daysPerWeek: 3, sessionMin: 60,
  equipment: ['barbell', 'dumbbell', 'bench', 'squat_rack', 'bodyweight'], dietType: 'omnivore', allergies: [], cuisines: [], mealsPerDay: 3, budget: 2, cookMin: 30,
};

async function main(): Promise<number> {
  if (!base) {
    console.error('usage: npx tsx server/scripts/smoke.ts <https://api-url> [--write]');
    return 2;
  }
  console.log(`smoke: ${base}${write ? ' (with writes)' : ''}`);

  const health = await req('GET', '/health');
  check('GET /health is 200 {ok:true}', health.status === 200 && health.json?.ok === true, `${health.status}, ${health.ms} ms`);
  check('/health exposes only ok/service/time', !!health.json && Object.keys(health.json).sort().join(',') === 'ok,service,time');
  check('responses carry x-request-id', !!health.headers.get('x-request-id'));
  check('security headers (nosniff, no-store, HSTS)', health.headers.get('x-content-type-options') === 'nosniff' && health.headers.get('cache-control') === 'no-store' && !!health.headers.get('strict-transport-security'));

  const cfg = await req('GET', '/config');
  check('GET /config is 200', cfg.status === 200 && typeof cfg.json?.payments_enabled === 'boolean', `ai_provider=${cfg.json?.ai_provider}, payments=${cfg.json?.payments_enabled}`);
  check('/config leaks no secrets', !/sk-ant|mongodb|secret|BEGIN|PRIVATE/i.test(cfg.text));

  const nf = await req('GET', '/definitely-not-a-route');
  check('unknown route is JSON 404', nf.status === 404 && nf.json?.error === 'not_found');

  const cors = await req('OPTIONS', '/auth/refresh', { headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
  check('no CORS grant for an unknown origin', cors.headers.get('access-control-allow-origin') !== 'https://evil.example' && cors.headers.get('access-control-allow-credentials') !== 'true');

  check('protected route without a token is 401', (await req('GET', '/sync/pull')).status === 401);
  check('garbage token is 401 (not 500)', (await req('GET', '/sync/pull', { token: 'garbage' })).status === 401);
  check('malformed JSON is 400', (await req('POST', '/auth/refresh', { body: undefined, headers: { 'content-type': 'application/json' } })).status === 400);
  const bad = await req('POST', '/auth/email/start', { body: { email: 'not-an-email' } });
  check('invalid input is 400 with a code', bad.status === 400 && typeof bad.json?.error === 'string', bad.json?.error);
  const ent = await req('GET', '/billing/entitlement');
  check('billing is gated (404 off, 401 on without token)', cfg.json?.payments_enabled ? ent.status === 401 : ent.status === 404, String(ent.status));

  if (write) {
    const anon = await req('POST', '/auth/anonymous', { body: { deviceId: 'smoke-test' } });
    check('POST /auth/anonymous issues tokens (DB reachable)', anon.status === 201 && typeof anon.json?.accessToken === 'string', `${anon.status}, ${anon.ms} ms`);
    const token = anon.json?.accessToken as string | undefined;
    if (token) {
      check('anonymous accounts cannot sync (403)', (await req('GET', '/sync/pull', { token })).status === 403);
      const plan = await req('POST', '/ai/plan/week', { token, body: { profile: SAMPLE_PROFILE } });
      check('POST /ai/plan/week returns a plan', plan.status === 200 && !!plan.json?.plan?.week, `source=${plan.json?.source}, reason=${plan.json?.fallbackReason ?? '-'}, ${plan.ms} ms`);
      check('plan validates', plan.json?.plan?.week?.validation?.ok === true);
      const del = await req('DELETE', '/account', { token });
      check('DELETE /account cleans up (204)', del.status === 204);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  return failed.length === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`smoke error: ${e instanceof Error ? e.message : 'unknown'}`);
    process.exit(1);
  },
);
