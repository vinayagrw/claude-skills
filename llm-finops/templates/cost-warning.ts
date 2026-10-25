/**
 * cost-warning.ts — the once-per-process startup cost notice.
 *
 * WHAT
 *   On the first metered call, one non-fatal log line comparing the configured
 *   primary model's per-MTok rates against the cheapest generally-available entry
 *   in the price sheet, with the delta and a pointer at the measurement script.
 *
 * WHY THIS EXISTS AT ALL
 *   The default provider chain shipped by this skill was chosen partly on cost and
 *   partly on a standing preference. That is a legitimate way to choose, but it
 *   means the default is not automatically the cheapest option in the sheet, and
 *   a tradeoff documented in a reference file is a tradeoff nobody reads.
 *
 *   A log line in application startup output is read. So the tradeoff is stated
 *   where the cost is actually incurred, once, in the developer's own logs, with
 *   the current numbers rather than the ones that were true when the docs were
 *   written.
 *
 *   It says "delta on sticker price", NOT "you are overpaying". Sticker price is
 *   not cost per task: models differ in how many tokens they burn to complete the
 *   same work, sometimes by a large multiple, and a cheaper per-token model that
 *   needs twice the tokens is not cheaper. That is why the last line of the notice
 *   points at `scripts/compare-providers.mjs`, which measures tokens-per-task on a
 *   fixed fixture and multiplies by the dated price. The notice raises the
 *   question; the script answers it.
 *
 * FOUR THINGS IT MUST NEVER DO, ALL IMPLEMENTED RATHER THAN INTENDED
 *   1. Throw. Every path is inside a try/catch that swallows. This is
 *      instrumentation, and instrumentation that can break the response path
 *      eventually gets deleted by whoever is paged.
 *   2. Block. Synchronous, no I/O, no network, no awaits.
 *   3. Repeat. Once per process, guarded by a module-level flag. A line printed
 *      per request trains everyone to filter it, which is worse than not printing
 *      it — you lose the signal AND keep the noise.
 *   4. Invent. If the sheet is stale it says the sheet is stale. If the configured
 *      model is not in the sheet it says THAT, and stops. A comparison against a
 *      guessed rate would be exactly the confidently-wrong number this whole skill
 *      is built to prevent.
 *
 * HOW TO WIRE IT IN
 *   Nothing to do — `metered-llm.ts` calls `emitCostNotice()` on its first call.
 *   To silence it, set `costNotice: false` in `config/llm.ts`. To route it into a
 *   structured logger, pass `{ log: (m) => logger.info(m) }`.
 *
 * Dependencies: `./pricing.js` only.
 */

import { PRICES, PRICE_SHEET_REV, STALENESS_WARN_DAYS, priceSheetAgeDays, type PriceEntry } from './pricing.ts';

export interface CostNoticeConfig {
  primary: { provider: string; model: string };
}

export interface CostNoticeOptions {
  log?: (msg: string) => void;
  /** Injected for tests. Defaults to `new Date()`. */
  today?: Date;
  rows?: PriceEntry[];
  /**
   * Statuses excluded from "cheapest". Preview SKUs are excluded by default and
   * that exclusion is the point: a preview model is often cheaper precisely
   * because it can be withdrawn or repriced without notice, so recommending one
   * as the floor would be recommending the risk this skill teaches against.
   */
  excludeStatuses?: string[];
}

let emitted = false;

/** Test helper. Lets a suite assert the once-per-process behaviour. */
export function resetCostNoticeForTests(): void {
  emitted = false;
}

/**
 * Build the notice text without emitting it. Exported so it can be asserted in
 * tests and rendered into a health endpoint, and so the emitter stays trivial.
 *
 * Returns `null` when there is nothing worth saying (for example: the configured
 * primary IS the cheapest row).
 */
