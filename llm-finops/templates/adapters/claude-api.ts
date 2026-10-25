/**
 * STATUS: UNVERIFIED — written from provider spec, never executed against the live API.
 * Cost math here has NOT been validated against real usage payloads. Wrong costs fail
 * SILENTLY (bad costUsd, not a crash). Run templates/VERIFY.md smoke tests before
 * trusting any number this adapter produces in a client-facing context.
 * Verified: <none>   Last spec review: 2026-07-19
 */

/**
 * Anthropic Messages API — the metered escalation tier.
 *
 * Reached deliberately: either the call site declared `tier: 'escalation'`, or a
 * deterministic zero-token quality gate rejected the primary's output. Never reached by a
 * blind auto-router, because cache economics dominate routing economics — a mid-conversation
 * provider switch to save on sticker price destroys a prefix worth an order of magnitude
 * more than the tier delta.
 *
 * TWO THINGS TO GET RIGHT HERE, both of which move cost in the invisible direction:
 *
 * 1. REASONING IS A NESTED BREAKDOWN, NOT AN ADDEND. `output_tokens_details.thinking_tokens`
 *    is documented as always <= `output_tokens`; subtracting it gives the non-reasoning
 *    remainder. So billable output is `output_tokens`, full stop. Adding thinking on top —
 *    which is correct on Gemini and only on Gemini — double-charges every reasoning token.
 *    Hence `reasoningInOutput: 'nested'`.
 *
 *    Corollary that catches people during reconciliation: with summarized thinking you are
 *    billed for the FULL reasoning the model generated, not the shorter summary returned in
 *    the response body. The visible text will not add up to the billed count. `usage` is the
 *    only billing-truthful source. Do not re-tokenize the response to "check" it.
 *
 * 2. INPUT IS ALREADY EXCLUSIVE OF CACHE. `input_tokens` counts only uncached input;
 *    `cache_read_input_tokens` and `cache_creation_input_tokens` are reported alongside it,
 *    not inside it. Subtracting cache reads here — as you MUST on Gemini and OpenAI —
 *    understates input by the whole prefix. This is the never-subtract-twice invariant and
 *    it is the reason each adapter carries its own explicit comment about which side it is
 *    on rather than sharing one helper that "handles caching".
 *
 * Rates, TTL multipliers and batch discounts: references/sota-snapshot.md. Not here.
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

const PROVIDER = 'anthropic' as const;
const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';

export interface ClaudeApiAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  /** US data residency carries a rate multiplier on every category. The adapter reports the
   *  setting; pricing.ts applies the multiplier. Adapters never touch money. */
  inferenceGeo?: 'us' | null;
  fetchImpl?: typeof fetch;
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  output_tokens_details?: { thinking_tokens?: number };
}

/**
 * Pure mapping function, exported so VERIFY.md's smoke test can assert on it directly.
 *
 * Cache writes are split by TTL because the two are priced differently (the longer TTL costs
 * more to write and is worth it only above a higher reuse cadence). Collapsing them into one
 * number makes the break-even calculation in caching-and-batch.md unanswerable from the
 * ledger, which is how a cache that loses money survives unnoticed.
 */
export function normalizeAnthropicUsage(
  u: AnthropicUsage | undefined | null,
): NormalizedUsage | null {
  if (!u || typeof u.input_tokens !== 'number') return null;

  const write5m = u.cache_creation?.ephemeral_5m_input_tokens;
  const write1h = num(u.cache_creation?.ephemeral_1h_input_tokens);
  // Older responses report only the aggregate. Attribute it to the short TTL rather than
  // dropping it — under-reporting a cache write understates cost.
  const shortWrite =
    typeof write5m === 'number' ? write5m : num(u.cache_creation_input_tokens) - write1h;

  const usage: NormalizedUsage = {
    // Already exclusive of cache reads. Do NOT subtract.
    inputTokens: num(u.input_tokens),
    outputTokens: num(u.output_tokens),
    cacheReadTokens: num(u.cache_read_input_tokens),
    cacheWriteTokens: Math.max(0, shortWrite),
    cacheWrite1hTokens: write1h,
    reasoningTokens:
      typeof u.output_tokens_details?.thinking_tokens === 'number'
        ? u.output_tokens_details.thinking_tokens
        : null,
    reasoningInOutput: 'nested',
    totalTokensReported: null,
    estimated: false,
  };

  // Fails loudly if thinking ever exceeds output — which would mean the documented
  // containment relationship changed and this adapter's cost math is stale.
  assertUsageInvariants(PROVIDER, usage);
  return usage;
}

