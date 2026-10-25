/**
 * budget.ts — spend policy: advisory | soft-degrade | hard-stop.
 *
 * WHAT
 *   A pure preflight/postflight pair. `preflight()` returns a `BudgetDecision`
 *   telling the metered wrapper what it may do on this call; `postflight()` records
 *   the spend and emits edge-triggered threshold events. No I/O, injected clock,
 *   injected store — so it is testable to the cent and cannot slow a request down.
 *
 * WHY THREE MODES AND WHY ADVISORY IS THE DEFAULT
 *   The classic failure is a budget that is display-only while the team believes
 *   it is a control: the meter turns red, an alert fires into a channel nobody
 *   watches, and spend continues. That failure is not "advisory mode" — it is
 *   advisory mode with no alternative and nobody having chosen it.
 *
 *   So: all three modes ship and work, the mode is one field, and the default is
 *   `advisory` because for demos, prototypes and pre-sales work a false hard-stop
 *   is worse than an overrun. That is a deliberate choice for a specific context,
 *   and it stops being the right one at a nameable moment.
 *
 *   MOVE OFF `advisory` WHEN ANY OF THESE IS TRUE:
 *     - the app serves real customer traffic in production;
 *     - spend is charged back per customer or per tenant;
 *     - the workload contains autonomous agent loops or parallel subagents;
 *     - a single tenant can drive unbounded volume;
 *     - monthly spend has grown past the point where an overrun would need
 *       explaining to someone.
 *   Use `soft-degrade` for user-facing apps — graceful quality reduction beats an
 *   outage. Use `hard-stop` for batch/offline jobs and per-tenant caps, where
 *   refusing is the correct behaviour.
 *
 * ============================ READ THIS BEFORE TRUSTING A CAP ================
 * A budget is a SHARED COUNTER. `memoryStore()` is process-local. Across N
 * replicas a cap of X is a cap of N*X, and under autoscaling it is unbounded. A
 * process restart resets the counter, so every deploy refunds the budget.
 *
 * That makes `hard-stop` — the mode with the strongest safety claim — the one most
 * likely to be silently inert, because per-tenant caps and batch jobs are exactly
 * the workloads that run multi-instance. `hard-stop` REQUIRES a shared counter
 * (`redisStore()`, `callbackStore()`) or a gateway virtual key to mean anything.
 * `health()` reports `budgetStore: 'memory'` so this is visible at runtime rather
 * than discovered from an invoice.
 * ============================================================================
 *
 * PER-AGENT ENVELOPES ARE ALWAYS ENFORCED, IN EVERY MODE — including advisory.
 * This is the one deliberate exception and it is the right one: advisory means
 * "do not let a budget threshold break the user's app", not "let a looping agent
 * spend without limit". A breached envelope kills one agent; the orchestrator
 * collects partial results and proceeds. Blast radius is one branch of a fan-out.
 *
 * HOW TO WIRE IT IN
 *   const budget = createBudget({
 *     mode: 'advisory',                       // <- the one-line switch
 *     limits: { windowUsd: 25, window: 'calendar-month' },
 *     agentEnvelopeUsd: 1.5,
 *     store: memoryStore(),                   // swap for redisStore() before hard-stop
 *     onThreshold: (e) => alerts.send(e),
 *   });
 *   const decision = await budget.preflight({ surface, tags });
 *   ...
 *   await budget.postflight({ costUsd, tags });
 *
 * Dependencies: none.
 */

/* ------------------------------------------------------------------------- */
/* Types                                                                      */
/* ------------------------------------------------------------------------- */

export type BudgetMode = 'advisory' | 'soft-degrade' | 'hard-stop';

export type BudgetWindow = 'calendar-month' | 'rolling-24h' | 'rolling-7d' | 'session';

export interface BudgetLimits {
  /** Spend cap for the window. Omit for "no window cap" (envelopes still apply). */
  windowUsd?: number;
  window?: BudgetWindow;
  /** Optional per-tenant cap within the same window. */
  perTenantUsd?: number;
  /** Optional per-session cap — the cheapest defence against one runaway chat. */
  perSessionUsd?: number;
}

/**
 * The 75/90/100 ladder is PRACTITIONER CONVENTION, not a standard from any
 * FinOps body. It is a reasonable default because it gives you one warning while
 * you can still act, one while you can still throttle, and one at the line. Move
 * the numbers if your burn profile says otherwise; do not treat them as received.
 */
