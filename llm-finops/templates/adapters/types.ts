/**
 * Adapter interface contract — shared by all six shipped adapters.
 *
 * `templates/metered-llm.ts` re-exports everything in this file, so application code can
 * `import type { LlmAdapter } from './metered-llm.ts'` and never reach into `adapters/`.
 * The definitions live here rather than in metered-llm.ts because adapters must not import
 * the choke point: that would be a cycle, and it would tempt an adapter into doing cost work.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE: adapters are PROTOCOL ONLY. They speak one
 * provider's wire format and hand back provider-reported token counts. They know nothing
 * about prices, budgets, ledgers or tiers. Cost is derived downstream against a dated price
 * sheet, because prices change on a schedule and a cost baked in at call time can never be
 * re-derived. An adapter that computes dollars is a bug even when the dollars are right.
 */

export type ProviderName =
  | 'gemini'
  | 'anthropic'
  | 'claude-code'
  | 'openai'
  | 'azure-openai'
  | 'bedrock';

/**
 * Why a call failed, in the vocabulary the fallback chain routes on. Adapters classify;
 * `fallback.ts` decides. Keeping classification in the adapter is deliberate — only the
 * adapter can tell a 429-for-rate-limit from a 429-for-quota-exhausted, and those two want
 * opposite behaviour (bounded retry vs. immediate tier change plus a cooldown).
 */
export type FallbackReason =
  | 'rate-limited'
  | 'overloaded'
  | 'network-error'
  | 'timeout'
  | 'quota-exhausted'
  | 'not-authenticated'
  | 'spawn-failed'
  | 'context-length-exceeded'
  | 'empty-output'
  | 'malformed-output'
  | 'schema-violation'
  | 'ungrounded'
  | 'content-filtered'
  | 'api-error'
  | 'unsupported-capability';

/**
 * How this provider reports reasoning/thinking tokens relative to its output count.
 * This is the single most dangerous cost-math trap in the whole skill — see
 * `reasoning-semantics.md` for the evidence and the invariants.
 *
 *  - 'additive' — reasoning is a SIBLING of the output count and bills ON TOP of it.
 *                 Billable output = outputTokens + reasoningTokens. Gemini only.
 *  - 'nested'   — reasoning is a SUBSET of the output count, already billed inside it.
 *                 Billable output = outputTokens. Adding reasoning double-counts.
 *  - 'folded'   — reasoning bills inside the output count and the provider exposes no
 *                 field for it at all. Billable output = outputTokens; reasoningTokens
 *                 MUST be null (unknown), never 0 (asserted absent).
 *
 * The design document's older boolean `reasoningInOutput` maps as:
 * additive -> false, nested -> true, folded -> true (degenerate).
 */
export type ReasoningInclusion = 'additive' | 'nested' | 'folded';

/**
 * Provider-reported usage, normalised. Every field here comes off the provider's own usage
 * object. There is deliberately NO code path in this skill that estimates tokens from
 * character counts — the reference project shipped a chars/4 branch and its cost figures
 * silently diverged from the invoice with no error anywhere. When usage is genuinely absent,
 * adapters return `usage: null` and the choke point raises `finops.usage_missing`, which is
 * loud. A wrong number that looks right is worse than a missing number that says so.
 */
export interface NormalizedUsage {
  /**
   * Uncached input tokens ONLY. Providers disagree about whether their prompt total already
   * excludes the cached portion (Anthropic, Bedrock, Claude Code do; Gemini and OpenAI do
   * not). Adapters reconcile that here so downstream code can always charge
   * `inputTokens` at the input rate and `cacheReadTokens` at the cache-read rate without
   * asking who the provider is. See the never-subtract-twice invariant.
   */
  inputTokens: number;

  /** The provider's output/candidates count, VERBATIM. Never re-tokenize response text. */
  outputTokens: number;

  cacheReadTokens: number;
  /** Cache-creation tokens at the default/short TTL. 0 where the provider has no write fee. */
  cacheWriteTokens: number;
  /** Cache-creation tokens at an extended TTL, where the provider prices it separately. */
  cacheWrite1hTokens: number;

  /** null means UNKNOWN, not zero. Only ever 0 when the provider affirmatively reported 0. */
  reasoningTokens: number | null;
  reasoningInOutput: ReasoningInclusion;

  /** The provider's own total, kept for the arithmetic invariants. null if not reported. */
  totalTokensReported: number | null;

  /**
   * Always false in shipped adapters. The field exists so the ledger can carry it and
   * `summarize()` can report `estimatedRate` — a nonzero rate is a defect signal, not a
   * rounding detail.
   */
  estimated: false;

  /** Provider-specific extras a cost model may need later (modality splits, tool tokens). */
  raw?: Record<string, unknown>;
}

