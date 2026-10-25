#!/usr/bin/env node
/**
 * compare-providers.mjs — rank providers on MEASURED cost per task, not sticker rate.
 *
 * WHY THIS IS A FIRST-CLASS DELIVERABLE AND NOT A FOOTNOTE.
 *
 * Sticker price per million tokens is not spend. Two independent effects break naive
 * comparison, and both push in the same direction:
 *
 *   1. TOKENIZER INFLATION. Recent frontier models emit measurably more tokens for
 *      identical text than their predecessors. A model with a lower posted rate can bill
 *      more for the same work.
 *   2. TOKENS PER TASK. In agentic settings the same task consumed roughly 65% more input
 *      tokens on one assistant than another. A model 30% cheaper per token that burns 65%
 *      more tokens is MORE expensive.
 *
 * So a decision made on posted rates is a decision made on the wrong number. This script
 * applies per-provider inflation factors to a workload shape, prices it against the dated
 * snapshot, and ranks on cost per task.
 *
 * It also exists so the default-provider choice stays RE-DECIDABLE. Prices move on dates
 * you can already name. When they do, re-run this instead of re-arguing — that is the
 * whole point of building the comparison as a script rather than writing the conclusion
 * into a document that will quietly expire.
 *
 * HONEST LIMITS, because a comparison tool that overstates its precision is worse than
 * none: the inflation factors are the best available published figures, not measurements
 * of YOUR workload. They are medium-confidence at best. Override them with --inflation
 * once you have real numbers from your own ledger — which is exactly what the ledger is
 * for. Latency, quality and output-verbosity differences are NOT modelled here.
 *
 * Node builtins only.
 */

import { freshness, isSeedable, loadSnapshot, toIso } from './lib/snapshot.mjs';

const HELP = `
compare-providers.mjs — measured cost per task across providers, from the dated snapshot

USAGE
  node scripts/compare-providers.mjs [options]

WORKLOAD SHAPE
  --calls-per-day <n>     Model calls per day.                    (default: 10000)
  --input-tokens <n>      Average input tokens per call.          (default: 4000)
  --output-tokens <n>     Average output tokens per call.         (default: 600)
  --cache-hit-rate <0-1>  Share of INPUT tokens served from cache. (default: 0)
                          Cache reads are billed at the cached rate; a model with no
                          published cached rate is billed at full input.
  --reasoning-tokens <n>  Average reasoning tokens per call.      (default: 0)
                          Billed as output. On providers that report reasoning as a
                          sibling rather than a subset this is additive spend you will
                          not see in the output count.
  --latency <mode>        interactive | batch                     (default: interactive)
                          batch applies the asynchronous discount. Ask the triage
                          question first: is a human waiting for this response right now?

FILTERS AND TUNING
  --provider <name>       Restrict to a provider (repeatable): anthropic, google, openai.
  --ga-only               Exclude Preview SKUs.  (default: on — see --include-preview)
  --include-preview       Include Preview SKUs, which are cheaper precisely because they
                          can be withdrawn mid-quarter. Two were, within eight weeks.
  --inflation <p=f>       Override the tokens-per-task factor for a provider (repeatable),
                          e.g. --inflation google=1.4. Use YOUR ledger's numbers.
  --no-inflation          Compare on raw sticker rates. Shows how misleading that is.
  --top <n>               Show only the n cheapest rows.           (default: 12)
  --json                  Machine-readable output.
  --help                  This text.

EXIT CODES
  0 ranked | 2 ranked, but the cheapest row is stale or unquotable | 4 could not run
`;

/**
 * Tokens-per-task inflation, relative to a 1.0 baseline. These come from the snapshot's
 * non-price SOTA section and are MEDIUM confidence: consistently reported, but not a
 * single published vendor number. They are applied to input tokens, because that is where
 * the measured agentic difference was observed.
 *
 * These are not dollar figures, so they live here rather than in the price sheet — but
 * they are just as capable of being wrong, and they are labelled accordingly in output.
 */
const DEFAULT_INFLATION = {
  google: 1.65, // measured on one matched agentic task; the single largest published gap
  anthropic: 1.3, // ~30% tokenizer inflation on the current frontier generation
  openai: 1.0, // no published matched-task measurement — treated as the baseline
};
const INFLATION_CONFIDENCE = 'medium — published/derived figures, NOT measurements of your workload';

