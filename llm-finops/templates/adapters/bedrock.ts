/**
 * STATUS: UNVERIFIED — written from provider spec, never executed against the live API.
 * Cost math here has NOT been validated against real usage payloads. Wrong costs fail
 * SILENTLY (bad costUsd, not a crash). Run templates/VERIFY.md smoke tests before
 * trusting any number this adapter produces in a client-facing context.
 * Verified: <none>   Last spec review: 2026-07-19
 */

/**
 * AWS Bedrock — Converse API.
 *
 * THE ONE THING THAT MAKES THIS ADAPTER DIFFERENT: Bedrock FOLDS reasoning into the output
 * count and exposes NO field for it. `TokenUsage` is exactly inputTokens, outputTokens,
 * totalTokens plus cache fields, and `totalTokens` is documented as a two-term identity:
 * input plus tokens generated. Extended thinking is billed as output and is captured inside
 * `outputTokens` along with the answer.
 *
 *   => billable output = outputTokens. Correct, and easy.
 *   => reasoningTokens = null. NOT 0. This is the part people get wrong.
 *
 * WHY null RATHER THAN 0, spelled out because it is one line of code and it decides whether
 * a whole class of cost analysis is trustworthy:
 *
 *   0    asserts "this call performed no reasoning."
 *   null asserts "this provider cannot tell me, so I do not know."
 *
 * Those are different claims and only one of them is true here. Write 0 and every derived
 * metric inherits a false statement: a "reasoning share of output" dashboard reads a
 * confident 0% on a reasoning-heavy Bedrock workload, and someone concludes that turning
 * thinking off would save nothing — on the exact workload where it would save the most.
 * The failure is silent, plausible and self-reinforcing. `null` propagates as "unknown",
 * which forces the honest answer: to measure reasoning share, use a provider that reports
 * it, or measure it out of band. The invariant checker enforces this — a 'folded' provider
 * reporting a non-null reasoning count fails loudly.
 *
 * NEVER SUBTRACT TWICE: `inputTokens` on Bedrock ALREADY EXCLUDES cache reads and writes,
 * like Anthropic and unlike Gemini and OpenAI. Do not subtract `cacheReadInputTokens`.
 *
 * PRICING NOTES the adapter must report but must not act on (rates: sota-snapshot.md):
 *   - Bedrock prices off the first-party list rate with a routing-tier multiplier. A global
 *     inference profile is at parity with the first-party list; a regional or geo profile
 *     carries a multiplier. The tier is encoded in the model id's prefix, so it is
 *     extracted here and passed along.
 *   - That tiering applies only from a certain model generation forward. Earlier models are
 *     flat and must NOT receive the multiplier — the price sheet gates it, not this file.
 *   - GovCloud multipliers are deliberately not modelled anywhere in this skill; the number
 *     could not be confirmed. Do not invent one.
 *   - Bedrock's minimum cacheable prefix for Anthropic models is higher than the direct
 *     API's. Below the floor, cachePoint blocks silently no-op at full price.
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

const PROVIDER = 'bedrock' as const;

/** Minimal shape of the AWS SDK Converse client, so this file has no hard SDK dependency. */
export interface BedrockConverseClientLike {
  send(command: unknown): Promise<BedrockConverseOutput>;
}

export interface BedrockTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
}

export interface BedrockConverseOutput {
  output?: { message?: { content?: Array<{ text?: string }> } };
  stopReason?: string;
  usage?: BedrockTokenUsage;
  $metadata?: { httpStatusCode?: number };
  trace?: unknown;
}

/**
 * Pure mapping function. Exported so VERIFY.md's smoke test can assert on it without an
 * AWS credential chain.
 */
export function normalizeBedrockUsage(
  u: BedrockTokenUsage | undefined | null,
): NormalizedUsage | null {
  if (!u || typeof u.inputTokens !== 'number') return null;

  const usage: NormalizedUsage = {
    // Already exclusive of cache. Do NOT subtract cacheReadInputTokens.
    inputTokens: num(u.inputTokens),
    // Contains reasoning tokens, invisibly and unavoidably.
    outputTokens: num(u.outputTokens),
    cacheReadTokens: num(u.cacheReadInputTokens),
    cacheWriteTokens: num(u.cacheWriteInputTokens),
    cacheWrite1hTokens: 0,
    // UNKNOWN, not zero. See the file header. This single line is the difference between a
    // reasoning-share metric that abstains and one that lies.
    reasoningTokens: null,
    reasoningInOutput: 'folded',
    totalTokensReported: typeof u.totalTokens === 'number' ? u.totalTokens : null,
    estimated: false,
  };
  assertUsageInvariants(PROVIDER, usage);
  return usage;
}

/** The routing tier is encoded in the model id prefix; the price sheet maps tier to rate. */
export function parseBedrockModelId(modelId: string): {
  routingTier: 'global' | 'regional' | 'direct';
  baseModelId: string;
} {
  if (modelId.startsWith('global.')) {
    return { routingTier: 'global', baseModelId: modelId.slice('global.'.length) };
  }
  // Geo/regional inference profiles carry a two-or-three letter region prefix.
  const m = /^([a-z]{2,3})\.(.+)$/.exec(modelId);
  if (m && m[1] !== 'global') {
    return { routingTier: 'regional', baseModelId: m[2]! };
  }
  return { routingTier: 'direct', baseModelId: modelId };
}

