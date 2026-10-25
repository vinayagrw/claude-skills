/**
 * finops-routes.ts — OPTIONAL Fastify routes exposing the ledger, the cost
 * summary and health.
 *
 * ============================== OPTIONAL FILE ==============================
 * This is the ONLY file in the template set that knows any web framework exists.
 * Nothing else imports it, and it imports nothing that imports it back. Delete it
 * and everything else still compiles and runs.
 *
 * That isolation is deliberate. The reference implementation this generalizes had
 * its cost machinery accidentally coupled to one HTTP framework, which made
 * lifting it into an Express service a rewrite rather than a copy. Accidental
 * coupling is prevented by a test, not by a good intention — add an import scanner
 * to CI that fails if any file other than this one names a framework:
 *
 *   rg -l "fastify|express|next/server|hono" src/finops --glob '!**\/finops-routes.ts'
 *
 * On Express, Hono, Koa or a Next route handler, copy the four handler bodies —
 * they are a dozen lines each and depend only on `ledger`, `budget` and `llm`.
 * ==========================================================================
 *
 * WHY EXPOSE THIS AT ALL
 *   Because a cost number that lives only in a log file is a cost number nobody
 *   looks at until the invoice arrives. A `/finops/summary` endpoint is what turns
 *   metering into a dashboard, a demo talking point and a pre-sales artifact — and
 *   `/finops/health` is what makes the two limitations that matter (process-local
 *   budget counters, a stale price sheet) visible at runtime rather than
 *   discovered from an invoice.
 *
 * ============================== SECURITY ==================================
 * These routes expose spend, tenant identifiers and model configuration. They are
 * an internal or admin surface — never public. The plugin REFUSES to register
 * without an explicit `auth` hook or an explicit `insecure: true` acknowledgement,
 * because the realistic failure here is not a misconfigured firewall, it is
 * nobody having thought about it at all.
 *
 * `/finops/entries` can return prompts-adjacent attribution (tenant, user). Treat
 * its output as personal data: it is off unless you turn it on.
 * ==========================================================================
 *
 * HOW TO WIRE IT IN
 *   import { finopsRoutes } from './finops/finops-routes.ts';
 *   await app.register(finopsRoutes, {
 *     ledger, budget, llm,
 *     auth: async (req, reply) => { if (!isAdmin(req)) reply.code(403).send(); },
 *     exposeEntries: false,
 *   });
 */

import type { Ledger, SummaryFilter } from './ledger.ts';
import type { Budget } from './budget.ts';
import type { MeteredLlm } from './metered-llm.ts';
import { PRICE_SHEET_REV, SHEET_PROBLEMS, STALENESS_WARN_DAYS, priceSheetAgeDays } from './pricing.ts';

/**
 * Structurally-typed stand-ins for the Fastify types.
 *
 * Declared locally rather than imported so this file adds no dependency to the
 * package even when it is present in the tree. If you have Fastify installed,
 * replace these with `import type { FastifyInstance } from 'fastify'` — the shapes
 * are compatible.
 */
export interface MinimalRequest {
  query: Record<string, string | undefined>;
}
export interface MinimalReply {
  code(status: number): MinimalReply;
  send(payload: unknown): unknown;
  header(name: string, value: string): MinimalReply;
}
export interface MinimalApp {
  get(
    path: string,
    opts: { preHandler?: unknown } | ((req: MinimalRequest, reply: MinimalReply) => unknown),
    handler?: (req: MinimalRequest, reply: MinimalReply) => unknown,
  ): unknown;
}

export interface FinopsRoutesOptions {
  ledger: Ledger;
  budget?: Budget;
  llm?: MeteredLlm;
  /** Prefix for all routes. Default `/finops`. */
  prefix?: string;
  /** Auth guard, run before every handler. Required unless `insecure` is set. */
  auth?: (req: MinimalRequest, reply: MinimalReply) => unknown;
  /**
   * Expose raw ledger entries, which carry tenant and user identifiers.
   * Default false — opt in only for an authenticated internal surface.
   */
  exposeEntries?: boolean;
  /** Explicit acknowledgement that these routes are unauthenticated. */
  insecure?: boolean;
}

