/**
 * Budget mode-transition tests.
 *
 * These exist because a budget's failure mode is SILENCE. A mode that never blocks when
 * it should, or blocks when it should not, produces no exception and no log line — it
 * produces an invoice, weeks later, or an outage nobody can attribute. Every assertion
 * below covers a transition whose breakage looks exactly like correct behaviour from
 * outside the process.
 *
 * The clock and the store are injected, so nothing here sleeps, races, or depends on the
 * calendar. A budget test that needs wall-clock time is a budget test that gets deleted.
 *
 * Run with the Node test runner:
 *   node --test templates/budget.test.ts
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
  createBudget,
  memoryStore,
  DEFAULT_THRESHOLDS,
  type BudgetMode,
  type BudgetStore,
  type ThresholdEvent,
} from './budget.ts';

/** A fixed cap. The unit is USD; the value is arbitrary and carries no pricing meaning. */
const CAP = 100;

/** Deterministic clock — every test prices at the same instant in the same window. */
const FIXED_NOW = Date.UTC(2026, 6, 19);

function budgetAt(
  mode: BudgetMode,
  spent: number,
  extra: { agentEnvelopeUsd?: number; store?: BudgetStore; onThreshold?: (e: ThresholdEvent) => void } = {},
) {
  const store = extra.store ?? memoryStore();
  const b = createBudget({
    mode,
    limits: { windowUsd: CAP, window: 'calendar-month' },
    agentEnvelopeUsd: extra.agentEnvelopeUsd,
    store,
    now: () => FIXED_NOW,
    onThreshold: extra.onThreshold,
  });
  return { budget: b, store, seed: (usd: number, tags?: Record<string, string>) => b.postflight({ costUsd: usd, tags }) };
}

// ===========================================================================
// advisory — meters everything, blocks nothing
// ===========================================================================

describe('advisory never blocks', () => {
  it('allows the call at, and far past, the cap while still reporting overBudget', async () => {
    for (const utilisation of [0.5, 0.9, 1.0, 3.0]) {
      const { budget, seed } = budgetAt('advisory', 0);
      await seed(CAP * utilisation);
      const d = await budget.preflight({ surface: 'chat' });

      assert.equal(d.allow, true, `advisory must not block at ${utilisation}x the cap`);
      assert.equal(d.forceTier, undefined, 'advisory must not silently reroute a call either');
      assert.equal(d.disableEscalation, undefined);
      assert.equal(
        d.overBudget,
        utilisation >= 1,
        'visibility is NOT what advisory gives up — overBudget must be reported identically ' +
          'to the enforcing modes, or a team cannot watch what hard-stop WOULD have done',
      );
      assert.ok(Math.abs(d.utilization - utilisation) < 1e-9);
    }
  });

  it('reports the same utilisation as the enforcing modes for identical spend', async () => {
    const seen: number[] = [];
    for (const mode of ['advisory', 'soft-degrade', 'hard-stop'] as const) {
      const { budget, seed } = budgetAt(mode, 0);
      await seed(CAP * 0.95);
      seen.push((await budget.preflight({ surface: 'chat' })).utilization);
    }
    assert.deepEqual(seen, [seen[0], seen[0], seen[0]], 'switching mode must change behaviour, never visibility');
  });
});

// ===========================================================================
// soft-degrade — the app keeps working, more cheaply
// ===========================================================================

describe('soft-degrade routes to a cheaper tier at the threshold', () => {
  it('does nothing below the throttle threshold', async () => {
    const { budget, seed } = budgetAt('soft-degrade', 0);
    await seed(CAP * 0.8);
    const d = await budget.preflight({ surface: 'chat' });
    assert.equal(d.allow, true);
    assert.equal(d.forceTier, undefined, 'a 75% alert is an alert, not a behaviour change');
  });

  it('throttles to the cheapest paid tier at 90% and turns escalation off', async () => {
    const { budget, seed } = budgetAt('soft-degrade', 0);
    await seed(CAP * 0.9);
    const d = await budget.preflight({ surface: 'chat' });

    assert.equal(d.allow, true, 'degrading is not refusing');
    assert.equal(d.forceTier, 'primary', 'pin to the cheapest paid tier');
    assert.equal(d.disableEscalation, true, 'escalation is the single largest per-call multiplier');
    assert.equal(d.reduceOutput, true);
    assert.equal(d.disableReasoning, true, 'thinking tokens bill as output');
    assert.equal(d.preferNonBillable, true);
    assert.equal(d.reason, 'degrade-policy');
  });

  it('drops to the zero-marginal-cost tier at the cap, and still does not refuse', async () => {
    const { budget, seed } = budgetAt('soft-degrade', 0);
    await seed(CAP);
    const d = await budget.preflight({ surface: 'chat' });

    assert.equal(d.allow, true);
    assert.equal(
      d.forceTier,
      'failsafe',
      'this is the whole contract of soft-degrade: at the cap the app serves a worse answer ' +
        'rather than no answer. Without a registered deterministic fallback below it, ' +
        '"degrade" has nowhere to go and becomes an outage with extra steps',
    );
    assert.equal(d.overBudget, true);
  });
});

