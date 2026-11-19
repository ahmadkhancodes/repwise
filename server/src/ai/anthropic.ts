import type { LlmProvider, LlmRequest, LlmResult, LlmUsage } from './provider';
import { LlmCallError } from './provider';

export const ANTHROPIC_API = 'https://api.anthropic.com';
export const ANTHROPIC_VERSION = '2026-10-21';

interface MessagesResponse {
  model?: string;
  stop_reason?: string;
  content?: { type: string; text?: string }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export function usageOf(u: MessagesResponse['usage']): LlmUsage {
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
  };
}

/** Request body for the Messages API (also used for Batch API requests). */
export function messagesBody(model: string, req: Omit<LlmRequest, 'timeoutMs' | 'kind'>) {
  return {
    model,
    max_tokens: req.maxTokens,
    // Static system prompt first, cached; the per-request JSON goes in the user turn after it.
    system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: req.user }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: req.schema } },
  };
}

/** Parse a Messages API response: read text blocks by type (thinking blocks may come first). */
export function parseMessage(body: MessagesResponse, fallbackModel: string): LlmResult {
  const usage = usageOf(body.usage);
  const model = body.model ?? fallbackModel;
  const stopReason = body.stop_reason ?? 'unknown';
  if (stopReason === 'refusal') return { model, output: undefined, stopReason, usage, error: 'refusal' };
  if (stopReason === 'max_tokens') return { model, output: undefined, stopReason, usage, error: 'max_tokens' };
  const text = (body.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
  if (!text) return { model, output: undefined, stopReason, usage, error: 'no_text' };
  try {
    return { model, output: JSON.parse(text), stopReason, usage };
  } catch {
    return { model, output: undefined, stopReason, usage, error: 'invalid_json' };
  }
}

/** Claude via the Messages API over plain fetch (no SDK in the Worker bundle). */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private headers() {
    return { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': ANTHROPIC_VERSION };
  }

  async generate(req: LlmRequest): Promise<LlmResult> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), req.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(`${ANTHROPIC_API}/v1/messages`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(messagesBody(this.model, req)),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new LlmCallError('http', res.status);
      return parseMessage((await res.json()) as MessagesResponse, this.model);
    } catch (e) {
      if (e instanceof LlmCallError) throw e;
      throw new LlmCallError(ctrl.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Batch API (50% price) for non-urgent work such as overnight weekly regeneration.
   * Returns the batch id; poll `getBatch` until processing_status is "ended", then `batchResults`.
   */
  async createBatch(items: { customId: string; req: Omit<LlmRequest, 'timeoutMs' | 'kind'> }[]): Promise<string> {
    const res = await this.fetchFn(`${ANTHROPIC_API}/v1/messages/batches`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ requests: items.map((i) => ({ custom_id: i.customId, params: messagesBody(this.model, i.req) })) }),
    });
    if (!res.ok) throw new LlmCallError('http', res.status);
    return ((await res.json()) as { id: string }).id;
  }

  async getBatch(id: string): Promise<{ status: string; resultsUrl: string | null }> {
    const res = await this.fetchFn(`${ANTHROPIC_API}/v1/messages/batches/${encodeURIComponent(id)}`, { headers: this.headers() });
    if (!res.ok) throw new LlmCallError('http', res.status);
    const b = (await res.json()) as { processing_status: string; results_url?: string | null };
    return { status: b.processing_status, resultsUrl: b.results_url ?? null };
  }

  /** Results arrive in any order: key them by custom_id. Failed items map to null. */
  async batchResults(resultsUrl: string): Promise<Map<string, LlmResult | null>> {
    const res = await this.fetchFn(resultsUrl, { headers: this.headers() });
    if (!res.ok) throw new LlmCallError('http', res.status);
    const out = new Map<string, LlmResult | null>();
    for (const line of (await res.text()).split('\n')) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as { custom_id: string; result: { type: string; message?: MessagesResponse } };
      out.set(r.custom_id, r.result.type === 'succeeded' && r.result.message ? parseMessage(r.result.message, this.model) : null);
    }
    return out;
  }
}

