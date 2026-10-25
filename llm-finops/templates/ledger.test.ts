/**
 * Ledger resilience tests — "instrumentation never breaks the response path", implemented
 * and proven rather than asserted in a comment.
 *
 * The header of ledger.ts states two invariants and then says: "Test both: inject
 * `throwingSinkForTests()` and assert the response is unchanged and
 * `health().sinkFailures > 0`. If that test does not exist, the invariant is an intention,
 * not a property." This file is that test.
 *
 * Why it matters more than it looks: a metering layer that can throw gets deleted by
 * whoever is on call the first time it takes down a request — and then the application has
 * no instrumentation at all. The cost of a broken sink must be a counter going up, never a
 * user seeing an error.
 *
 * Run with the Node test runner:
 *   node --test templates/ledger.test.ts
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
  callbackSink,
  createLedger,
  multiSink,
  nullSink,
  throwingSinkForTests,
  type LedgerEntry,
  type LedgerInput,
  type LedgerSink,
} from './ledger.ts';

/** Sink dispatch is deferred to a microtask, so drain it before asserting on counters. */
const drain = () => new Promise<void>((r) => setTimeout(r, 0));

let seq = 0;
function entry(over: Partial<LedgerInput> = {}): LedgerInput {
  seq += 1;
  return {
    requestId: `req_${seq}`,
    surface: 'chat',
    tier: 'primary',
    provider: 'test',
    requestedModel: 'model-a',
    servedModel: 'model-a',
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: null,
    reasoningInOutput: true,
    costUsd: 1,
    billable: true,
    estimated: false,
    latencyMs: 10,
    ok: true,
    tags: {},
    ...over,
  };
}

/** Deterministic ids and clock — no crypto, no wall clock, no flake. */
function ledgerWith(sink: LedgerSink, capacity?: number) {
  let n = 0;
  let t = 1_000;
  return createLedger({
    sink,
    capacity,
    now: () => (t += 1),
    idFactory: () => `id_${++n}`,
  });
}

// ===========================================================================
// A throwing sink must not propagate
// ===========================================================================

describe('a sink that throws is absorbed, never propagated', () => {
  it('record() does not throw', () => {
    const ledger = ledgerWith(throwingSinkForTests());
    // If this line can throw, every LLM call in the application can throw for a
    // bookkeeping reason. That is the defect this whole file exists to rule out.
    assert.doesNotThrow(() => ledger.record(entry()));
  });

  it('counts the failure instead, so a broken sink is visible without being fatal', async () => {
    const ledger = ledgerWith(throwingSinkForTests());
    ledger.record(entry());
    await drain();

    const h = ledger.health();
    assert.ok(h.sinkFailures > 0, 'silence here would mean a dead sink is indistinguishable from a working one');
    assert.equal(h.recordFailures, 0, 'the sink failed; the record path did not');
    assert.equal(h.sink, 'throwing');
  });

  it('absorbs an ASYNC sink rejection too', async () => {
    const rejecting: LedgerSink = { name: 'rejecting', write: () => Promise.reject(new Error('shipper down')) };
    const ledger = ledgerWith(rejecting);
    ledger.record(entry());
    await drain();
    assert.ok(ledger.health().sinkFailures > 0, 'an unhandled rejection here would crash the process');
  });

  it('routes the error to onInternalError rather than to the caller', async () => {
    const seen: Array<{ phase: string }> = [];
    const ledger = createLedger({
      sink: throwingSinkForTests(),
      onInternalError: (_err, phase) => seen.push({ phase }),
    });
    ledger.record(entry());
    await drain();
    assert.deepEqual(seen.map((s) => s.phase), ['sink']);
  });

  it('survives an onInternalError reporter that itself throws', async () => {
    const ledger = createLedger({
      sink: throwingSinkForTests(),
      onInternalError: () => {
        throw new Error('the error reporter is also broken');
      },
    });
    assert.doesNotThrow(() => ledger.record(entry()));
    await drain();
    assert.ok(ledger.health().sinkFailures > 0);
  });

  it('flush() absorbs a throwing flush', async () => {
    const ledger = ledgerWith({
      name: 'bad-flush',
      write() {},
      flush() {
        throw new Error('flush failed');
      },
    });
    ledger.record(entry());
    await ledger.flush();
    assert.ok(ledger.health().sinkFailures > 0);
  });
});

// ===========================================================================
// A throwing sink must not alter the response path
// ===========================================================================