export interface BedrockAdapterOptions {
  client: BedrockConverseClientLike;
  /** Constructor for the SDK's ConverseCommand, injected to keep this file SDK-agnostic. */
  converseCommand: new (input: Record<string, unknown>) => unknown;
  region: string;
  /** Bedrock's minimum cacheable prefix is model-dependent and higher than the direct
   *  Anthropic API's. Below it, cachePoint silently no-ops at full price. */
  minCachePrefixTokens?: number;
}

export function createBedrockAdapter(opts: BedrockAdapterOptions): LlmAdapter {
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
          'Bedrock batch inference is a separate job API reading from and writing to S3, ' +
            'not a complete() call. Throwing rather than silently running synchronously ' +
            'is deliberate: a silent synchronous fallback bills double what the caller ' +
            'believed they had asked for.',
        );
      }

      const cache = req.cache ?? { mode: 'auto' as const };
      const { routingTier, baseModelId } = parseBedrockModelId(req.model);

      /**
       * Caching on Converse is positional: a `cachePoint` block marks the end of a cacheable
       * span in the content array. Everything before it is cached, everything after is not.
       * Same discipline as everywhere else — stable content first, byte-identical, nothing
       * volatile ahead of the point.
       */
      const system: Array<Record<string, unknown>> = [];
      if (req.system) {
        system.push({ text: req.system });
        if (cache.mode !== 'off') system.push({ cachePoint: { type: 'default' } });
      } else if (cache.mode === 'explicit') {
        throw new AdapterError(
          PROVIDER,
          'unsupported-capability',
          'A cachePoint needs stable content to sit behind. Move your stable prefix into ' +
            '`system`.',
        );
      }

      const input: Record<string, unknown> = {
        modelId: req.model,
        messages: req.messages.map((m) => ({
          role: m.role,
          content: [{ text: m.content }],
        })),
        ...(system.length > 0 ? { system } : {}),
        inferenceConfig: {
          maxTokens: req.maxOutputTokens,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.stopSequences ? { stopSequences: req.stopSequences } : {}),
        },
        // Thinking bills inside outputTokens and you will never see how much. On mechanical
        // work, leaving it enabled is spend with no observable trace — which, on this
        // provider specifically, you cannot audit after the fact.
        ...(req.reasoning?.enabled
          ? {
              additionalModelRequestFields: {
                reasoning_config: {
                  type: 'enabled',
                  budget_tokens: req.reasoning.budgetTokens ?? 4096,
                },
              },
            }
          : {}),
      };

      let out: BedrockConverseOutput;
      try {
        out = await opts.client.send(new opts.converseCommand(input));
      } catch (cause) {
        throw classifyBedrockError(cause);
      }

      const text = (out.output?.message?.content ?? [])
        .map((b) => b.text ?? '')
        .join('');

      if (out.stopReason === 'guardrail_intervened') {
        throw new AdapterError(
          PROVIDER,
          'content-filtered',
          'guardrail intervened; no retry and no escalation — paying a stronger model to ' +
            'trip the same guardrail buys nothing',
        );
      }

      return {
        text,
        requestedModel: req.model,
        /**
         * Converse does not echo a resolved model id, so the served model is the id we sent.
         * Keep the full prefixed id: the routing prefix is part of the pricing key, because
         * the same underlying model prices differently by inference profile.
         */
        servedModel: req.model,
        usage: normalizeBedrockUsage(out.usage),
        finishReason: out.stopReason ?? null,
        billable: true,
        notionalCostUsd: null,
        providerMeta: {
          region: opts.region,
          routingTier,
          baseModelId,
          cacheMode: cache.mode,
          minCachePrefixTokens: opts.minCachePrefixTokens ?? null,
          // Stated explicitly in the ledger so nobody later reads a null reasoning count as
          // a data-collection bug and "fixes" it to zero.
          reasoningReportedByProvider: false,
        },
      };
    },
  };
}

function classifyBedrockError(cause: unknown): AdapterError {
  const e = cause as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const name = e?.name ?? '';
  const status = e?.$metadata?.httpStatusCode;
  const msg = (e?.message ?? String(cause)).slice(0, 400);

  if (name === 'ThrottlingException' || status === 429) {
    return new AdapterError(PROVIDER, 'rate-limited', msg);
  }
  if (name === 'ServiceQuotaExceededException') {
    return new AdapterError(PROVIDER, 'quota-exhausted', msg);
  }
  if (
    name === 'AccessDeniedException' ||
    name === 'UnrecognizedClientException' ||
    status === 403
  ) {
    // On Bedrock this is very often "model access not requested in this region" rather than
    // bad credentials. Both mean the same thing to the fallback chain — do not retry, change
    // tier — but the message matters to whoever reads the log.
    return new AdapterError(
      PROVIDER,
      'not-authenticated',
      `${msg} (check model access is enabled for this model in this region)`,
    );
  }
  if (name === 'ValidationException' && /too long|context|input length/i.test(msg)) {
    return new AdapterError(PROVIDER, 'context-length-exceeded', msg);
  }
  if (name === 'ModelTimeoutException') {
    return new AdapterError(PROVIDER, 'timeout', msg);
  }
  if (name === 'ModelNotReadyException' || (status !== undefined && status >= 500)) {
    return new AdapterError(PROVIDER, 'overloaded', msg);
  }
  return new AdapterError(PROVIDER, 'api-error', `${name}: ${msg}`, { cause });
}
