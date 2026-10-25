/**
 * fallback.ts — the tier chain, the FallbackReason taxonomy, and the per-reason
 * retry table.
 *
 * WHAT
 *   Classification of why a call failed, a policy table saying what to do about
 *   each class, per-tier cooldowns, and session-sticky pinning.
 *
 * WHY A TAXONOMY RATHER THAN A BOOLEAN
 *   Two reasons, one operational and one financial.
 *
 *   Operationally: a degraded response must be ATTRIBUTABLE. "The model failed and
 *   we served the template" is not an answer anyone can act on. "34% of degrades
 *   this week were `not-authenticated` on the failsafe tier" is a fix.
 *
 *   Financially: a blanket retry policy is a spend bug. Retrying a
 *   `context-length-exceeded` costs the full input tokens to fail in exactly the
 *   same way. Retrying a `malformed-output` in a loop is the classic runaway — the
 *   model is confidently wrong, and being asked again does not change that, but
 *   being asked twenty times changes the invoice. Retrying a `rate-limited` after
 *   backoff, on the other hand, is nearly always correct and saves you a degraded
 *   answer. Only classification lets you get all three right.
 *
 *   EVERY RETRY IS A LEDGER ENTRY sharing the parent `requestId`. Retry spend is
 *   the line teams are most consistently surprised by, and it is invisible unless
 *   you record it as its own call.
 *
 * THE CHAIN
 *   primary -> escalation -> failsafe -> deterministic.
 *   The deterministic tier is not optional. It is what makes a hard-stop budget
 *   survivable, what makes soft-degrade mean anything, and what turns a provider
 *   outage into reduced quality rather than an incident. `registerSurface()` in
 *   metered-llm.ts refuses a surface that has no deterministic fallback for
 *   exactly this reason.
 *
 * HOW TO WIRE IT IN
 *   const reason = classifyError(err, { tier: 'primary' });
 *   const policy = retryPolicyFor(reason);
 *   if (policy.retries > 0 && attempt < policy.retries) {
 *     await sleep(backoffMs(attempt, policy, retryAfterMs));
 *   } else {
 *     nextTier(chain, currentTier);
 *   }
 *
 * Dependencies: none.
 */

/* ------------------------------------------------------------------------- */
/* Taxonomy                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Every way a tier can fail to produce a usable answer. Closed set on purpose:
 * an open string field becomes forty spellings of "timeout" and no dashboard.
 * If you genuinely need a new one, add it here and give it a policy row below —
 * a reason with no policy is a reason nobody chose behaviour for.
 */
export type FallbackReason =
  /* transport / auth — the tier is not usable right now */
  | 'spawn-failed'
  | 'not-authenticated'
  | 'quota-exhausted'
  | 'rate-limited'
  | 'overloaded'
  | 'network-error'
  | 'timeout'
  | 'api-error'
  /* request shape — retrying identically cannot help */
  | 'context-length-exceeded'
  | 'content-filtered'
  /* output quality — one repair attempt is justified, a loop is not */
  | 'empty-output'
  | 'malformed-output'
  | 'schema-violation'
  /* correctness — paying more to try again is paying for the same bug */
  | 'ungrounded'
  /* policy — the decision was ours, not the provider's */
  | 'over-budget'
  | 'envelope-exceeded'
  | 'degrade-policy';

export type Tier = 'primary' | 'escalation' | 'failsafe' | 'deterministic';

export interface RetryPolicy {
  /** Attempts AFTER the first. 0 means "go to the next tier immediately". */
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Honour a provider-supplied `Retry-After`, capped at `maxDelayMs`. */
  respectRetryAfter: boolean;
  /** Mark the tier unusable for this long, so later requests skip the failure. */
  cooldownMs: number;
  /** Retry at the SAME tier with a corrective instruction before moving on. */
  repairPrompt: boolean;
  /** Skip straight past the metered tiers to the deterministic fallback. */
  goDeterministic: boolean;
  /** Jump to a tier with a bigger context window rather than retrying. */
  needsLargerContext: boolean;
  why: string;
}

