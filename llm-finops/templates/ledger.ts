/**
 * ledger.ts — the per-call append-only cost ledger.
 *
 * WHAT
 *   Every LLM call your app makes writes exactly one entry here: who asked, what
 *   ran, what the provider said it used, what that cost, and whether the answer was
 *   degraded. An in-memory ring buffer answers "what is happening right now"
 *   (`summarize()`); a pluggable sink is where durability actually lives.
 *
 * WHY
 *   Without a per-call record you can answer "what did we spend" (the invoice does
 *   that) but not the questions that change decisions: which surface, which tenant,
 *   which pipeline stage, how much of it was retries, how often we silently fell
 *   back. Those are the numbers that turn a cost report into an action.
 *
 *   Two invariants make this safe to put on a hot path, and they are implemented
 *   here rather than merely asserted in a comment:
 *
 *   1. `record()` NEVER throws. Every field access, sink dispatch and summarize
 *      path is defended. A metering bug must not become an outage — instrumentation
 *      that can break the response path will eventually be deleted by whoever is
 *      on call, and then you have no instrumentation at all.
 *   2. `record()` NEVER alters the response path. It is synchronous, does no I/O
 *      inline, and dispatches the sink write on a microtask. There is no `await`
 *      you can accidentally place in front of it that would add latency to a user
 *      request, and no sink error that can propagate back to the caller.
 *
 *   Test both: inject `throwingSinkForTests()` and assert the response is unchanged
 *   and `health().sinkFailures > 0`. If that test does not exist, the invariant is
 *   an intention, not a property.
 *
 * HOW TO WIRE IT IN
 *   const ledger = createLedger({ sink: fileSink({ path: 'C:/var/log/finops' }) });
 *   const metered = createMeteredLlm({ ledger, ... });   // see metered-llm.ts
 *   // reporting:  ledger.summarize({ since: startOfMonth })
 *
 * NOT AN AUDIT LOG. The ring is a rolling operational window (default 2,000
 * entries). It is arithmetically wrong as a month-to-date total the moment call
 * 2,001 lands. If you need chargeback, bill from the sink's durable store, never
 * from `summarize()`. This distinction is called out here because the reference
 * implementation this generalizes got it wrong in exactly that way.
 *
 * Dependencies: none at import time. `node:fs` is loaded lazily by `fileSink` only.
 */

/* ------------------------------------------------------------------------- */
/* Entry shape                                                                */
/* ------------------------------------------------------------------------- */

/** Which tier of the provider chain actually served this call. */
export type LedgerTier =
  | 'primary'
  | 'escalation'
  | 'failsafe'
  | 'deterministic'
  | 'cache';

/** Attribution dimensions. Every one of these is a slice someone will ask for. */
export interface AttributionTags {
  env?: string;
  app?: string;
  team?: string;
  feature?: string;
  tenantId?: string;
  userId?: string;
  /** Agent/subagent identity — the unit a per-agent budget envelope bounds. */
  agentId?: string;
  sessionId?: string;
  [k: string]: string | undefined;
}

export interface LedgerEntry {
  /* identity */
  id: string;
  /** Epoch milliseconds. Injected clock — never `Date.now()` inside pure code. */
  ts: number;
  /**
   * Stable across retries and fallbacks of ONE logical request. This is what lets
   * you compute `retryCostShare`; without it a retried call looks like two
   * unrelated calls and retry spend becomes invisible.
   */
  requestId: string;
  traceId?: string;
  spanId?: string;

  /* what ran */
  /** Feature-level label: 'chat', 'summarize', 'narrate'. */
  surface: string;
  /**
   * Pipeline stage within the surface: 'plan', 'worker', 'reflexion'. Coarse
   * surface labels hide per-stage unit economics — a multi-call pipeline logged
   * under one label cannot tell you which call is the expensive one.
   */
  stage?: string;
  tier: LedgerTier;
  provider: string;
  /**
   * What you asked for. Differs from `servedModel` more often than teams expect:
   * aliases resolve to dated snapshots, Azure requests name a deployment, Bedrock
   * ids carry region prefixes, and some free tiers silently downgrade under load.
   */
  requestedModel: string;
  /**
   * What actually ran, provider-reported. THIS is the pricing key. A nonzero
   * `modelDriftRate` in the summary means your cost model describes a system you
   * do not have.
   */
  servedModel: string;

