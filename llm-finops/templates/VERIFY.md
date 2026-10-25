# VERIFY.md — promoting an UNVERIFIED adapter to verified

Four adapters ship with a `STATUS: UNVERIFIED` header: `claude-api.ts`, `openai.ts`,
`azure-openai.ts`, `bedrock.ts`. They were written from the providers' published API
references and have never been executed against a live endpoint.

**Why this matters more than it usually would.** A wrong adapter here does not crash. It
returns text, it returns a usage object, the ledger records an entry, `summarize()` produces
a report, and every number in it is off by the size of a cached prefix or a thinking budget.
The failure mode is a confident figure in a client-facing estimate — which is precisely the
outcome this whole skill exists to prevent. Labelling unverified code as unverified is the
same discipline as labelling an unverified price, applied to a different artifact.

This file is the procedure that removes the label honestly. It takes about ten minutes per
provider and you only do it once.

---

## What "verified" means here

An adapter is verified when **you** have run a live call against it and confirmed, from the
real payload, that:

1. **The input-side invariant holds** — `inputTokens + cacheReadTokens` reconstructs the
   provider's prompt total for an inclusive provider, or `inputTokens` equals it for an
   exclusive one. (Never subtract twice.)
2. **The output-side invariant holds** — `reasoningTokens <= outputTokens` for a nested
   provider; `reasoningTokens === null` for a folded one. (Never add twice.)
3. **The served model is the model you priced** — `servedModel` is a real model id that
   exists in the price sheet, not a deployment name, not an alias you assumed resolved.
4. **Cache fields move when you exercise the cache** — the second identical call reports a
   nonzero cache read. An adapter that reads cache fields but never sets the write side
   reports a permanent zero and looks like "caching doesn't help here."

Anything less is a smoke test, not a verification, and the header should stay.

Background for all of it: `templates/adapters/reasoning-semantics.md`.

---

## Before you start

```powershell
# PowerShell 5.1 (the user's primary shell). Set only the key for the provider you are
# verifying — do not paste keys into files that could be committed.
$env:ANTHROPIC_API_KEY = "<key>"
```

In Git Bash use `export ANTHROPIC_API_KEY=...` and forward slashes for relative paths.

Run the invariant suite first. It must be green before a live call tells you anything —
otherwise you cannot distinguish a provider surprise from a mapping bug:

```powershell
# One adapter suite, from the skill root:
node --test templates/adapters/usage-invariants.test.ts

# Or the whole template suite (70 tests: adapters, budget, pricing, ledger):
node --test "templates/**/*.test.ts"
```

Node builtins only — nothing to install. Node 22.6+ strips types natively (no
`--experimental-strip-types` flag needed on Node 23+).

> **Why these files import `./types.ts` and not `./types.js`.** Node's own resolver does
> **not** remap a `.js` specifier onto a `.ts` file, so the whole template tree uses
> explicit `.ts` specifiers in order to be runnable as shipped. If you compile these
> templates with `tsc` under `module: nodenext`, set **`rewriteRelativeImportExtensions:
> true`** (TypeScript 5.7+), which rewrites them to `.js` on emit; for a bundler or a
> `noEmit` typecheck, set **`allowImportingTsExtensions: true`** instead. Under
> vitest/jest/tsx no configuration is needed. This was a deliberate trade: a shipped test
> that cannot execute is worse than no test, because it looks like coverage.

A directory-level run also works from inside the templates folder:

```powershell
cd templates ; node --test
```

(`node --test templates` from the skill root does **not** work — Node treats a bare
positional directory as a module entry point and fails with `MODULE_NOT_FOUND`. Use the
quoted glob above, or `cd` first.)

---

## The general shape of a smoke test

Every provider follows the same three-call pattern. Only the client construction differs.

| Call | Purpose | What you assert |
|---|---|---|
| **1. Minimal** | Does the wire format work at all | usage is non-null; `servedModel` is a real model id; input-side invariant |
| **2. Reasoning on** | Is the reasoning mapping right | output-side invariant; `reasoningTokens` present (or null on Bedrock) |
| **3. Repeat of a long stable prefix** | Does caching actually engage | second call reports `cacheReadTokens > 0` |

Call 3 needs a prefix above the model's minimum cacheable size — a few hundred tokens is not
enough on most models, and below the floor caching silently no-ops with no error at all.
Paste roughly two thousand tokens of stable filler into `system` and reuse it byte-identically.

Keep `maxOutputTokens` small. Verification should cost cents, not dollars.

---

## Per provider

### `claude-api.ts` (Anthropic Messages)

```ts
import { createClaudeApiAdapter } from './adapters/claude-api.ts';

const a = createClaudeApiAdapter({ apiKey: process.env.ANTHROPIC_API_KEY! });
const r = await a.complete({
  model: '<a model id from references/sota-snapshot.md>',
  system: STABLE_PREFIX,          // ~2k tokens, byte-identical between calls
  messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
  maxOutputTokens: 16,
  cache: { mode: 'auto', ttl: '5m' },
});
```

Assert:

- `r.usage.inputTokens` **equals** the raw `input_tokens` — this provider is exclusive, so
  the adapter must not have subtracted the cache read.
