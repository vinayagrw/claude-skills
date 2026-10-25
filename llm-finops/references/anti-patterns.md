# Anti-patterns

Fourteen ways LLM cost engineering goes wrong. AP-01..AP-08 are **observed failures** in a real
production-adjacent codebase (`rnd-trust-graph`, a Ciklum pre-sales demo audited 2026-07-19) — not
hypotheticals. AP-09..AP-14 come from the July-2026 research pass and describe failures that appear at scale
or after a price change.

Each entry: **symptom you would observe** -> **why it costs money or corrupts numbers** -> **the fix** ->
**which shipped template solves it** -> **detect**.

The detect commands are ripgrep one-liners for Windows. They are a *manual check with known limits*, not a
linter: a regex over SDK call shapes is fragile across frameworks, and a linter that misses a call site is
worse than none because it manufactures confidence. Read the hits; use judgement.

Every dollar figure in this skill lives in `references/sota-snapshot.md`. Statements here are relative and
dated.

---

## AP-01 — Unmetered bypass call sites

**Symptom.** Ledger request count is materially below the provider console's, and the gap is stable rather
than noisy. One feature never appears in the by-surface breakdown. More files import the provider SDK than
import your metered wrapper.

**Why it costs.** Money is not the first casualty — *truth* is. An unmetered path spends real dollars your
model does not know about, so every derived number (cost per conversation, per tenant, forecast) is understated
by an unknown amount. You then present it to a client. In the reference project a playbook module called the
model with no surface tag *and* carried its own raw cloud-fetch branch: two bypasses in one file. (Reference
project audit, as_of 2026-07-19, confidence: high — read from the codebase.)

**Fix.** Exactly one choke point: one wrapper that resolves the provider, records provider-reported usage,
tags a surface, and applies the budget check. Raw SDK imports outside `adapters/` are forbidden by convention
and checked in review. The surface tag is a **required argument**, not an optional field with a default — an
optional tag becomes an untagged call within two sprints.

**Template.** `templates/metered-llm.ts`, `templates/ledger.ts`.

**Detect.**
```
rg -n "new (Anthropic|OpenAI|GoogleGenAI)|@google/genai|@anthropic-ai/sdk" src --glob "!src/**/adapters/**"
rg -n "generateContent|messages\.create|chat\.completions\.create" src --glob "!src/**/adapters/**"
```
Then cross-check: ledger request count for a period vs. the provider console for the same period. A persistent
gap is the strongest evidence.

---

## AP-02 — The codebase has exactly one budget behaviour and no one chose it

**Framing.** The defect is the **unchosen default**, not advisory mode. This skill ships `advisory` as its
deliberate, documented default because for pre-sales demos and early builds a false hard-stop is worse than an
overrun. What went wrong in the reference project was different: a budget value existed, the meter turned amber
and red, and the team *believed* they had a control. They had a display. Nobody had decided.

**Symptom.** Grep the config for a budget mode and find nothing — a budget value and a warn threshold, but no
field naming the enforcement behaviour. Two engineers give two answers for what happens at 100%. The dashboard
has a red state no code path reads.

**Why it costs.** An unchosen default is unbounded downside with the *feeling* of a cap. The overrun lands at
the worst time — a demo loop, a runaway agent, a traffic spike — and the post-mortem sentence is always "we
thought that stopped it."

**Fix.** Make the mode an explicit named field with a stated intent, switchable in one line. Ship all three:
`advisory` (alert only, never blocks); `soft-degrade` (at threshold force the cheapest tier, disable escalation
and reasoning, halve max output; at cap fall through to the zero-cost transport, then deterministic output);
`hard-stop` (refuse paid calls at cap). Then write the escalation triggers down so the choice is revisited on
evidence:

