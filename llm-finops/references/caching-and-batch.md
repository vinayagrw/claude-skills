# The caching ladder — decision rules

Five layers, cheapest and safest first. **Do not skip to semantic caching.** It has the worst
benefit-to-risk ratio of anything here and it is where most teams start, because it is the layer
with the best marketing.

```
L0  Don't call the model         deterministic compute, lookup tables, regex, derived KPIs
L1  Prompt / context cache       ~90% off the repeated prefix at steady state, near-zero risk
L2  Exact response cache         full saving on identical inputs, zero correctness risk
L3  Semantic response cache      full saving on similar inputs, REAL correctness risk
L4  Batch API                    ~50% off everything, costs latency
```

Each section below is a **rule you can apply**, not a description of a feature. If a section does
not tell you when to turn something on and when to leave it off, it is not finished.

No dollar figures appear in this file. Multipliers and break-even counts are ratios and are safe to
quote; absolute prices live only in `references/sota-snapshot.md`.

---

## L0 — The cheapest token is the one you never send

Before any cache: **does this need a model at all?**

Compute host-side anything code can compute — aggregations, sorts, counts, KPI tiles, gauges,
sparkline series, unit conversions, date math, sorting a list of results. This is a full saving
*and* a quality improvement: deterministic numbers do not hallucinate.

Rule: if the output is a number, a sort order, a boolean, or a value already present in your data,
write a function. Reach for a model only where the value added is language, judgement, or
extraction from unstructured input.

---

## L1 — Prompt / context caching

### Universal prerequisite, both providers

**Stable-first prompt layout with byte-identical prefixes.** Prefix matching is exact — including
whitespace. No timestamps, UUIDs, request ids, user names, or shuffled retrieval results before the
cache breakpoint.

```
system → tools/schema → static corpus → [BREAKPOINT] → conversation history → user turn
```

If you get this wrong, everything below this line is moot: you will pay full price forever and see
no error. (source: Claude Platform prompt-caching docs, ai.google.dev caching docs;
as_of_date: 2026-07-19; confidence: high)

### Anthropic — TTL decision rule

```
gap between calls < 5 min                       → ttl '5m'   break-even at N = 2
gap 5–60 min AND ≥ 2 calls/hour on this prefix  → ttl '1h'   break-even at N = 3
gap > 60 min, or fewer than 2 calls/hour        → no cache   the write premium never recovers
prefix below the model's minimum                → no cache   it silently no-ops
```

The multipliers against base input price are: **5-minute write 1.25x, 1-hour write 2x, cache read
0.1x either TTL**, universal across models. (source: Claude Platform prompt-caching docs;
as_of_date: 2026-07-19; confidence: high)

The break-even math, derived from those multipliers:

- 5m TTL over N calls costs `1.25 + 0.1(N-1)` against `N` uncached. At N=2 that is 1.35 versus 2.0
  — **32.5% saved on the prefix at just two calls.**
- Worst case, a write that is never read, is **+25% on the prefix only** — not on the whole call.
- 1h TTL costs `2 + 0.1(N-1)`, break-even at N=3; and against repeated 5m misses (`1.25N`) it wins
  from N≥2 calls per hour.
- Steady state approaches **90% off the cached prefix.**

That asymmetry — 32.5% saved at two calls, 25% worst-case overhead on the prefix alone — is why the
default for any stable prefix at or above the model minimum is **cache on**. It is near-free
insurance, and treating it as an advanced optimization leaves money on the table by default.

**Cache hits refresh the 5-minute TTL at no charge.** A steady stream of calls under five minutes
apart keeps a cache alive indefinitely while paying only read rates. This is why "use 1h TTL to be
safe" is usually wrong — it doubles the write for a guarantee that hit traffic already provides.

**Minimum cacheable prefix varies by model, by up to 8x** — roughly 512 tokens at the low end to
4,096 at the high end, with Bedrock's floor sometimes higher than the direct API's for the same
model. Below the floor, caching does not error; it just doesn't happen. Encode the per-model floor
in the adapter and warn when a cache directive is set under it. (source: Claude Platform
prompt-caching docs; as_of_date: 2026-07-19; confidence: high)

Up to 4 explicit breakpoints are supported, with an automatic lookback over roughly the last 20
blocks that finds the longest previously cached prefix — so a growing conversation reuses cache
without you moving markers each turn.

### Gemini — implicit-first rule

```
default                                          → implicit caching, free and automatic
prefix below the model's minimum                 → no hit; restructure the prompt or accept full price
≥ ~4 hits/hour on the SAME prefix
     AND you need a guaranteed (not opportunistic) discount → explicit CachedContent
otherwise                                        → stay implicit
```