// ===========================================================================
// hard-stop — refusal is the correct behaviour
// ===========================================================================

describe('hard-stop refuses past the cap', () => {
  it('permits the call right up to the cap', async () => {
    const { budget, seed } = budgetAt('hard-stop', 0);
    await seed(CAP * 0.99);
    const d = await budget.preflight({ surface: 'batch' });
    assert.equal(d.allow, true, 'a cap is a cap, not a target to stay under');
  });

  it('refuses at and past the cap, and names why on the decision', async () => {
    for (const utilisation of [1.0, 1.5]) {
      const { budget, seed } = budgetAt('hard-stop', 0);
      await seed(CAP * utilisation);
      const d = await budget.preflight({ surface: 'batch' });

      assert.equal(d.allow, false);
      assert.equal(d.forceTier, 'deterministic');
      assert.equal(d.reason, 'over-budget', 'the reason goes straight onto the ledger entry');
      assert.equal(d.overBudget, true);
      assert.ok(typeof d.message === 'string' && d.message.length > 0);
    }
  });

  it('warns in health() that a process-local counter makes hard-stop inert', () => {
    const { budget } = budgetAt('hard-stop', 0);
    const h = budget.health();
    assert.equal(h.budgetStore, 'memory');
    assert.equal(h.sharedCounter, false);
    assert.match(
      String(h.warning),
      /replica|shared/i,
      'hard-stop over a process-local counter reads like enforcement and is not: across N ' +
        'replicas it enforces N times the cap, and every restart refunds it. That has to be ' +
        'visible at runtime rather than discovered from an invoice',
    );
  });

  it('setMode flips behaviour on an already-overspent budget', async () => {
    const { budget, seed } = budgetAt('advisory', 0);
    await seed(CAP * 1.2);
    assert.equal((await budget.preflight({ surface: 'chat' })).allow, true);
    budget.setMode('hard-stop');
    assert.equal((await budget.preflight({ surface: 'chat' })).allow, false);
  });
});

// ===========================================================================
// the 75/90/100 ladder
// ===========================================================================

describe('the threshold ladder fires in order, once each', () => {
  it('emits 75 then 90 then 100 as spend accrues, and never out of order', async () => {
    const events: ThresholdEvent[] = [];
    const { budget, seed } = budgetAt('advisory', 0, { onThreshold: (e) => events.push(e) });

    // Walk spend upward, taking a decision at each step the way a real request would.
    for (const target of [0.5, 0.75, 0.8, 0.9, 0.95, 1.0, 1.4]) {
      const status = await budget.status();
      await seed(CAP * target - status.spentUsd);
      await budget.preflight({ surface: 'chat' });
    }

    const windowEvents = events.filter((e) => e.scope === 'window');
    assert.deepEqual(
      windowEvents.map((e) => e.threshold),
      [...DEFAULT_THRESHOLDS],
      'the ladder must fire 75 -> 90 -> 100 in that order and exactly once each: ' +
        'level-triggered alerting re-fires on every request past the line, which trains ' +
        'the recipient to filter the channel, and then the 100% alert lands in a muted room',
    );
    for (const e of windowEvents) {
      assert.equal(e.limitUsd, CAP);
      assert.equal(e.mode, 'advisory');
      assert.ok(e.utilization >= e.threshold);
    }
  });

  it('fires the ladder in advisory mode too — metering is not conditional on enforcing', async () => {
    const events: ThresholdEvent[] = [];
    const { budget, seed } = budgetAt('advisory', 0, { onThreshold: (e) => events.push(e) });
    await seed(CAP);
    await budget.preflight({ surface: 'chat' });
    assert.ok(events.some((e) => e.threshold === 1), 'advisory alerts, it just does not block');
  });

  it('an onThreshold handler that throws cannot break the request that triggered it', async () => {
    const { budget, seed } = budgetAt('advisory', 0, {
      onThreshold: () => {
        throw new Error('alerting pipeline is down');
      },
    });
    await seed(CAP);
    // Same invariant as the ledger: instrumentation never breaks the response path.
    const d = await budget.preflight({ surface: 'chat' });
    assert.equal(d.allow, true);
    assert.equal(d.overBudget, true);
  });
});