> Move off `advisory` when any of these is true: production traffic from real customers; spend charged back
> per customer or tenant; autonomous agent loops or parallel subagents in the workload; a single tenant able to
> drive unbounded volume; or monthly spend past the threshold in `references/sota-snapshot.md`. Use
> `soft-degrade` for user-facing apps — graceful quality reduction beats an outage. Use `hard-stop` for batch
> and offline jobs and per-tenant caps, where refusing is correct.

**Per-agent envelopes are enforced in all three modes, including advisory.** This is the one deliberate
exception and it is the right one: advisory means "a budget threshold must not break the user's app", not "let
a looping agent spend without limit". An envelope breach kills one agent; the orchestrator collects partial
results and continues.

**Template.** `templates/budget.ts`, `templates/config/llm.ts`.

**Detect.**
```
rg -n "budgetMode|budgetUsd|maxSpend|spendLimit|overBudget|pctUsed" src
```
If `overBudget` is only read by a UI component and never by a call-path guard, you have a display.

---

## AP-03 — Character-count cost estimation

**Symptom.** A `chars / 4` or `text.length / 4` in the cost path. A ledger field `estimated: true` on a nonzero
share of entries. Ledger and invoice diverge by tens of percent, inconsistently by feature.

**Why it corrupts numbers.** Four-characters-per-token is folk knowledge from an older English-text tokenizer.
It is wrong for code, JSON and non-Latin scripts, wrong across vendors, and as of the Claude 5 era wrong for
plain English too — Opus 4.7+, Fable 5 and Sonnet 5 emit roughly 30% more tokens for identical text than
earlier Claude models (R1/R8 dossiers, as_of 2026-07-19, confidence: medium — vendor-adjacent reporting).
Worse, the estimate is structurally blind to cache reads, cache writes and thinking tokens — exactly the fields
that make the real bill differ from the naive one. An estimate that is wrong *and* blind is not a fallback; it
is noise with a decimal point.

**Fix.** Read provider-reported usage fields, always. If a transport genuinely cannot report usage, record
`estimated: true` and treat a nonzero `estimatedRate` in `summarize()` as a **defect signal**, not a steady
state. Never present an estimated figure to a client without the band.

**Template.** `templates/adapters/*.ts`, `templates/adapters/usage-invariants.test.ts`.

**Detect.**
```
rg -n "/ *4\b|length *[/*] *4|estimateTokens|approxTokens|charsPerToken|estimated *: *true" src
```

---

## AP-04 — Paying full price for context you send every turn

**Symptom.** The ledger reads cache-token fields and they are always zero. A conversational endpoint re-sends
the same tool schema, system prompt or retrieved corpus every turn. Cache-hit rate renders as "0%" rather than
as an alert, so nobody notices.

**Why it costs.** Cache reads bill at a small fraction of base input on every major vendor, and on Anthropic
batch discounts stack on top of cache reads. Repeated context is the largest recoverable line in most chat and
RAG workloads. In the reference project the ledger parsed both cache-read and cache-creation fields faithfully
— and nothing in the codebase ever set a cache breakpoint.

**Fix.** Stable content first, volatile content last. System prompt, tool definitions and retrieved documents
at the front; user turn, timestamps, UUIDs and session ids after the breakpoint. Anthropic needs an explicit
cache marker, Gemini caches implicitly on 2.5+ with no write surcharge — but *the layout rule is identical*,
which is why it is worth learning once. Verify with usage fields, never by assertion: a nonzero cache-read
count is the only proof. Minimum prefix lengths apply (`references/caching-and-batch.md`); below them caching
silently no-ops.

**Template.** `templates/metered-llm.ts`, `references/caching-and-batch.md`.

**Detect.**
```
rg -n "cache_control|cachedContent|cache_read_input_tokens" src
rg -n "new Date\(|Date\.now\(|randomUUID|uuidv4" src --glob "**/prompt*"
```
The second finds volatility placed before a breakpoint — the most common reason a correctly-marked cache never
hits.

---

## AP-05 — No retry, no backoff, no batch lane

