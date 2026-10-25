/**
 * Price-sheet integrity tests: unknown-model alerting and the transposed-meter guard.
 *
 * Both failures covered here share one property, and it is the reason they are tests
 * rather than comments: THEY PRODUCE A PLAUSIBLE NUMBER. An unlisted model id priced at a
 * default rate does not crash — it quietly reports a cost for a system you do not have. A
 * transposed input/output pair does not crash either — it reports a several-fold overcharge
 * that looks like a busy month. Nothing about either looks wrong on a dashboard, which is
 * exactly why an assertion has to look for them.
 *
 * Run with the Node test runner:
 *   node --test templates/pricing.test.ts
 *
 * IMPORT EXTENSIONS: the whole template tree uses explicit `.ts` specifiers, because
 * Node's resolver does not remap a `.js` specifier onto a `.ts` file — with `.js` these
 * suites fail to load with ERR_MODULE_NOT_FOUND. Compiling with `tsc` under
 * `module: nodenext`? Set `rewriteRelativeImportExtensions: true` (TS 5.7+). Bundler or
 * `noEmit`? Set `allowImportingTsExtensions: true`. Under vitest/jest/tsx, nothing to do.
 * Only node:test and node:assert are imported otherwise — no external dependencies.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertSheetSane,
  computeCost,
  priceFor,
  BATCH_MULTIPLIER,
  DEFAULT_PRICE,
  PRICES,
  PRICE_SHEET_REV,
  SHEET_PROBLEMS,
  type PriceEntry,
  type UsageLike,
} from './pricing.ts';

const usage: UsageLike = {
  inputTokens: 1_000_000,
  outputTokens: 1_000_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  reasoningInOutput: true,
};

/** A row shaped like a real one, so the sanity checker sees a realistic object. */
const row = (over: Partial<PriceEntry>): PriceEntry => ({
  modelId: 'test-model',
  label: 'test-model',
  provider: 'test',
  inputPerMTok: 1,
  outputPerMTok: 5,
  cacheReadPerMTok: 0.1,
  cacheWrite5mPerMTok: null,
  cacheWrite1hPerMTok: null,
  status: 'GA',
  verified: '2026-07-19',
  effective: null,
  effectiveUntil: null,
  contextTier: null,
  source: 'TEST',
  confidence: 'high',
  ...over,
});

// ===========================================================================
// Unknown models must ALERT, not absorb
// ===========================================================================

describe('an unlisted model id fails loudly', () => {
  const unlisted = [
    'gemini-4.0-flash-lite', // a model that does not exist yet
    'claude-sonnet-9', // a future family
    'some-internal-deployment-name', // an Azure deployment alias nobody mapped
    '', // a served-model field the provider left empty
  ];

  it('never resolves an unlisted id to a real price row', () => {
    for (const id of unlisted) {
      const { entry, match } = priceFor(id);
      assert.equal(entry, null, `"${id}" must not resolve to a row`);
      assert.equal(match, 'default', `"${id}" must be reported as unmatched`);
    }
  });

  it('flags the resulting cost as estimated, with the lowest confidence', () => {
    for (const id of unlisted) {
      const r = computeCost(usage, { modelId: id });
      assert.equal(r.match, 'default');
      assert.equal(
        r.estimated,
        true,
        'estimated is the DEFECT SIGNAL the ledger aggregates into estimatedRate. A ' +
          'default-priced call that reported estimated:false would be indistinguishable ' +
          'from a correctly priced one, and the drift would survive every review',
      );
      assert.equal(r.confidence, 'low');
      assert.equal(r.entry, null);
    }
  });

  it('prices the unknown at the MOST EXPENSIVE rates in the sheet, never a cheap default', () => {
    const maxInput = Math.max(...PRICES.map((e) => e.inputPerMTok));
    const maxOutput = Math.max(...PRICES.map((e) => e.outputPerMTok));

    assert.ok(
      DEFAULT_PRICE.inputPerMTok >= maxInput && DEFAULT_PRICE.outputPerMTok >= maxOutput,
      'the fallback rate must sit at or above every row in the sheet. This is the entire ' +
        'alerting mechanism: an unpriced model has to surface as a spike someone ' +
        'investigates. A too-low default is how a silent model drift survives a full ' +
        'billing cycle — the number goes DOWN, and nobody investigates a saving',
    );

    const unknown = computeCost(usage, { modelId: 'gemini-4.0-flash-lite' });
    const cheapest = computeCost(usage, { modelId: cheapestModelId() });
    assert.ok(
      unknown.costUsd > cheapest.costUsd,
      'an unknown model must cost more than the cheapest known one, not less',
    );
  });

  it('resolves a KNOWN id exactly, so the alert cannot be dismissed as noise', () => {
    for (const e of PRICES) {
      const r = priceFor(e.modelId, { atDate: e.effective ?? '2026-07-19' });
      assert.notEqual(r.match, 'default', `${e.label} is in the sheet and must resolve`);
    }
  });

  it('resolves a partner-cloud id by containment', () => {
    // Bedrock and Azure ids wrap the base model id in region prefixes and version
    // suffixes. Those must resolve, or every partner-cloud call prices as unknown.
    const r = priceFor('global.anthropic.claude-opus-4-8-v1:0');
    assert.equal(r.match, 'alias');
    assert.equal(r.entry?.modelId, 'claude-opus-4-8');
  });

  it('picks the LONGEST containing id when several match', () => {
    const r = priceFor('eu.anthropic.claude-haiku-4-5-20251001-v1:0');
    assert.equal(r.entry?.modelId, 'claude-haiku-4-5-20251001');
  });

  /**
   * KNOWN GAP, pinned deliberately rather than fixed.
   *
   * The alias matcher resolves in ONE direction only: the queried id must CONTAIN a
   * sheet id. A shorter undated alias ('claude-haiku-4-5' against the dated row
   * 'claude-haiku-4-5-20251001') therefore does NOT resolve — it falls to the default.
   * The header comment on `priceFor` in pricing.ts cites exactly that pair as a
   * worked example, so the doc and the code disagree; the CODE is the safer of the two
   * and this test pins it.
   *
   * Why matching the other direction would be worse: a query for 'gemini-2.5-flash'
   * would then also match 'gemini-2.5-flash-lite' and could resolve to the CHEAPER row.
   * Under-pricing is the silent failure; over-pricing an unknown is the loud one. The
   * current behaviour fails loudly — expensive default, estimated: true — which is the
   * outcome this sheet is designed around.
   */
  it('an undated alias falls to the LOUD default, not to a cheaper neighbour', () => {
    const r = priceFor('claude-haiku-4-5');
    assert.equal(r.match, 'default');
    assert.equal(r.entry, null);
    assert.equal(computeCost(usage, { modelId: 'claude-haiku-4-5' }).estimated, true);
  });

  it('stamps the price-sheet revision on every result, priced or defaulted', () => {
    for (const id of ['gemini-3.1-flash-lite', 'gemini-4.0-flash-lite']) {
      assert.equal(computeCost(usage, { modelId: id }).priceSheetRev, PRICE_SHEET_REV);
    }
  });
});