export const DEFAULT_THRESHOLDS = [0.75, 0.9, 1.0] as const;

export interface BudgetContext {
  surface?: string;
  tags?: {
    tenantId?: string;
    sessionId?: string;
    agentId?: string;
    team?: string;
    [k: string]: string | undefined;
  };
  /** Estimated cost of the call about to be made, if the caller can supply one. */
  projectedUsd?: number;
}

export interface BudgetDecision {
  /** False only in `hard-stop` past the cap, or on a breached agent envelope. */
  allow: boolean;
  /** Pin the call to a cheaper tier. Set by throttling at 90%. */
  forceTier?: 'primary' | 'failsafe' | 'deterministic';
  /** Block quality-driven escalation to a more expensive model. */
  disableEscalation?: boolean;
  /** Prefer a transport with zero marginal cost (subscription CLI) if available. */
  preferNonBillable?: boolean;
  /** Halve output caps and turn off extended reasoning. */
  reduceOutput?: boolean;
  disableReasoning?: boolean;
  /** Utilisation at decision time, 0..1+ (can exceed 1). */
  utilization: number;
  /** Highest threshold currently crossed, or null. */
  crossed: number | null;
  /** True once utilisation is at or past 1. Set in EVERY mode, including advisory. */
  overBudget: boolean;
  /** Why the call was refused or degraded — goes straight onto the ledger entry. */
  reason?: 'over-budget' | 'envelope-exceeded' | 'degrade-policy';
  /** Human-readable, safe to log and to show in a health endpoint. */
  message?: string;
}

export interface ThresholdEvent {
  threshold: number;
  utilization: number;
  spentUsd: number;
  limitUsd: number;
  scope: 'window' | 'tenant' | 'session' | 'agent';
  scopeKey?: string;
  mode: BudgetMode;
  at: number;
}

/* ------------------------------------------------------------------------- */
/* Store                                                                      */
/* ------------------------------------------------------------------------- */

/**
 * The counter behind every cap. Injected, because the correct implementation
 * depends entirely on your deployment topology and there is no default that is
 * right for all of them.
 *
 * `add` returns the NEW total so a caller can detect a threshold crossing without
 * a second read (and, in a shared store, without a race).
 */
export interface BudgetStore {
  /** Reported by `health()`. Keep it honest: `'memory'`, `'redis'`, `'callback:pg'`. */
  readonly kind: string;
  get(key: string): Promise<number> | number;
  add(key: string, usd: number): Promise<number> | number;
  reset(key: string): Promise<void> | void;
}

/**
 * SINGLE-PROCESS ONLY. Correct for a CLI, a script, a single-container demo, or
 * local development. Wrong for anything with more than one replica, and wrong
 * across restarts.
 *
 * It is the default because a store that requires infrastructure would mean the
 * template does not run out of the box, and a budget you did not install is worse
 * than a process-local one you know is process-local. `health()` reports the kind
 * so nothing has to be remembered.
 */
export function memoryStore(): BudgetStore {
  const m = new Map<string, number>();
  return {
    kind: 'memory',
    get: (k) => m.get(k) ?? 0,
    add: (k, usd) => {
      const next = (m.get(k) ?? 0) + usd;
      m.set(k, next);
      return next;
    },
    reset: (k) => {
      m.delete(k);
    },
  };
}

/**
 * Shape for a shared counter. Wire the two functions to `INCRBYFLOAT`/`GET` (with
 * an `EXPIRE` matching your window) or to any atomic counter you already run.
 *
 * The atomicity requirement is not decorative: with a read-modify-write under
 * concurrency, a hard cap leaks by roughly the number of in-flight requests, which
 * is exactly when you least want it to.
 */
export function callbackStore(kind: string, impl: Omit<BudgetStore, 'kind'>): BudgetStore {
  return { kind, ...impl };
}

/* ------------------------------------------------------------------------- */
/* Budget                                                                     */
/* ------------------------------------------------------------------------- */

export interface BudgetOptions {
  /** THE ONE-LINE SWITCH. Default `advisory`. */
  mode?: BudgetMode;
  limits?: BudgetLimits;
  /**
   * Per-agent spend cap. ALWAYS enforced, in every mode, including advisory.
   * Set it even on a demo — an agent loop is the one failure that can turn a
   * pleasant overrun into an unpleasant one while you are asleep.
   */
  agentEnvelopeUsd?: number;
  store?: BudgetStore;
  thresholds?: readonly number[];
  /** Injected clock. Keeps preflight/postflight deterministic in tests. */
  now?: () => number;
  /** Fires once per threshold per window (edge-triggered, not level-triggered). */
  onThreshold?: (e: ThresholdEvent) => void;
}