export function createClaudeApiAdapter(opts: ClaudeApiAdapterOptions): LlmAdapter {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    provider: PROVIDER,
    billable: true,
    supportsBatch: true,
    supportsExplicitCache: true,

    async complete(req: AdapterRequest): Promise<AdapterResponse> {
      if (req.batch) {
        throw new AdapterError(
          PROVIDER,
          'unsupported-capability',
          'Message Batches are an asynchronous submit-and-poll flow, not a complete() ' +
            'call. Worth routing to: batch discounts stack with cache reads, so a cached ' +
            'batched read is a small fraction of base input. Use the batch script.',
        );
      }

      const cache = req.cache ?? { mode: 'auto' as const };
      const body: Record<string, unknown> = {
        model: req.model,
        max_tokens: req.maxOutputTokens,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.stopSequences ? { stop_sequences: req.stopSequences } : {}),
      };

      /**
       * Cache breakpoints. `cache_control` marks the END of a cacheable prefix, so it goes
       * on the LAST stable block — everything before it is cached, everything after is not.
       * The system prompt is where the stable content belongs: tool definitions, role,
       * conventions, schemas, few-shot examples. Anything volatile placed before this
       * breakpoint is a full miss on every call, with no error and no signal other than
       * cache_read_input_tokens staying at zero.
       *
       * Extended TTL is opt-in because it costs more to write. Below roughly two reads it
       * loses money; the arithmetic is in references/caching-and-batch.md.
       */
      if (req.system) {
        if (cache.mode === 'off') {
          body.system = req.system;
        } else {
          body.system = [
            {
              type: 'text',
              text: req.system,
              cache_control:
                cache.ttl === '1h'
                  ? { type: 'ephemeral', ttl: '1h' }
                  : { type: 'ephemeral' },
            },
          ];
        }
      } else if (cache.mode === 'explicit') {
        throw new AdapterError(
          PROVIDER,
          'unsupported-capability',
          "cache.mode 'explicit' needs a stable system prefix to place the breakpoint on. " +
            'Move your stable content into `system` and set cache.ttl.',
        );
      }

      // Thinking draws from the same output budget as the answer and bills at the output
      // rate, so the budget must sit below max_tokens. Turning it off for mechanical work
      // is the cheapest dial available on this API.
      if (req.reasoning?.enabled) {
        body.thinking = {
          type: 'enabled',
          budget_tokens: Math.min(
            req.reasoning.budgetTokens ?? 4096,
            Math.max(1024, req.maxOutputTokens - 1),
          ),
        };
      }

      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': API_VERSION,
      };
      if (opts.inferenceGeo === 'us') headers['anthropic-inference-geo'] = 'us';

      const controller = new AbortController();
      const timer = req.timeoutMs
        ? setTimeout(() => controller.abort(), req.timeoutMs)
        : null;
      req.signal?.addEventListener('abort', () => controller.abort(), { once: true });

      let res: Response;
      try {
        res = await doFetch(`${baseUrl}/v1/messages`, {
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

      if (!res.ok) throw await classifyAnthropicError(res);

      const json = (await res.json()) as {
        model?: string;
        stop_reason?: string;
        content?: Array<{ type?: string; text?: string }>;
        usage?: AnthropicUsage;
      };

      const text = (json.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');

      return {
        text,
        requestedModel: req.model,
        // Aliases resolve to dated snapshots. The resolved id is the pricing key.
        servedModel: json.model ?? req.model,
        usage: normalizeAnthropicUsage(json.usage),
        finishReason: json.stop_reason ?? null,
        billable: true,
        notionalCostUsd: null,
        providerMeta: {
          cacheMode: cache.mode,
          cacheTtl: cache.ttl ?? '5m',
          inferenceGeo: opts.inferenceGeo ?? null,
        },
      };
    },
  };
}

async function classifyAnthropicError(res: Response): Promise<AdapterError> {
  const bodyText = await res.text().catch(() => '');
  const retryAfter = Number(res.headers.get('retry-after'));
  const retryAfterMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined;

  if (res.status === 429) {
    const exhausted = /credit balance|billing|spend limit/i.test(bodyText);
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
  if (res.status === 400 && /prompt is too long|max_tokens|context/i.test(bodyText)) {
    return new AdapterError(PROVIDER, 'context-length-exceeded', bodyText.slice(0, 400));
  }
  if (res.status === 529 || res.status === 503) {
    return new AdapterError(PROVIDER, 'overloaded', bodyText.slice(0, 400), {
      retryAfterMs,
    });
  }
  return new AdapterError(
    PROVIDER,
    res.status >= 500 ? 'overloaded' : 'api-error',
    `HTTP ${res.status}: ${bodyText.slice(0, 400)}`,
    { retryAfterMs },
  );
}