// ===========================================================================
// The load-time transposed-meter guard
// ===========================================================================

describe('the load-time sanity assertion catches a transposed meter', () => {
  it('the shipped sheet is clean', () => {
    assert.deepEqual(
      SHEET_PROBLEMS,
      [],
      'a shipped sheet with a known problem is a sheet nobody read the output of',
    );
  });

  it('catches an input/output pair swapped upstream', () => {
    // This is not hypothetical: a partner cloud's retail price API returned the pair
    // swapped, reproduced across two independent fetches. A naive seeder would have
    // encoded a several-fold input overcharge and nothing would have crashed.
    const problems = assertSheetSane([row({ label: 'swapped', inputPerMTok: 5, outputPerMTok: 1 })]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /transposed/i);
    assert.match(problems[0], /swapped/, 'the label must name the offending row');
  });

  it('catches the equal-rate case, which a strict > check would miss', () => {
    const problems = assertSheetSane([row({ inputPerMTok: 3, outputPerMTok: 3 })]);
    assert.equal(problems.length, 1, 'no shipped model prices output at exactly the input rate');
  });

  it('catches a cache-read rate that is not below the input rate', () => {
    const problems = assertSheetSane([row({ inputPerMTok: 1, cacheReadPerMTok: 1 })]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /cache read/i);
  });

  it('passes a well-formed row, so the guard is not just always-true', () => {
    assert.deepEqual(assertSheetSane([row({})]), []);
  });

  it('accepts a row with no cache-read rate published', () => {
    assert.deepEqual(assertSheetSane([row({ cacheReadPerMTok: null })]), []);
  });

  it('holds for every row in the shipped sheet individually', () => {
    for (const e of PRICES) {
      assert.ok(
        e.outputPerMTok > e.inputPerMTok,
        `${e.label}: output must bill above input — the inverse is the transposition signature`,
      );
    }
  });

  it('a discount multiplier above 1 is caught, because a discount cannot cost more', () => {
    assert.ok(BATCH_MULTIPLIER > 0 && BATCH_MULTIPLIER < 1);
  });
});

// ===========================================================================
// Arithmetic that the two guards above are protecting
// ===========================================================================

describe('cost arithmetic', () => {
  it('prices input and output at their own rates', () => {
    const entry = PRICES.find((e) => e.modelId === 'gemini-3.1-flash-lite')!;
    const r = computeCost(usage, { modelId: entry.modelId });
    const expected = entry.inputPerMTok + entry.outputPerMTok; // one MTok of each
    assert.ok(Math.abs(r.costUsd - expected) < 1e-6);
  });

  it('adds reasoning tokens ONLY when the provider reports them as a sibling', () => {
    const nested = computeCost({ ...usage, reasoningTokens: 500_000, reasoningInOutput: true }, { modelId: 'gemini-3.1-flash-lite' });
    const additive = computeCost({ ...usage, reasoningTokens: 500_000, reasoningInOutput: false }, { modelId: 'gemini-3.1-flash-lite' });
    assert.ok(additive.costUsd > nested.costUsd, 'an additive provider bills thoughts on top');
    assert.equal(
      nested.costUsd,
      computeCost(usage, { modelId: 'gemini-3.1-flash-lite' }).costUsd,
      'a nested breakdown must not be added again — that double-charges every thinking token',
    );
  });

  it('reprices correctly on both sides of a scheduled change date', () => {
    // The effective-date axis: a dated step-up must price correctly with no code deploy.
    const before = computeCost(usage, { modelId: 'claude-sonnet-5', atDate: '2026-08-31' });
    const after = computeCost(usage, { modelId: 'claude-sonnet-5', atDate: '2026-09-02' });
    assert.notEqual(before.entry?.label, after.entry?.label);
    assert.ok(after.costUsd > before.costUsd, 'the scheduled increase must actually take effect');
  });
});

function cheapestModelId(): string {
  return PRICES.slice().sort((a, b) => a.inputPerMTok + a.outputPerMTok - (b.inputPerMTok + b.outputPerMTok))[0].modelId;
}