Implicit caching is on by default on recent models, requires no code change, and has **no write fee
and no storage fee** — you are simply billed at the cached rate when a prefix hit occurs. Minimum
prefix for a hit is roughly 2,048 tokens on the 2.5 series and 4,096 on the newer Flash and Pro
models. (source: ai.google.dev caching + pricing docs; as_of_date: 2026-07-19; confidence: high)

Explicit `CachedContent` objects bill as: a one-time creation at the standard input rate, plus
cached reads at roughly 90% off, plus **storage per million tokens per hour**. That storage fee is
what sets the break-even, and it is a *time* threshold, not a volume one:

> Explicit caching pays for itself at roughly **4 hits per hour per cache** on Pro-class models and
> a shade under 4 on Flash-class. Below that rate you are paying rent on an idle cache and explicit
> caching **loses money** against free implicit caching. (derived from published storage and cached
> read rates; as_of_date: 2026-07-19; confidence: high)

Explicit's real value is not a bigger discount — it is a **guaranteed** discount rather than an
opportunistic one. Use it for SLA'd workloads with a predictable cadence where you must be able to
promise a cost figure. Otherwise stay implicit.

**Adapter caveat:** explicit caching is not supported on Gemini's newer Interactions API — Google
is steering users toward implicit. The adapter throws a clear, actionable error when `explicit` is
requested there rather than silently doing nothing. (source: ai.google.dev caching docs;
as_of_date: 2026-07-19; confidence: high)

---

## L2 — Exact response cache

Key = a hash of everything that can change the output:

```
sha256(servedModel, system, messages, temperature, maxOutputTokens, toolsHash, promptVersion)
```

**Rule: on by default for any deterministic-ish surface (`temperature ≤ 0.3`); off for creative
surfaces.** Default TTL of about an hour, LRU-bounded, **scoped per tenant** by default.

Correctness risk is zero *if and only if the key is complete*. The classic failure is omitting
`promptVersion`: you edit the prompt, the key doesn't change, and the cache serves answers from the
old prompt forever. Include the prompt version explicitly and bump it on every edit.

Two operational cautions:

- A per-process LRU across N replicas has an **N-times miss rate** — the same multi-process defect
  documented for `BudgetStore` in `references/runtime-patterns.md` §6.3. Use a shared store when
  you deploy more than one instance, or expect the measured hit rate to disappoint.
- Cache entries are user data. Scope per tenant and per permission boundary by default; widening
  the scope is a deliberate decision with a security review attached, not a config default.

---

## L3 — Semantic response cache (opt-in, off by default)

**Budget it at a 20–45% hit rate, not the vendor-claimed 70–95%.** FAQ and support workloads sit at
the high end; open-ended chat at the low end. One production analysis found semantic caching added
only 5–8 percentage points over exact-match caching — meaning for many workloads L2 already
captures most of the value at none of the risk. (source: production write-ups aggregated in R6;
as_of_date: 2026-07-19; confidence: medium — multiple secondary sources, no primary benchmark.
Vendor hit-rate claims are explicitly **rejected** as marketing.)

Enable only when **all four** hold:

1. **Measured L2 hit rate is already above ~10%** — proving query repetition actually exists in
   your traffic — and semantic uplift over L2 has been *measured*, not assumed.
2. **The workload tolerates approximate matching.** FAQ, support deflection, classification: yes.
   Anything computing numbers, quoting policy, or making a decision: no. A near-miss is served with
   a 200 and full confidence — there is no signal that it was wrong.
3. **Caches are scoped per tenant and per permission boundary.** Adversarial key-collision attacks
   on semantic caches are published research; poisoned entries can be served to other users.
   (source: arXiv 2601.23088; as_of_date: 2026-07-19; confidence: high)
4. **TTL *and* version-tagged invalidation exist.** LRU alone serves stale facts indefinitely —
   eviction by recency has no relationship to whether the answer is still true.

Mandatory instrumentation if you turn it on: hit rate, **false-positive rate** (sampled
deterministic or human review), and per-layer savings. A semantic cache whose false-positive rate
you cannot measure is a correctness liability wearing a cost-savings costume.

Tooling note: GPTCache, the lineage project, has had no release since 2024-08-01. Treat it as
reference architecture, not a production dependency. Managed options exist; evaluate them on your
own measured hit rate, never on their published one. (source: GitHub release history;
as_of_date: 2026-07-19; confidence: high)

---

## L4 — Batch APIs

**Triage question: is a human waiting for this response right now?** If no, batch it.

Roughly **50% off input and output** across Anthropic, OpenAI and Google alike. (source: vendor
batch docs, all three; as_of_date: 2026-07-19; confidence: high)