const P = (p: Partial<RetryPolicy> & { why: string }): RetryPolicy => ({
  retries: 0,
  baseDelayMs: 500,
  maxDelayMs: 4000,
  respectRetryAfter: true,
  cooldownMs: 0,
  repairPrompt: false,
  goDeterministic: false,
  needsLargerContext: false,
  ...p,
});

/**
 * The policy table. Read the `why` column before changing a row — each one encodes
 * a specific way of wasting money or time.
 */
export const RETRY_TABLE: Record<FallbackReason, RetryPolicy> = {
  'rate-limited': P({
    retries: 2,
    why: 'Transient and self-correcting. Backing off costs a little latency; not retrying costs a degraded answer for a condition that cleared in two seconds.',
  }),
  overloaded: P({
    retries: 2,
    why: 'Provider-side capacity. Same reasoning as rate-limited.',
  }),
  'network-error': P({
    retries: 2,
    why: 'Almost always transient. Bounded at 2 so a real outage degrades quickly instead of holding the request open.',
  }),
  timeout: P({
    retries: 1,
    cooldownMs: 30_000,
    why: 'One retry, because a timeout may be a slow response rather than a dead one — but a timeout already cost the full timeout budget in wall-clock, so retrying twice doubles the worst case a user experiences.',
  }),
  'quota-exhausted': P({
    retries: 0,
    cooldownMs: 60_000,
    why: 'Retrying cannot create quota. The cooldown stops every subsequent request re-paying the same failure latency to learn the same thing.',
  }),
  'not-authenticated': P({
    retries: 0,
    cooldownMs: 60_000,
    why: 'Credentials do not fix themselves within a request. Cool the tier down and alert.',
  }),
  'spawn-failed': P({
    retries: 0,
    cooldownMs: 60_000,
    why: 'A missing or unlaunchable binary is a deployment fact, not a transient. Probe-gate the tier instead of discovering this per request.',
  }),
  'api-error': P({
    retries: 1,
    cooldownMs: 15_000,
    why: 'Ambiguous by definition. One retry catches the transient half without turning a deterministic 4xx into a loop.',
  }),
  'context-length-exceeded': P({
    retries: 0,
    needsLargerContext: true,
    why: 'The single most expensive pointless retry there is: you pay for the full input to fail identically. Escalate to a larger-context tier, trim the prompt, or go deterministic.',
  }),
  'content-filtered': P({
    retries: 0,
    goDeterministic: true,
    why: 'A filter decision will be the same on the next call and on a more expensive model. Escalating pays more for the same refusal.',
  }),
  'empty-output': P({
    retries: 1,
    repairPrompt: true,
    why: 'Exactly one repair attempt. Repair loops are a classic runaway cost pattern — the failure mode is silent, because each individual retry looks reasonable.',
  }),
  'malformed-output': P({
    retries: 1,
    repairPrompt: true,
    why: 'As empty-output. One repair, then escalate — a model that cannot produce the shape twice will not produce it on the fifth try.',
  }),
  'schema-violation': P({
    retries: 1,
    repairPrompt: true,
    why: 'As above, with the validator error fed back as the repair instruction. That is what makes the single retry worth paying for.',
  }),
  ungrounded: P({
    retries: 0,
    goDeterministic: true,
    why: 'A grounding violation is a correctness failure, not a capability gap. Paying a stronger model to try again is paying more for the same bug, and it may produce a confident version of it.',
  }),
  'over-budget': P({
    retries: 0,
    goDeterministic: true,
    why: 'The budget layer already decided. Retrying would be the code arguing with its own policy.',
  }),
  'envelope-exceeded': P({
    retries: 0,
    goDeterministic: true,
    why: 'One agent is done spending. Return partial results to the orchestrator.',
  }),
  'degrade-policy': P({
    retries: 0,
    why: 'Deliberate throttling. Go to whatever tier the budget decision named.',
  }),
};

/**
 * Always go through this rather than indexing the table directly: an unmapped
 * reason falls back to the `api-error` policy (one cautious retry) instead of
 * producing `undefined` and crashing the error path — which would turn a handled
 * provider failure into an unhandled application failure.
 */
export function retryPolicyFor(reason: FallbackReason): RetryPolicy {
  return RETRY_TABLE[reason] ?? RETRY_TABLE['api-error'];
}

/* ------------------------------------------------------------------------- */
/* Classification                                                             */
/* ------------------------------------------------------------------------- */