  /* provider-reported usage — never estimated from character counts */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /**
   * Thinking/reasoning tokens. On some providers these are a NESTED breakdown of
   * `outputTokens`; on others they are a SIBLING addend that must be added to get
   * billable output. `reasoningInOutput` records which, per call, so cost math
   * does not have to guess. See adapters.md.
   */
  reasoningTokens: number | null;
  reasoningInOutput: boolean;

  /* money */
  costUsd: number;
  /**
   * What this would have cost if it had been metered. Set for subscription
   * transports where marginal cost is ~zero but a rate-limited quota is being
   * consumed. `billable: false` is NOT the same as `costUsd: 0` — reporting both
   * is how you discover a subscription ceiling before production does.
   */
  notionalCostUsd?: number;
  billable: boolean;
  /**
   * True when usage was not provider-reported or the model was absent from the
   * price sheet. A nonzero `estimatedRate` is a DEFECT SIGNAL, not a rounding
   * error — treat it as a bug to fix, not a caveat to footnote.
   */
  estimated: boolean;
  /** Which revision of the price sheet produced `costUsd`. Enables repricing. */
  priceSheetRev?: string;
  /** Confidence of the price row used. A large third-party share caveats a report. */
  priceConfidence?: 'PRIMARY' | 'DERIVED' | 'THIRD-PARTY' | 'ESTIMATED';
  batch?: boolean;
  cacheLayer?: 'none' | 'prefix' | 'exact' | 'semantic';

  /* operations */
  latencyMs: number;
  ok: boolean;
  /** Present whenever this call was reached because something before it failed. */
  fallbackReason?: string;
  /** True when the caller received a lower-quality answer than the happy path. */
  degraded?: boolean;
  /** Attempt index within `requestId`. 0 = first try; >0 = retry spend. */
  attempt?: number;

  tags: AttributionTags;
}

/** What callers hand to `record()`. Everything else is filled in with defaults. */
export type LedgerInput = Omit<LedgerEntry, 'id' | 'ts'> &
  Partial<Pick<LedgerEntry, 'id' | 'ts'>>;

/* ------------------------------------------------------------------------- */
/* Sinks                                                                      */
/* ------------------------------------------------------------------------- */

/**
 * A sink is where entries go to survive process death. It is deliberately a
 * one-method interface so you can point it at NDJSON, OTel, Postgres, ClickHouse
 * or Kafka without the ledger knowing anything about any of them.
 *
 * CONTRACT: a sink MAY throw or reject. The ledger catches everything and counts
 * the failure. Do not add defensive try/catch inside your sink for the ledger's
 * benefit — add it for your own logging if you want detail.
 */
export interface LedgerSink {
  name: string;
  write(entry: LedgerEntry): void | Promise<void>;
  flush?(): void | Promise<void>;
  close?(): void | Promise<void>;
}

/** Drops everything. The default, so the ledger is useful with zero configuration. */
export function nullSink(): LedgerSink {
  return { name: 'null', write() {} };
}

/**
 * Rotating NDJSON, one JSON object per line, appended.
 *
 * NDJSON and not "rewrite a JSON array each call" — the latter is O(n) per request
 * and becomes a latency tax that grows with your own success. It is also the exact
 * mistake the reference implementation made.
 *
 * `node:fs` is required lazily so that importing this module in a browser, an edge
 * runtime or a test does not fail.
 */
