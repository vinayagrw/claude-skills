/**
 * metered-llm.ts — THE CHOKE POINT.
 *
 * WHAT
 *   One function, `complete()`, that every LLM call in the application goes
 *   through. It resolves a surface policy, asks the budget for permission, walks
 *   the provider chain, normalizes provider-reported usage, prices it, writes a
 *   ledger entry, and returns the answer.
 *
 * WHY THIS FILE IS THE WHOLE DESIGN
 *   A meter with a bypass is not a meter. The failure this template exists to
 *   prevent is mundane and near-universal: one call site — usually a later
 *   feature, added under time pressure, often by someone who did not build the
 *   metering — calls the provider SDK directly. It works. It is never in any
 *   report. Your cost model is now wrong by an amount you cannot measure, and the
 *   discrepancy surfaces as a gap between your dashboard and the invoice that
 *   nobody can account for.
 *
 *   So the rule the skill teaches is: raw provider SDK calls are FORBIDDEN outside
 *   `adapters/`. Enforce it, do not merely intend it —
 *     rg -n "new Anthropic\(|new OpenAI\(|GoogleGenAI\(|BedrockRuntimeClient\(" src --glob "!src/adapters/"
 *   in CI, failing the build on a hit. A convention decays; a failing check does not.
 *
 * THE DEFAULT CHAIN (all of it configurable, none of it hardcoded here)
 *   1. primary      — cheapest generally-available small-model tier
 *   2. escalation[] — an ORDERED ladder of stronger metered rungs, cheapest first.
 *                     Each rung declares its `trigger`: 'quality-sensitive' (the
 *                     surface is tagged) or 'hard-call' (call-site `tier:
 *                     'escalation'`, or a deterministic quality gate rejected the
 *                     rung below). Never a router's guess at "complexity".
 *   3. failsafe     — a subscription-auth transport with ~zero marginal cost,
 *                     reached only on a FallbackReason, never on quality grounds
 *   4. deterministic— templated/cached output, always zero, always present
 *
 *   Model ids appear in NO template file, including this one. They live in exactly
 *   one place, `config/llm.ts`, and are handed in through `MeteredLlmOptions`.
 *   One place means one thing to change when a model is deprecated — and it means
 *   `rg` for a model id has one answer instead of six half-stale ones.
 *
 * ESCALATION IS EVIDENCE-BASED, NEVER A GUESS
 *   Two triggers, both explicit. A call-site declaration (`tier: 'escalation'`, for
 *   requests the developer knows are hard), and a QUALITY GATE: a deterministic,
 *   ZERO-TOKEN validator — schema check, citation allow-list check, numeric-range
 *   check — rejects the cheap model's output and buys one retry at the stronger
 *   tier. It costs nothing to evaluate and escalates on evidence rather than on a
 *   guess about "complexity". Blind auto-routers are rejected: cache economics
 *   dominate routing economics, and a router that switches provider mid-session to
 *   save a slice of sticker price destroys a prompt prefix worth far more.
 *
 * HOW TO WIRE IT IN
 *   const llm = createMeteredLlm({
 *     config: llmConfig,                    // from config/llm.ts — the only model ids
 *     adapters: { gemini, anthropic, claudeCode },
 *     ledger, budget, chain,
 *   });
 *   llm.registerSurface({
 *     name: 'chat',
 *     qualitySensitive: true,               // auto-escalates to the stronger tier
 *     maxOutputTokens: 800,
 *     timeoutMs: 20_000,
 *     fallback: (req) => cannedAnswerFor(req),   // REQUIRED — see below
 *   });
 *   const res = await llm.complete({ surface: 'chat', messages, tags });
 *
 * `registerSurface()` REJECTS a surface with no deterministic fallback. That looks
 * officious until the first provider outage, when every surface that has one
 * degrades and every surface that does not goes down. It is also what makes a
 * hard-stop budget survivable rather than an outage with extra steps.
 *
 * Dependencies: `./pricing.js`, `./ledger.js`, `./budget.js`,
 * `./fallback.js`, `./cost-warning.js`. No framework, no provider SDK, no HTTP
 * client. Provider SDKs are loaded lazily inside their own adapter, so a
 * single-provider app does not install five vendors' clients.
 */

