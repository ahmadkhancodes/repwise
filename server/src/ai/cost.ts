import type { ModelPrice } from '../config';
import type { LlmUsage } from './provider';

/**
 * Cost of one call in micro-USD. Prices are USD per million tokens, so tokens × price = micro-USD.
 * Long-context rates apply when the whole prompt (input + cache read + cache write) exceeds the
 * model's threshold. Batch API calls are billed at 50%.
 */
export function costMicros(price: ModelPrice, u: LlmUsage, opts: { batch?: boolean } = {}): number {
  const prompt = u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens;
  const long = price.longThreshold !== undefined && prompt > price.longThreshold;
  const rate = {
    input: long ? (price.longInput ?? price.input) : price.input,
    output: long ? (price.longOutput ?? price.output) : price.output,
    cacheRead: long ? (price.longCacheRead ?? price.cacheRead) : price.cacheRead,
    cacheWrite: long ? (price.longCacheWrite ?? price.cacheWrite) : price.cacheWrite,
    cacheWrite1h: cacheWrite1hRate(price, long),
  };
  const total =
    u.inputTokens * rate.input +
    u.outputTokens * rate.output +
    u.cacheReadTokens * rate.cacheRead +
    u.cacheWriteTokens * rate.cacheWrite +
    (u.cacheWrite1hTokens ?? 0) * rate.cacheWrite1h;
  return opts.batch ? total / 2 : total;
}

/** 1-hour cache writes bill at 2x input when no explicit price is configured. */
export function cacheWrite1hRate(price: ModelPrice, long = false): number {
  if (long) return price.longCacheWrite1h ?? 2 * (price.longInput ?? price.input);
  return price.cacheWrite1h ?? 2 * price.input;
}

/**
 * Upper bound on a prompt's tokens for budgeting BEFORE the call. Real English/JSON runs ~3.5–4
 * chars per token; slugs and punctuation-heavy JSON can be denser, so this assumes 2 chars per
 * token (deliberately high: the reservation must never be below what the API can bill).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

/**
 * The most a call can cost: every prompt token at the dearest prompt rate (input or either cache
 * write) and the full `max_tokens` of output (thinking counts toward it, so output cannot exceed it).
 */
export function worstCaseMicros(price: ModelPrice, promptTokens: number, maxTokens: number): number {
  const long = price.longThreshold !== undefined && promptTokens > price.longThreshold;
  const dearestPrompt = Math.max(
    long ? (price.longInput ?? price.input) : price.input,
    long ? (price.longCacheWrite ?? price.cacheWrite) : price.cacheWrite,
    cacheWrite1hRate(price, long),
  );
  const out = long ? (price.longOutput ?? price.output) : price.output;
  return Math.ceil(promptTokens * dearestPrompt + maxTokens * out);
}

export function monthKey(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}