// ===========================================================================
// per-agent envelopes — the one thing advisory still enforces
// ===========================================================================

describe('per-agent envelopes enforce in EVERY mode', () => {
  const ENVELOPE = 5;

  it('blocks a spent agent even in advisory, where nothing else blocks', async () => {
    const { budget, seed } = budgetAt('advisory', 0, { agentEnvelopeUsd: ENVELOPE });
    await seed(ENVELOPE, { agentId: 'worker-3' });

    const d = await budget.preflight({ surface: 'chat', tags: { agentId: 'worker-3' } });
    assert.equal(
      d.allow,
      false,
      'this is the single deliberate exception to advisory, and it is the right one: ' +
        'advisory means "do not let a threshold break the user\'s app", not "let a looping ' +
        'agent spend without limit". A breached envelope kills one branch of a fan-out',
    );
    assert.equal(d.reason, 'envelope-exceeded');
    assert.equal(d.forceTier, 'deterministic');
    assert.equal(d.overBudget, true);
  });

  it('enforces identically across all three modes', async () => {
    for (const mode of ['advisory', 'soft-degrade', 'hard-stop'] as const) {
      const { budget, seed } = budgetAt(mode, 0, { agentEnvelopeUsd: ENVELOPE });
      await seed(ENVELOPE, { agentId: 'looper' });
      const d = await budget.preflight({ surface: 'chat', tags: { agentId: 'looper' } });
      assert.equal(d.allow, false, `envelope must hold in ${mode}`);
      assert.equal(d.reason, 'envelope-exceeded', `envelope must hold in ${mode}`);
    }
  });

  it('bounds the blast radius to the one agent that overspent', async () => {
    const { budget, seed } = budgetAt('advisory', 0, { agentEnvelopeUsd: ENVELOPE });
    await seed(ENVELOPE, { agentId: 'looper' });

    const sibling = await budget.preflight({ surface: 'chat', tags: { agentId: 'sibling' } });
    assert.equal(sibling.allow, true, 'the orchestrator collects partial results and proceeds');

    const untagged = await budget.preflight({ surface: 'chat' });
    assert.equal(untagged.allow, true, 'an envelope bounds an agent, not the application');
  });

  it('is checked BEFORE the window budget, so the tightest cap wins', async () => {
    // Window budget nowhere near its cap; the agent is done regardless.
    const { budget, seed } = budgetAt('advisory', 0, { agentEnvelopeUsd: ENVELOPE });
    await seed(ENVELOPE, { agentId: 'looper' });
    const status = await budget.status();
    assert.ok(status.utilization < 0.1, 'precondition: the window budget is nowhere near its cap');
    assert.equal((await budget.preflight({ surface: 'chat', tags: { agentId: 'looper' } })).allow, false);
  });

  it('does not enforce an envelope that was never configured', async () => {
    const { budget, seed } = budgetAt('advisory', 0);
    await seed(1000, { agentId: 'looper' });
    assert.equal(
      (await budget.preflight({ surface: 'chat', tags: { agentId: 'looper' } })).allow,
      true,
      'no envelope configured means no envelope enforced — silently inventing one would be ' +
        'its own defect class',
    );
  });
});

// ===========================================================================
// postflight — bookkeeping must never become an outage
// ===========================================================================

describe('postflight is best-effort and never throws', () => {
  it('absorbs a store that throws on write', async () => {
    const brokenStore: BudgetStore = {
      kind: 'broken',
      get: () => 0,
      add: () => {
        throw new Error('counter store is down');
      },
      reset: () => {},
    };
    const { budget } = budgetAt('hard-stop', 0, { store: brokenStore });
    // It runs AFTER the caller already has an answer. Failing here would turn a
    // bookkeeping problem into a user-visible error.
    await budget.postflight({ costUsd: 1, tags: { agentId: 'a' } });
  });

  it('ignores a non-finite cost rather than poisoning the counter with NaN', async () => {
    const { budget } = budgetAt('advisory', 0);
    await budget.postflight({ costUsd: Number.NaN });
    const status = await budget.status();
    assert.equal(status.spentUsd, 0, 'one NaN would make every subsequent comparison false');
  });
});