function parseArgs(argv) {
  const o = {
    callsPerDay: 10000,
    inputTokens: 4000,
    outputTokens: 600,
    reasoningTokens: 0,
    cacheHitRate: 0,
    latency: 'interactive',
    providers: [],
    includePreview: false,
    inflation: { ...DEFAULT_INFLATION },
    useInflation: true,
    top: 12,
    json: false,
  };
  const num = (v, name) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number, got: ${v}`);
    return n;
  };
  try {
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--help' || a === '-h') return { help: true };
      else if (a === '--calls-per-day') o.callsPerDay = num(argv[++i], a);
      else if (a === '--input-tokens') o.inputTokens = num(argv[++i], a);
      else if (a === '--output-tokens') o.outputTokens = num(argv[++i], a);
      else if (a === '--reasoning-tokens') o.reasoningTokens = num(argv[++i], a);
      else if (a === '--cache-hit-rate') {
        o.cacheHitRate = num(argv[++i], a);
        if (o.cacheHitRate > 1) throw new Error('--cache-hit-rate is a fraction between 0 and 1');
      } else if (a === '--latency') {
        o.latency = String(argv[++i]);
        if (!['interactive', 'batch'].includes(o.latency)) throw new Error('--latency must be interactive or batch');
      } else if (a === '--provider') o.providers.push(String(argv[++i]).toLowerCase());
      else if (a === '--include-preview') o.includePreview = true;
      else if (a === '--ga-only') o.includePreview = false;
      else if (a === '--no-inflation') o.useInflation = false;
      else if (a === '--inflation') {
        const [p, f] = String(argv[++i]).split('=');
        o.inflation[p.toLowerCase()] = num(f, '--inflation factor');
      } else if (a === '--top') o.top = num(argv[++i], a);
      else if (a === '--json') o.json = true;
      else return { error: `Unknown argument: ${a}` };
    }
  } catch (err) {
    return { error: err.message };
  }
  return o;
}

const BATCH_MULTIPLIER = 0.5;

function costForRow(row, o) {
  const inflation = o.useInflation ? o.inflation[row.provider] ?? 1 : 1;

  const rawInput = o.inputTokens * inflation;
  const cachedInput = rawInput * o.cacheHitRate;
  const freshInput = rawInput - cachedInput;

  // Reasoning is billed at the output rate everywhere. Whether it is already inside the
  // reported output count is a per-adapter question; for a forward projection the user
  // supplies it separately, so it is always additive here.
  const billableOutput = o.outputTokens + o.reasoningTokens;

  const cachedRate = row.cacheReadPerMTok ?? row.inputPerMTok;
  const per = (tok, rate) => (tok / 1_000_000) * rate;

  let perCall = per(freshInput, row.inputPerMTok) + per(billableOutput, row.outputPerMTok) + per(cachedInput, cachedRate);

  if (o.latency === 'batch') perCall *= BATCH_MULTIPLIER;

  return {
    perCall,
    perDay: perCall * o.callsPerDay,
    perMonth: perCall * o.callsPerDay * 30,
    inflation,
    effectiveInputTokens: rawInput,
    cachedRateUsed: cachedRate,
    hasPublishedCacheRate: row.cacheReadPerMTok !== null,
  };
}

const money = (n) => (n < 0.01 ? n.toFixed(6) : n < 1 ? n.toFixed(4) : n.toFixed(2));

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (o.error) {
    process.stderr.write(`${o.error}\n\nRun with --help for usage.\n`);
    return 4;
  }

  let snapshot;
  try {
    snapshot = loadSnapshot();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 4;
  }

  const today = toIso();
  const rows = snapshot.prices
    .filter(isSeedable)
    .filter((r) => r.inputPerMTok !== null && r.outputPerMTok !== null)
    // A row not yet in force, or superseded, is not a thing you can buy today.
    .filter((r) => !r.effective || r.effective <= today)
    .filter((r) => (o.includePreview ? true : !/preview/i.test(r.status)))
    .filter((r) => !/deprecat|retire/i.test(r.status))
    .filter((r) => (o.providers.length ? o.providers.includes(r.provider) : true))
    // Context-tiered rows: pick the tier matching this workload's prompt size.
    .filter((r) => {
      if (!r.contextTier) return true;
      const t = r.contextTier.maxPromptTokens;
      const p = o.inputTokens;
      return r.contextTier.op === '<=' || r.contextTier.op === '<' ? p <= t : p > t;
    });

  if (rows.length === 0) {
    process.stderr.write('No priceable rows matched those filters. Loosen --provider, or try --include-preview.\n');
    return 4;
  }

  const ranked = rows
    .map((r) => ({ row: r, cost: costForRow(r, o), fresh: freshness(r) }))
    .sort((a, b) => a.cost.perCall - b.cost.perCall);

  const shown = ranked.slice(0, o.top);
  const cheapest = ranked[0];
  const cheapestUnquotable = cheapest.fresh.state === 'STALE' || cheapest.fresh.state === 'KNOWN-WRONG';

  if (o.json) {
    process.stdout.write(
      JSON.stringify(
        {
          priceSheetRev: snapshot.snapshotDate,
          workload: {
            callsPerDay: o.callsPerDay,
            inputTokens: o.inputTokens,
            outputTokens: o.outputTokens,
            reasoningTokens: o.reasoningTokens,
            cacheHitRate: o.cacheHitRate,
            latency: o.latency,
          },
          inflationApplied: o.useInflation ? o.inflation : null,
          inflationConfidence: o.useInflation ? INFLATION_CONFIDENCE : null,
          results: shown.map((x) => ({
            model: x.row.label,
            provider: x.row.provider,
            status: x.row.status,
            verified: x.row.verified,
            confidence: x.row.confidence,
            freshness: x.fresh.state,
            inflationFactor: x.cost.inflation,
            costPerCall: x.cost.perCall,
            costPerDay: x.cost.perDay,
            costPerMonth: x.cost.perMonth,
          })),
        },
        null,
        2
      ) + '\n'
    );
    return cheapestUnquotable ? 2 : 0;
  }

  const out = [];
  out.push(`Cost per task — ranked on measured tokens, not sticker rate`);
  out.push(`price sheet rev ${snapshot.snapshotDate}, evaluated ${today}`);
  out.push('');
  out.push(
    `WORKLOAD  ${o.callsPerDay.toLocaleString()} calls/day, ${o.inputTokens} in + ${o.outputTokens} out` +
      `${o.reasoningTokens ? ` + ${o.reasoningTokens} reasoning` : ''} tokens/call, ` +
      `cache hit ${Math.round(o.cacheHitRate * 100)}%, ${o.latency}${o.latency === 'batch' ? ' (async discount applied)' : ''}`
  );
  if (o.useInflation) {
    const f = Object.entries(o.inflation)
      .map(([p, v]) => `${p} ${v}x`)
      .join(', ');
    out.push(`INFLATION applied to input tokens: ${f}`);
    out.push(`          confidence: ${INFLATION_CONFIDENCE}`);
  } else {
    out.push(`INFLATION disabled — this ranks on sticker rate alone, which is the comparison`);
    out.push(`          this script exists to correct. Treat the ordering as untrustworthy.`);
  }
  out.push('');
  out.push(`  ${'rank'.padEnd(5)}${'model'.padEnd(34)}${'per call'.padStart(12)}${'per day'.padStart(12)}${'per month'.padStart(12)}  ${'infl'.padStart(5)}  freshness`);
  out.push(`  ${'-'.repeat(96)}`);

  shown.forEach((x, i) => {
    const flag = x.fresh.state === 'FRESH' ? '' : `  <- ${x.fresh.state}`;
    out.push(
      `  ${String(i + 1).padEnd(5)}${x.row.label.slice(0, 33).padEnd(34)}` +
        `${money(x.cost.perCall).padStart(12)}${money(x.cost.perDay).padStart(12)}${money(x.cost.perMonth).padStart(12)}` +
        `  ${String(x.cost.inflation).padStart(5)}  ${x.row.confidence}${flag}`
    );
  });
  out.push('');
  out.push('  All figures USD. Cross-check any number you quote against references/sota-snapshot.md,');
  out.push('  which is the only file in this skill carrying literal prices.');

  // Where cache assumptions are doing heavy lifting, say so — a cache-hit rate assumed
  // rather than measured is the most common way one of these projections goes wrong.
  if (o.cacheHitRate > 0) {
    const noRate = shown.filter((x) => !x.cost.hasPublishedCacheRate);
    if (noRate.length) {
      out.push('');
      out.push(`  NOTE: ${noRate.length} row(s) have no published cached-read rate and were billed at full`);
      out.push(`  input. Their cost here is an UPPER bound: ${noRate.map((x) => x.row.label).slice(0, 4).join(', ')}`);
    }
    if (o.cacheHitRate >= 0.5) {
      out.push('');
      out.push(`  A ${Math.round(o.cacheHitRate * 100)}% cache hit rate is a strong assumption. It holds only with a`);
      out.push('  byte-identical stable prefix and nothing volatile ahead of the breakpoint. If you have');
      out.push('  not verified a nonzero cache-read count in real traffic, rerun with --cache-hit-rate 0');
      out.push('  and treat the gap between the two runs as the value of getting caching right.');
    }
  }

  const upcoming = snapshot.scheduledChanges.filter((c) => c.date >= today).slice(0, 3);
  if (upcoming.length) {
    out.push('');
    out.push('  SCHEDULED CHANGES that will move this ranking — a model built today is wrong on these dates:');
    for (const c of upcoming) out.push(`    ${c.date}  ${c.event.slice(0, 90)}`);
  }

  if (cheapestUnquotable) {
    out.push('');
    out.push(`  WARNING: the top-ranked row is ${cheapest.fresh.state} (${cheapest.fresh.reason}).`);
    out.push('  Do not put this ranking in a client-facing artifact until you have re-verified it.');
    out.push('  Run: node scripts/check-prices.mjs');
  }

  out.push('');
  out.push('  Cost is one axis. This tool does not model quality, latency, output verbosity or');
  out.push('  cache-invalidation risk from switching providers mid-session — and that last one');
  out.push('  routinely costs more than the rate difference it was chasing.');

  process.stdout.write(out.join('\n') + '\n');
  return cheapestUnquotable ? 2 : 0;
}

process.exit(main());
