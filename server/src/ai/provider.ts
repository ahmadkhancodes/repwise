import type { AiKind } from '../config';
import type { JsonObject } from './planner';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** Cache writes at the 5-minute rate. */
  cacheWriteTokens: number;
  /** Cache writes at the 1-hour rate. */
  cacheWrite1hTokens?: number;
}

export type CacheTtl = '5m' | '1h';

export interface LlmRequest {
  kind: AiKind;
  /** Static instructions (cached). */
  system: string;
  /** Static catalogue (cached, after `system`). */
  catalogue?: string | undefined;
  /** TTL of the cached system blocks. */
  cacheTtl?: CacheTtl | undefined;
  /** Per-request JSON (never cached). */
  user: string;
  schema: JsonObject;
  maxTokens: number;
  timeoutMs: number;
}

/** A completed (billed) call. `output` is undefined when the reply was not valid JSON. */
export interface LlmResult {
  model: string;
  output: unknown;
  stopReason: string;
  usage: LlmUsage;
  error?: 'invalid_json' | 'refusal' | 'max_tokens' | 'no_text';
}

export type LlmFailure = 'timeout' | 'http' | 'network';

export class LlmCallError extends Error {
  constructor(
    readonly reason: LlmFailure,
    readonly status?: number,
  ) {
    super(`llm call failed: ${reason}${status ? ` ${status}` : ''}`);
  }
}

/** Optional variety/copy layer behind the Worker. Output is always validated and can always fall back. */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  generate(req: LlmRequest): Promise<LlmResult>;
}
