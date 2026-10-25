# Reasoning-token semantics per provider

**Verified 2026-07-19 against primary vendor API references. Confidence: high, except the one
row marked medium.**

This is the single most dangerous cost-math trap in the skill, because it fails silently and
in different directions on different providers. Nothing crashes. You get a number, it looks
like a number, and it is wrong by the size of the thinking budget — which on a reasoning
workload is frequently larger than the visible answer.

## The table

| Provider / surface | Output field | Reasoning field | Semantics | `reasoningInOutput` | Billable output |
|---|---|---|---|---|---|
| **Gemini `generateContent`** | `candidatesTokenCount` | `thoughtsTokenCount` | **ADDITIVE** — sibling | `'additive'` | `candidates + thoughts` |
| Anthropic Messages | `usage.output_tokens` | `usage.output_tokens_details.thinking_tokens` | **NESTED** — subset | `'nested'` | `output_tokens` |
| Claude Code CLI | `result.usage.output_tokens` | *(not broken out)* | **NESTED** — subset, unreported | `'nested'` | `output_tokens` |
| OpenAI Responses | `usage.output_tokens` | `output_tokens_details.reasoning_tokens` | **NESTED** — subset | `'nested'` | `output_tokens` |
| OpenAI Chat Completions | `usage.completion_tokens` | `completion_tokens_details.reasoning_tokens` | **NESTED** — subset *(medium confidence)* | `'nested'` | `completion_tokens` |
| Azure OpenAI | as OpenAI | as OpenAI | **NESTED** | `'nested'` | as OpenAI |
| Bedrock Converse | `usage.outputTokens` | *(no field exists)* | **FOLDED IN** — invisible | `'folded'` | `outputTokens` |

**Gemini is the only additive provider, and it is this skill's shipped default.** That
coincidence is the whole reason this file exists. A design that shipped one `computeCost`
with no inclusion flag would have undercounted output cost by the entire thinking budget on
its own recommended path.

## The two mirror-image invariants

They are mirror images because they fail in opposite directions, and because the instinct
that protects you on one side is exactly what harms you on the other.

### Output side: never add twice

```
'additive'          billableOutput = outputTokens + reasoningTokens
'nested' | 'folded' billableOutput = outputTokens
```

- Adding reasoning on a nested provider **double-charges every reasoning token**.
- Omitting it on Gemini **undercharges by the whole thinking budget**.

Assertions that catch a regression:

- `'nested'` → `reasoningTokens <= outputTokens`. Reasoning is inside output; if it exceeds
  it, either the containment relationship changed or the wrong field was mapped.
- `'additive'` → `promptTokenCount + thoughtsTokenCount + candidatesTokenCount ===
  totalTokenCount`. This identity is the *evidence* for additive billing, not merely a
  consistency check: the provider enumerates thoughts as a third addend alongside prompt and
  candidates. If it stops holding, stop trusting the output cost until you have re-read the
  reference. **Fail loudly — do not default.**
- `'folded'` → `reasoningTokens === null`.

### Input side: never subtract twice

The same class of error, one field over. Providers disagree about whether their prompt total
already excludes the cached portion, and there is no way to tell from the field names.

| Provider | Prompt total is… | Uncached input = |
|---|---|---|
| Gemini | **inclusive** of `cachedContentTokenCount` | `promptTokenCount - cachedContentTokenCount` |
| OpenAI / Azure | **inclusive** of `*_details.cached_tokens` | `prompt total - cached_tokens` |
| Anthropic | **exclusive** already | `input_tokens` (do not subtract) |
| Claude Code CLI | **exclusive** already | `input_tokens` (do not subtract) |
| Bedrock | **exclusive** already | `inputTokens` (do not subtract) |

Subtracting where you should not understates input by the whole prefix. Failing to subtract
where you should charges the cached prefix at full input rate — which makes prompt caching
appear to have done nothing, and is the most likely reason someone concludes "caching didn't
help us" while their cache-read counters are healthy.

Per-adapter assertion: `inputTokens + cacheReadTokens === providerPromptTotal` for the
inclusive providers, `inputTokens === providerPromptTotal` for the exclusive ones.

## Why `null` and not `0` on Bedrock

`0` asserts *there were none*. `null` asserts *I do not know*. Bedrock exposes no reasoning
field at all, so only the second statement is true.

Write `0` and every derived metric inherits a false claim. A "reasoning share of output"
dashboard reports a confident 0% on a reasoning-heavy Bedrock workload, and the obvious
conclusion — that disabling thinking would save nothing here — is exactly backwards. The
number is plausible, stable and wrong, which is the worst combination available. `null`
propagates as unknown and forces the honest answer: measure reasoning share on a provider
that reports it, or measure it out of band.

This generalises past this one field. Anywhere a provider cannot tell you something, the
normalised record must say *unknown* rather than pick a value that happens to type-check.

## Two things that are never safe on any provider

**Never re-tokenize the response body to derive output tokens.** Anthropic bills the full
reasoning it generated, not the shorter summarized thinking returned in the response — the
visible text will not add up to the billed count, by design. OpenAI does not return reasoning
at all. Bedrock does not either. The usage object is the only billing-truthful source on
every provider here.

**Never assume reasoning is priced at the output rate forever.** It is today on every
provider in this table, which is why `computeCost` uses a single output rate. That is a
*pricing-page* fact, not an *API-reference* fact, and it is the assumption most likely to
break first. If any provider ever prices thinking separately, this table stays correct and
`computeCost` needs a distinct `reasoningRate`. Flagged as a known follow-up; re-check it at
each price refresh.
