import { Hono, type Context } from 'hono';
import { monthKey } from '../ai/cost';
import type { JsonObject, PlanRequest } from '../ai/planner';
import { runPlanner, usageReport } from '../ai/service';
import type { AiKind } from '../config';
import { safeEqual } from '../lib/crypto';
import { badRequest, clientIp, isPlainObject, notFound, unauthorized } from '../lib/http';
import { bearer, rateLimit, requireUser } from '../lib/middleware';
import { parseJson, parseQuery, parseWith } from '../lib/validate';
import { AiBody, AiParams, UsageQuery } from '../schemas';
import type { AppEnv } from '../types';

/** Keys that could identify a person are dropped before anything is hashed, cached or prompted. */
const PII_KEYS = new Set(['name', 'first_name', 'last_name', 'full_name', 'firstname', 'lastname', 'email', 'phone', 'address', 'user_id', 'userid']);
const MAX_DEPTH = 8;

export function scrub(v: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) throw badRequest('too_deep');
  if (Array.isArray(v)) return v.map((x) => scrub(x, depth + 1));
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (!PII_KEYS.has(k.toLowerCase())) out[k] = scrub(x, depth + 1);
    return out;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) throw badRequest('invalid_value');
  return v;
}

async function parseRequest(c: Context<AppEnv>, kind: AiKind): Promise<PlanRequest> {
  const body = await parseJson(c, AiBody, 32 * 1024);
  if (kind === 'swap' && !body.params) throw badRequest('params_required');
  // Known params are type- and range-checked; unknown keys are dropped (never cached or prompted).
  const params = body.params ? (stripUndefined(parseWith(AiParams, body.params)) as JsonObject) : null;
  return {
    kind,
    profile: scrub(body.profile) as JsonObject,
    history: body.history ? (scrub(body.history) as JsonObject) : null,
    params: params && Object.keys(params).length > 0 ? params : kind === 'swap' ? {} : null,
  };
}

function stripUndefined(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

export const aiRoutes = new Hono<AppEnv>();

/** Monthly spend, behind AI_ADMIN_TOKEN (404 when no token is configured). */
aiRoutes.get('/usage', async (c) => {
  const deps = c.get('deps');
  const admin = deps.config.ai.adminToken;
  if (!admin || admin.length < 16) throw notFound();
  await rateLimit(c, `ai-usage:ip:${clientIp(c)}`, 10, 60_000); // no brute-forcing the admin token
  const token = bearer(c);
  if (!token || !safeEqual(token, admin)) throw unauthorized();
  const month = parseQuery(c, UsageQuery).month ?? monthKey(deps.now());
  return c.json(await usageReport(deps.config, await deps.db(), month));
});

const ROUTES: [string, AiKind][] = [
  ['/plan/week', 'plan_week'],
  ['/meals/day', 'meals_day'],
  ['/swap', 'swap'],
];

for (const [path, kind] of ROUTES) {
  aiRoutes.post(path, requireUser(), async (c) => {
    const userId = c.get('userId');
    await rateLimit(c, `ai:min:${userId}`, 20, 60_000);
    const req = await parseRequest(c, kind);
    const deps = c.get('deps');
    return c.json(await runPlanner(deps, await deps.db(), userId, req, c.get('log')));
  });
}
