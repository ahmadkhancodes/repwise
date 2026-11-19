/**
 * Card persistence format (cards table: rule_id, date, text, action, state). Pure.
 * - text: JSON { title, body, detail, actionLabel } so S12 shows the exact copy that fired;
 * - action: JSON CardAction or null;
 * - state: 'active' | 'dismissed' | 'applied' | 'snoozed:<epoch ms>'.
 * One row per (rule, date): dismissing hides that rule for the day; snoozing hides it until then.
 */
import type { CardAction, CardCandidate, RuleId } from './rules';

export type CardState =
  | { kind: 'active' }
  | { kind: 'dismissed' }
  | { kind: 'applied' }
  | { kind: 'snoozed'; until: number };

/** "Later" hides a card for three hours. */
export const SNOOZE_MS = 3 * 60 * 60 * 1000;
/** RW-41: free users get one assistant card a day; Pro gets all. */
export const FREE_CARDS_PER_DAY = 1;

export function parseState(raw: string | null | undefined): CardState {
  if (raw === 'dismissed' || raw === 'applied') return { kind: raw };
  const m = /^snoozed:(\d+)$/.exec(raw ?? '');
  if (m) return { kind: 'snoozed', until: Number(m[1]) };
  return { kind: 'active' };
}

export function formatState(s: CardState): string {
  return s.kind === 'snoozed' ? `snoozed:${Math.round(s.until)}` : s.kind;
}

export function snoozeState(now: number, ms = SNOOZE_MS): string {
  return formatState({ kind: 'snoozed', until: now + ms });
}

export function isVisible(raw: string | null | undefined, now: number): boolean {
  const s = parseState(raw);
  if (s.kind === 'active') return true;
  if (s.kind === 'snoozed') return s.until <= now;
  return false;
}

export type CardCopy = Pick<CardCandidate, 'title' | 'body' | 'detail' | 'actionLabel'>;

export function encodeCopy(c: CardCandidate): string {
  return JSON.stringify({ title: c.title, body: c.body, detail: c.detail, actionLabel: c.actionLabel });
}

export function decodeCopy(raw: string | null | undefined): CardCopy | null {
  try {
    const v = JSON.parse(raw ?? '') as Partial<CardCopy>;
    if (typeof v.title !== 'string' || typeof v.body !== 'string') return null;
    return {
      title: v.title,
      body: v.body,
      detail: typeof v.detail === 'string' ? v.detail : v.body,
      actionLabel: typeof v.actionLabel === 'string' ? v.actionLabel : null,
    };
  } catch {
    return null;
  }
}

export function encodeAction(a: CardAction | null): string | null {
  return a ? JSON.stringify(a) : null;
}

export function decodeAction(raw: string | null | undefined): CardAction | null {
  try {
    const v = JSON.parse(raw ?? '') as CardAction;
    return v && typeof v === 'object' && typeof v.type === 'string' ? v : null;
  } catch {
    return null;
  }
}

export type StoredCard = { id: string; ruleId: string; state: string | null };

export type ShownCard = { id: string; ruleId: RuleId; candidate: CardCandidate };

/**
 * Which cards to show now: candidates (already sorted by priority) that have a stored row in a
 * visible state, capped to one for free users.
 */
export function visibleCards(
  candidates: CardCandidate[],
  stored: StoredCard[],
  now: number,
  isPro: boolean,
): ShownCard[] {
  const byRule = new Map(stored.map((r) => [r.ruleId, r]));
  const shown: ShownCard[] = [];
  for (const c of candidates) {
    const row = byRule.get(c.ruleId);
    if (!row || !isVisible(row.state, now)) continue;
    shown.push({ id: row.id, ruleId: c.ruleId, candidate: c });
  }
  return isPro ? shown : shown.slice(0, FREE_CARDS_PER_DAY);
}

/**
 * Candidates that need a row for the day. Pro: every new rule. Free: only the day's first card,
 * so a dismissed card is not replaced by the next one (RW-41: one card a day).
 */
export function missingRows(
  candidates: CardCandidate[],
  stored: StoredCard[],
  isPro: boolean,
): CardCandidate[] {
  if (!isPro) return stored.length > 0 ? [] : candidates.slice(0, FREE_CARDS_PER_DAY);
  const have = new Set(stored.map((r) => r.ruleId));
  return candidates.filter((c) => !have.has(c.ruleId));
}