export function fileSink(opts: {
  /** Directory (created if missing) or full file path ending in `.ndjson`. */
  path: string;
  /** Rotate once the active file exceeds this size. Default 32 MiB. */
  maxBytes?: number;
  /** How many rotated files to keep. Default 5. */
  maxFiles?: number;
}): LedgerSink {
  const maxBytes = opts.maxBytes ?? 32 * 1024 * 1024;
  const maxFiles = opts.maxFiles ?? 5;
  let fs: typeof import('node:fs') | null = null;
  let target: string | null = null;
  let bytes = 0;

  function init() {
    if (fs && target) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    fs = require('node:fs') as typeof import('node:fs');
    const isFile = /\.(ndjson|jsonl|log)$/i.test(opts.path);
    const dir = isFile ? opts.path.replace(/[\\/][^\\/]+$/, '') : opts.path;
    fs.mkdirSync(dir, { recursive: true });
    target = isFile ? opts.path : `${dir.replace(/[\\/]+$/, '')}/finops.ndjson`;
    try {
      bytes = fs.statSync(target).size;
    } catch {
      bytes = 0;
    }
  }

  function rotate() {
    if (!fs || !target) return;
    for (let i = maxFiles - 1; i >= 1; i--) {
      try {
        fs.renameSync(`${target}.${i}`, `${target}.${i + 1}`);
      } catch {
        /* nothing to rotate at this index */
      }
    }
    try {
      fs.renameSync(target, `${target}.1`);
    } catch {
      /* first rotation with no prior file */
    }
    bytes = 0;
  }

  return {
    name: 'file',
    write(entry) {
      init();
      if (!fs || !target) return;
      const line = JSON.stringify(entry) + '\n';
      if (bytes + line.length > maxBytes) rotate();
      fs.appendFileSync(target, line, 'utf8');
      bytes += line.length;
    },
  };
}

/** Hand every entry to your own function: a queue, a DB batcher, a HTTP shipper. */
export function callbackSink(
  name: string,
  fn: (entry: LedgerEntry) => void | Promise<void>,
): LedgerSink {
  return { name, write: fn };
}

/**
 * Emit each entry as an OTel log record / event via an injected emitter.
 *
 * The emitter is injected rather than imported so this file keeps zero hard
 * dependencies: pass `(name, attrs) => logger.emit({ body: name, attributes: attrs })`
 * or wire it to your own exporter. Cost is emitted under a clearly custom
 * `app.finops.*` namespace — the GenAI semantic conventions deliberately have no
 * cost attribute, and a span priced at emission time can never be repriced when
 * the price sheet changes.
 */
export function otelSink(emit: (name: string, attributes: Record<string, unknown>) => void): LedgerSink {
  return {
    name: 'otel',
    write(e) {
      emit('finops.call', {
        'gen_ai.provider.name': e.provider,
        'gen_ai.request.model': e.requestedModel,
        'gen_ai.response.model': e.servedModel,
        'gen_ai.usage.input_tokens': e.inputTokens,
        'gen_ai.usage.output_tokens': e.outputTokens,
        'app.finops.surface': e.surface,
        'app.finops.stage': e.stage,
        'app.finops.tier': e.tier,
        'app.finops.billable': e.billable,
        'app.finops.estimated': e.estimated,
        'app.finops.fallback_reason': e.fallbackReason,
        'app.finops.cost.usd': e.costUsd,
        'app.finops.cost.price_sheet_rev': e.priceSheetRev,
        'app.team': e.tags.team,
        'app.feature': e.tags.feature,
        'app.tenant.id': e.tags.tenantId,
        'enduser.id': e.tags.userId,
      });
    },
  };
}

/** Fans out to several sinks. One failing sink does not stop the others. */
export function multiSink(...sinks: LedgerSink[]): LedgerSink {
  return {
    name: `multi(${sinks.map((s) => s.name).join(',')})`,
    write(e) {
      for (const s of sinks) {
        try {
          const r = s.write(e);
          if (r && typeof (r as Promise<void>).catch === 'function') {
            (r as Promise<void>).catch(() => {});
          }
        } catch {
          /* isolated per sink */
        }
      }
    },
    flush() {
      for (const s of sinks) {
        try {
          s.flush?.();
        } catch {
          /* best effort */
        }
      }
    },
  };
}