- Second identical call: `r.usage.cacheReadTokens > 0` and `inputTokens` drops to near zero.
  The cold call should instead show a large `cacheWriteTokens`.
- With `reasoning: { enabled: true, budgetTokens: 1024 }`:
  `r.usage.reasoningTokens <= r.usage.outputTokens`.
- `r.servedModel` is a **dated snapshot id**, not the alias you sent, if you sent an alias.
  Price the snapshot.

### `openai.ts`

Same shape, `createOpenAiAdapter({ apiKey, surface: 'responses' })`.

Assert:

- `r.usage.inputTokens + r.usage.cacheReadTokens === usage.input_tokens` from the raw
  payload — this provider is **inclusive**, the opposite of Anthropic. If they are equal
  instead, the adapter failed to subtract and you are paying full input rate for the cache.
- `reasoningTokens <= outputTokens` on a reasoning model.
- **If you use `surface: 'chat'`, verify the totals identity explicitly**:
  `prompt_tokens + completion_tokens === total_tokens`. The nesting of reasoning inside
  `completion_tokens` on this surface is documented at **medium confidence** — inferred from
  the naming convention and the totals identity, not stated in prose. This assertion is the
  one that would catch it being wrong. If it fails, stop and re-read the current reference
  before trusting any Chat Completions cost figure.

### `azure-openai.ts`

```ts
const a = createAzureOpenAiAdapter({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  deployment: '<your deployment name>',
  apiVersion: '<your api version>',
  routingTier: 'global-standard',   // must match the portal
});
```

Assert everything from `openai.ts`, **plus the two Azure-specific traps**:

- `r.requestedModel` is your **deployment name** and `r.servedModel` is a **model id**, and
  they differ. Then go look at the portal and confirm the served id is the model you believe
  that deployment is pinned to. If it is not, your cost model has been describing a different
  model than the one running, and nothing would have told you.
- `routingTier` in the config matches what the portal shows. There is no way to read it back
  from a completion response, so a mismatch here silently applies the wrong multiplier to
  every call from this deployment.

Also confirm the price-sheet load assertion is active: output rate must exceed input rate for
every text model row. A public price feed has been observed returning a data-zone model's
input and output meters transposed, and the resulting overcharge looks entirely plausible.

### `bedrock.ts`

```ts
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
const a = createBedrockAdapter({
  client: new BedrockRuntimeClient({ region: 'us-east-1' }),
  converseCommand: ConverseCommand,
  region: 'us-east-1',
});
```

Assert:

- `r.usage.inputTokens` equals the raw `inputTokens` — exclusive provider, no subtraction.
- `r.usage.reasoningTokens === null`. **If anyone has "fixed" this to 0, revert it.** Null
  means unknown; zero asserts that no reasoning occurred, and a reasoning-share metric built
  on that reads a confident zero percent on a reasoning-heavy workload.
- `r.usage.totalTokensReported === inputTokens + cacheReadTokens + cacheWriteTokens +
  outputTokens` — a clean two-term-plus-cache identity with reasoning invisible inside output.
- `parseBedrockModelId(r.servedModel).routingTier` matches the inference profile you called.
  Global and regional profiles price differently and the prefix is part of the pricing key.
- Cache: `cachePoint` needs a longer minimum prefix here than the direct Anthropic API. If
  `cacheReadTokens` stays at zero on a repeat call, lengthen the prefix before concluding the
  adapter is broken.

---

## Updating the STATUS header honestly

When and only when the assertions above have actually passed **in a session you ran**,
replace the header block with:

```
/**
 * STATUS: VERIFIED — executed against the live API on <YYYY-MM-DD>.
 * Verified: <YYYY-MM-DD>   Last spec review: <YYYY-MM-DD>
 * Verified by: <who>, against <model id>, surfaces: <e.g. responses + chat>.
 * Invariants asserted: input-side (never subtract twice), output-side (never add twice),
 * served-model resolution, cache engagement on repeat call.
 */
```

Three rules, and they exist because each has a plausible-looking violation:

1. **The `Verified:` date is the date the test actually ran.** Not today's date because you
   are editing the file today, not the date on the vendor's documentation page, and not the
   date a previous session claimed. This mirrors the provenance guard on prices: a verified
   date may only be advanced by a session that did the verifying. If you are updating this
   file without having run the calls, the date does not move.
2. **Record what you did NOT verify.** Verifying `responses` does not verify `chat`.
   Verifying one deployment does not verify another routing tier. Verifying without a cache
   hit does not verify the cache path. Narrow the claim in the header rather than widening it
   by omission — `Verified: 2026-08-02 (responses surface only; chat unverified)` is an
   honest and useful header.
3. **A partial pass leaves the header as UNVERIFIED**, with a note about what passed. There
   is no intermediate status, because a half-verified adapter in a client-facing context
   behaves exactly like an unverified one.

Finally, append an entry to `LEARNINGS.md` with the date, the provider, and anything the live
payload did that the specification did not predict. A field that was absent, a name that
differed, a total that did not reconcile — that is exactly the material the next refresh
needs, and it is lost if it stays in your terminal scrollback.
