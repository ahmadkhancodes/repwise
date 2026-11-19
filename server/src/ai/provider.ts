import type { AiKind } from '../config';
import type { JsonObject } from './planner';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface LlmRequest {
  kind: AiKind;
  system: string;
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