export async function finopsRoutes(app: MinimalApp, opts: FinopsRoutesOptions): Promise<void> {
  const prefix = opts.prefix ?? '/finops';
  const { ledger, budget, llm } = opts;

  if (!opts.auth && !opts.insecure) {
    throw new Error(
      'finopsRoutes was registered without an `auth` hook. These routes expose spend, tenant ' +
        'identifiers and model configuration and must not be public. Pass `auth`, or pass ' +
        '`insecure: true` to state deliberately that this instance is on a private network.',
    );
  }

  const guard = opts.auth ? { preHandler: opts.auth } : {};

  /**
   * Rolling cost summary from the in-memory ring.
   *
   * IMPORTANT AND WORTH SAYING ON THE WIRE: this is an OPERATIONAL window, not an
   * accounting total. The ring holds a bounded number of recent entries, so once
   * it has wrapped, this is "recent spend", not "spend this month" — and it resets
   * on restart. Bill from the sink's durable store. The response carries
   * `truncated` and `authoritative: false` so a dashboard built on it cannot claim
   * otherwise by accident.
   */
  app.get(`${prefix}/summary`, guard, async (req: MinimalRequest, reply: MinimalReply) => {
    const filter: SummaryFilter = {};
    if (req.query.since) filter.since = Number(req.query.since);
    if (req.query.until) filter.until = Number(req.query.until);
    if (req.query.surface) filter.surface = req.query.surface;
    if (req.query.tenantId) filter.tenantId = req.query.tenantId;
    if (req.query.team) filter.team = req.query.team;

    const summary = ledger.summarize(filter);
    const h = ledger.health();

    return reply.send({
      summary,
      priceSheetRev: PRICE_SHEET_REV,
      authoritative: false,
      truncated: h.wrapped,
      note: h.wrapped
        ? 'The ring buffer has wrapped: these totals cover only the most recent entries, not the ' +
          'full period. Use the ledger sink for accounting or chargeback.'
        : 'Operational window from the in-memory ring. Resets on process restart.',
      caveats: buildCaveats(summary.estimatedRate, summary.thirdPartyPricedShare),
    });
  });

  /**
   * Recent raw entries. Off by default — see the security note.
   */
  app.get(`${prefix}/entries`, guard, async (req: MinimalRequest, reply: MinimalReply) => {
    if (!opts.exposeEntries) {
      return reply.code(404).send({
        error: 'not_enabled',
        message:
          'Raw ledger entries carry tenant and end-user identifiers and are disabled by default. ' +
          'Set `exposeEntries: true` only behind authentication you trust.',
      });
    }
    const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 50)));
    return reply.send({ entries: ledger.recent(limit), priceSheetRev: PRICE_SHEET_REV });
  });

  /**
   * Health. The point of this endpoint is to surface the two limitations that are
   * otherwise invisible until they cost money: a process-local budget counter
   * (which makes a cap an N-times cap across replicas) and a stale price sheet
   * (which makes every number quietly historical).
   */
  app.get(`${prefix}/health`, guard, async (_req: MinimalRequest, reply: MinimalReply) => {
    const age = safeAge();
    const budgetHealth = budget?.health() ?? {
      mode: 'none',
      budgetStore: 'none',
      sharedCounter: false,
      warning: 'No budget is configured. Spend is metered but unbounded.',
    };

    const warnings: string[] = [];
    if (budgetHealth.warning) warnings.push(budgetHealth.warning);
    if (age !== null && age > STALENESS_WARN_DAYS) {
      warnings.push(
        `Price sheet is ${age} days old (rev ${PRICE_SHEET_REV}). Costs reported here are derived ` +
          'from rates that may have moved; re-verify before using them in a client-facing artifact.',
      );
    }
    for (const p of SHEET_PROBLEMS) warnings.push(`Price sheet sanity failure: ${p}`);

    const ok = warnings.length === 0;
    return reply.code(ok ? 200 : 200).send({
      ok,
      priceSheetRev: PRICE_SHEET_REV,
      priceSheetAgeDays: age,
      budgetMode: budgetHealth.mode,
      // Reported explicitly, by name, because "which store am I using" is the
      // question whose wrong answer makes a hard-stop cap silently inert.
      budgetStore: budgetHealth.budgetStore,
      sharedCounter: budgetHealth.sharedCounter,
      ledger: ledger.health(),
      llm: llm?.health() ?? null,
      warnings,
    });
  });

  /**
   * Budget status. Deliberately separate from `/health` so an alerting rule can
   * poll utilisation cheaply without pulling the whole diagnostic payload.
   */
  app.get(`${prefix}/budget`, guard, async (_req: MinimalRequest, reply: MinimalReply) => {
    if (!budget) return reply.code(404).send({ error: 'no_budget_configured' });
    const status = await budget.status();
    return reply.send({ ...status, ...budget.health() });
  });
}

function safeAge(): number | null {
  try {
    const a = priceSheetAgeDays();
    return Number.isFinite(a) ? a : null;
  } catch {
    return null;
  }
}

/**
 * Turn two defect signals into sentences a reader can act on.
 *
 * `estimatedRate` above zero means an adapter or a price row is missing and some
 * share of the reported cost is not a measurement. Reporting a total without
 * saying so is the false-precision failure this whole skill exists to prevent —
 * so the caveat travels with the number, in the same payload.
 */
function buildCaveats(estimatedRate: number, thirdPartyShare: number): string[] {
  const out: string[] = [];
  if (estimatedRate > 0) {
    out.push(
      `${(estimatedRate * 100).toFixed(1)}% of entries are flagged estimated — the provider ` +
        'returned no usage object, or the served model was absent from the price sheet. Treat this ' +
        'as a defect to fix, not a caveat to footnote: check /finops/health and the ' +
        'finops.price.unknown_model alerts.',
    );
  }
  if (thirdPartyShare > 0.1) {
    out.push(
      `${(thirdPartyShare * 100).toFixed(0)}% of reported spend was priced from third-party or ` +
        'unowned rate rows. Do not put this figure in a client-facing estimate without fetching ' +
        'the primary vendor sources first.',
    );
  }
  return out;
}