/**
 * One neutral directive across six providers whose caching mechanisms genuinely differ.
 * `'auto'` is honestly neutral. `'explicit'` is NOT — it throws on four of six adapters.
 * The skill says so rather than promising a frictionless swap.
 */
export interface CacheDirective {
  mode: 'off' | 'auto' | 'explicit';
  /** Anthropic/Bedrock TTL selection. Ignored where the provider has one TTL. */
  ttl?: '5m' | '1h';
  /** Explicit-cache handle (Gemini CachedContent name). Created out of band, reused here. */
  handle?: string;
  /**
   * Below a model's minimum cacheable prefix, caching silently no-ops — no error, full
   * price. Floors run 512-4096 tokens depending on model, and Bedrock's Anthropic floor is
   * higher than the direct API's. Adapters surface the floor; the choke point warns.
   */
  minPrefixTokens?: number;
}

export interface AdapterMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AdapterRequest {
  /** What the caller asked for. On Azure this is a DEPLOYMENT name, not a model id. */
  model: string;
  /**
   * Stable prefix content. Order everything long-lived here: tools, role, conventions,
   * schemas, few-shot examples. Nothing volatile — a `new Date()` or a session id before
   * the cache breakpoint is a full cache miss on every provider.
   */
  system?: string;
  messages: AdapterMessage[];
  maxOutputTokens: number;
  temperature?: number;
  stopSequences?: string[];
  /**
   * Reasoning/thinking control. Thinking bills as output on every provider, and default
   * budgets run to tens of thousands of tokens, so leaving this off for mechanical work is
   * free money. Some frontier tiers cannot disable it at all — adapters say so.
   */
  reasoning?: { enabled: boolean; budgetTokens?: number };
  cache?: CacheDirective;
  /** Asynchronous batch submission. Adapters without batch support THROW rather than
   *  silently running synchronously at full price. */
  batch?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  responseFormat?: 'text' | 'json';
}

export interface AdapterResponse {
  text: string;
  /** What the caller asked for, echoed back unchanged. */
  requestedModel: string;
  /**
   * What actually ran, and therefore THE PRICING KEY. These diverge more often than teams
   * expect: Azure resolves a deployment name to a model, Bedrock ids carry region and
   * inference-profile prefixes, aliases resolve to dated snapshots, and Gemini's free tier
   * has been observed downgrading Pro to Flash under load. A cost model keyed on the
   * requested model describes a system you do not have.
   */
  servedModel: string;
  /** null means "I cannot report usage" — said loudly, never papered over with an estimate. */
  usage: NormalizedUsage | null;
  finishReason: string | null;
  /**
   * false for subscription-authenticated transports (the Claude Code CLI). NOT the same as
   * costUsd === 0: the call has ~zero marginal cost but consumes a rate-limited quota, so
   * the ledger records costUsd 0 alongside a notionalCostUsd. Hiding the notional figure is
   * how teams discover their subscription ceiling in production.
   */
  billable: boolean;
  /** Provider-reported notional cost for non-billable transports. null elsewhere. */
  notionalCostUsd: number | null;
  providerMeta?: Record<string, unknown>;
}

export interface LlmAdapter {
  readonly provider: ProviderName;
  readonly billable: boolean;
  readonly supportsBatch: boolean;
  readonly supportsExplicitCache: boolean;
  complete(req: AdapterRequest): Promise<AdapterResponse>;
  /** Liveness probe. Cheap, no model call where possible. Used by the failsafe tier. */
  probe?(): Promise<{ ok: boolean; detail: string }>;
}

export class AdapterError extends Error {
  readonly reason: FallbackReason;
  readonly provider: ProviderName;
  readonly retryAfterMs?: number;
  readonly cause?: unknown;