export interface Budget {
  preflight(ctx: BudgetContext): Promise<BudgetDecision>;
  postflight(input: { costUsd: number; tags?: BudgetContext['tags'] }): Promise<void>;
  status(ctx?: BudgetContext): Promise<{
    mode: BudgetMode;
    spentUsd: number;
    limitUsd: number | null;
    utilization: number;
    overBudget: boolean;
  }>;
  health(): { mode: BudgetMode; budgetStore: string; sharedCounter: boolean; warning: string | null };
  setMode(mode: BudgetMode): void;
}

export function createBudget(options: BudgetOptions = {}): Budget {
  let mode: BudgetMode = options.mode ?? 'advisory';
  const limits = options.limits ?? {};
  const window: BudgetWindow = limits.window ?? 'calendar-month';
  const store = options.store ?? memoryStore();
  const thresholds = [...(options.thresholds ?? DEFAULT_THRESHOLDS)].sort((a, b) => a - b);
  const now = options.now ?? (() => Date.now());
  const fired = new Set<string>();

  function windowKey(at: number): string {
    const d = new Date(at);
    switch (window) {
      case 'calendar-month':
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      case 'rolling-24h':
        return `d${Math.floor(at / 86_400_000)}`;
      case 'rolling-7d':
        return `w${Math.floor(at / (7 * 86_400_000))}`;
      case 'session':
        return 'session';
    }
  }

  const keys = {
    window: (at: number) => `finops:budget:${windowKey(at)}`,
    tenant: (at: number, id: string) => `finops:budget:${windowKey(at)}:tenant:${id}`,
    session: (id: string) => `finops:budget:session:${id}`,
    agent: (id: string) => `finops:budget:agent:${id}`,
  };

  function emit(e: ThresholdEvent) {
    const dedupe = `${e.scope}:${e.scopeKey ?? ''}:${e.threshold}`;
    if (fired.has(dedupe)) return;
    fired.add(dedupe);
    try {
      options.onThreshold?.(e);
    } catch {
      // A budget alert handler that throws must not take down the request that
      // triggered it. Same invariant as the ledger: instrumentation never breaks
      // the response path.
    }
  }

  function highestCrossed(u: number): number | null {
    let c: number | null = null;
    for (const t of thresholds) if (u >= t) c = t;
    return c;
  }

  /**
   * The mode ladder. Note that `advisory` computes and reports exactly the same
   * utilisation and `overBudget` flag as the other two — it simply never sets
   * `allow: false` or a `forceTier`. That symmetry matters: switching modes must
   * change behaviour only, never visibility, so a team can watch what hard-stop
   * WOULD have done before turning it on.
   */
  function decide(u: number): Omit<BudgetDecision, 'utilization' | 'crossed' | 'overBudget'> {
    if (mode === 'advisory') return { allow: true };

    if (u >= 1.0) {
      if (mode === 'hard-stop') {
        return {
          allow: false,
          forceTier: 'deterministic',
          reason: 'over-budget',
          message:
            'Budget cap reached and mode is hard-stop: paid tiers refused, deterministic fallback only.',
        };
      }
      // soft-degrade: the app keeps working, at zero marginal cost, at reduced
      // quality. This is why every metered surface must register a deterministic
      // fallback — without one, "degrade" has nowhere to go and becomes an outage.
      return {
        allow: true,
        forceTier: 'failsafe',
        disableEscalation: true,
        preferNonBillable: true,
        reduceOutput: true,
        disableReasoning: true,
        reason: 'degrade-policy',
        message: 'Budget cap reached: paid tiers disabled, serving from failsafe/deterministic.',
      };
    }

    if (u >= 0.9) {
      return {
        allow: true,
        forceTier: 'primary',
        disableEscalation: true,
        preferNonBillable: true,
        reduceOutput: true,
        disableReasoning: true,
        reason: 'degrade-policy',
        message: 'Budget above 90%: throttling to cheapest tier, escalation and reasoning off.',
      };
    }

    return { allow: true };
  }

  async function preflight(ctx: BudgetContext): Promise<BudgetDecision> {
    const at = now();

    // ---- Agent envelope first, and unconditionally. ----
    // Checked before the window budget and enforced in EVERY mode, because a
    // looping agent is the failure that outruns any alerting cadence.
    const agentId = ctx.tags?.agentId;
    if (agentId && options.agentEnvelopeUsd !== undefined) {
      const spent = await store.get(keys.agent(agentId));
      if (spent >= options.agentEnvelopeUsd) {
        emit({
          threshold: 1,
          utilization: spent / options.agentEnvelopeUsd,
          spentUsd: spent,
          limitUsd: options.agentEnvelopeUsd,
          scope: 'agent',
          scopeKey: agentId,
          mode,
          at,
        });
        return {
          allow: false,
          utilization: spent / options.agentEnvelopeUsd,
          crossed: 1,
          overBudget: true,
          forceTier: 'deterministic',
          reason: 'envelope-exceeded',
          message:
            `Agent ${agentId} exhausted its spend envelope. This is enforced in every budget ` +
            'mode, including advisory. The orchestrator should collect partial results and proceed.',
        };
      }
    }

    // ---- Narrower scopes before the window, so the tightest cap wins. ----
    for (const scope of ['session', 'tenant'] as const) {
      const id = scope === 'session' ? ctx.tags?.sessionId : ctx.tags?.tenantId;
      const cap = scope === 'session' ? limits.perSessionUsd : limits.perTenantUsd;
      if (!id || cap === undefined) continue;
      const key = scope === 'session' ? keys.session(id) : keys.tenant(at, id);
      const spent = await store.get(key);
      const u = cap > 0 ? spent / cap : 0;
      const crossed = highestCrossed(u);
      if (crossed !== null) {
        emit({ threshold: crossed, utilization: u, spentUsd: spent, limitUsd: cap, scope, scopeKey: id, mode, at });
      }
      if (u >= 1) {
        const d = decide(u);
        return { ...d, utilization: u, crossed, overBudget: true };
      }
    }

    // ---- Window budget. ----
    if (limits.windowUsd === undefined) {
      return { allow: true, utilization: 0, crossed: null, overBudget: false };
    }
    const spent = await store.get(keys.window(at));
    const u = limits.windowUsd > 0 ? spent / limits.windowUsd : 0;
    const crossed = highestCrossed(u);
    if (crossed !== null) {
      emit({
        threshold: crossed,
        utilization: u,
        spentUsd: spent,
        limitUsd: limits.windowUsd,
        scope: 'window',
        mode,
        at,
      });
    }
    const d = decide(u);
    return { ...d, utilization: u, crossed, overBudget: u >= 1 };
  }

  async function postflight(input: { costUsd: number; tags?: BudgetContext['tags'] }): Promise<void> {
    // Postflight must never throw. It runs after the caller already has an answer;
    // failing here would turn a bookkeeping problem into a user-visible error.
    try {
      const at = now();
      const usd = Number.isFinite(input.costUsd) ? input.costUsd : 0;
      if (usd === 0) return;
      await store.add(keys.window(at), usd);
      const t = input.tags ?? {};
      if (t.tenantId) await store.add(keys.tenant(at, t.tenantId), usd);
      if (t.sessionId) await store.add(keys.session(t.sessionId), usd);
      if (t.agentId) await store.add(keys.agent(t.agentId), usd);
    } catch {
      /* counters are best-effort; the ledger is the record of truth */
    }
  }

  return {
    preflight,
    postflight,
    async status(ctx = {}) {
      const at = now();
      const spent = await store.get(keys.window(at));
      const limit = limits.windowUsd ?? null;
      const u = limit && limit > 0 ? spent / limit : 0;
      void ctx;
      return { mode, spentUsd: spent, limitUsd: limit, utilization: u, overBudget: u >= 1 };
    },
    health() {
      const shared = store.kind !== 'memory';
      return {
        mode,
        budgetStore: store.kind,
        sharedCounter: shared,
        warning:
          !shared && mode === 'hard-stop'
            ? 'hard-stop is configured with a process-local counter. Across N replicas this ' +
              'enforces N times the intended cap, and every restart refunds it. Inject a shared ' +
              'store (redis/callback) or enforce the cap at a gateway virtual key.'
            : !shared
              ? 'Budget counters are process-local: totals cover this process only and reset on restart.'
              : null,
      };
    },
    setMode(next) {
      mode = next;
      fired.clear();
    },
  };
}
