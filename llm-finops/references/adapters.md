# Adapters — usage-field mapping and cost-math semantics

**Load this when wiring or debugging any provider.** The authoritative per-provider table lives in
`templates/adapters/reasoning-semantics.md`, verified 2026-07-19 against primary vendor API
references (confidence: high, except one row marked medium). This file is the orientation layer:
what an adapter is responsible for, the two invariants that fail silently, and where to look next.

## What an adapter is, and is not

An adapter is **protocol only**. It translates one provider's wire format into `NormalizedUsage`
and hands back text plus the *served* model id. It contains **no cost logic, no pricing, no budget
awareness and no fallback decisions** — those live in `metered-llm.ts`, `pricing.ts`, `budget.ts`
and `fallback.ts` respectively.

The separation matters for one specific reason: adapters are the files most likely to be written
from documentation rather than executed against a live endpoint. Keeping cost math out of them
means a wrong adapter produces a wrong *token count* — which the usage invariants catch — rather
than a wrong *dollar figure*, which nothing catches.

**Raw provider SDK calls are legal ONLY inside `adapters/`.** That is what makes the choke point a
choke point. A meter with a bypass is not a meter (AP-01).

## Verification status — read before trusting a number

| Adapter | Status | What that means |
|---|---|---|
| `gemini.ts` | **VERIFIED** | Executed live; recorded fixtures replayed by `usage-invariants.test.ts` |
| `claude-code-cli.ts` | **VERIFIED** | Executed against the local CLI; recorded result fixture |
| `claude-api.ts` | ⚠ **UNVERIFIED** | Written from provider spec, never executed |
| `openai.ts` | ⚠ **UNVERIFIED** | Written from provider spec, never executed |
| `azure-openai.ts` | ⚠ **UNVERIFIED** | Written from provider spec, never executed |
| `bedrock.ts` | ⚠ **UNVERIFIED** | Written from provider spec, never executed |

An unverified adapter fails **silently**: you get a plausible `costUsd` that is wrong, not a crash.
Run `templates/VERIFY.md` before any number from one of these reaches a client-facing context.

## The two invariants that fail silently

Both are mirror images, and the instinct that protects you on one side harms you on the other.
Full tables, per-provider field names and the regression assertions:
`templates/adapters/reasoning-semantics.md`.

### Output side — never add reasoning twice

Gemini reports thinking tokens as an **additive sibling** of candidate tokens. Everyone else nests
them as a **breakdown** of output, and Bedrock Converse folds them in invisibly with no field at
all. One uniform cost function is therefore wrong for roughly half the providers under either
choice — hence an explicit `reasoningInOutput: 'additive' | 'nested' | 'folded'` flag per adapter.

Adding reasoning on a nested provider double-charges every reasoning token. Omitting it on Gemini
undercharges by the entire thinking budget, which on a reasoning workload is frequently larger than
the visible answer. **Gemini is the only additive provider and it is this skill's shipped default**
— that coincidence is why the flag exists.

### Input side — never subtract cache reads twice

Providers disagree about whether their prompt total already excludes the cached portion, and there
is no way to tell from the field names. Anthropic and Bedrock already exclude cache reads from
their input count; Gemini and OpenAI do not. Getting it backwards misstates cost by most of the
prefix — which is to say, by most of the cost on any workload with a stable prefix.

## Missing usage is a defect signal, never a guess

If a provider returns no usage block, the adapter sets `estimated: true` and raises a counter. It
**never** falls back to `chars/4` (AP-03). A nonzero `estimatedRate` in `summarize()` means an
adapter is flying blind and your unit economics are fiction; it is a bug to fix, not a rounding
note to accept.

Likewise, always record the **served** model, not the requested one. A nonzero `modelDriftRate`
means your cost model describes a system you do not have.

## Authoring a new adapter

1. Implement `LlmAdapter` from `templates/metered-llm.ts`.
2. Map usage fields explicitly and set `reasoningInOutput` — do not copy another adapter's flag.
3. Declare `supportsBatch`. Adapters lacking batch support must **throw** rather than silently
   running synchronously at full price.
4. Add a fixture under `templates/adapters/__fixtures__/` and a case to
   `usage-invariants.test.ts`. A field mapping without a replayed fixture is a mapping that will
   break quietly in a refactor.
5. Carry the UNVERIFIED block header until you have executed it live, then record the date.

## See also

- `templates/adapters/reasoning-semantics.md` — the authoritative per-provider table
- `runtime-patterns.md` — the choke point, tier chain and ledger schema the adapters feed
- `caching-and-batch.md` — cache exposure and discount stacking per provider
- `sota-snapshot.md` — the only file with rates; partner-cloud multipliers noted there