export interface ClassifyHints {
  tier?: Tier;
  httpStatus?: number;
  /** Seconds or an HTTP-date, straight from the provider's `Retry-After` header. */
  retryAfter?: string | number;
  /** Set by the wrapper when its own AbortController fired. */
  aborted?: boolean;
}

export interface Classification {
  reason: FallbackReason;
  policy: RetryPolicy;
  retryAfterMs: number | null;
  /** What we matched on, so a surprising classification is debuggable. */
  evidence: string;
}

/**
 * Map an arbitrary thrown value onto the taxonomy.
 *
 * Order matters: structured signals (HTTP status, provider error codes) are
 * checked before message-text matching, because message text is the least stable
 * thing any provider ships and a string match that silently stops matching after
 * an SDK upgrade will quietly reclassify half your failures as `api-error`.
 */
export function classifyError(err: unknown, hints: ClassifyHints = {}): Classification {
  const e = (err ?? {}) as Record<string, any>;
  const status: number | undefined =
    hints.httpStatus ?? e.status ?? e.statusCode ?? e.response?.status;
  const code = String(e.code ?? e.name ?? e.error?.type ?? '').toLowerCase();
  const msg = String(e.message ?? e.error?.message ?? err ?? '').toLowerCase();
  const retryAfterMs = parseRetryAfter(hints.retryAfter ?? e.headers?.['retry-after']);

  const done = (reason: FallbackReason, evidence: string): Classification => ({
    reason,
    policy: retryPolicyFor(reason),
    retryAfterMs,
    evidence,
  });

  if (hints.aborted || code.includes('abort') || code === 'etimedout' || msg.includes('timed out')) {
    return done('timeout', `aborted/timeout signal (${code || 'abort'})`);
  }
  if (status === 429) return done('rate-limited', 'http 429');
  if (status === 401 || status === 403) return done('not-authenticated', `http ${status}`);
  if (status === 402) return done('quota-exhausted', 'http 402');
  if (status === 529 || status === 503 || status === 502) return done('overloaded', `http ${status}`);

  if (['enoent', 'eacces', 'espawn'].some((c) => code.includes(c))) {
    return done('spawn-failed', `process error ${code}`);
  }
  if (['econnreset', 'econnrefused', 'enotfound', 'epipe', 'eai_again'].some((c) => code.includes(c))) {
    return done('network-error', `socket error ${code}`);
  }

  if (msg.includes('context length') || msg.includes('too many tokens') || msg.includes('maximum context')) {
    return done('context-length-exceeded', 'provider context-length message');
  }
  if (msg.includes('content filter') || msg.includes('safety') || msg.includes('blocked')) {
    return done('content-filtered', 'provider filter message');
  }
  if (msg.includes('quota') || msg.includes('billing') || msg.includes('credit balance')) {
    return done('quota-exhausted', 'provider quota/billing message');
  }
  if (msg.includes('rate limit')) return done('rate-limited', 'provider rate-limit message');
  if (msg.includes('overloaded')) return done('overloaded', 'provider overloaded message');
  if (msg.includes('not authenticated') || msg.includes('unauthorized') || msg.includes('api key')) {
    return done('not-authenticated', 'provider auth message');
  }

  // Deliberately the LAST resort, and deliberately not a silent bucket: if
  // `api-error` dominates your fallback histogram, the classifier has drifted
  // behind the SDK and needs a new rule, not a bigger retry budget.
  return done('api-error', `unclassified (status=${status ?? 'none'}, code=${code || 'none'})`);
}

function parseRetryAfter(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return v * 1000;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return Number(s) * 1000;
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.max(0, t - Date.now()) : null;
}

/**
 * Exponential backoff with FULL JITTER.
 *
 * Full jitter (random in [0, delay]) rather than plain exponential, because every
 * client that hit the same rate limit is also backing off — synchronized retries
 * reconstruct the thundering herd that caused the limit, and you pay the failure
 * latency twice before anything succeeds.
 */
export function backoffMs(
  attempt: number,
  policy: RetryPolicy,
  retryAfterMs: number | null = null,
  random: () => number = Math.random,
): number {
  if (policy.respectRetryAfter && retryAfterMs !== null) {
    return Math.min(retryAfterMs, policy.maxDelayMs);
  }
  const exp = Math.min(policy.baseDelayMs * 2 ** attempt, policy.maxDelayMs);
  return Math.floor(random() * exp);
}