**Symptom.** A single transient 429 or 503 drops straight to the deterministic fallback; fallback rate tracks
provider incidents rather than genuine model failures. Every offline job — nightly summaries, backfills, bulk
classification, the eval suite — runs on the synchronous API.

**Why it costs.** Two ways. Quality: an instant fallback turns a recoverable blip into a degraded, often
visible, answer. Larger: work with no human waiting is billed at synchronous rates when every major vendor
sells the same tokens at a flat discount on an asynchronous batch lane — available on Anthropic, OpenAI and
Google, and on Anthropic compounding with cache reads. (Vendor pricing pages, as_of 2026-07-19, confidence:
high — see `references/sota-snapshot.md`.)

**Fix.** A bounded retry table keyed by failure reason: retry rate-limits and transient server errors with
exponential backoff and jitter; never retry auth failures, schema violations or ungrounded output. Then apply
the triage question at every call site — **is a human waiting for this response right now?** If no, it belongs
in the batch lane.

**Template.** `templates/fallback.ts`, `references/caching-and-batch.md`.

**Detect.**
```
rg -n "retry|backoff|maxAttempts|exponential" src
rg -n "batch|Batch" src --glob "**/{jobs,workers,cron,eval}/**"
```
Zero hits from the first plus a populated `jobs/` directory is the classic shape.

---

## AP-06 — Coarse surface labels hide per-stage economics

**Symptom.** A multi-call pipeline — planner, N workers, reflexion pass — logs every call under one label. The
breakdown shows one large bar. Asked "what would we save by dropping the reflexion round?", the honest answer
is "we don't know."

**Why it corrupts numbers.** Optimisation requires attribution. A single fat label says the pipeline is
expensive without saying which part to cut, so the team optimises the wrong stage or does nothing. It also
blocks the most valuable pre-sales question: which stage scales with input size and which is fixed per request.

**Fix.** Label per stage, not per feature: `dashboard:plan`, `dashboard:worker`, `dashboard:reflexion`. Keep
the coarse surface as a separate dimension so both rollups exist.

**Template.** `templates/ledger.ts` — surface + stage dimensions, and `otelSink()` puts the same tags on
OTel spans so the split survives into your observability stack.

**Detect.**
```
rg -no "surface *: *[\"'][^\"']+" src | sort | uniq -c
```
Far fewer distinct surfaces than distinct LLM call sites means labels are reused across stages.

---

## AP-07 — Undated model ids and a silent default price

**Symptom.** A hand-maintained price table commented "as of 2026-06". Model ids with no version date. And
critically, a `priceFor(model)` that falls back to a default rate on an unknown id — silently, returning a
number, logging nothing.

**Why it corrupts numbers.** The most dangerous entry here, because it fails *quietly and plausibly*. Change a
model id, deploy, and every call prices at the default rate. The ledger keeps producing confident dollar
figures. Nothing errors. The divergence surfaces on the invoice, weeks later, in front of whoever asked for the
forecast. Between 2026-05-19 and 2026-07-19 alone the market produced three new Claude models, a repriced fast
mode, two silently withdrawn SKUs, a *scheduled* 50% increase on Sonnet 5 effective 2026-09-01, and a new
OpenAI cheap tier that reset the cross-provider floor. A price table written as static prose is wrong within a
quarter. (R8 dossier, as_of 2026-07-19, confidence: high.)

**Fix.** Four cheap parts:
1. **Dated ids.** Pin the exact versioned id, never a floating alias. Record the *served* model alongside the
   requested one; a nonzero `modelDriftRate` means your cost model describes a system you do not have.
2. **A price-lookup miss is an alert, not a fallback.** Log loudly, mark `pricingUnknown: true`, surface it in
   `summarize()`. Never silently substitute a rate.
3. **One source of truth.** Prices live in `references/sota-snapshot.md`; `pricing.ts` is *generated* from it
   by `scripts/init-finops.mjs`, never hand-maintained in parallel.