describe('a throwing sink does not alter the response path', () => {
  it('record() returns BEFORE the sink is touched at all', () => {
    let writes = 0;
    const ledger = ledgerWith(
      callbackSink('counting', () => {
        writes += 1;
      }),
    );
    ledger.record(entry());
    assert.equal(
      writes,
      0,
      'dispatch is on a microtask, so no sink I/O — however slow or hung — can land inside ' +
        'the caller frame and add latency to a user-facing request',
    );
  });

  it('does no I/O inline even when the sink is the throwing one', () => {
    const ledger = ledgerWith(throwingSinkForTests());
    ledger.record(entry());
    assert.equal(
      ledger.health().sinkFailures,
      0,
      'the throw has not happened yet — it happens on the microtask, outside the response path',
    );
  });

  it('the in-memory record is complete regardless of what the sink does', async () => {
    const ledger = ledgerWith(throwingSinkForTests());
    ledger.record(entry({ costUsd: 2.5, surface: 'summarize' }));
    await drain();

    const [e] = ledger.recent();
    assert.equal(e.costUsd, 2.5);
    assert.equal(e.surface, 'summarize');
    assert.equal(ledger.summarize().totalCostUsd, 2.5, 'reporting is unaffected by a dead sink');
  });

  it('summarize() and health() stay callable and correct with a broken sink', async () => {
    const ledger = ledgerWith(throwingSinkForTests());
    for (let i = 0; i < 5; i++) ledger.record(entry({ costUsd: 1 }));
    await drain();

    const s = ledger.summarize();
    assert.equal(s.entries, 5);
    assert.equal(s.requests, 5);
    assert.equal(s.totalCostUsd, 5);
    assert.equal(ledger.health().sinkFailures, 5);
  });
});

// ===========================================================================
// A throwing sink must not lose subsequent entries
// ===========================================================================

describe('a throwing sink does not lose subsequent entries', () => {
  it('every later entry is still recorded and still attempted', async () => {
    const ledger = ledgerWith(throwingSinkForTests());
    for (let i = 0; i < 10; i++) ledger.record(entry());
    await drain();

    assert.equal(ledger.health().entriesInRing, 10, 'the ring must not stop accepting after a failure');
    assert.equal(
      ledger.health().sinkFailures,
      10,
      'each entry is dispatched independently — one poisoned write must not disable the sink ' +
        'for the rest of the process, which would turn a transient outage into permanent data loss',
    );
    assert.equal(ledger.summarize().entries, 10);
  });

  it('recovers cleanly when only SOME writes throw', async () => {
    let n = 0;
    const flaky = callbackSink('flaky', () => {
      n += 1;
      if (n % 2 === 1) throw new Error('every other write fails');
    });
    const ledger = ledgerWith(flaky);
    for (let i = 0; i < 6; i++) ledger.record(entry());
    await drain();

    assert.equal(ledger.health().sinkFailures, 3);
    assert.equal(ledger.health().entriesInRing, 6, 'nothing is dropped on the read path');
  });

  it('multiSink isolates a broken sink from a working one', async () => {
    const delivered: LedgerEntry[] = [];
    const ledger = ledgerWith(
      multiSink(throwingSinkForTests(), callbackSink('good', (e) => void delivered.push(e)), throwingSinkForTests()),
    );
    for (let i = 0; i < 3; i++) ledger.record(entry());
    await drain();

    assert.equal(
      delivered.length,
      3,
      'a broken sink placed first must not starve the durable one behind it — fan-out order ' +
        'is not something anyone should have to get right to keep their billing data',
    );
    assert.equal(ledger.health().sinkFailures, 0, 'multiSink absorbs per-sink failures itself');
  });

  it('a malformed entry is coerced rather than rejected', async () => {
    const ledger = ledgerWith(nullSink());
    ledger.record(entry({ costUsd: Number.NaN, inputTokens: undefined as unknown as number }));
    await drain();

    const [e] = ledger.recent();
    assert.equal(e.costUsd, 0, 'one NaN would poison every downstream total');
    assert.equal(e.inputTokens, 0);
    assert.equal(ledger.health().recordFailures, 0);
  });

  it('ring overflow is reported, not silently absorbed', async () => {
    const ledger = ledgerWith(nullSink(), 3);
    for (let i = 0; i < 5; i++) ledger.record(entry());
    await drain();

    const h = ledger.health();
    assert.equal(h.entriesInRing, 3);
    assert.equal(h.wrapped, true, 'once wrapped, summarize() no longer covers all history');
    assert.equal(
      h.droppedEntries,
      2,
      'the ledger is NOT an audit log. Billing from summarize() past the ring size is ' +
        'arithmetically wrong, so the wrap has to be observable',
    );
  });
});