/* ------------------------------------------------------------------------- */
/* Chain, cooldowns, stickiness                                               */
/* ------------------------------------------------------------------------- */

export const DEFAULT_CHAIN: Tier[] = ['primary', 'escalation', 'failsafe', 'deterministic'];

export interface ChainOptions {
  chain?: Tier[];
  now?: () => number;
  /** Session pin TTL. Default 15 minutes. */
  stickyTtlMs?: number;
}

export interface FallbackChain {
  /** Next usable tier after `from`, skipping any tier in cooldown. */
  next(from: Tier, classification?: Classification): Tier;
  markUnavailable(tier: Tier, forMs: number): void;
  available(tier: Tier): boolean;
  /**
   * Session-sticky routing. Once a session resolves to a (provider, model), pin
   * it. Cache economics dominate routing economics: a router that saves a slice
   * of sticker price by switching providers mid-conversation destroys a prompt
   * prefix worth far more, and it wins on the invoice line it can see while
   * losing on the one it cannot. Users also experience mid-session provider
   * swaps as a bug — formatting, refusal boundaries and tool-call shape all move.
   */
  pin(sessionId: string, route: { provider: string; model: string; tier: Tier }): void;
  pinned(sessionId: string): { provider: string; model: string; tier: Tier } | null;
  unpin(sessionId: string): void;
  health(): { cooldowns: Record<string, number>; pins: number };
}

export function createFallbackChain(options: ChainOptions = {}): FallbackChain {
  const chain = options.chain ?? DEFAULT_CHAIN;
  const now = options.now ?? (() => Date.now());
  const ttl = options.stickyTtlMs ?? 15 * 60_000;
  const cooldown = new Map<Tier, number>();
  const pins = new Map<string, { provider: string; model: string; tier: Tier; at: number }>();

  function available(tier: Tier): boolean {
    if (tier === 'deterministic') return true; // always, by construction
    const until = cooldown.get(tier);
    return !until || until <= now();
  }

  return {
    next(from, classification) {
      // A classification can short-circuit the ladder entirely: a grounding
      // failure or a budget refusal has no business paying a stronger model.
      if (classification?.policy.goDeterministic) return 'deterministic';

      let i = chain.indexOf(from);
      if (i < 0) i = 0;
      for (let j = i + 1; j < chain.length; j++) {
        if (available(chain[j])) return chain[j];
      }
      return 'deterministic';
    },
    markUnavailable(tier, forMs) {
      if (forMs > 0) cooldown.set(tier, now() + forMs);
    },
    available,
    pin(sessionId, route) {
      if (sessionId) pins.set(sessionId, { ...route, at: now() });
    },
    pinned(sessionId) {
      const p = pins.get(sessionId);
      if (!p) return null;
      if (now() - p.at > ttl) {
        pins.delete(sessionId);
        return null;
      }
      return { provider: p.provider, model: p.model, tier: p.tier };
    },
    unpin(sessionId) {
      pins.delete(sessionId);
    },
    health() {
      const t = now();
      const cds: Record<string, number> = {};
      for (const [tier, until] of cooldown) if (until > t) cds[tier] = until - t;
      return { cooldowns: cds, pins: pins.size };
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Deterministic fallback                                                     */
/* ------------------------------------------------------------------------- */

/**
 * The zero-cost last resort every surface must have.
 *
 * `reason` is passed in so the fallback can be honest with the user ("we could
 * not verify sources for this answer") rather than generically apologetic, and so
 * the ledger entry for the degraded call is attributable. Yes, the deterministic
 * call writes a ledger entry too, with cost zero: HOW OFTEN YOU DEGRADE is a
 * first-class reliability and FinOps signal, and a fallback that records nothing
 * makes "was that really the model?" answerable but "how often do we degrade?"
 * unanswerable.
 */
export type DeterministicFallback<TReq = unknown, TRes = unknown> = (
  request: TReq,
  context: { reason: FallbackReason; surface: string; stage?: string },
) => TRes | Promise<TRes>;

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