4. **A freshness gate.** `scripts/check-prices.mjs` grades each row FRESH / AGING / STALE / KNOWN-WRONG.

**Template.** `templates/pricing.ts` (generated), `scripts/check-prices.mjs`, `references/sota-snapshot.md`.

**Detect.**
```
rg -n "defaultPrice|DEFAULT_PRICE|fallbackPrice" src
rg -n "\"(claude|gemini|gpt)-[a-z0-9.-]*\"" src | rg -v "\d{8}|\d{4}-\d{2}"
```
The second lists model ids carrying no date component.

---

## AP-08 — A configured-but-unwired capability counted as shipped

**Symptom.** Config names a judge model. A UI shows a metric. The value is always `null`. No code path
constructs the call. The feature appears in the architecture diagram, the cost model and the client deck.

**Why it costs.** Twice, in opposite directions. The cost model *includes* spend that never happens, so the
forecast is inflated and the eventual reconciliation looks like an unearned win. And the quality control the
client believes protects them does not exist — the failure that actually damages a pre-sales relationship. In
the reference project a faithfulness judge model was configured and an answer-relevancy metric rendered in the
UI; no judge was ever wired.

**Fix.** A capability is shipped when a test exercises it end to end. Until then it is `planned` in config and
renders as "not enabled" wherever a human reads it; if it appears in a cost model, it appears as zero with a
footnote. This skill applies the rule to itself — the four adapters written from provider spec and never
executed carry a `STATUS: UNVERIFIED` header for exactly this reason.

**Template.** `templates/adapters/usage-invariants.test.ts` (a capability without a test is not shipped), `templates/VERIFY.md`.

**Detect.**
```
rg -n "judgeModel|evaluator|scorer" src
rg -n "TODO|FIXME|not implemented" src --glob "**/config/**"
```
For each capability named in config, confirm a test file references it.

---

## AP-09 — Unbounded parallel subagent fan-out

**Symptom.** An orchestrator spawns workers from a model-generated plan with no cap on concurrency,
alternatives or reflexion rounds. Session-cost distribution has a long right tail nobody can explain.

**Why it costs.** Fan-out multiplies, and the 2026 harness generation made it sharply worse: Claude Code's
dynamic workflows can spawn hundreds of parallel subagents in one session, and agent-team patterns have been
reported at roughly 7x the tokens of a single-agent run (R8 dossier, as_of 2026-07-19, confidence: medium —
vendor launch material plus practitioner reports). **A model deciding its own parallelism is a model deciding
your bill.**

**Fix.** Numeric caps chosen by a human and enforced in code, not suggested in a prompt: max concurrency, max
alternatives per branch, exactly N reflexion rounds, a wall-clock budget for the pipeline, and a per-agent
envelope so a looping branch kills itself. Plus the cheapest rule of all: **do not pay a model for what code
can compute.** KPI tiles, aggregations, sorting, filtering and schema validation are host-side work — the
reference project derived these deterministically and got them free.

**Template.** `templates/budget.ts` (per-agent envelopes, enforced in every mode), `templates/fallback.ts`.

**Detect.**
```
rg -n "Promise\.all|Promise\.allSettled|p-map|pLimit|concurrency" src
```
A `Promise.all` over a model-produced array is an unbounded fan-out unless a limiter wraps it.

---

## AP-10 — Budget counters that reset, and multiply across replicas

**Symptom.** A budget module summing an in-memory ring buffer. It passes its unit tests. It is deployed to N
replicas behind an autoscaler.

**Why it costs.** A monthly cap computed per process is an N-times cap across N replicas, unbounded under
autoscaling. A calendar-month window computed over a fixed-size ring is arithmetically wrong once call count
exceeds ring size — the window silently shortens. A restart resets the counter, so deploys refund the budget.
Note which mode this bites hardest: `hard-stop` is exactly the mode you would choose for per-tenant caps and
batch jobs, which are the *most* likely to be multi-instance. **The mode with the strongest safety claim is the
one most likely to be silently inert.** This is AP-02 in a better suit.