/** For the invariant test. Always throws; the ledger must absorb it. */
export function throwingSinkForTests(): LedgerSink {
  return {
    name: 'throwing',
    write() {
      throw new Error('sink is broken on purpose');
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Summary                                                                    */
/* ------------------------------------------------------------------------- */

export interface LedgerSummary {
  windowStart: number | null;
  windowEnd: number | null;
  entries: number;
  /** Distinct `requestId`s — the denominator you actually want for unit cost. */
  requests: number;
  sessions: number;

  totalCostUsd: number;
  /** Spend that a subscription absorbed. Real quota consumption, zero invoice. */
  notionalCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;

  bySurface: Record<string, DimensionTotal>;
  byStage: Record<string, DimensionTotal>;
  byModel: Record<string, DimensionTotal>;
  byProvider: Record<string, DimensionTotal>;
  byTier: Record<string, DimensionTotal>;
  byTeam: Record<string, DimensionTotal>;
  byTenant: Record<string, DimensionTotal>;
  byFallbackReason: Record<string, number>;

  /* derived unit economics — the numbers that change decisions */
  costPerRequest: number;
  costPerSession: number;
  /** cacheReadTokens / (inputTokens + cacheReadTokens). */
  cacheHitRate: number;
  /** Share of requests that used any fallback reason at all. */
  fallbackRate: number;
  /** Share of requests that returned a deterministic/degraded answer. */
  degradedRate: number;
  /** DEFECT SIGNAL. Any value above zero means an adapter is flying blind. */
  estimatedRate: number;
  /** Share of spend burned on attempt > 0. Teams are consistently surprised. */
  retryCostShare: number;
  /** Share of calls where servedModel !== requestedModel. */
  modelDriftRate: number;
  /** Share of spend priced from a THIRD-PARTY row. Caveat the report above ~0. */
  thirdPartyPricedShare: number;
}

export interface DimensionTotal {
  entries: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

/* ------------------------------------------------------------------------- */
/* The ledger                                                                 */
/* ------------------------------------------------------------------------- */

export interface LedgerOptions {
  /** Ring capacity. Default 2,000. Bigger is not better — see the audit-log note. */
  capacity?: number;
  sink?: LedgerSink;
  /** Injected so tests are deterministic and the core stays pure. */
  now?: () => number;
  /** Injected so tests are deterministic. Defaults to `node:crypto.randomUUID`. */
  idFactory?: () => string;
  /**
   * Where the ledger's own failures go. Deliberately NOT `console.error` by
   * default: a broken sink on a hot path would produce one log line per request
   * and drown the signal it is trying to give you. Counters are in `health()`.
   */
  onInternalError?: (err: unknown, phase: 'record' | 'sink') => void;
}

export interface Ledger {
  record(input: LedgerInput): void;
  summarize(filter?: SummaryFilter): LedgerSummary;
  recent(limit?: number): LedgerEntry[];
  health(): LedgerHealth;
  flush(): Promise<void>;
  clear(): void;
}

export interface SummaryFilter {
  since?: number;
  until?: number;
  surface?: string;
  tenantId?: string;
  team?: string;
  agentId?: string;
  sessionId?: string;
}

export interface LedgerHealth {
  entriesInRing: number;
  capacity: number;
  /** True once the ring has wrapped — `summarize()` no longer covers all history. */
  wrapped: boolean;
  sink: string;
  sinkFailures: number;
  recordFailures: number;
  droppedEntries: number;
}

export function createLedger(options: LedgerOptions = {}): Ledger {
  const capacity = Math.max(1, options.capacity ?? 2000);
  const sink = options.sink ?? nullSink();
  const now = options.now ?? (() => Date.now());
  const idFactory = options.idFactory ?? defaultIdFactory();
  const onInternalError = options.onInternalError;

  const ring: LedgerEntry[] = new Array(capacity);
  let head = 0;
  let size = 0;
  let wrapped = false;
  let sinkFailures = 0;
  let recordFailures = 0;
  let droppedEntries = 0;

  function note(err: unknown, phase: 'record' | 'sink') {
    if (!onInternalError) return;
    try {
      onInternalError(err, phase);
    } catch {
      /* an error reporter that throws is not going to get a second chance */
    }
  }

  function record(input: LedgerInput): void {
    // The whole body is inside one try. This function is called on the response
    // path of every LLM request in the application; there is no failure here that
    // is worth a user-visible error.
    try {
      const entry: LedgerEntry = {
        id: input.id ?? idFactory(),
        ts: input.ts ?? now(),
        requestId: input.requestId,
        traceId: input.traceId,
        spanId: input.spanId,
        surface: input.surface,
        stage: input.stage,
        tier: input.tier,
        provider: input.provider,
        requestedModel: input.requestedModel,
        servedModel: input.servedModel,
        inputTokens: num(input.inputTokens),
        outputTokens: num(input.outputTokens),
        cacheReadTokens: num(input.cacheReadTokens),
        cacheWriteTokens: num(input.cacheWriteTokens),
        reasoningTokens:
          input.reasoningTokens === null || input.reasoningTokens === undefined
            ? null
            : num(input.reasoningTokens),
        reasoningInOutput: !!input.reasoningInOutput,
        costUsd: num(input.costUsd),
        notionalCostUsd:
          input.notionalCostUsd === undefined ? undefined : num(input.notionalCostUsd),
        billable: input.billable !== false,
        estimated: !!input.estimated,
        priceSheetRev: input.priceSheetRev,
        priceConfidence: input.priceConfidence,
        batch: input.batch,
        cacheLayer: input.cacheLayer,
        latencyMs: num(input.latencyMs),
        ok: input.ok !== false,
        fallbackReason: input.fallbackReason,
        degraded: input.degraded,
        attempt: input.attempt ?? 0,
        tags: input.tags ?? {},
      };

      if (size === capacity) {
        wrapped = true;
        droppedEntries++;
      }
      ring[head] = entry;
      head = (head + 1) % capacity;
      if (size < capacity) size++;

      dispatch(entry);
    } catch (err) {
      recordFailures++;
      note(err, 'record');
    }
  }

  /**
   * Sink dispatch on a microtask. Two reasons, both load-bearing:
   *  - the caller's `record()` returns before any I/O is attempted, so a slow or
   *    hung sink cannot add latency to a user-facing request;
   *  - a synchronous throw from the sink lands inside this queued function, not
   *    inside `record()`'s call frame, so it cannot escape even if the try above
   *    were later refactored away.
   */
  function dispatch(entry: LedgerEntry) {
    queueMicrotask(() => {
      try {
        const r = sink.write(entry);
        if (r && typeof (r as Promise<void>).then === 'function') {
          (r as Promise<void>).catch((err) => {
            sinkFailures++;
            note(err, 'sink');
          });
        }
      } catch (err) {
        sinkFailures++;
        note(err, 'sink');
      }
    });
  }

  function snapshot(): LedgerEntry[] {
    const out: LedgerEntry[] = [];
    const start = size === capacity ? head : 0;
    for (let i = 0; i < size; i++) out.push(ring[(start + i) % capacity]);
    return out;
  }

  function summarize(filter: SummaryFilter = {}): LedgerSummary {
    try {
      return buildSummary(snapshot().filter((e) => matches(e, filter)));
    } catch (err) {
      note(err, 'record');
      return buildSummary([]);
    }
  }

  return {
    record,
    summarize,
    recent(limit = 50) {
      const all = snapshot();
      return all.slice(Math.max(0, all.length - limit));
    },
    health() {
      return {
        entriesInRing: size,
        capacity,
        wrapped,
        sink: sink.name,
        sinkFailures,
        recordFailures,
        droppedEntries,
      };
    },
    async flush() {
      try {
        await sink.flush?.();
      } catch (err) {
        sinkFailures++;
        note(err, 'sink');
      }
    },
    clear() {
      head = 0;
      size = 0;
      wrapped = false;
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function matches(e: LedgerEntry, f: SummaryFilter): boolean {
  if (f.since !== undefined && e.ts < f.since) return false;
  if (f.until !== undefined && e.ts > f.until) return false;
  if (f.surface && e.surface !== f.surface) return false;
  if (f.tenantId && e.tags.tenantId !== f.tenantId) return false;
  if (f.team && e.tags.team !== f.team) return false;
  if (f.agentId && e.tags.agentId !== f.agentId) return false;
  if (f.sessionId && e.tags.sessionId !== f.sessionId) return false;
  return true;
}

function bump(
  bucket: Record<string, DimensionTotal>,
  key: string | undefined,
  e: LedgerEntry,
) {
  if (!key) return;
  const t = (bucket[key] ??= {
    entries: 0,
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
  });
  t.entries++;
  t.costUsd += e.costUsd;
  t.inputTokens += e.inputTokens;
  t.outputTokens += e.outputTokens;
}

export function buildSummary(entries: LedgerEntry[]): LedgerSummary {
  const s: LedgerSummary = {
    windowStart: entries.length ? entries[0].ts : null,
    windowEnd: entries.length ? entries[entries.length - 1].ts : null,
    entries: entries.length,
    requests: 0,
    sessions: 0,
    totalCostUsd: 0,
    notionalCostUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    bySurface: {},
    byStage: {},
    byModel: {},
    byProvider: {},
    byTier: {},
    byTeam: {},
    byTenant: {},
    byFallbackReason: {},
    costPerRequest: 0,
    costPerSession: 0,
    cacheHitRate: 0,
    fallbackRate: 0,
    degradedRate: 0,
    estimatedRate: 0,
    retryCostShare: 0,
    modelDriftRate: 0,
    thirdPartyPricedShare: 0,
  };

  const requestIds = new Set<string>();
  const sessionIds = new Set<string>();
  const fallbackRequests = new Set<string>();
  const degradedRequests = new Set<string>();
  let retryCost = 0;
  let thirdPartyCost = 0;
  let estimatedEntries = 0;
  let driftEntries = 0;

  for (const e of entries) {
    s.totalCostUsd += e.costUsd;
    s.notionalCostUsd += e.notionalCostUsd ?? 0;
    s.inputTokens += e.inputTokens;
    s.outputTokens += e.outputTokens;
    s.cacheReadTokens += e.cacheReadTokens;
    s.cacheWriteTokens += e.cacheWriteTokens;
    s.reasoningTokens += e.reasoningTokens ?? 0;

    if (e.requestId) requestIds.add(e.requestId);
    if (e.tags.sessionId) sessionIds.add(e.tags.sessionId);
    if (e.fallbackReason) {
      fallbackRequests.add(e.requestId);
      s.byFallbackReason[e.fallbackReason] =
        (s.byFallbackReason[e.fallbackReason] ?? 0) + 1;
    }
    if (e.degraded) degradedRequests.add(e.requestId);
    if ((e.attempt ?? 0) > 0) retryCost += e.costUsd;
    if (e.priceConfidence === 'THIRD-PARTY') thirdPartyCost += e.costUsd;
    if (e.estimated) estimatedEntries++;
    if (e.servedModel && e.requestedModel && e.servedModel !== e.requestedModel) {
      driftEntries++;
    }

    bump(s.bySurface, e.surface, e);
    bump(s.byStage, e.stage ? `${e.surface}:${e.stage}` : undefined, e);
    bump(s.byModel, e.servedModel, e);
    bump(s.byProvider, e.provider, e);
    bump(s.byTier, e.tier, e);
    bump(s.byTeam, e.tags.team, e);
    bump(s.byTenant, e.tags.tenantId, e);
  }

  s.requests = requestIds.size;
  s.sessions = sessionIds.size;
  const reqDiv = s.requests || 1;
  const sesDiv = s.sessions || 1;
  const entDiv = s.entries || 1;
  const costDiv = s.totalCostUsd || 1;
  const inDiv = s.inputTokens + s.cacheReadTokens || 1;

  s.costPerRequest = s.totalCostUsd / reqDiv;
  s.costPerSession = s.totalCostUsd / sesDiv;
  s.cacheHitRate = s.cacheReadTokens / inDiv;
  s.fallbackRate = fallbackRequests.size / reqDiv;
  s.degradedRate = degradedRequests.size / reqDiv;
  s.estimatedRate = estimatedEntries / entDiv;
  s.retryCostShare = retryCost / costDiv;
  s.modelDriftRate = driftEntries / entDiv;
  s.thirdPartyPricedShare = thirdPartyCost / costDiv;

  return s;
}

function defaultIdFactory(): () => string {
  let counter = 0;
  let randomUUID: (() => string) | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    randomUUID = (require('node:crypto') as typeof import('node:crypto')).randomUUID;
  } catch {
    randomUUID = null;
  }
  return () => {
    if (randomUUID) {
      try {
        return randomUUID();
      } catch {
        /* fall through to the counter */
      }
    }
    counter += 1;
    return `led_${Date.now().toString(36)}_${counter.toString(36)}`;
  };
}
