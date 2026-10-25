/**
 * STATUS: UNVERIFIED — written from provider spec, never executed against the live API.
 * Cost math here has NOT been validated against real usage payloads. Wrong costs fail
 * SILENTLY (bad costUsd, not a crash). Run templates/VERIFY.md smoke tests before
 * trusting any number this adapter produces in a client-facing context.
 * Verified: <none>   Last spec review: 2026-07-19
 */

/**
 * OpenAI — Responses API (default) and Chat Completions.
 *
 * TWO INVARIANTS, PULLING IN OPPOSITE DIRECTIONS FROM ANTHROPIC:
 *
 * 1. INPUT IS INCLUSIVE OF CACHE READS. `input_tokens` (Responses) and `prompt_tokens`
 *    (Chat) COUNT the cached portion; `*_details.cached_tokens` tells you how much of that
 *    total was served from cache. Uncached input is therefore the difference. This is the
 *    Gemini side of the never-subtract-twice invariant and the OPPOSITE of Anthropic and
 *    Bedrock, where the input count already excludes cache. Failing to subtract here charges
 *    the cached prefix at full input rate — the exact overstatement the cache existed to
 *    remove, which makes prompt caching look like it did nothing.
 *
 * 2. REASONING IS A NESTED BREAKDOWN. `output_tokens_details.reasoning_tokens` is a subset
 *    of `output_tokens`: the documented usage example shows reasoning strictly less than the
 *    output total, and reasoning is stated to be "billed as output tokens". Billable output
 *    is `output_tokens`. Adding reasoning on top double-charges. Hence
 *    `reasoningInOutput: 'nested'`.
 *
 * CONFIDENCE NOTE, stated because an unlabelled inference is a defect: for Chat Completions
 * the containment relationship is NOT asserted in prose by the field reference. It is
 * inferred from the parallel `*_details` naming, from the long-standing
 * `total_tokens = prompt_tokens + completion_tokens` identity which leaves no slot for a
 * third addend, and from the "billed as output tokens" statement in the reasoning guide.
 * Medium confidence. If you use Chat Completions with a reasoning model, VERIFY.md's
 * totals cross-check is the assertion that would catch it being wrong.
 *
 * Caching is automatic on this provider — there is no `cache_control` equivalent to set. The
 * only lever is prefix stability, so `mode: 'explicit'` throws with a pointer rather than
 * pretending to do something.
 */

import {
  AdapterError,
  assertUsageInvariants,
  num,
  type AdapterRequest,
  type AdapterResponse,
  type LlmAdapter,
  type NormalizedUsage,
} from './types.ts';

const PROVIDER = 'openai' as const;
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export type OpenAiSurface = 'responses' | 'chat';

export interface OpenAiAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  surface?: OpenAiSurface;
  organization?: string;
  fetchImpl?: typeof fetch;
}

export interface OpenAiResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

export interface OpenAiChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

/** Responses API mapping. Exported for the smoke test. */
export function normalizeOpenAiResponsesUsage(
  u: OpenAiResponsesUsage | undefined | null,
): NormalizedUsage | null {
  if (!u || typeof u.input_tokens !== 'number') return null;
  const promptTotal = num(u.input_tokens);
  const cacheRead = num(u.input_tokens_details?.cached_tokens);

  const usage: NormalizedUsage = {
    // Inclusive prompt total minus the cached portion. Subtract exactly once.
    inputTokens: Math.max(0, promptTotal - cacheRead),
    outputTokens: num(u.output_tokens),
    cacheReadTokens: cacheRead,
    // Automatic caching has no write surcharge — there is nothing to bill for creating it.
    cacheWriteTokens: 0,
    cacheWrite1hTokens: 0,
    reasoningTokens:
      typeof u.output_tokens_details?.reasoning_tokens === 'number'
        ? u.output_tokens_details.reasoning_tokens
        : null,
    reasoningInOutput: 'nested',
    totalTokensReported: typeof u.total_tokens === 'number' ? u.total_tokens : null,
    estimated: false,
    raw: { promptTotalInclusiveOfCache: promptTotal },
  };
  assertUsageInvariants(PROVIDER, usage, { providerPromptTotal: promptTotal });
  return usage;
}

/** Chat Completions mapping. Same semantics, different field names. */
export function normalizeOpenAiChatUsage(
  u: OpenAiChatUsage | undefined | null,
): NormalizedUsage | null {
  if (!u || typeof u.prompt_tokens !== 'number') return null;
  const promptTotal = num(u.prompt_tokens);
  const cacheRead = num(u.prompt_tokens_details?.cached_tokens);

  const usage: NormalizedUsage = {
    inputTokens: Math.max(0, promptTotal - cacheRead),
    outputTokens: num(u.completion_tokens),
    cacheReadTokens: cacheRead,
    cacheWriteTokens: 0,
    cacheWrite1hTokens: 0,
    reasoningTokens:
      typeof u.completion_tokens_details?.reasoning_tokens === 'number'
        ? u.completion_tokens_details.reasoning_tokens
        : null,
    reasoningInOutput: 'nested',
    totalTokensReported: typeof u.total_tokens === 'number' ? u.total_tokens : null,
    estimated: false,
    raw: { promptTotalInclusiveOfCache: promptTotal, containmentConfidence: 'medium' },
  };
  assertUsageInvariants(PROVIDER, usage, { providerPromptTotal: promptTotal });
  return usage;
}