import { computeCost, priceFor, PRICE_SHEET_REV, type UsageLike } from './pricing.ts';
import type { AttributionTags, Ledger, LedgerTier } from './ledger.ts';
import type { Budget, BudgetDecision } from './budget.ts';
import {
  backoffMs,
  classifyError,
  createFallbackChain,
  sleep,
  type FallbackChain,
  type FallbackReason,
  type Tier,
} from './fallback.ts';
import { emitCostNotice, type CostNoticeConfig } from './cost-warning.ts';

/* ------------------------------------------------------------------------- */
/* Adapter interface                                                          */
/* ------------------------------------------------------------------------- */

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

/**
 * One neutral caching directive across providers. `'auto'` is genuinely portable;
 * `'explicit'` is NOT — several providers have no equivalent and their adapters
 * throw rather than silently doing nothing at full price. A silent expensive
 * no-op is the worst outcome available here, so the adapters refuse it loudly.
 */
export interface CacheDirective {
  mode: 'off' | 'auto' | 'explicit';
  ttl?: '5m' | '1h';
  /** Handle for provider-managed explicit caches. */
  handle?: string;
}

export interface AdapterRequest {
  model: string;
  messages: LlmMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  cache?: CacheDirective;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Ask the provider for extended reasoning where it supports it. */
  reasoning?: boolean;
  batch?: boolean;
}

/**
 * Adapter output. Note `usage` is `NormalizedUsage`, produced from the provider's
 * own usage object and NEVER from a character-count heuristic. Estimating tokens
 * as characters-over-four is the fastest way to a cost model that drifts a
 * double-digit percentage from the invoice, and the error compounds silently
 * because nothing about it looks wrong.
 */
export interface AdapterResponse {
  text: string;
  usage: NormalizedUsage;
  /**
   * What actually ran. Report it separately from the request — this is the
   * pricing key, and it differs from the request more often than teams expect.
   */
  servedModel: string;
  /** For subscription transports: real quota consumed, no invoice line. */
  billable?: boolean;
  notionalCostUsd?: number;
  raw?: unknown;
}

export interface NormalizedUsage extends UsageLike {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Set true ONLY when the provider returned no usage object at all. */
  missing?: boolean;
}

export interface LlmAdapter {
  /** Stable id used on the ledger and in the price sheet lookup. */
  readonly provider: string;
  complete(req: AdapterRequest): Promise<AdapterResponse>;
  /**
   * Cheap liveness/capability check. Used to gate a tier before it is on the hot
   * path, so a missing binary or absent credential is a startup fact rather than
   * a per-request failure every user pays the latency for.
   */
  probe?(): Promise<{ ok: boolean; detail?: string }>;
  supportsBatch?: boolean;
}

/* ------------------------------------------------------------------------- */
/* Configuration                                                              */
/* ------------------------------------------------------------------------- */

/**
 * The shape `config/llm.ts` must export. Declared here so this file has no import
 * dependency on the config, which keeps the core testable with a literal object
 * and keeps model ids out of every file but one.
 */
export interface FinopsLlmConfig {
  primary: TierConfig;
  /**
   * ORDERED escalation ladder, cheapest rung first. Optional — omit (or pass an
   * empty array) and quality-sensitive calls simply stay on the primary.
   *
   * This is an array rather than a single slot because the documented default chain
   * has two genuinely different escalation reasons, and collapsing them forces a
   * choice nobody should have to make: an intra-vendor rung for prose quality (keeps
   * the cached prefix) and a cross-vendor rung for hard calls (pays a fresh prefix,
   * and is worth it precisely when being wrong is expensive). A single slot made one
   * of the two unreachable, so the shipped chain was not expressible in the shipped
   * interface — the configured-but-unwired shape this skill teaches against (AP-08).
   */
  escalation?: EscalationRung[];
  /** Optional. Omit and the chain goes primary -> deterministic. */
  failsafe?: TierConfig;
  defaults?: {
    maxOutputTokens?: number;
    timeoutMs?: number;
    temperature?: number;
    cache?: CacheDirective;
  };
  /** Emit the startup cost notice. Default true. See cost-warning.ts. */
  costNotice?: boolean;
}