export function buildCostNotice(
  config: CostNoticeConfig,
  options: CostNoticeOptions = {},
): string | null {
  const rows = options.rows ?? PRICES;
  const today = options.today ?? new Date();
  const exclude = options.excludeStatuses ?? ['preview', 'deprecated', 'retire', 'legacy'];

  const lines: string[] = [];

  // --- staleness first: it qualifies everything that follows ---------------
  let age: number | null = null;
  try {
    age = priceSheetAgeDays(today);
  } catch {
    age = null;
  }
  if (age === null || !Number.isFinite(age)) {
    return (
      `[finops] price sheet revision "${PRICE_SHEET_REV}" could not be parsed, so no cost ` +
      'comparison is possible. Regenerate pricing.ts from references/sota-snapshot.md.'
    );
  }
  if (age > STALENESS_WARN_DAYS) {
    lines.push(
      `[finops] price sheet is ${age} days old (rev ${PRICE_SHEET_REV}, warn threshold ` +
        `${STALENESS_WARN_DAYS}). The comparison below is based on rates that may have moved; ` +
        're-verify against the vendors’ live pricing pages before quoting it anywhere.',
    );
  }

  // --- locate the configured primary ---------------------------------------
  const configured = findRow(rows, config.primary.model);
  if (!configured) {
    // Say what is actually true, and stop. No comparison against a guessed rate.
    return (
      `[finops] configured primary is ${config.primary.provider}:${config.primary.model}, which is ` +
      `not listed in price sheet rev ${PRICE_SHEET_REV}. No cost comparison can be made, and every ` +
      'call on this model will be recorded with estimated=true. Add the row to ' +
      'references/sota-snapshot.md and regenerate pricing.ts, or pin a listed model.'
    );
  }

  // --- cheapest generally-available row -------------------------------------
  const eligible = rows.filter((r) => {
    const s = (r.status ?? '').toLowerCase();
    return !exclude.some((x) => s.includes(x));
  });
  if (!eligible.length) return lines.length ? lines.join('\n') : null;

  const cheapest = eligible.reduce((a, b) => (b.inputPerMTok < a.inputPerMTok ? b : a));

  if (cheapest.modelId === configured.modelId) {
    lines.push(
      `[finops] primary = ${config.primary.provider}:${configured.modelId} — this is the cheapest ` +
        `generally-available entry in price sheet ${PRICE_SHEET_REV} on input rate. Sticker price is ` +
        'not cost per task: run `node scripts/compare-providers.mjs` to confirm on measured tokens.',
    );
    return lines.join('\n');
  }

  const inDelta = ratio(configured.inputPerMTok, cheapest.inputPerMTok);
  const outDelta = ratio(configured.outputPerMTok, cheapest.outputPerMTok);

  lines.push(
    `[finops] primary = ${config.primary.provider}:${configured.modelId} at ` +
      `${fmt(configured.inputPerMTok)} in / ${fmt(configured.outputPerMTok)} out per MTok (USD, ` +
      `price sheet ${PRICE_SHEET_REV}, confidence ${configured.confidence}).`,
  );
  lines.push(
    `         Cheapest GA entry in the sheet: ${cheapest.provider}:${cheapest.modelId} at ` +
      `${fmt(cheapest.inputPerMTok)} in / ${fmt(cheapest.outputPerMTok)} out. ` +
      `Delta: ${inDelta} input, ${outDelta} output.`,
  );
  lines.push(
    '         This is a STICKER-PRICE delta, not a cost-per-task delta — models differ in how many ' +
      'tokens they burn on the same work. Run `node scripts/compare-providers.mjs` to decide on ' +
      'measured tokens rather than list rates.',
  );

  return lines.join('\n');
}

/**
 * Emit the notice at most once per process. Never throws, under any circumstance,
 * including a caller-supplied `log` that throws.
 */
export function emitCostNotice(config: CostNoticeConfig, options: CostNoticeOptions = {}): void {
  if (emitted) return;
  emitted = true;
  try {
    const msg = buildCostNotice(config, options);
    if (!msg) return;
    const log = options.log ?? ((m: string) => console.warn(m));
    log(msg);
  } catch {
    // Deliberately silent. A cost notice that turns a startup into a crash — or
    // even into a stack trace in the logs — would be a strictly worse outcome
    // than the tradeoff going unmentioned.
  }
}

/* ------------------------------------------------------------------------- */

function findRow(rows: PriceEntry[], modelId: string): PriceEntry | null {
  const exact = rows.filter((r) => r.modelId === modelId);
  if (exact.length) {
    // Prefer the base row over a context-tier variant, so the notice compares
    // like with like rather than quoting a long-context surcharge band.
    return exact.find((r) => !r.contextTier) ?? exact[0];
  }
  let best: PriceEntry | null = null;
  for (const r of rows) {
    if (modelId.startsWith(r.modelId) && (!best || r.modelId.length > best.modelId.length)) best = r;
  }
  return best;
}

/** Rates are printed bare with the unit named in the sentence — the price sheet is the only place a currency symbol belongs. */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function ratio(a: number, b: number): string {
  if (!(b > 0)) return 'n/a';
  const r = a / b;
  if (r === 1) return 'parity';
  return `${r.toFixed(r < 10 ? 1 : 0)}x`;
}
