/**
 * Accepting the Worker's AI-varied week (`POST /ai/plan/week`). Pure. The Worker already validates
 * with the same engine, but the app never trusts the network: the plan must have the right week,
 * the right shape and pass the local engine validator, or the rules plan stays.
 */
import type { WeekPlan } from '../engine';

/** What `/ai/*` returns (server/src/ai/service.ts `AiResponse`). */
export type AiWeekResponse = {
  source?: unknown;
  plan?: unknown;
  fallbackReason?: unknown;
};

export type AiDecision =
  | { accept: true; plan: WeekPlan }
  | { accept: false; reason: 'rules_only' | 'bad_shape' | 'wrong_week' | 'invalid' };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function looksLikeWeekPlan(v: unknown): v is WeekPlan {
  if (!isObj(v)) return false;
  return (
    typeof v.weekStart === 'string' &&
    Array.isArray(v.dates) &&
    Array.isArray(v.sessions) &&
    Array.isArray(v.days) &&
    Array.isArray(v.trainingDates) &&
    isObj(v.block) &&
    isObj(v.nutrition) &&
    isObj(v.volumeRange) &&
    typeof v.noRepeatDays === 'number' &&
    v.sessions.every(
      (s) =>
        isObj(s) &&
        typeof s.date === 'string' &&
        typeof s.title === 'string' &&
        Array.isArray(s.items),
    ) &&
    v.days.every(
      (d) => isObj(d) && typeof d.date === 'string' && Array.isArray(d.meals) && isObj(d.targets),
    )
  );
}

export function decideAiPlan(
  res: AiWeekResponse | null | undefined,
  expectedWeekStart: string,
  validate: (plan: WeekPlan) => boolean,
): AiDecision {
  if (!res || res.source !== 'ai' || res.plan == null)
    return { accept: false, reason: 'rules_only' };
  if (!looksLikeWeekPlan(res.plan)) return { accept: false, reason: 'bad_shape' };
  if (res.plan.weekStart !== expectedWeekStart) return { accept: false, reason: 'wrong_week' };
  let ok = false;
  try {
    ok = validate(res.plan);
  } catch {
    ok = false;
  }
  return ok ? { accept: true, plan: res.plan } : { accept: false, reason: 'invalid' };
}