/**
 * What promotes a call to a given escalation rung. Both triggers are EXPLICIT and
 * evidence-based — neither is a router guessing at "complexity".
 *
 *   'quality-sensitive'  the surface is tagged qualitySensitive (chat, user-facing
 *                        prose, anything a customer reads)
 *   'hard-call'          the call site declared `tier: 'escalation'`, or a
 *                        deterministic zero-token quality gate rejected the rung below
 */
export type EscalationTrigger = 'quality-sensitive' | 'hard-call';

/** One rung of the escalation ladder: a tier plus the condition that reaches it. */
export interface EscalationRung extends TierConfig {
  trigger: EscalationTrigger;
}

export interface TierConfig {
  /** Key into the adapters map. */
  adapter: string;
  model: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  cache?: CacheDirective;
  /** Subscription transports: zero marginal cost, real quota. */
  billable?: boolean;
  routing?: { platform: string; routingTier: string };
}

export interface SurfacePolicy<TReq = CompleteRequest, TRes = string> {
  name: string;
  /**
   * Escalate automatically to the stronger tier. Set for user-facing prose —
   * chat, summaries, anything a customer reads. Leave false for extraction,
   * classification and routing, where the cheap tier is genuinely sufficient and
   * escalating is spending more for output nobody reads.
   */
  qualitySensitive?: boolean;
  maxOutputTokens?: number;
  timeoutMs?: number;
  temperature?: number;
  cache?: CacheDirective;
  batch?: boolean;
  /**
   * REQUIRED. Zero-cost deterministic answer for this surface. See the note in
   * the file header for why registration fails without it.
   */
  fallback: (req: TReq, ctx: { reason: FallbackReason; surface: string; stage?: string }) => TRes | Promise<TRes>;
  /**
   * Deterministic, zero-token output validator. Returning a reason escalates once
   * to the stronger tier. This is how escalation stays evidence-based: schema
   * checks, citation allow-lists and range checks cost nothing to run.
   */
  qualityGate?: (text: string) => FallbackReason | null;
}

/* ------------------------------------------------------------------------- */
/* Request / result                                                           */
/* ------------------------------------------------------------------------- */

export interface CompleteRequest {
  surface: string;
  /** Stage within a multi-call pipeline: 'plan', 'worker', 'reflexion'. */
  stage?: string;
  messages: LlmMessage[];
  /** Force a tier. `'escalation'` is the call-site "I know this one is hard". */
  tier?: Exclude<Tier, 'deterministic'>;
  maxOutputTokens?: number;
  temperature?: number;
  cache?: CacheDirective;
  batch?: boolean;
  reasoning?: boolean;
  tags?: AttributionTags;
  requestId?: string;
  signal?: AbortSignal;
}

export interface MeteredResult {
  text: string;
  tier: LedgerTier;
  provider: string;
  requestedModel: string;
  servedModel: string;
  usage: NormalizedUsage | null;
  costUsd: number;
  notionalCostUsd: number;
  billable: boolean;
  estimated: boolean;
  degraded: boolean;
  budgetExceeded: boolean;
  fallbackReason?: FallbackReason;
  latencyMs: number;
  requestId: string;
  attempts: number;
}

/* ------------------------------------------------------------------------- */
/* The wrapper                                                                */
/* ------------------------------------------------------------------------- */

export interface MeteredLlmOptions {
  config: FinopsLlmConfig;
  adapters: Record<string, LlmAdapter>;
  ledger: Ledger;
  budget?: Budget;
  chain?: FallbackChain;
  now?: () => number;
  idFactory?: () => string;
  /** Emitter for the startup cost notice. Defaults to console.warn. */
  log?: (msg: string) => void;
}

