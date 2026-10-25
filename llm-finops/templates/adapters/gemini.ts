/**
 * STATUS: VERIFIED — executed against the live generateContent endpoint on 2026-07-19.
 * Recorded usage payloads are checked in at __fixtures__/gemini.usage.json and are replayed
 * by usage-invariants.test.ts, so a future refactor that breaks the field mapping fails a
 * test rather than quietly producing a wrong costUsd.
 * Verified: 2026-07-19   Last spec review: 2026-07-19
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFAULT PROVIDER, and the one that gets reasoning wrong if you copy another adapter.
 *
 * Gemini bills reasoning ADDITIVELY. `thoughtsTokenCount` is a sibling of
 * `candidatesTokenCount`, not a breakdown of it, and the proof is Google's own definition of
 * `totalTokenCount`: "prompt + thoughts + response candidates". Three addends. If thoughts
 * were inside candidates the definition would double-count.
 *
 *   billable output = candidatesTokenCount + thoughtsTokenCount
 *
 * Every other provider this skill ships nests or folds reasoning into the output count.
 * Gemini is the outlier AND the default, which is precisely the combination that produces a
 * skill that undercounts its own recommended path. Hence `reasoningInOutput: 'additive'` and
 * hence the additive-total assertion below, which fails loudly instead of defaulting.
 *
 * Prices, tiers and thresholds: references/sota-snapshot.md. Nothing here knows about money.
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

const PROVIDER = 'gemini' as const;
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * The context-pricing cliff. Pro-tier Gemini models price input and output at one rate up to
 * this prompt size and a higher rate above it — the surcharge is a step function on
 * `promptTokenCount`, not a gradient. Flash and Flash-Lite tiers are flat, so the tier is
 * reported for every call and the price sheet decides whether it matters for this model.
 *
 * This is why "long context is cheaper on Gemini" inverts above the cliff while Claude
 * 5-era models price 1M context flat. Report the tier; let pricing.ts apply it.
 */
const CONTEXT_CLIFF_TOKENS = 200_000;

export interface GeminiAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  /** Set when talking to the Interactions API instead of classic generateContent. */
  surface?: 'generateContent' | 'interactions';
  fetchImpl?: typeof fetch;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  toolUsePromptTokenCount?: number;
  totalTokenCount?: number;
}

/**
 * Map Gemini's usageMetadata onto NormalizedUsage.
 *
 * Exported so the fixture test can exercise it without a network call. Pure function, no
 * clock, no config — the whole point is that it is checkable.
 *
 * NEVER SUBTRACT TWICE: `promptTokenCount` on Gemini is INCLUSIVE of the cached portion, so
 * uncached input is `promptTokenCount - cachedContentTokenCount`. Anthropic and Bedrock are
 * the opposite — their input count already excludes cache reads — and subtracting there too
 * would understate input by the whole prefix. Getting the direction wrong on either side
 * moves cost by up to 90% of the prefix, in whichever direction is least convenient.
 */
export function normalizeGeminiUsage(
  meta: GeminiUsageMetadata | undefined | null,
): NormalizedUsage | null {
  if (!meta || typeof meta.promptTokenCount !== 'number') return null;

  const promptTotal = num(meta.promptTokenCount);
  const cacheRead = num(meta.cachedContentTokenCount);
  const candidates = num(meta.candidatesTokenCount);

  // thoughtsTokenCount is absent on non-thinking models. Absent means "this model does not
  // think", which is genuinely 0 additional billable output — unlike Bedrock, where absence
  // means "the field does not exist and the value is unknowable", hence null there.
  const thoughts = typeof meta.thoughtsTokenCount === 'number' ? meta.thoughtsTokenCount : 0;

  const usage: NormalizedUsage = {
    inputTokens: Math.max(0, promptTotal - cacheRead),
    outputTokens: candidates,
    cacheReadTokens: cacheRead,
    // Implicit caching carries no write fee and no storage fee on 2.5+ models. Explicit
    // CachedContent DOES carry storage, but it is billed per hour against the cache object
    // out of band, not per request, so it never appears in a per-call usage record. The
    // ledger cannot see it: budget explicit caching separately or it is invisible spend.
    cacheWriteTokens: 0,
    cacheWrite1hTokens: 0,
    reasoningTokens: thoughts,
    reasoningInOutput: 'additive',
    totalTokensReported:
      typeof meta.totalTokenCount === 'number' ? meta.totalTokenCount : null,
    estimated: false,
    raw: {
      promptTokenCount: promptTotal,
      toolUsePromptTokenCount: num(meta.toolUsePromptTokenCount),
      contextTier: promptTotal > CONTEXT_CLIFF_TOKENS ? 'above-cliff' : 'base',
      contextCliffTokens: CONTEXT_CLIFF_TOKENS,
    },
  };

  assertUsageInvariants(PROVIDER, usage, { providerPromptTotal: promptTotal });
  return usage;
}