| Fits batch | Does not fit |
|---|---|
| Eval suites, nightly summarization, bulk classification and moderation, embedding backfills, dataset generation, re-scoring, report pre-generation | Interactive chat, agent loops with sequential dependencies, anything with a sub-hour hard SLA |

Latency is the price. Most batches complete well inside an hour, but the guarantee is 24 hours and
jobs **expire** at the ceiling. Never put a user-facing path behind a batch queue on the assumption
it will be fast.

### Stacking batch with caching

**Multipliers combine.** On Anthropic, a batched cache read is `0.1 × 0.5` = **5% of base input
price** on the cached portion. For a bulk job over a large shared prefix — the classic eval-suite
shape — this is the single largest lever in this document. (source: Claude Platform batch +
prompt-caching docs; as_of_date: 2026-07-19; confidence: high)

Two rules that follow:

- **Use 1-hour TTL inside batches.** Batch execution routinely spans more than five minutes, so a
  5m cache expires between requests in the same job and you pay the write repeatedly. This is the
  one common case where 1h beats 5m outright.
- **Cache pre-warming with a zero max-tokens request is not allowed in batch.** Warm the cache with
  a real synchronous call before submitting, or accept the write cost on the first batch item.

Encode the operational limits so a job fails at submission rather than halfway: Anthropic caps
around 100,000 requests or 256 MB per batch; OpenAI around 50,000 requests or 200 MB of JSONL with
a separate rate-limit pool; Gemini accepts JSONL or inline. (source: vendor batch docs;
as_of_date: 2026-07-19; confidence: high)

Adapters that do not support batch **throw** when `AdapterRequest.batch` is set. They must never
silently run the request synchronously at full price — a silent expensive fallback is the exact
failure this whole skill exists to prevent.

---

## 5. Verification — prove the cache is actually working

"We enabled caching" is a claim. The provider usage fields are the evidence. Every layer above has
a specific field that must move, and a specific number that means it isn't working.

| Layer | Evidence of a hit | It is NOT working if |
|---|---|---|
| L1 Anthropic / Bedrock | `cache_read_input_tokens` > 0 on the second call | both `cache_creation_input_tokens` and `cache_read_input_tokens` are 0 — the prefix is under the model floor |
| L1 Gemini | `cachedContentTokenCount` > 0 (Interactions API: the cached-tokens field on `usage`) | it stays 0 across identical calls — prefix too short, or not byte-identical |
| L1 OpenAI / Azure | `prompt_tokens_details.cached_tokens` > 0 | it stays 0 — something varies before the breakpoint |
| L2 exact | `cacheLayer: 'exact'` on the ledger entry, `costUsd` 0 | hit rate near zero on repetitive traffic — check the key includes `promptVersion` and nothing volatile |
| L3 semantic | hit rate **and** sampled false-positive rate | you cannot state the false-positive rate — then turn it off |
| L4 batch | `batch: true` on the entry and roughly halved unit cost | unit cost matches sync — the adapter fell back |

**Ship this as a test, not a hope:**

```ts
// assertCacheWorking(): run the same prefixed request twice; the second must read cache.
const a = await adapter.complete(reqWithStablePrefix);
const b = await adapter.complete(reqWithStablePrefix);   // byte-identical prefix
assert(b.usage.cacheReadTokens > 0,
  'cache never fired: check prefix length vs model floor, byte-identity, and TTL');
```

This exists because the most common caching bug is asymmetric: code that **reads** the cache usage
fields and reports them proudly, while never actually **setting** the cache directive. The read
side succeeds, the numbers are all zero, and zero looks like "no hits yet" rather than "broken."
The test fails loudly instead.

`summarize()` exposes `cacheHitRate` as `cacheReadTokens / (inputTokens + cacheReadTokens)`. Watch
it in the same dashboard as cost. A cache hit rate that silently drops to zero after a prompt edit
is one of the fastest ways to double a bill without changing a single price.

---

## Decision summary

1. Can code compute it? Then do not call a model. (L0)
2. Is there a stable prefix at or above the model's floor? Turn prompt caching **on** — it breaks
   even at two calls. Choose TTL by call cadence, not by caution. (L1)
3. Is the surface near-deterministic? Turn the exact response cache **on**, with a complete key
   including `promptVersion`, scoped per tenant. (L2)
4. Do you have a measured L2 hit rate above ~10%, an approximate-tolerant workload, per-tenant
   scoping, and false-positive instrumentation? Only then consider semantic. (L3)
5. Is nobody waiting? Batch it, with a 1-hour cache TTL inside the job. (L4)
6. Then **verify** with the token fields. An unverified cache is an assumption on your invoice.
