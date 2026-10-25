/**
 * Mirror-image invariant tests for provider usage normalisation.
 *
 * These are the tests that stop a silent cost defect. Every failure mode they cover produces
 * a plausible number rather than an exception, which is why they exist as assertions rather
 * than as a paragraph in a reference file.
 *
 * Two mirrored families:
 *   INPUT SIDE  — never subtract twice (cache reads: inclusive vs exclusive prompt totals)
 *   OUTPUT SIDE — never add twice     (reasoning: additive vs nested vs folded)
 *
 * Run with the Node test runner:
 *   node --test templates/adapters/usage-invariants.test.ts
 * or through your project's runner (vitest/jest) unchanged — only node:test and node:assert
 * are imported.
 *
 * IMPORT EXTENSIONS: these files import `./types.ts`, not `./types.js`, because Node's
 * resolver does not remap a `.js` specifier onto a `.ts` file — with `.js` this suite fails
 * to load with ERR_MODULE_NOT_FOUND, which is how it silently never ran. Compiling with
 * `tsc` under `module: nodenext`? Set `rewriteRelativeImportExtensions: true` (TS 5.7+).
 * Bundler or `noEmit`? Set `allowImportingTsExtensions: true`. See templates/VERIFY.md.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  billableOutputTokens,
  checkUsageInvariants,
  type NormalizedUsage,
} from './types.ts';
import { normalizeGeminiUsage } from './gemini.ts';
import { normalizeClaudeCodeUsage } from './claude-code-cli.ts';
import { normalizeAnthropicUsage } from './claude-api.ts';
import {
  normalizeOpenAiChatUsage,
  normalizeOpenAiResponsesUsage,
} from './openai.ts';
import { normalizeBedrockUsage, parseBedrockModelId } from './bedrock.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(here, '__fixtures__', name), 'utf8'));

// ===========================================================================
// OUTPUT SIDE — never add twice
// ===========================================================================

describe('output side: reasoning inclusion', () => {
  it('Gemini is additive — billable output includes thoughts', () => {
    const u = normalizeGeminiUsage({
      promptTokenCount: 2210,
      candidatesTokenCount: 388,
      thoughtsTokenCount: 1567,
      totalTokenCount: 4165,
    })!;
    assert.equal(u.reasoningInOutput, 'additive');
    assert.equal(u.outputTokens, 388);
    assert.equal(u.reasoningTokens, 1567);
    // The whole point. Charging outputTokens alone undercounts by 1567 tokens — 80% of the
    // billable output on this call — on the skill's own default provider.
    assert.equal(billableOutputTokens(u), 1955);
  });

  it('Gemini fails loudly when the additive identity does not hold', () => {
    // A payload where thoughts are NOT a third addend. If Google ever changed the semantics,
    // this is the shape we would see, and we must stop rather than silently reprice.
    assert.throws(
      () =>
        normalizeGeminiUsage({
          promptTokenCount: 2210,
          candidatesTokenCount: 1955, // thoughts folded in
          thoughtsTokenCount: 1567,
          totalTokenCount: 4165,
        }),
      /additive-total-mismatch|usage invariant violated/,
      'a broken additive identity must throw, not default — a defaulted invariant still ' +
        'produces a number, and the number is what ends up in a client-facing figure',
    );
  });

  it('nested providers must not add reasoning on top', () => {
    const anthropic = normalizeAnthropicUsage({
      input_tokens: 900,
      output_tokens: 1400,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens_details: { thinking_tokens: 1100 },
    })!;
    assert.equal(anthropic.reasoningInOutput, 'nested');
    assert.equal(billableOutputTokens(anthropic), 1400);
    assert.notEqual(
      billableOutputTokens(anthropic),
      anthropic.outputTokens + (anthropic.reasoningTokens ?? 0),
      'adding reasoning here double-charges every thinking token',
    );

    const openai = normalizeOpenAiResponsesUsage({
      input_tokens: 900,
      output_tokens: 1186,
      total_tokens: 2086,
      output_tokens_details: { reasoning_tokens: 1024 },
    })!;
    assert.equal(billableOutputTokens(openai), 1186);

    const chat = normalizeOpenAiChatUsage({
      prompt_tokens: 900,
      completion_tokens: 1186,
      total_tokens: 2086,
      completion_tokens_details: { reasoning_tokens: 1024 },
    })!;
    assert.equal(billableOutputTokens(chat), 1186);
  });

  it('nested providers reject reasoning exceeding output', () => {
    assert.throws(
      () =>
        normalizeAnthropicUsage({
          input_tokens: 100,
          output_tokens: 200,
          output_tokens_details: { thinking_tokens: 400 },
        }),
      /reasoning-exceeds-output|usage invariant violated/,
    );
  });

  it('Bedrock folds reasoning and reports null, never zero', () => {
    const u = normalizeBedrockUsage({
      inputTokens: 45,
      outputTokens: 1240,
      totalTokens: 1285,
    })!;
    assert.equal(u.reasoningInOutput, 'folded');
    assert.equal(
      u.reasoningTokens,
      null,
      'null means unknown; 0 would assert "no reasoning occurred", which makes a ' +
        'reasoning-share metric read 0% on a reasoning-heavy workload',
    );
    assert.notEqual(u.reasoningTokens, 0);
    assert.equal(billableOutputTokens(u), 1240);
  });

  it('a folded provider reporting a non-null reasoning count is a violation', () => {
    const bad: NormalizedUsage = {
      inputTokens: 45,
      outputTokens: 1240,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheWrite1hTokens: 0,
      reasoningTokens: 0, // the tempting, wrong value
      reasoningInOutput: 'folded',
      totalTokensReported: 1285,
      estimated: false,
    };
    const v = checkUsageInvariants(bad);
    assert.ok(v.some((x) => x.code === 'folded-reasoning-not-null'));
  });
});

// ===========================================================================
// INPUT SIDE — never subtract twice
// ===========================================================================

describe('input side: cache-read inclusion', () => {
  it('Gemini prompt total is INCLUSIVE — subtract exactly once', () => {
    const promptTotal = 6042;
    const cached = 5120;
    const u = normalizeGeminiUsage({
      promptTokenCount: promptTotal,
      cachedContentTokenCount: cached,
      candidatesTokenCount: 173,
      totalTokenCount: 6215,
    })!;
    assert.equal(u.inputTokens, promptTotal - cached);
    assert.equal(
      u.inputTokens + u.cacheReadTokens,
      promptTotal,
      'inclusive provider: uncached input plus cache reads must reconstruct the total',
    );
  });

  it('OpenAI prompt total is INCLUSIVE on both surfaces', () => {
    const r = normalizeOpenAiResponsesUsage({
      input_tokens: 8000,
      output_tokens: 120,
      total_tokens: 8120,
      input_tokens_details: { cached_tokens: 6400 },
    })!;
    assert.equal(r.inputTokens, 1600);
    assert.equal(r.inputTokens + r.cacheReadTokens, 8000);

    const c = normalizeOpenAiChatUsage({
      prompt_tokens: 8000,
      completion_tokens: 120,
      total_tokens: 8120,
      prompt_tokens_details: { cached_tokens: 6400 },
    })!;
    assert.equal(c.inputTokens, 1600);
    assert.equal(c.inputTokens + c.cacheReadTokens, 8000);
  });

  it('Anthropic input is EXCLUSIVE — do not subtract', () => {
    const u = normalizeAnthropicUsage({
      input_tokens: 1600,
      output_tokens: 120,
      cache_read_input_tokens: 6400,
      cache_creation_input_tokens: 0,
    })!;
    assert.equal(
      u.inputTokens,
      1600,
      'subtracting here would understate input by the whole cached prefix',
    );
    assert.equal(u.cacheReadTokens, 6400);
  });

  it('Claude Code CLI input is EXCLUSIVE — do not subtract', () => {
    const u = normalizeClaudeCodeUsage({
      input_tokens: 6,
      output_tokens: 341,
      cache_read_input_tokens: 13820,
      cache_creation_input_tokens: 0,
    })!;
    assert.equal(u.inputTokens, 6);
    assert.equal(u.cacheReadTokens, 13820);
    assert.equal(u.reasoningTokens, null, 'the CLI does not break out thinking');
  });

  it('Bedrock input is EXCLUSIVE — do not subtract', () => {
    const u = normalizeBedrockUsage({
      inputTokens: 1600,
      outputTokens: 120,
      totalTokens: 8120,
      cacheReadInputTokens: 6400,
      cacheWriteInputTokens: 0,
    })!;
    assert.equal(u.inputTokens, 1600);
    assert.equal(u.cacheReadTokens, 6400);
  });

  it('Anthropic splits cache writes by TTL so break-even stays computable', () => {
    const u = normalizeAnthropicUsage({
      input_tokens: 10,
      output_tokens: 50,
      cache_creation_input_tokens: 9000,
      cache_creation: {
        ephemeral_5m_input_tokens: 2000,
        ephemeral_1h_input_tokens: 7000,
      },
    })!;
    assert.equal(u.cacheWriteTokens, 2000);
    assert.equal(u.cacheWrite1hTokens, 7000);
  });
});

// ===========================================================================
// Structural guarantees
// ===========================================================================

describe('structural guarantees', () => {
  it('no adapter ever reports estimated usage', () => {
    const all = [
      normalizeGeminiUsage({ promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }),
      normalizeAnthropicUsage({ input_tokens: 10, output_tokens: 5 }),
      normalizeClaudeCodeUsage({ input_tokens: 10, output_tokens: 5 }),
      normalizeOpenAiResponsesUsage({ input_tokens: 10, output_tokens: 5, total_tokens: 15 }),
      normalizeBedrockUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
    ];
    for (const u of all) assert.equal(u!.estimated, false);
  });

  it('missing usage normalises to null, never to a fabricated zero', () => {
    // "I cannot report usage" must be sayable. A zeroed usage record is indistinguishable
    // from a free call and would quietly deflate every aggregate it lands in.
    assert.equal(normalizeGeminiUsage(undefined), null);
    assert.equal(normalizeAnthropicUsage(null), null);
    assert.equal(normalizeClaudeCodeUsage(undefined), null);
    assert.equal(normalizeOpenAiResponsesUsage({}), null);
    assert.equal(normalizeBedrockUsage({}), null);
  });

  it('Bedrock routing tier is parsed out of the model id, since it is a pricing input', () => {
    assert.deepEqual(parseBedrockModelId('global.anthropic.claude-x'), {
      routingTier: 'global',
      baseModelId: 'anthropic.claude-x',
    });
    assert.deepEqual(parseBedrockModelId('eu.anthropic.claude-x'), {
      routingTier: 'regional',
      baseModelId: 'anthropic.claude-x',
    });
    assert.deepEqual(parseBedrockModelId('anthropic.claude-x'), {
      routingTier: 'direct',
      baseModelId: 'anthropic.claude-x',
    });
  });
});

// ===========================================================================
// Recorded fixtures — the VERIFIED adapters replay real payloads
// ===========================================================================

describe('recorded fixtures (verified adapters)', () => {
  it('gemini fixtures normalise exactly as recorded', () => {
    const f = fixtures('gemini.usage.json') as {
      cases: Array<{ name: string; usageMetadata: Record<string, number>; expect: Record<string, unknown> }>;
    };
    for (const c of f.cases) {
      const u = normalizeGeminiUsage(c.usageMetadata)!;
      assert.equal(u.inputTokens, c.expect.inputTokens, c.name);
      assert.equal(u.outputTokens, c.expect.outputTokens, c.name);
      assert.equal(u.reasoningTokens, c.expect.reasoningTokens, c.name);
      assert.equal(billableOutputTokens(u), c.expect.billableOutputTokens, c.name);
      if (c.expect.contextTier) {
        assert.equal(u.raw?.contextTier, c.expect.contextTier, c.name);
      }
    }
  });

  it('claude-code-cli fixtures normalise exactly as recorded', () => {
    const f = fixtures('claude-code-cli.result.json') as {
      cases: Array<{
        name: string;
        payload?: { usage?: Record<string, number>; total_cost_usd?: number };
        expect: Record<string, unknown>;
      }>;
    };
    for (const c of f.cases) {
      if (!c.payload?.usage) continue;
      const u = normalizeClaudeCodeUsage(c.payload.usage)!;
      assert.equal(u.inputTokens, c.expect.inputTokens, c.name);
      assert.equal(u.cacheReadTokens, c.expect.cacheReadTokens, c.name);
      assert.equal(u.cacheWriteTokens, c.expect.cacheWriteTokens, c.name);
      assert.equal(u.reasoningTokens, null, c.name);
      // The notional figure must survive to the ledger. Dropping it hides the subscription
      // quota burn until the window closes in production.
      assert.equal(c.payload.total_cost_usd, c.expect.notionalCostUsd, c.name);
    }
  });
});
