/**
 * config/llm.ts — THE ONLY FILE IN A GENERATED PROJECT THAT NAMES A PROVIDER OR MODEL ID.
 *
 * Everywhere else names *tiers* ('primary', 'escalation', 'failsafe'). The reason is not
 * tidiness: a model id copied into a second file is a model id the next migration will miss,
 * and the resulting silent drift shows up as a `modelDriftRate` you cannot explain — your cost
 * model then describes a system you do not have. One file, one place to change, one diff to
 * review when a vendor reprices or withdraws a SKU.
 *
 * This file carries NO dollar figures. Rates live in exactly one place,
 * `references/sota-snapshot.md`, and reach code only via the generated `pricing.ts`.
 * Read the snapshot before reasoning about what any of these tiers costs.
 *
 * Shape is defined by `FinopsLlmConfig` in `../metered-llm.ts`.
 */

import type { FinopsLlmConfig } from '../metered-llm.ts';

/**
 * THE DEFAULT CHAIN, and why each rung is where it is.
 *
 *   1 primary            Gemini Flash-Lite class, cheapest GA tier   — every call by default
 *   2 escalation[0]      Gemini Flash workhorse                      — quality-sensitive calls
 *   3 escalation[1]      Anthropic Sonnet-class, metered             — hard calls / gate rejects
 *   4 failsafe           Claude Code CLI, subscription auth          — only on a FallbackReason
 *   5 deterministic      no model at all                             — budget kill, or all failed
 *
 * Rungs 1-2 are intra-vendor, so an escalation for prose quality keeps the cached prefix.
 * Rung 3 crosses vendors deliberately: it is a considered, call-site-declared or gate-driven
 * decision, never a router's guess, and it pays a fresh prefix — which is exactly why it is
 * reserved for calls where being wrong is expensive.
 *
 * NO PREVIEW SKU APPEARS ANYWHERE IN THIS FILE. Preview pricing and preview availability both
 * change without notice; two fast SKUs were withdrawn inside eight weeks before this template
 * was written. A default that depends on a preview SKU breaks on someone else's schedule.
 * Override below if you accept that risk, and record why — this comment is the audit trail.
 */
export const llmConfig: FinopsLlmConfig = {
  primary: {
    adapter: 'gemini',
    model: 'gemini-3.1-flash-lite',
    maxOutputTokens: 1024,
    timeoutMs: 30_000,
    // Gemini implicit context caching is free and automatic; explicit CachedContent only pays
    // above roughly four hits/hour on the same prefix. See references/caching-and-batch.md.
    // `'auto'` IS implicit caching — it is the portable name for it across all six adapters,
    // and the one CacheDirective mode that is honestly neutral. `'explicit'` throws on four
    // of six rather than silently billing full price for a cache that never engaged.
    cache: { mode: 'auto' },
  },

  /**
   * THE ESCALATION LADDER — ordered, cheapest rung first. Both documented rungs ship and
   * both are reachable; the `trigger` on each is what selects it, so no call site ever
   * names a model and the drift this file exists to prevent cannot start.
   *
   * Rung 1 is intra-vendor: a prose-quality escalation keeps the cached prefix, which is
   * usually worth more than the per-token delta. Rung 2 crosses vendors and pays a fresh
   * prefix — reserved for calls the developer flagged as hard, or that a zero-token quality
   * gate already rejected one rung down. That is a considered decision, never a router's guess.
   *
   * Anthropic model ids and parameters are the `claude-api` skill's territory — this skill
   * only decides *when* the money is worth spending.
   */
  escalation: [
    {
      trigger: 'quality-sensitive',
      adapter: 'gemini',
      model: 'gemini-3.5-flash',
      maxOutputTokens: 2048,
      timeoutMs: 45_000,
      cache: { mode: 'auto' },
    },
    {
      trigger: 'hard-call',
      adapter: 'claude-api',
      model: 'claude-sonnet-4-5',
      maxOutputTokens: 2048,
      timeoutMs: 60_000,
      cache: { mode: 'explicit', ttl: '5m' },
    },
  ],

  /**
   * `billable: false` is NOT `costUsd: 0`. This transport has near-zero marginal cost under a
   * plan but consumes a rate-limited quota, so the ledger records `costUsd: 0` alongside
   * `notionalCostUsd` and reports both. Hiding the notional figure is how teams discover their
   * subscription ceiling in production rather than on a dashboard.
   *
   * Reached ONLY on a FallbackReason — never on quality grounds — and gated by `probe()`, so
   * nothing on the hot path depends on a CLI existing.
   */
  failsafe: {
    adapter: 'claude-code-cli',
    model: 'default',
    billable: false,
    timeoutMs: 120_000,
  },

  defaults: {
    maxOutputTokens: 1024,
    timeoutMs: 30_000,
    temperature: 0.2,
  },

  /**
   * Emits ONE non-fatal line on first use per process comparing this configured primary's rate
   * against the cheapest entry in the price sheet. It exists because the shipped default was
   * chosen deliberately over a cheaper competitor, and that tradeoff should be visible at
   * runtime rather than buried in a document nobody opens. It never throws, never blocks, fires
   * once, and says so plainly when the sheet is stale or the model is unlisted rather than
   * inventing a comparison. See ../cost-warning.ts.
   */
  costNotice: true,
};

/**
 * BUDGET MODE — state this explicitly even when you keep the default.
 *
 * `advisory` is a legitimate default: meter and warn, never block, so a threshold can never
 * break a user's app. The anti-pattern (AP-02) is not advisory mode — it is a codebase with
 * exactly one budget behaviour that nobody chose. Writing the field down IS the choice.
 *
 * Move off `advisory` when any of these is true: production traffic with real customers; spend
 * charged back per customer or tenant; autonomous agent loops or parallel subagents in the
 * workload; a single tenant able to drive unbounded volume; monthly spend past the low hundreds.
 *
 *   soft-degrade  user-facing apps — graceful quality reduction beats an outage
 *   hard-stop     batch jobs and per-tenant hard caps, where refusing is correct
 *
 * Per-agent envelopes are enforced in EVERY mode, including advisory. That exception is
 * deliberate: advisory means "don't let a threshold break the user's app", not "let a looping
 * agent spend unbounded money". An envelope breach kills one branch of a fan-out; the
 * orchestrator collects partial results and continues.
 */
export const budgetMode: 'advisory' | 'soft-degrade' | 'hard-stop' = 'advisory';

/**
 * BudgetStore MUST match your deployment topology.
 *
 * The default `memoryStore()` is SINGLE-PROCESS ONLY. Across N replicas a monthly cap silently
 * becomes an N-times cap; under autoscaling it is unbounded; and a restart refunds the budget,
 * so every deploy resets your cap. `hard-stop` over a process-local counter is inert — it reads
 * like enforcement and is not. Use `redisStore()`, `callbackStore()`, or a gateway virtual key
 * for anything multi-instance. `health()` reports `budgetStore: 'memory'` so this surfaces at
 * runtime rather than on an invoice.
 */
export const budgetStoreKind: 'memory' | 'redis' | 'callback' = 'memory';