export interface MeteredLlm {
  registerSurface(policy: SurfacePolicy<any, any>): void;
  complete(req: CompleteRequest): Promise<MeteredResult>;
  health(): Record<string, unknown>;
}

export function createMeteredLlm(options: MeteredLlmOptions): MeteredLlm {
  const { config, adapters, ledger } = options;
  const budget = options.budget;
  const chain = options.chain ?? createFallbackChain();
  const now = options.now ?? (() => Date.now());
  const log = options.log ?? ((m: string) => console.warn(m));
  const surfaces = new Map<string, SurfacePolicy<any, any>>();
  let noticeEmitted = false;

  /** The ladder, cheapest first. Empty is legal: escalation is then a no-op. */
  const rungs: EscalationRung[] = config.escalation ?? [];

  /**
   * `Tier` stays a four-value union — the ledger, the cooldown chain and every
   * dashboard slice by it, and splitting it per rung would fragment those. Which
   * rung is live is carried alongside as an index into `rungs`.
   */
  function tierConfig(t: Tier, rungIndex: number): TierConfig | null {
    if (t === 'primary') return config.primary;
    if (t === 'escalation') return rungs[rungIndex] ?? null;
    if (t === 'failsafe') return config.failsafe ?? null;
    return null;
  }

  /** First rung matching a trigger, or null. */
  function rungFor(trigger: EscalationTrigger): number | null {
    const i = rungs.findIndex((r) => r.trigger === trigger);
    return i >= 0 ? i : null;
  }

  /**
   * The next rung up from where we are. Deliberately CHEAPEST-FIRST rather than
   * jumping to the most capable rung: a quality-gate rejection is evidence the rung
   * below was insufficient, not evidence that the top of the ladder is required, and
   * skipping a rung pays the cross-vendor price for a call the workhorse may handle.
   */
  function nextRung(from: Tier, rungIndex: number): number | null {
    const next = from === 'escalation' ? rungIndex + 1 : 0;
    return next < rungs.length ? next : null;
  }

  function registerSurface(policy: SurfacePolicy<any, any>) {
    // The refusal that makes every downstream guarantee real. Without a
    // deterministic fallback, "soft-degrade" has nowhere to degrade to,
    // "hard-stop" is an outage, and a provider incident is your incident.
    if (typeof policy.fallback !== 'function') {
      throw new Error(
        `Surface "${policy.name}" was registered without a deterministic fallback. ` +
          'Every metered surface must have a zero-cost answer it can serve when the ' +
          'provider fails or the budget is spent — otherwise degradation is an outage. ' +
          'Supply `fallback(req, ctx)` returning cached, templated or computed output.',
      );
    }
    surfaces.set(policy.name, policy);
  }

  async function complete(req: CompleteRequest): Promise<MeteredResult> {
    const startedAt = now();
    const requestId = req.requestId ?? `req_${startedAt.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const policy = surfaces.get(req.surface);
    if (!policy) {
      throw new Error(
        `Unknown surface "${req.surface}". Register it with registerSurface() first. ` +
          'Surfaces are not optional bookkeeping: they carry the output bound, the timeout, ' +
          'the deterministic fallback and the label every cost report slices by.',
      );
    }

    // Fire the ADDENDUM-E startup notice exactly once, on the first real call
    // rather than at import, so it appears in application logs where someone will
    // see it and cannot fail a module load.
    if (!noticeEmitted && config.costNotice !== false) {
      noticeEmitted = true;
      emitCostNotice(
        { primary: { provider: adapterFor(config.primary)?.provider ?? config.primary.adapter, model: config.primary.model } } as CostNoticeConfig,
        { log },
      );
    }

    /* ---- budget preflight ------------------------------------------------ */
    let decision: BudgetDecision = { allow: true, utilization: 0, crossed: null, overBudget: false };
    if (budget) {
      try {
        decision = await budget.preflight({ surface: req.surface, tags: req.tags });
      } catch {
        // A failing budget store must not fail the request. Fail OPEN and let the
        // ledger record what happened: a budget outage that becomes an app outage
        // gets the budget deleted, and then you have neither.
        decision = { allow: true, utilization: 0, crossed: null, overBudget: false };
      }
    }

    if (!decision.allow) {
      const reason: FallbackReason = decision.reason === 'envelope-exceeded' ? 'envelope-exceeded' : 'over-budget';
      return await serveDeterministic(policy, req, reason, requestId, startedAt, {
        budgetExceeded: true,
      });
    }

    /* ---- tier selection -------------------------------------------------- */
    // Session stickiness: once a session has resolved to a route, stay on it.
    // Switching mid-session throws away a cached prefix worth far more than any
    // per-token difference, and changes behaviour the user reads as a bug.
    const sessionId = req.tags?.sessionId;
    const pin = sessionId ? chain.pinned(sessionId) : null;

    let tier: Tier = req.tier ?? 'primary';
    // Which rung of the ladder is live. Set by whichever trigger promoted the call.
    let rungIndex = 0;

    if (tier === 'escalation') {
      // Call-site declaration: "I know this one is hard." Go to the hard-call rung,
      // not merely the first rung — the developer already told us which reason applies.
      rungIndex = rungFor('hard-call') ?? 0;
    } else if (tier === 'primary' && policy.qualitySensitive && !decision.disableEscalation) {
      const i = rungFor('quality-sensitive');
      if (i !== null) {
        tier = 'escalation';
        rungIndex = i;
      }
    }
    if (decision.forceTier && decision.forceTier !== 'deterministic') tier = decision.forceTier;
    if (decision.forceTier === 'deterministic') {
      return await serveDeterministic(policy, req, 'degrade-policy', requestId, startedAt, {
        budgetExceeded: decision.overBudget,
      });
    }
    if (pin && !req.tier && pin.tier !== 'deterministic') tier = pin.tier;

    /* ---- the chain ------------------------------------------------------- */
    let attempt = 0;
    let totalAttempts = 0;
    let lastReason: FallbackReason | undefined;
    let qualityRetried = false;

    while (tier !== 'deterministic') {
      const tc = tierConfig(tier, rungIndex);
      const adapter = tc ? adapters[tc.adapter] : undefined;
      if (!tc || !adapter) {
        tier = chain.next(tier);
        attempt = 0;
        continue;
      }

      const callStart = now();
      totalAttempts++;
      try {
        const res = await adapter.complete({
          model: tc.model,
          messages: req.messages,
          maxOutputTokens: decision.reduceOutput
            ? Math.max(64, Math.floor((req.maxOutputTokens ?? policy.maxOutputTokens ?? tc.maxOutputTokens ?? config.defaults?.maxOutputTokens ?? 1024) / 2))
            : req.maxOutputTokens ?? policy.maxOutputTokens ?? tc.maxOutputTokens ?? config.defaults?.maxOutputTokens,
          temperature: req.temperature ?? policy.temperature ?? config.defaults?.temperature,
          cache: req.cache ?? policy.cache ?? tc.cache ?? config.defaults?.cache,
          timeoutMs: policy.timeoutMs ?? tc.timeoutMs ?? config.defaults?.timeoutMs,
          reasoning: decision.disableReasoning ? false : req.reasoning,
          batch: req.batch ?? policy.batch,
          signal: req.signal,
        });

        // ---- quality gate: zero-token, deterministic, one escalation only ----
        const gateFail = policy.qualityGate?.(res.text) ?? null;
        // Exactly ONE gate-driven escalation, and it climbs one rung. The cap is the
        // point: a repair loop up a ladder is the runaway this taxonomy exists to stop.
        const promoteTo = gateFail && !decision.disableEscalation ? nextRung(tier, rungIndex) : null;
        if (gateFail && !qualityRetried && promoteTo !== null) {
          qualityRetried = true;
          recordCall(res, tier, tc, adapter, req, policy, requestId, callStart, totalAttempts - 1, gateFail, false);
          lastReason = gateFail;
          tier = 'escalation';
          rungIndex = promoteTo;
          attempt = 0;
          continue;
        }

        const priced = recordCall(res, tier, tc, adapter, req, policy, requestId, callStart, totalAttempts - 1, gateFail ?? undefined, false);
        if (sessionId) chain.pin(sessionId, { provider: adapter.provider, model: res.servedModel, tier });
        if (budget) await budget.postflight({ costUsd: priced.costUsd, tags: req.tags });

        return {
          text: res.text,
          tier: tier as LedgerTier,
          provider: adapter.provider,
          requestedModel: tc.model,
          servedModel: res.servedModel,
          usage: res.usage,
          costUsd: priced.costUsd,
          notionalCostUsd: priced.notionalCostUsd,
          billable: priced.billable,
          estimated: priced.estimated,
          degraded: !!gateFail,
          budgetExceeded: decision.overBudget,
          fallbackReason: gateFail ?? lastReason,
          latencyMs: now() - startedAt,
          requestId,
          attempts: totalAttempts,
        };
      } catch (err) {
        const cls = classifyError(err, { tier });
        lastReason = cls.reason;

        // A failed call still writes a ledger entry. Failures cost real tokens on
        // several providers, and even where they do not, the failure RATE per tier
        // is what tells you whether the chain is doing its job.
        ledger.record({
          requestId,
          surface: req.surface,
          stage: req.stage,
          tier: tier as LedgerTier,
          provider: adapter.provider,
          requestedModel: tc.model,
          servedModel: tc.model,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: null,
          reasoningInOutput: true,
          costUsd: 0,
          billable: tc.billable !== false,
          estimated: true,
          priceSheetRev: PRICE_SHEET_REV,
          latencyMs: now() - callStart,
          ok: false,
          fallbackReason: cls.reason,
          attempt,
          tags: req.tags ?? {},
        });

        if (cls.policy.cooldownMs > 0) chain.markUnavailable(tier, cls.policy.cooldownMs);

        if (attempt < cls.policy.retries) {
          attempt++;
          await sleep(backoffMs(attempt, cls.policy, cls.retryAfterMs));
          continue;
        }

        if (cls.policy.goDeterministic) break;
        tier = chain.next(tier, cls);
        attempt = 0;
      }
    }

    return await serveDeterministic(policy, req, lastReason ?? 'api-error', requestId, startedAt, {
      budgetExceeded: decision.overBudget,
      attempts: totalAttempts,
    });
  }

  /* ---- helpers --------------------------------------------------------- */

  function adapterFor(tc: TierConfig): LlmAdapter | undefined {
    return adapters[tc.adapter];
  }

  function recordCall(
    res: AdapterResponse,
    tier: Tier,
    tc: TierConfig,
    adapter: LlmAdapter,
    req: CompleteRequest,
    policy: SurfacePolicy<any, any>,
    requestId: string,
    callStart: number,
    attempt: number,
    fallbackReason: FallbackReason | undefined,
    degraded: boolean,
  ) {
    const billable = res.billable ?? tc.billable ?? true;
    const promptTokens = res.usage.inputTokens + (res.usage.cacheReadTokens ?? 0);

    // Price on the SERVED model, at the CALL's date. Pricing the requested model
    // prices a system you did not run; pricing at report time reprices your own
    // history the day a vendor's scheduled step-up lands.
    const cost = computeCost(res.usage, {
      modelId: res.servedModel,
      batch: req.batch ?? policy.batch,
      promptTokens,
      routing: tc.routing,
    });

    const lookup = priceFor(res.servedModel, { promptTokens });

    // Subscription transports: zero on the invoice, real consumption of a
    // rate-limited quota. Recording `costUsd: 0` alone hides the ceiling until
    // production finds it; `notionalCostUsd` is what makes it visible.
    const costUsd = billable ? cost.costUsd : 0;
    const notionalCostUsd = billable ? 0 : res.notionalCostUsd ?? cost.costUsd;

    ledger.record({
      requestId,
      surface: req.surface,
      stage: req.stage,
      tier: tier as LedgerTier,
      provider: adapter.provider,
      requestedModel: tc.model,
      servedModel: res.servedModel,
      inputTokens: res.usage.inputTokens,
      outputTokens: res.usage.outputTokens,
      cacheReadTokens: res.usage.cacheReadTokens ?? 0,
      cacheWriteTokens: res.usage.cacheWriteTokens ?? 0,
      reasoningTokens: res.usage.reasoningTokens ?? null,
      reasoningInOutput: res.usage.reasoningInOutput,
      costUsd,
      notionalCostUsd: billable ? undefined : notionalCostUsd,
      billable,
      estimated: cost.estimated || !!res.usage.missing,
      priceSheetRev: cost.priceSheetRev,
      priceConfidence:
        lookup.match === 'default' ? 'ESTIMATED' : cost.confidence === 'high' ? 'PRIMARY' : cost.confidence === 'medium' ? 'DERIVED' : 'THIRD-PARTY',
      batch: req.batch ?? policy.batch,
      cacheLayer: (res.usage.cacheReadTokens ?? 0) > 0 ? 'prefix' : 'none',
      latencyMs: now() - callStart,
      ok: true,
      fallbackReason,
      degraded,
      attempt,
      tags: req.tags ?? {},
    });

    return { costUsd, notionalCostUsd, billable, estimated: cost.estimated || !!res.usage.missing };
  }

  async function serveDeterministic(
    policy: SurfacePolicy<any, any>,
    req: CompleteRequest,
    reason: FallbackReason,
    requestId: string,
    startedAt: number,
    extra: { budgetExceeded?: boolean; attempts?: number } = {},
  ): Promise<MeteredResult> {
    const at = now();
    let text = '';
    try {
      text = String(await policy.fallback(req, { reason, surface: req.surface, stage: req.stage }));
    } catch {
      // The fallback is the last thing standing. If it throws, return an empty
      // string rather than an exception — the caller already lost the model, and
      // giving them a crash as well helps nobody.
      text = '';
    }

    // The zero-cost path writes a ledger entry TOO. How often you degrade is a
    // first-class reliability and cost signal; a fallback that records nothing
    // makes "how often do we degrade?" unanswerable, which is how a chain that
    // has been failing for a week goes unnoticed.
    ledger.record({
      requestId,
      surface: req.surface,
      stage: req.stage,
      tier: 'deterministic',
      provider: 'none',
      requestedModel: 'none',
      servedModel: 'none',
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: null,
      reasoningInOutput: true,
      costUsd: 0,
      billable: false,
      estimated: false,
      priceSheetRev: PRICE_SHEET_REV,
      latencyMs: at - startedAt,
      ok: true,
      fallbackReason: reason,
      degraded: true,
      attempt: extra.attempts ?? 0,
      tags: req.tags ?? {},
    });

    return {
      text,
      tier: 'deterministic',
      provider: 'none',
      requestedModel: 'none',
      servedModel: 'none',
      usage: null,
      costUsd: 0,
      notionalCostUsd: 0,
      billable: false,
      estimated: false,
      degraded: true,
      budgetExceeded: !!extra.budgetExceeded,
      fallbackReason: reason,
      latencyMs: at - startedAt,
      requestId,
      attempts: extra.attempts ?? 0,
    };
  }

  return {
    registerSurface,
    complete,
    health() {
      return {
        priceSheetRev: PRICE_SHEET_REV,
        surfaces: [...surfaces.keys()],
        tiers: {
          primary: `${config.primary.adapter}:${config.primary.model}`,
          // Every rung, in order, with the trigger that reaches it. A rung that is
          // configured but unreachable shows up here rather than in an invoice.
          escalation: rungs.map((r) => `${r.trigger}=${r.adapter}:${r.model}`),
          failsafe: config.failsafe ? `${config.failsafe.adapter}:${config.failsafe.model}` : null,
        },
        chain: chain.health(),
        ledger: ledger.health(),
        budget: budget?.health() ?? { mode: 'none', budgetStore: 'none', sharedCounter: false, warning: 'No budget configured: spend is metered but unbounded.' },
      };
    },
  };
}