**Fix.** Make the counter store an explicit injected interface. The in-process store is the default and is
documented — in its own doc comment and in `SKILL.md` — as **single-process only**. Shared-counter shapes
(Redis, or a callback into your own store) are documented. State plainly at the top of the file that
`hard-stop` requires a shared counter or a gateway virtual key to mean anything multi-instance. Report the
active store from `health()` so the limitation is visible at runtime rather than discovered from an invoice.
The same defect applies to any per-process response cache: an in-process LRU has an N-times miss rate across
replicas.

**Template.** `templates/budget.ts` (`BudgetStore`, `memoryStore()` / `redisStore()` / `callbackStore()`),
`references/observability.md`.

**Detect.**
```
rg -n "BudgetStore|memoryStore|new Map\(\)|entries\.slice" src --glob "**/budget*"
rg -n "replicas|autoscal|HPA" -g "*.{yaml,yml,tf}" .
```

---

## AP-11 — Routing that saves sticker price and destroys the cache prefix

**Symptom.** A router switches model or provider mid-conversation to chase a cheaper rate. Cache-read tokens
collapse at exactly the turns where the switch happens. Measured spend goes *up* after the router ships.

**Why it costs.** **Cache economics dominate routing economics.** A cached prefix bills at a small fraction of
base input; the spread between two comparable tiers is a fraction of the spread between cached and uncached. A
router saving 30% on sticker price by switching providers mid-conversation throws away a prefix worth up to
90%. The same destruction happens for free, with no router at all, whenever tool definitions change mid-session
or an MCP server is added or removed — the tool block sits before the breakpoint, so changing it invalidates
everything after it.

**Fix.** Pin model *and* provider for the life of a session. Route at session start, or at a clean boundary
where no prefix is being reused. Treat auto-routers as A/B-tested cost levers behind an eval harness, never as
a default. Do not change MCP server sets or system-prompt files mid-session.

**Template.** `templates/config/llm.ts` (pinning is a config property, not a runtime decision),
`references/observability.md` (the routing-vs-cache constraint).

**Detect.**
```
rg -n "router|routeModel|selectModel|pickModel" src
rg -n "session|conversationId|threadId" src --glob "**/{router,routing}*"
```
A router taking no session identifier cannot pin, and therefore cannot preserve a prefix.

---

## AP-12 — Cost models built on sticker price

**Symptom.** A spreadsheet comparing providers by per-MTok rate, with the recommendation following directly
from which column is smaller. No measurement of tokens actually consumed per task on each candidate.

**Why it corrupts numbers.** Two independent effects break naive rate comparison and they compound. **Tokenizer
inflation:** Claude 5-era models emit roughly 30% more tokens for identical text than the 4.5 generation, so a
rate behaves worse than it reads. **Tokens-per-task variation:** one measured comparison put a Gemini CLI task
at roughly 65% more input tokens than Claude Code on the same task. So:

> A model 30% cheaper per token that burns 65% more tokens is **more expensive**.

(R1/R2/R8 dossiers, as_of 2026-07-19, confidence: medium overall; **low** for the tokens-per-task magnitude —
a single measured example. Design around the direction, not the number.)

**Fix.** Measure. Run a fixed task fixture across candidates, capture provider-reported token counts, multiply
by the dated rate from the snapshot, compare real cost per task. This is also the only method that stays
correct when prices move — and one move is already scheduled for 2026-09-01. Re-run rather than re-argue.

**Template.** `scripts/compare-providers.mjs`, `references/unit-economics.md` (presenting the result with its
band).

**Detect.**
```
rg -n "perMTok|pricePerMillion|costPerToken" src docs
rg -n "compare-providers|tokens.?per.?task" .
```
Absence of the second is the finding.

---

## AP-13 — Reasoning tokens dropped or double-counted