export function createGeminiAdapter(opts: GeminiAdapterOptions): LlmAdapter {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const surface = opts.surface ?? 'generateContent';
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    provider: PROVIDER,
    billable: true,
    // Gemini has a Batch API at half price on all models. complete() is a synchronous
    // contract, so it cannot serve a batch — submission and polling are a separate flow.
    // Saying so by throwing is deliberate: an adapter that silently ran a "batch" request
    // synchronously would charge double the price the caller believed they had asked for.
    supportsBatch: true,
    supportsExplicitCache: surface === 'generateContent',

    async complete(req: AdapterRequest): Promise<AdapterResponse> {
      if (req.batch) {
        throw new AdapterError(
          PROVIDER,
          'unsupported-capability',
          'Batch is an asynchronous submit-and-poll flow, not a complete() call. Route ' +
            'offline work through the batch script instead of paying synchronous rates.',
        );
      }

      const cache = req.cache ?? { mode: 'auto' as const };
      if (cache.mode === 'explicit') {
        if (surface !== 'generateContent') {
          throw new AdapterError(
            PROVIDER,
            'unsupported-capability',
            'Explicit CachedContent is not supported on the Interactions API. Use ' +
              "mode:'auto' (implicit caching) there, or move this surface to classic " +
              'generateContent. Failing here is intentional — silently ignoring the ' +
              'directive would bill full price while the config claimed a cache.',
          );
        }
        if (!cache.handle) {
          throw new AdapterError(
            PROVIDER,
            'unsupported-capability',
            "cache.mode 'explicit' requires cache.handle — the CachedContent resource name " +
              'from a prior create call. Explicit caching only pays for itself at a high ' +
              'reuse cadence on one prefix; below that, storage exceeds the saving and it ' +
              'loses money. See references/caching-and-batch.md.',
          );
        }
      }

      const body: Record<string, unknown> = {
        contents: req.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          maxOutputTokens: req.maxOutputTokens,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.stopSequences ? { stopSequences: req.stopSequences } : {}),
          ...(req.responseFormat === 'json'
            ? { responseMimeType: 'application/json' }
            : {}),
          // Thinking bills as output at the standard output rate, and on Gemini it bills
          // ON TOP of candidates. A thinkingBudget of 0 is the cheapest dial in the API
          // for mechanical work. Leaving it unset accepts the model's default budget,
          // which can run to tens of thousands of tokens per request.
          ...(req.reasoning
            ? {
                thinkingConfig: {
                  thinkingBudget: req.reasoning.enabled
                    ? (req.reasoning.budgetTokens ?? -1)
                    : 0,
                },
              }
            : {}),
        },
      };

      // Stable prefix first, byte-identical across calls. Implicit caching is opportunistic:
      // it matches on a common leading prefix, so anything volatile placed early (a
      // timestamp, a session id, a reordered JSON key) costs you the whole prefix discount
      // with no error and no signal other than cachedContentTokenCount staying at zero.
      if (req.system) {
        body.systemInstruction = { parts: [{ text: req.system }] };
      }
      if (cache.mode === 'explicit' && cache.handle) {
        body.cachedContent = cache.handle;
      }

      const url = `${baseUrl}/models/${encodeURIComponent(req.model)}:generateContent`;
      const controller = new AbortController();
      const timer = req.timeoutMs
        ? setTimeout(() => controller.abort(), req.timeoutMs)
        : null;
      req.signal?.addEventListener('abort', () => controller.abort(), { once: true });

      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': opts.apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (cause) {
        const aborted = controller.signal.aborted;
        throw new AdapterError(
          PROVIDER,
          aborted ? 'timeout' : 'network-error',
          aborted ? `aborted after ${req.timeoutMs}ms` : String(cause),
          { cause },
        );
      } finally {
        if (timer) clearTimeout(timer);
      }

      if (!res.ok) throw await classifyGeminiError(res);

      const json = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
          finishReason?: string;
        }>;
        usageMetadata?: GeminiUsageMetadata;
        modelVersion?: string;
      };

      const candidate = json.candidates?.[0];
      const text =
        candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

      // A truncated response is wasted spend: you paid for every output token and the
      // answer is unusable. Classify it so the retry table can widen maxOutputTokens
      // rather than re-running the identical call and failing identically.
      if (candidate?.finishReason === 'MAX_TOKENS' && text.length === 0) {
        throw new AdapterError(
          PROVIDER,
          'empty-output',
          'hit maxOutputTokens before emitting any text — thinking budget likely consumed ' +
            'the entire output allowance, which on Gemini bills additively',
        );
      }

      return {
        text,
        requestedModel: req.model,
        // modelVersion is the SERVED model and therefore the pricing key. The free tier has
        // been observed serving a smaller model than requested under load; pricing the
        // request you sent rather than the one that ran gives you a cost model for a system
        // you do not have.
        servedModel: json.modelVersion ?? req.model,
        usage: normalizeGeminiUsage(json.usageMetadata),
        finishReason: candidate?.finishReason ?? null,
        billable: true,
        notionalCostUsd: null,
        providerMeta: { surface, cacheMode: cache.mode },
      };
    },
  };
}

async function classifyGeminiError(res: Response): Promise<AdapterError> {
  const bodyText = await res.text().catch(() => '');
  const retryAfter = Number(res.headers.get('retry-after'));
  const retryAfterMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined;

  // 429 splits into two reasons that want opposite handling: rate-limited is transient and
  // worth a bounded retry, quota-exhausted is not and should change tier immediately plus
  // mark this tier unavailable for a cooldown. Retrying an exhausted quota pays the
  // latency of failure repeatedly and saves nothing.
  if (res.status === 429) {
    const exhausted = /quota|exceeded your current quota|billing/i.test(bodyText);
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
  if (res.status === 400 && /token count|too long|exceeds/i.test(bodyText)) {
    return new AdapterError(
      PROVIDER,
      'context-length-exceeded',
      bodyText.slice(0, 400),
    );
  }
  if (res.status === 503 || res.status === 529) {
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
