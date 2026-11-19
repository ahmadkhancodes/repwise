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
  };
  const total =
    u.inputTokens * rate.input + u.outputTokens * rate.output + u.cacheReadTokens * rate.cacheRead + u.cacheWriteTokens * rate.cacheWrite;
  return opts.batch ? total / 2 : total;
}

/** Conservative token estimate (≈3 chars/token) for budgeting calls whose usage we never saw. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export function monthKey(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}