  constructor(
    provider: ProviderName,
    reason: FallbackReason,
    message: string,
    opts: { retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(`[${provider}] ${reason}: ${message}`);
    this.name = 'AdapterError';
    this.provider = provider;
    this.reason = reason;
    this.retryAfterMs = opts.retryAfterMs;
    this.cause = opts.cause;
  }
}

// ---------------------------------------------------------------------------
// Cost-relevant helpers. These do arithmetic on TOKENS, never on money.
// ---------------------------------------------------------------------------

/**
 * The number of output tokens you must charge at the output rate.
 *
 * This one function is where GAP-1 lands. Gemini reports thoughts as a sibling addend, so
 * charging only `outputTokens` undercounts by the entire thinking budget — on the skill's
 * own shipped default provider, in a skill whose thesis is honest measurement. Everyone
 * else nests reasoning inside the output count, so adding it double-charges.
 */
export function billableOutputTokens(usage: NormalizedUsage): number {
  if (usage.reasoningInOutput === 'additive') {
    return usage.outputTokens + (usage.reasoningTokens ?? 0);
  }
  return usage.outputTokens;
}

/** Total tokens the provider says it processed, derived from the normalised record. */
export function derivedTotalTokens(usage: NormalizedUsage): number {
  return (
    usage.inputTokens +
    usage.cacheReadTokens +
    usage.cacheWriteTokens +
    usage.cacheWrite1hTokens +
    billableOutputTokens(usage)
  );
}

export interface UsageInvariantViolation {
  code:
    | 'reasoning-exceeds-output'
    | 'additive-total-mismatch'
    | 'negative-token-count'
    | 'folded-reasoning-not-null';
  detail: string;
}

/**
 * The mirror-image invariants, run by every adapter before it returns.
 *
 * Input side (never subtract twice): checked per adapter at construction of the usage
 * record, because only the adapter knows whether its provider's prompt total was inclusive
 * or exclusive of cache reads. What survives to here is the arithmetic that is checkable
 * without provider knowledge — plus the totals cross-check when the provider gave us one.
 *
 * Output side (never add twice): 'nested' and 'folded' providers must satisfy
 * reasoning <= output, because reasoning is inside output. 'additive' providers must
 * satisfy prompt + reasoning + output === providerTotal, because reasoning is beside it.
 *
 * Violations FAIL LOUDLY rather than defaulting. A silently defaulted invariant is exactly
 * the failure mode this skill exists to prevent: the number still looks like a number.
 */
export function checkUsageInvariants(
  usage: NormalizedUsage,
  opts: { providerPromptTotal?: number } = {},
): UsageInvariantViolation[] {
  const v: UsageInvariantViolation[] = [];

  const counts: Array<[string, number]> = [
    ['inputTokens', usage.inputTokens],
    ['outputTokens', usage.outputTokens],
    ['cacheReadTokens', usage.cacheReadTokens],
    ['cacheWriteTokens', usage.cacheWriteTokens],
    ['cacheWrite1hTokens', usage.cacheWrite1hTokens],
  ];
  for (const [name, n] of counts) {
    if (!Number.isFinite(n) || n < 0) {
      v.push({ code: 'negative-token-count', detail: `${name} = ${n}` });
    }
  }

  if (usage.reasoningInOutput === 'folded' && usage.reasoningTokens !== null) {
    v.push({
      code: 'folded-reasoning-not-null',
      detail:
        'A folded-reasoning provider exposes no reasoning field, so reasoningTokens must be ' +
        'null (unknown). Reporting 0 asserts "there were none", which makes a reasoning-share ' +
        'metric read 0% on a reasoning-heavy workload.',
    });
  }

  if (usage.reasoningInOutput === 'nested' && usage.reasoningTokens !== null) {
    if (usage.reasoningTokens > usage.outputTokens) {
      v.push({
        code: 'reasoning-exceeds-output',
        detail:
          `reasoningTokens ${usage.reasoningTokens} > outputTokens ${usage.outputTokens}. ` +
          'For a nested provider reasoning is a subset of output; this means either the ' +
          'inclusion semantics changed or the wrong field was mapped.',
      });
    }
  }

  if (usage.reasoningInOutput === 'additive' && usage.totalTokensReported !== null) {
    const prompt =
      opts.providerPromptTotal ?? usage.inputTokens + usage.cacheReadTokens;
    const sum = prompt + (usage.reasoningTokens ?? 0) + usage.outputTokens;
    if (sum !== usage.totalTokensReported) {
      v.push({
        code: 'additive-total-mismatch',
        detail:
          `prompt(${prompt}) + reasoning(${usage.reasoningTokens ?? 0}) + ` +
          `output(${usage.outputTokens}) = ${sum}, but the provider reported ` +
          `${usage.totalTokensReported}. The additive identity is the load-bearing proof ` +
          'that thoughts bill on top of candidates; if it stops holding, stop trusting the ' +
          'output cost until you have re-read the provider reference.',
      });
    }
  }

  return v;
}

/** Throwing wrapper. Adapters call this; the choke point catches AdapterError. */
export function assertUsageInvariants(
  provider: ProviderName,
  usage: NormalizedUsage,
  opts: { providerPromptTotal?: number } = {},
): void {
  const violations = checkUsageInvariants(usage, opts);
  if (violations.length > 0) {
    throw new AdapterError(
      provider,
      'malformed-output',
      'usage invariant violated: ' +
        violations.map((x) => `${x.code} (${x.detail})`).join(' | '),
    );
  }
}

/** Small helper: providers return usage fields inconsistently, and missing !== zero. */
export function num(x: unknown, fallback = 0): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback;
}