**Symptom.** Ledger output-token totals sit below the provider's on reasoning-heavy workloads, and the gap
scales with the thinking budget. Or a "reasoning share" metric reporting 0% on a workload you know reasons
heavily.

**Why it corrupts numbers.** Providers disagree about *inclusion semantics*, and the difference is not
documented anywhere you would look. Gemini reports thinking tokens as a **sibling addend** — billable output is
`candidatesTokenCount + thoughtsTokenCount`. Anthropic and OpenAI report reasoning as a **nested breakdown**
inside the output count, so adding it again double-bills. Get Gemini wrong in the direction of the majority and
you undercount output cost by the entire thinking budget — in a system whose whole purpose is honest
measurement, and on this skill's default provider. Separately, Bedrock normalises reasoning to `null` rather
than `0`, so a naive share metric reports a confident 0% instead of "unknown". (Five primary vendor API
references, verified 2026-07-19, confidence: high.)

**Fix.** An explicit `reasoningInOutput` flag per adapter, never a uniform assumption — a single uniform cost
function is wrong for half the providers under either choice. Assert the mirror-image invariants and **fail
loudly** rather than defaulting: for `reasoningInOutput: true`, `reasoningTokens <= outputTokens`; for Gemini,
`promptTokenCount + thoughtsTokenCount + candidatesTokenCount === totalTokenCount`. Distinguish `null` (not
reported) from `0` (reported as none).

**Template.** `templates/adapters/*.ts`, `templates/adapters/usage-invariants.test.ts`, `references/adapters.md`,
`references/gemini.md` §4.

**Detect.**
```
rg -n "thoughtsTokenCount|reasoning_tokens|reasoningTokens|thinking" src
rg -n "outputTokens *=|output_tokens" src --glob "**/adapters/**"
```

---

## AP-14 — A default path that depends on a Preview or fast-mode SKU

**Symptom.** The default model id carries `preview`, `exp` or `-latest`, or config sets a `fast` / priority
speed mode. Everything works. Then one morning it does not, or the bill doubles with no code change.

**Why it costs.** Preview SKUs are withdrawn without a deprecation window and fast modes are repriced and
removed on the vendor's schedule, not yours — two fast modes were pulled within eight weeks in mid-2026, and
the obvious cheaper Flash-class default is Preview status. A hardcoded speed mode is now an audit item. And a
fast mode is a **latency purchase, not a cost lever**: a multiple of standard price for a smaller multiple of
speed, typically not batchable. (R8 dossier + vendor pricing pages, as_of 2026-07-19, confidence: high.)

**Fix.** No default path depends on a Preview SKU — this skill applies that to itself, which is why its default
chain is GA-only despite a cheaper Preview tier existing. Record the cheaper option and its risk in one
paragraph so the user can override in one line, with eyes open. Pin exact versioned ids. Treat any
speed/priority mode as an explicit latency decision with the multiplier written next to it.

**Template.** `templates/config/llm.ts` (GA-only defaults, Preview override documented),
`references/sota-snapshot.md` (GA vs Preview per model), `references/gemini.md` §1–2.

**Detect.**
```
rg -n "preview|-exp|latest|speed *: *[\"']fast|priority" src --glob "**/config/**"
```

---

## Using this file in a review

Work in this order, because the later checks depend on the earlier ones being true:

1. **AP-01, AP-03, AP-13** — is the measurement itself trustworthy? Nothing below matters if it is not.
2. **AP-07, AP-12** — are the prices and the token counts real and dated?
3. **AP-06** — is attribution fine-grained enough to act on?
4. **AP-04, AP-05, AP-14** — are the structural savings being taken?
5. **AP-02, AP-09, AP-10** — do the controls fire, in the topology you actually deploy?
6. **AP-08, AP-11** — does the system match its own description?

When you find one, log it in `LEARNINGS.md` with the date and the repo, so its real-world frequency informs
future versions of this file rather than staying in one session's memory.