export function createOpenAiAdapter(opts: OpenAiAdapterOptions): LlmAdapter {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const surface: OpenAiSurface = opts.surface ?? 'responses';
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    provider: PROVIDER,
    billable: true,
    supportsBatch: true,
    supportsExplicitCache: false,

    async complete(req: AdapterRequest): Promise<AdapterResponse> {
      if (req.batch) {
        throw new AdapterError(
          PROVIDER,
          'unsupported-capability',
          'The Batch API is an asynchronous submit-and-poll flow at half price with a 24h ' +
            'window, not a complete() call. Ask the triage question — is a human waiting ' +
            'for this response right now? — and route accordingly.',
        );
      }
      if (req.cache?.mode === 'explicit') {
        throw new AdapterError(
          PROVIDER,
          'unsupported-capability',
          'Prompt caching here is automatic and has no explicit handle to set. The only ' +
            'lever is prefix stability: put your stable content (instructions, schemas, ' +
            'few-shot examples) first and byte-identical, and keep anything volatile ' +
            'after it. Verify with cached_tokens > 0 on the second identical call.',
        );
      }

      const headers: Record<string, string> = {
        'content-type': 'application/json',
        authorization: `Bearer ${opts.apiKey}`,
      };
      if (opts.organization) headers['openai-organization'] = opts.organization;

      const controller = new AbortController();
      const timer = req.timeoutMs
        ? setTimeout(() => controller.abort(), req.timeoutMs)
        : null;
      req.signal?.addEventListener('abort', () => controller.abort(), { once: true });

      const url =
        surface === 'responses' ? `${baseUrl}/responses` : `${baseUrl}/chat/completions`;
      const body =
        surface === 'responses' ? buildResponsesBody(req) : buildChatBody(req);

      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (cause) {
        const aborted = controller.signal.aborted;
        throw new AdapterError(
          PROVIDER,
          aborted ? 'timeout' : 'network-error',
          String(cause),
          { cause },
        );
      } finally {
        if (timer) clearTimeout(timer);
      }

      if (!res.ok) throw await classifyOpenAiError(res);
      const json = (await res.json()) as Record<string, unknown>;

      if (surface === 'responses') {
        const text = extractResponsesText(json);
        return {
          text,
          requestedModel: req.model,
          servedModel: (json.model as string) ?? req.model,
          usage: normalizeOpenAiResponsesUsage(json.usage as OpenAiResponsesUsage),
          finishReason: (json.status as string) ?? null,
          billable: true,
          notionalCostUsd: null,
          providerMeta: { surface },
        };
      }

      const choice = (json.choices as Array<Record<string, unknown>> | undefined)?.[0];
      const msg = choice?.message as { content?: string } | undefined;
      return {
        text: msg?.content ?? '',
        requestedModel: req.model,
        servedModel: (json.model as string) ?? req.model,
        usage: normalizeOpenAiChatUsage(json.usage as OpenAiChatUsage),
        finishReason: (choice?.finish_reason as string) ?? null,
        billable: true,
        notionalCostUsd: null,
        providerMeta: { surface },
      };
    },
  };
}

function buildResponsesBody(req: AdapterRequest): Record<string, unknown> {
  return {
    model: req.model,
    // Stable content first: automatic caching matches on a leading prefix, so instruction
    // text placed after the conversation earns nothing.
    ...(req.system ? { instructions: req.system } : {}),
    input: req.messages.map((m) => ({ role: m.role, content: m.content })),
    max_output_tokens: req.maxOutputTokens,
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    // Reasoning effort is a direct cost dial: reasoning tokens bill at the output rate and
    // are invisible in the response body, so a high effort setting on mechanical work is
    // spend you will never see in the text you got back.
    ...(req.reasoning
      ? { reasoning: { effort: req.reasoning.enabled ? 'medium' : 'minimal' } }
      : {}),
    ...(req.responseFormat === 'json'
      ? { text: { format: { type: 'json_object' } } }
      : {}),
  };
}

function buildChatBody(req: AdapterRequest): Record<string, unknown> {
  const messages = [
    ...(req.system ? [{ role: 'system', content: req.system }] : []),
    ...req.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  return {
    model: req.model,
    messages,
    max_completion_tokens: req.maxOutputTokens,
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.stopSequences ? { stop: req.stopSequences } : {}),
    ...(req.responseFormat === 'json'
      ? { response_format: { type: 'json_object' } }
      : {}),
  };
}

function extractResponsesText(json: Record<string, unknown>): string {
  if (typeof json.output_text === 'string') return json.output_text;
  const output = json.output as
    | Array<{ content?: Array<{ type?: string; text?: string }> }>
    | undefined;
  return (output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text ?? '')
    .join('');
}

async function classifyOpenAiError(res: Response): Promise<AdapterError> {
  const bodyText = await res.text().catch(() => '');
  const retryAfter = Number(res.headers.get('retry-after'));
  const retryAfterMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined;

  if (res.status === 429) {
    const exhausted = /insufficient_quota|billing|hard limit/i.test(bodyText);
    return new AdapterError(
      PROVIDER,
      exhausted ? 'quota-exhausted' : 'rate-limited',
      bodyText.slice(0, 400),
      { retryAfterMs },
    );
  }
  if (res.status === 401 || res.status === 403) {
    return new AdapterError(PROVIDER, 'not-authenticated', bodyText.slice(0, 400));
  }
  if (res.status === 400 && /context_length_exceeded|maximum context/i.test(bodyText)) {
    return new AdapterError(PROVIDER, 'context-length-exceeded', bodyText.slice(0, 400));
  }
  if (/content_filter/i.test(bodyText)) {
    return new AdapterError(PROVIDER, 'content-filtered', bodyText.slice(0, 400));
  }
  return new AdapterError(
    PROVIDER,
    res.status >= 500 ? 'overloaded' : 'api-error',
    `HTTP ${res.status}: ${bodyText.slice(0, 400)}`,
    { retryAfterMs },
  );
}
