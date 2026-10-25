---
name: llm-finops
version: 1.1.0
updated: 2026-07-20
description: >
  FinOps for LLM-powered software — controlling what the AI costs, both while you build it and
  after it ships. ALWAYS consult at the START of any work that will call an LLM: "build an app",
  "scaffold a service", "add an AI feature", "wire up an LLM call", "build a chatbot / agent /
  RAG pipeline", "integrate Gemini / Claude / OpenAI / Bedrock" — cost metering belongs in the
  first commit and is expensive to retrofit. This applies even when the request names no cost,
  model or AI vocabulary at all and only describes a product behaviour — "auto-draft replies to
  tickets", "summarise uploaded documents", "classify incoming emails", "generate descriptions",
  "let users ask questions about their data", "add smart search", "extract fields from PDFs":
  if shipping it means calling a model per user action, it has a per-request bill and belongs
  here before the first call site is written. Also use when the user says: "add cost tracking",
  "token tracking", "usage metering", "budget cap", "spend limit", "which model should I use",
  "is Opus overkill here", "reduce my Claude Code spend", "my token bill is too high", "use
  Gemini to save money", "what will this cost per user", "AI unit economics", "prompt caching",
  "batch API", "LLM gateway", "cost attribution per team", "LLM observability", "how much do our
  evals cost". For Anthropic model ids, API parameters and SDK syntax, defer to the claude-api
  skill; this skill owns cost decisions, budgets, metering and cross-provider comparison. Do NOT
  use for non-LLM cloud FinOps (EC2/S3/RDS rightsizing, reserved instances, K8s bin-packing),
  database/API latency "cost per query" questions, or ordinary financial accounting with no AI
  component. Prices in this skill are date-stamped and expire — see references/sota-snapshot.md
  before quoting any number.
---

# LLM FinOps

Two bills come out of AI work and they are routinely confused. **Dev-time spend** is what your coding assistant costs while the app is built — often a subscription, so one more session feels free right up until a usage window closes. **Runtime spend** is what the shipped app costs per request, forever. Different levers, different owners, different failure modes. Never sum them; label every figure `[dev-time]` or `[runtime]`.

**Boundary with `claude-api`:** that skill owns Anthropic model ids, parameters and SDK syntax. This one owns cost decisions, budgets, metering, caching economics and cross-provider comparison. Model-id questions there, money questions here.

> **Before stating any number, pass §1.** No exceptions, including "I'm fairly sure it's still…".

## §0 — ROUTER

One question: **is the money being spent by you (building it) or by the app (running it)?**

| Situation | Go to | Load |
|---|---|---|
| New project / scaffolding anything that will call an LLM | **§3 first, then §4** | `runtime-patterns.md` |
| "Add an AI feature / chat / agent / RAG to this app" | §3 | `runtime-patterns.md`, `adapters.md` |
| "What will this cost per user / per query / at N req/day?" | §3, §6 | `unit-economics.md` |
| "Cut the cost of this app that already ships" | §3, §7 | `anti-patterns.md`, `caching-and-batch.md` |
| "Set a spend limit / budget cap / per-tenant cap" | §3.3 | `runtime-patterns.md` (§6), `observability.md` (gateway virtual keys) |
| "Cost attribution per team / tenant / feature" | §3.6 | `observability.md` |
| "My Claude Code bill is too high" / "reduce my token spend" | **§4** | `claude-code-costs.md` |
| "Which model for this?" / "is Opus overkill?" | §4.1 (dev) or §3.2 (runtime) | `sota-snapshot.md` |
| "Use Gemini / a second assistant to save money on analysis" | §4.5 | `multi-assistant.md`, `gemini.md` |
| "How much do our evals cost?" | §4.6 | `observability.md` |

**Project start is both branches, runtime first.** Runtime decisions (choke point, price sheet, budget mode, deterministic fallback) are structural and near-impossible to retrofit; dev-time decisions are per-session and reversible. Spend the first ten minutes on §3.

### The seven invariants

Pointers into machinery, not aphorisms. If you remember nothing else, remember these.

1. **Compute matches consequence.** The same 5–25x tier spread recurs at every layer — models, assistants, judges, routers. Match the tier to what breaks if the answer is wrong. → §3.2, §4.1
2. **Meter at exactly one choke point.** All traffic through `meteredLlm()`; raw SDK calls only inside `adapters/`. A meter with a bypass is not a meter. → `metered-llm.ts`
3. **Instrumentation never breaks the response path.** Every ledger/sink/emit call is try/catch, fire-and-forget, bounded — proven by `ledger.test.ts`, which injects an always-throwing sink and asserts the response path is unchanged.
4. **Provider-reported usage only. No `chars/4`, ever.** Missing usage sets `estimated: true` and raises a counter; it never guesses. → `adapters.md`
5. **Stable prefix first, byte-identical.** Cache economics dominate routing economics — a mid-session model or provider swap destroys more than the tier delta saves. → §4.2
6. **"Is a human waiting for this response right now?"** If no, batch it. → §3.4
7. **Every dollar figure carries `(as of YYYY-MM-DD, source, confidence)`.** An uncited number is a bug, not a style lapse. → §1

## §1 — FRESHNESS GATE (do not skip)

The worst thing this skill can do is not "fail to help" — it is **state a wrong number confidently in a client-facing deck**. In the eight weeks before v1.0.0 the market produced three new Claude models, a 3x repricing of one fast mode, two silent SKU withdrawals, a *scheduled* price increase, and a new cheap tier that reset the cross-provider floor. Static prose about prices is wrong within one quarter.

Before quoting any price, quota, rate limit or product-status fact:

1. Run `node scripts/check-prices.mjs` from the skill root (`C:\Users\viagr\.claude\skills\llm-finops`). It prints `FRESH / AGING / STALE / KNOWN-WRONG` per row and re-emits the known-unknowns. An exit code cannot be rationalised away; a date in a table you are skimming can.
2. If you cannot run it, read the header of `references/sota-snapshot.md` and apply the rule below **per row** — age is measured from that row's `verified` date, not the snapshot's.

| Age of the row's `verified` date | What you may say |
|---|---|
| ≤ 30 days | Quote it, suffixed `(as of YYYY-MM-DD, source)` |
| 31–60 days | Quote it, suffixed `(as of YYYY-MM-DD — verify before client-facing use)` |
| **> 60 days** | **Do not state the number.** Say it was priced in a stated range as of that date, that this is over 60 days old and must be re-verified, and offer to fetch the live page |
| Any age with `confidence: low`, or anything quarantined in the snapshot | Never in a proposal, estimate, deck or client artifact without fetching the primary source *in this session*. Internal reasoning only |

**Confidence labels:** `high` = read off a primary vendor page in a session that fetched it. `medium` = derived from a verified base by a documented multiplier, or primary-but-implicit. `low` = third-party tracker or single unconfirmed source. A `low` row is not a lie — it is an *unowned* number, and you say so every time you use one.

**Prices live in exactly one file.** `references/sota-snapshot.md` is the only file here permitted to contain literal dollar figures. This file, every other reference, every template and the project-context snippet carry model *names* and *relative* statements ("the Flash-Lite class is materially cheaper on input than the current default Flash") plus a pointer. `pricing.ts` is **generated** from the snapshot by `init-finops.mjs` — never hand-edit it; `check-prices.mjs` enforces the rule with a tree-wide dollar-literal guard. The reason is not tidiness: a price copied into a second location is a price the next refresh will miss, and a project-context file with baked prices propagates off-machine into client repos you will never scan again.

**Refresh cadence:** every 60 days, or on any tripwire date in the snapshot's scheduled-changes table, whichever is sooner. The procedure is at the bottom of the snapshot.

## §2 — Zero-cost triage, asked first every time

**Does this need a model at all?** Deterministic compute is a 100% saving with a quality *improvement* — computed numbers do not hallucinate. KPI tiles, gauges, sparklines, aggregations, lookups, regex extraction, sorting, diffing, schema validation: code, not tokens. This is the most under-used lever in both halves of the skill and the zeroth rung of the caching ladder.

## §3 — RUNTIME PLAYBOOK (what the app costs, forever)

Build these six artifacts in this order. Each is one template; none depends on a web framework.

| # | Artifact | Template | Why it belongs in the first commit |
|---|---|---|---|
| 1 | Dated price sheet | `pricing.ts` (generated) | Every other number derives from it |
| 2 | Metered choke point | `metered-llm.ts` | Retrofitting a meter means auditing every call site |
| 3 | Ledger + sink | `ledger.ts` | Without per-call records you have opinions, not unit economics |
| 4 | Budget module | `budget.ts` | A mode nobody chose is the real anti-pattern (AP-02) |
| 5 | Fallback chain | `fallback.ts` | Makes `hard-stop` survivable and degradation measurable |
| 6 | Telemetry | `ledger.ts` → `otelSink()` | Attribution cannot be added retroactively |

### 3.1 The meter-everything invariant

**One choke point, zero bypass call sites.** Application code calls `meteredLlm.complete({ surface, stage, messages, tags })`; raw provider SDK calls exist only inside `adapters/`. `registerSurface()` **rejects** a surface that declares no deterministic fallback — which is what makes budget enforcement survivable.

Every entry carries `surface` **and `stage`**: a pipeline of plan → N workers → reflexion logged under one label hides exactly the per-stage economics you need to optimise it.

**Even the zero-cost deterministic fallback writes a ledger entry.** *How often you degrade* is a first-class FinOps and reliability signal. A fallback that writes nothing makes "was that really the model?" answerable but "how often do we degrade?" unanswerable.

**`billable: false` is not `costUsd: 0`.** A subscription CLI call has near-zero marginal cost but consumes a rate-limited quota, so record `costUsd: 0, notionalCostUsd: <reported>, billable: false` and report both. Hiding the notional figure is how teams discover their subscription ceiling in production.

Two usage-normalisation rules are wrong by default (full mapping table in `adapters.md`):

- **Never subtract twice.** Anthropic and Bedrock already exclude cache reads from their input count; Gemini and OpenAI do not. Backwards misstates cost by most of the prefix.
- **Never double-count or drop reasoning tokens.** Gemini reports thoughts as an *additive sibling* of candidate tokens; everyone else nests them as a *breakdown* of output. One uniform cost function is wrong for half the providers under either choice — hence an explicit `reasoningInOutput` flag per adapter.

**Cost is derived downstream, never baked into the span.** The OTel GenAI conventions deliberately have no cost attribute. Emit tokens + **served** model + timestamp and price it against a versioned sheet later: prices change on schedule, discounts are invisible at call time, and a span priced at emission can never be re-derived. Emit `app.cost.usd` only in a custom namespace, always paired with the price-sheet revision, and treat it as convenience denormalisation, not ground truth.

### 3.2 The default provider chain

Configured in **`config/llm.ts` — the only file in a generated project naming a provider or model id.** Everything else names tiers.

| Tier | Transport | Selected when |
|---|---|---|
| 1 — Primary | Gemini API, **cheapest GA (non-preview) Flash-Lite-class** model | Everything, by default |
| 2 — Escalation (quality) | Gemini API, Flash-class workhorse | The surface is tagged **quality-sensitive** — chat, user-facing prose, anything a customer reads. Intra-vendor, so the cached prefix survives |
| 3 — Escalation (hard) | Anthropic API, Sonnet-class | Call-site `tier: 'escalation'` on a hard call, or a deterministic quality gate rejected the tier below. Crosses vendors deliberately; pays a fresh prefix |
| 4 — Failsafe | Claude Code CLI (subscription auth) | A `FallbackReason` — never on quality grounds. `billable: false` |
| 5 — Deterministic | none | Everything above failed, or budget policy says stop. Always present, always zero |

`FinopsLlmConfig.escalation` is an **ordered `EscalationRung[]`**, cheapest rung first, each carrying its `trigger` (`'quality-sensitive'` or `'hard-call'`). Tiers 2 and 3 both ship configured and both are reachable; a quality-gate rejection climbs exactly one rung.

Three things about this chain are deliberate and worth stating to a client:

- **The pinned primary is the cheapest GA Flash-Lite-class SKU, not the vendor's current default Flash**, which was promoted in May 2026 and sits several times above the Flash-Lite class on input. "Flash means cheap" is now false; accepting a vendor default is a silent multiple.
- **No preview SKU appears in any default path.** A cheaper preview Flash and a preview Pro both exist. Two fast SKUs were withdrawn inside eight weeks — defaulting production templates to a preview SKU is the exact anti-pattern this skill teaches. Override in one line if you accept the withdrawal risk; the note recording that choice is already in `config/llm.ts`.
- **Escalation crosses vendors, and that is fine here.** Session-sticky routing pins the primary for the conversation; escalation is a distinct, deliberate, quality-gated call on a fresh prefix either way. What is *not* fine is a blind auto-router swapping mid-conversation (§3.5).

Two claims to refuse politely: *"Gemini is cheaper per task"* — sticker price times an unknown tokens-per-task multiplier is not cost, and one matched comparison showed a ~65% token-count gap in agentic use; and *"long context is cheaper there"* — it inverts above a 200k-token threshold on the Pro tier while the Claude 5-era models price flat.

**Resolve it with measurement, not argument.** `scripts/compare-providers.mjs` runs a fixed task fixture across candidate primaries and reports **measured tokens-per-task × dated price → real cost-per-task**. It is the only mechanism here that stays correct when prices move again — and one scheduled increase is already on the calendar.

**Startup notice:** on first use per process the wrapper logs one non-fatal line comparing the configured primary's rate against the cheapest sheet entry, with the delta, pointing at `compare-providers.mjs`. It never throws, never blocks, fires once, and degrades gracefully — if the sheet is stale it says so; if the model is unlisted it says *that* rather than inventing a comparison.

### 3.3 Budget modes

| Mode | 75% | 90% | 100% |
|---|---|---|---|
| **`advisory`** (default) | alert, meter amber | alert, meter red | alert, `overBudget: true`. **Never blocks** |
| `soft-degrade` | alert | force cheapest tier, disable escalation, halve max output, disable reasoning, prefer non-billable transport | kill paid tiers → failsafe → deterministic; app keeps working at zero |
| `hard-stop` | alert | throttle as above | refuse paid calls; deterministic only; `degraded: true, budgetExceeded: true` |

The 75/90/100 ladder is **practitioner convention, not a FinOps Foundation standard** — the Foundation publishes no percentages. Say so if a client asks where it comes from.

Switching is one field in `config/llm.ts`. **Move off `advisory` when any of these is true:** production traffic with real customers; spend charged back per customer or tenant; autonomous agent loops or parallel subagents in the workload; a single tenant able to drive unbounded volume; or monthly spend grown past the low hundreds. Use `soft-degrade` for user-facing apps — graceful quality reduction beats an outage. Use `hard-stop` for batch jobs and per-tenant hard caps, where refusing is correct.

> ⚠ **`hard-stop` is inert in a multi-instance deployment unless you inject a shared counter.** `BudgetStore` is an explicit injected interface and the default `memoryStore()` is **single-process only**. Across N replicas a monthly cap becomes an N-times cap; under autoscaling it is unbounded; a window computed over a bounded ring buffer is arithmetically wrong past the ring size; and a restart refunds the budget, so deploys reset your cap. Use `redisStore()`, `callbackStore()` or a gateway virtual key for anything multi-instance. `health()` reports `budgetStore: 'memory'` so the limitation surfaces at runtime rather than on an invoice. The same defect applies to the L2 response cache: a per-process LRU has an N-times miss rate across replicas.

**Per-agent envelopes are enforced in every mode, including advisory.** This is the one deliberate exception and it is the right one: advisory means *"don't let a threshold break the user's app"*, not *"let a looping agent spend unbounded money."* An envelope breach kills one agent; the orchestrator collects partial results and continues. Blast radius is one branch of a fan-out.

### 3.4 The caching ladder, as decision rules

Cheapest and safest first. **Do not skip to semantic caching** — worst benefit/risk ratio, and it is where teams start. Arithmetic in `caching-and-batch.md`.

| Layer | What | Rule |
|---|---|---|
| **L0** | Don't call the model | Always ask first (§2). 100% saving, *negative* risk |
| **L1** | Prompt / context cache | Default **on** for any stable prefix above the model's minimum floor |
| **L2** | Exact response cache | On for surfaces at `temperature ≤ 0.3`; off for creative ones |
| **L3** | Semantic response cache | **Do not build this yet** — four-condition gate below |
| **L4** | Batch API | "Is a human waiting?" If no, batch it |

**L1 prerequisite everywhere:** stable-first layout, byte-identical prefix, nothing volatile (timestamp, UUID, session id) before the breakpoint. On Anthropic: gap under five minutes → short TTL (break-even at two calls; hits refresh the TTL free, worst case a modest surcharge on the prefix only); gap of five to sixty minutes with ≥2 calls/hour → long TTL (heavier write, break-even at three); beyond an hour, don't cache. On Gemini: implicit caching is free and automatic, and explicit `CachedContent` only pays above roughly four hits/hour on the same prefix — below that it *loses* money on storage. Below the model's minimum prefix floor (which varies by up to 8x across models) caching silently no-ops at full price; the wrapper warns.

**Verification is a test, not a hope.** `assertCacheWorking()` issues the same prefixed request twice and asserts `cacheReadTokens > 0` on the second. Reading cache fields while never setting `cache_control` is a real observed failure (AP-04).

**L2** keys on a hash of `(servedModel, system, messages, temperature, maxOutputTokens, toolsHash, promptVersion)`. **Include `promptVersion`** — a prompt edit that does not change the key serves stale answers forever.

**L3 gate, all four required:** measured L2 hit rate already above 10%; the workload tolerates approximate matching (FAQ, support triage, classification — **never** anything computing numbers, quoting policy, or making a decision); caches scoped per tenant/permission boundary (published key-collision attacks serve poisoned entries across tenants); and TTL *plus* version-tagged invalidation exist. Budget the hit rate at 20–45%, not the vendor-claimed 70–95%; one production analysis found semantic caching added only a few points over exact-match. Instrument a sampled false-positive rate — a semantic cache you cannot measure FP rate on is a correctness liability in a cost-savings costume.

**L4 fits** eval suites, nightly summarisation, bulk classification and moderation, embedding backfills, dataset generation, report pre-generation. **Does not fit** interactive chat, agent loops with sequential dependencies, or anything with a sub-hour hard SLA (a batch can take the full 24h and expire). On Anthropic the discounts **stack** — a batched cache read lands at a small fraction of base input. Use the long TTL inside batches, since batch spans exceed the short one. Adapters lacking batch support **throw** rather than silently running sync at full price.

### 3.5 Routing, retries, fallback

**Session-sticky routing is on by default** (TTL 15 min). Once a session's first call resolves to a `(provider, model)`, subsequent calls pin to it. Cache economics dominate routing economics: a router saving on sticker price by switching mid-conversation destroys a prefix worth far more — it wins on the invoice line it can see and loses on the one it cannot. Cross-provider switching also changes *behaviour* (formatting, refusal boundaries, tool-call shape), which users experience as a bug.

**Escalation happens on evidence, never a complexity guess.** Two triggers: an explicit call-site `tier: 'escalation'`, and a **zero-token deterministic quality gate** (schema check, citation allow-list check, numeric-range check) that rejects the primary's output and buys exactly one retry at the escalation tier. Auto-routers are permitted only behind an eval harness measuring quality-per-dollar on a fixed fixture.

**Retries are spend and must be visible** — each writes its own ledger entry sharing the `requestId`, and `retryCostShare` is a metric teams are consistently surprised by. Policy is per-`FallbackReason`, not blanket: transient reasons (`rate-limited`, `overloaded`, `network-error`) get two bounded retries with jittered backoff; `quota-exhausted` / `not-authenticated` / `spawn-failed` get none and mark the tier unavailable for a cooldown; `context-length-exceeded` gets none (a blind retry pays full input to fail identically); malformed output gets **exactly one** repair retry (repair loops are a classic runaway); `ungrounded` and `content-filtered` go straight to deterministic, because paying a better model to retry a correctness bug is paying twice for the bug.

### 3.6 Attribution and reporting

`summarize()` returns totals plus breakdowns by surface, stage, model, provider, tier, team and tenant, plus derived unit economics: `costPerRequest`, `costPerSession`, `cacheHitRate`, `fallbackRate`, `degradedRate`, `estimatedRate`, `retryCostShare`, `modelDriftRate`. **A nonzero `estimatedRate` is a defect signal**, not a rounding note. **A nonzero `modelDriftRate` means your cost model describes a system you do not have.**

**The ledger is not an audit log** — it is a rolling operational record, and the *sink* is what you retain. Never build chargeback on a ring buffer. Ship **showback before chargeback**: per-team dashboards first, because chargeback needs reconciled numbers and an organisation that has already argued about the dashboards. → `observability.md`, `unit-economics.md`

## §4 — DEV-TIME PLAYBOOK (what building it costs)

### 4.1 Route the task before you route the model

| Task class | Do this |
|---|---|
| Anything grep, glob, a codemod, a test runner or a five-line script can answer | **No model.** The most under-used lever |
| Mechanical edit — rename, codemod, format | Workhorse tier, effort low, **thinking off** |
| Ordinary feature work (the 80% case) | Plan with frontier, execute with workhorse |
| Hard design, gnarly bug, security-sensitive path | Frontier tier, effort high |
| Reviewing a diff | Feed the **diff**, not the repo. Workhorse for style/correctness; frontier for security and cross-cutting concerns |
| Read-only breadth (map repo, find usages, summarise many files) | Cheap-tier subagent with a digest contract (§4.5) |
| CI / automation | Headless, bare mode, **pinned model**, JSON output, assert reported cost |

**Escalate one tier further only after the tier below has already failed on the same problem.** Thinking tokens bill as output and default budgets run to tens of thousands of tokens per request, so turning thinking off for a rename is free money; the frontier-max tier cannot disable thinking at all, which is a first-order reason it is never a default. **Fast modes are a latency purchase at a price premium, never a cost lever** — and audit any config pinning one, because two fast SKUs were withdrawn inside eight weeks and a pinned `speed: "fast"` is now a live breakage, not merely a cost item. Current tiers and model names: `sota-snapshot.md`.

### 4.2 Cache discipline: your job is not to earn hits, it is to avoid destroying them

**Invalidation hierarchy: `tools → system → messages`.** Change a level and everything downstream dies with it. Change a **tool definition** (add/remove an MCP server, enable a skill or plugin) and the *entire* cache dies.

**The seven silent cache killers:** (1) adding or removing an MCP server mid-session; (2) editing the project context file mid-session; (3) `/model` switching mid-session; (4) toggling fast mode or web search; (5) more than five minutes elapsing between turns on a short TTL; (6) installing or enabling a skill or plugin mid-session; (7) reordering or reformatting any part of the static prefix — a trailing space or a reordered JSON key is a full miss. **Decide the tier at session start.**

**The only reliable signal is a nonzero `cache_read_input_tokens`.** Target above 80% of input tokens as cache reads on a mature session; below 50% in a long session means a killer was tripped — find it. Keep the static prefix small anyway, since writes carry a surcharge: project context files under ~200 lines, the shared tool-neutral file under ~150. **Prefer CLIs (`gh`, `az`, `aws`) over MCP servers** — a CLI costs tokens only when invoked, whereas MCP tool definitions sit in the cached prefix on every request *and* changing them nukes the cache entirely.

### 4.3 Subagent economics

Fan-out is a power tool with a guard, not a default. It **saves** when the task emits verbose output you don't want to keep (test runs, log greps, dependency trees), when exploration would otherwise pollute a main context that is re-billed every turn, or when the subagent runs a cheaper model. It **burns** when phases share context (each subagent re-gathers it, paying N times for one body), when many parallel subagents return long results into the main conversation (you paid for isolation and then destroyed it), or when a no-tools aside would have done.

| # | Guardrail |
|---|---|
| G1 | Every subagent declares `model:` in frontmatter, defaulting to the **cheap tier**. `inherit` means a frontier session spawns frontier explorers — set the subagent-model env var globally rather than relying on memory |
| G2 | **Digest-return protocol**, verbatim in every subagent prompt: *"Return ONLY a digest of at most N words. Never paste file contents. Cite absolute file paths and line numbers instead of quoting."* Caps: exploration 300w, analysis 400w, review 600w, implementation report 250w |
| G3 | Per-agent envelope: declare max turns and a token envelope per agent class |
| G4 | Fan-out cap: 4 concurrent interactively, 8 for a deliberately budgeted batch. Past 8 you want a script |
| G5 | **Exactly one reflexion round** unless a second has been *measured* to help — critique loops are quadratic in cost and asymptotic in value |
| G6 | Never enable dynamic workflows or agent teams (~7x tokens, the largest single-session spend amplifier that exists) without a spend checkpoint immediately before and after. If you cannot state the delta, you do not have a guardrail |
| G7 | Before any fan-out, ask whether grep, glob, a test runner or a five-line script gives the same answer |

Envelope defaults — explorer/search: cheap tier, 6 turns, 60k tokens, 300w. Read-only analyzer: cheap, 8, 120k, 400w. Reviewer: workhorse, 6, 80k, 600w. Implementer: workhorse, 15, 200k, 250w. Adversarial final review: frontier, 4, 100k, 600w.

**Hard rule: never run two agents concurrently on one working tree.** Commit or stash between tool switches. Simultaneous edits produce "file has been unexpectedly modified" failures and stalls, and you pay full price for a session that then redoes its work. For real parallelism use `git worktree` with a separate directory and shell per agent.

### 4.4 Subscription vs API

> **The most time-sensitive section in this skill** — two vendors are closing subscription arbitrage simultaneously. Check the tripwire table in `sota-snapshot.md` before advising.

Daily driver at 4+ hrs/day → a **plan**, which beats the metered benchmark band with flat-rate certainty (caps are rolling-window and **unpublished**, shared across all models and surfaces). Occasional or bursty → **API key** plus a console spend limit. **CI, automation and headless → always an API key**: CI needs a per-invocation cost figure for regression checks, and burning a human's plan window on CI is the worst trade in the table. Bulk offline work (evals, backfills) → **API plus Batch**; interactive sessions cannot use Batch.

### 4.5 The hedged multi-assistant strategy

> ⚠ **Unverified, high impact.** The consumer Gemini CLI was retired on 2026-06-18 (**primary source**). The claim that its replacement has no documented headless one-shot mode rests on a **single third-party deep-dive, not a vendor statement**. Do not treat it as settled in either direction, and say so when advising.

**The spine is Plan C. Recommend it unconditionally.**

- **Plan C — cheap-tier analyzer subagent (THE DEFAULT):** a cheap-tier subagent with a strict digest-return contract. No second vendor, no second auth path, no capability gate, no cross-tool context-file sync. Nothing about it can be invalidated by another vendor's product decision.
- **Plan B — metered API for bulk read-only:** skip the CLI, call the HTTP API from a small script. Pin the cheapest **GA** Flash-class model, not the current default Flash, and batch it. Unaffected by any CLI product change.
- **Plan A — CLI offload (an optimisation, never architecture):** shell out for a repo-wide read-only scan and return only a digest so the paid context stays clean.

**Never emit a CLI-offload recipe without first saying: "run `node scripts/check-headless.mjs`; if it fails, use Plan C."** The gate inspects `--help` for a one-shot flag *before* probing, runs the probe under a hard timeout (an unrecognised flag dropping into a REPL would otherwise hang the session), and prints `HEADLESS-OK` / `HEADLESS-ABSENT` / `NOT-INSTALLED`.

Auth paths after 2026-06-18 — the artifact a strong baseline will not produce, so keep it in reach:

| Auth path | Status | Headless one-shot? | Confidence |
|---|---|---|---|
| Free personal Google account | Dead for CLI | n/a | high |
| Google AI Pro / Ultra | Dead for CLI (moved to the replacement) | **undocumented** | high / unverified |
| Gemini Code Assist Standard / Enterprise | Unaffected | **Unverified — run the gate** | low |
| **API key** (free or paid tier) | Unaffected | **Yes** — HTTP API, no CLI involved | high |
| Vertex AI | Unaffected | Yes | high |

**Offload hygiene:** a whole-repo flag will happily ingest `node_modules`, `.git`, `dist` and lockfiles — *a cost recipe that is itself a cost bomb*. Always pass an explicit include/exclude set, request JSON output and parse it (never scrape prose), and never apply an offloaded diff unreviewed. **Context-file sync:** one shared tool-neutral `AGENTS.md` (under ~150 lines) as the source of truth, with the Claude-specific file reduced to an `@AGENTS.md` import plus Claude-specific notes — correct whether or not native `AGENTS.md` support exists, and it avoids Windows symlink elevation.

### 4.6 Measurement ritual

1. **Per-session (10 seconds).** Start clean. At the 40–60% context mark, audit what is consuming the window. At session end run `/usage` (fall back to `/cost`; **never hardcode either in automation**) and record the cache-read ratio — green above 80%, amber 50–80% (find the invalidation), red below 50% in a long session. Local dollar figures are estimates; the console usage page is authoritative, so reconcile weekly, not per-session.
2. **Per-task budgets.** Declare a token budget for a task class before starting and compare after. The point is having a number to be wrong about. A 3x overrun is a signal to investigate — cache breakage? unbounded fan-out? genuinely harder work? — and the answer goes in `LEARNINGS.md`.
3. **Headless CI cost regression.** The only fully automatable checkpoint and the only one whose output belongs in version control: bare mode, pinned model, JSON output, assert on reported per-invocation cost, commit results to a small CSV. **A PR that triples the cost of a CI check should be as visible as one that triples its runtime.** Bare mode also skips hooks, skills, plugins, MCP and project context — deterministic *and* a cheaper startup context.

**Evaluation is its own cost line and can dominate** — judge inference can reach a large multiple of baseline application spend if run naively. Use a pyramid: deterministic assertions (free) on everything, cheap-tier judges sampled, frontier judges only via escalation cascade or as a release gate. The reference project computed faithfulness deterministically and paid zero judge tokens. → `observability.md`

## §5 — Templates and scripts index

Copy in with `node scripts/init-finops.mjs --target <project>` (idempotent — a second run overwrites nothing and writes `.new` files alongside).

| File | What it gives you | Copy in when |
|---|---|---|
| `config/llm.ts` | The **only** file naming a provider or model id: primary, escalation, failsafe, budget mode, budget store | Always, first |
| `metered-llm.ts` | The choke point, surface policy, the once-per-process cost notice | Always |
| `ledger.ts` | Ring buffer, pluggable sink, `summarize()` with unit-economics metrics | Always |
| `pricing.ts` | **Generated** from `sota-snapshot.md`: dated rows, effective-date axis, confidence labels, load-time sanity assertions, loud unknown-model alert | Always — never hand-edit |
| `budget.ts` | Three modes, pure preflight/postflight, injected `BudgetStore`, always-on agent envelopes | Always |
| `fallback.ts` | Tier chain, `FallbackReason` taxonomy, per-reason retry table, cooldowns, sticky pinning | Always |
| `ledger.ts` → `otelSink()` | OTel `gen_ai.*` emission lives in the ledger's sink layer, not a separate file; never emits cost in the `gen_ai.*` namespace | When you have a collector |
| `cost-warning.ts` | The once-per-process startup notice comparing your configured primary against the cheapest sheet entry | Always (`costNotice: true`) |
| `finops-routes.ts` | Framework-light HTTP handlers exposing `summarize()` and `health()` | When you want a cost dashboard |
| `adapters/usage-invariants.test.ts` | Per-adapter usage invariants replayed against recorded fixtures — the reasoning-token semantics (Gemini bills thinking **additively**, Anthropic/OpenAI nest it, Bedrock folds it) | Always |
| `budget.test.ts` | Mode transitions: advisory never blocks, soft-degrade routes cheaper at the threshold, hard-stop refuses past the cap, the 75/90/100 ladder fires in order once each, per-agent envelopes enforce in **every** mode | Always |
| `pricing.test.ts` | Unknown-model alerting (an unlisted id defaults to the *most expensive* rates with `estimated: true`, never a cheap silent default) and the load-time transposed-meter guard | Always |
| `ledger.test.ts` | Throwing-sink resilience: no propagation, no change to the response path, no loss of subsequent entries — invariant 3, implemented rather than intended | Always |
| `project-context-snippet.md` | Drop-in rules for the project's context file — prose only, **no prices** | When scaffolding a repo |
| `adapters/gemini.ts` | **VERIFIED** (recorded fixtures): additive-reasoning handling + three-term total assertion | Default primary |
| `adapters/claude-code-cli.ts` | **VERIFIED** (recorded fixtures): `billable: false` + `notionalCostUsd`; `probe()` gates the tier | Default failsafe |
| `adapters/{claude-api,openai,azure-openai,bedrock}.ts` | ⚠ **UNVERIFIED** — written from provider spec, never executed. Wrong cost math fails **silently** (a bad `costUsd`, not a crash) | Only after the `VERIFY.md` smoke tests pass |
| `templates/VERIFY.md` | Per-adapter smoke test + the two assertions that matter | Before trusting any unverified adapter's numbers |

**Running the tests.** `node --test "templates/**/*.test.ts"` from the skill root — **70 tests, Node builtins only**, nothing to install. (`cd templates ; node --test` also works. A bare `node --test templates` does *not*: Node treats a positional directory as a module entry point.) The template tree uses explicit **`.ts` import specifiers** because Node's resolver does not remap a `.js` specifier onto a `.ts` file — with `.js` the suites fail to load with `ERR_MODULE_NOT_FOUND`, which is how the adapter suite silently never ran. Compiling with `tsc` under `module: nodenext` requires `rewriteRelativeImportExtensions: true` (TS 5.7+); a bundler or `noEmit` typecheck requires `allowImportingTsExtensions: true`; vitest/jest/tsx need no configuration. → `templates/VERIFY.md`

| Script | Does |
|---|---|
| `check-prices.mjs` | Per-row FRESH/AGING/STALE/KNOWN-WRONG, tree-wide dollar-literal guard, re-emits known-unknowns |
| `init-finops.mjs` | Idempotent template copy; generates `pricing.ts` from the snapshot |
| `check-headless.mjs` | The CLI capability gate: `--help` first, then a timeout-bounded probe |
| `compare-providers.mjs` | Measured tokens-per-task × dated price → real cost-per-task; also scenario projection |

## §6 — Checklists

**Project start** (before a second feature exists):

- [ ] §1 freshness gate passed; snapshot age known
- [ ] `config/llm.ts` in place; primary / escalation / failsafe named once and nowhere else
- [ ] All provider traffic behind `meteredLlm()`; raw SDK calls confined to `adapters/`
- [ ] Every registered surface has a deterministic fallback, a `maxOutputTokens` and a timeout
- [ ] `surface` **and `stage`** labels distinguish each step of any multi-call pipeline
- [ ] `pricing.ts` generated (not hand-written); unknown models alert rather than silently default
- [ ] `budgetMode` **explicitly stated** in config — even `advisory` is a choice you record
- [ ] `BudgetStore` matches the deployment topology (memory ⇒ single process only)
- [ ] Cache directive set *and* `assertCacheWorking()` green
- [ ] Async workloads triaged against "is a human waiting?"
- [ ] Attribution tags (env/app/team/feature/tenant) stamped at the choke point
- [ ] Project context file contains **no prices** — only prose rules, which do not expire

**Pre-demo / pre-client cost review:**

- [ ] `check-prices.mjs` exits 0; every figure in the deck carries `(as of, source, confidence)`
- [ ] Nothing `confidence: low` or quarantined appears in a client artifact
- [ ] `[dev-time]` and `[runtime]` figures labelled and **never summed**
- [ ] `estimatedRate` is zero (nonzero ⇒ an adapter is flying blind)
- [ ] `modelDriftRate` is zero (nonzero ⇒ your cost model describes a different system)
- [ ] Cost-per-request / per-session computed from **measured** tokens, not stickers
- [ ] `compare-providers.mjs` re-run if any tripwire date has passed since the last run
- [ ] Unverified adapters on the demo path have passed `VERIFY.md`
- [ ] Budget mode is appropriate for where this is going next (demo vs production)

## §7 — Anti-pattern index

Scan against any codebase you review. Each row expands in `references/anti-patterns.md` with symptom → cost → fix → template → a ripgrep command that detects it. AP-01–AP-08 are real observed failures from the reference project, not hypotheticals.

| # | Anti-pattern |
|---|---|
| **AP-01** | **Unmetered bypass call site** — one playbook calls the provider directly and never reaches the ledger. Meter at one choke point; forbid raw provider calls outside `adapters/` |
| **AP-02** | **The codebase has exactly one budget behaviour and no one chose it** — `budgetMode` is not stated anywhere in config. Advisory is a legitimate default; an *unexamined* default is not. Escalate on: production traffic, per-tenant chargeback, agent loops, unbounded single-tenant volume, or spend past the low hundreds monthly |
| **AP-03** | **Character-count cost heuristics** (`chars/4`) — estimation error compounds silently and destroys invoice reconciliation. Provider-reported usage only |
| **AP-04** | **Cache fields read, `cache_control` never set** — paying full price for repeated context while a dashboard reports cache columns. Fix with `assertCacheWorking()` |
| **AP-05** | **No retries anywhere** — a transient blip drops straight to a degraded answer. Bounded retry with jitter per `FallbackReason`, plus Batch for offline work |
| **AP-06** | **Coarse surface labels** — plan + N workers + reflexion logged under one name, hiding per-stage unit economics |
| **AP-07** | **Hand-maintained price table with undated model ids**, unknown models silently falling to a default price. Use dated ids, staleness warnings, provenance, loud unknown-model alerts |
| **AP-08** | **Configured-but-unwired capability** — a judge model configured and surfaced in the UI while no judge is wired. Dead knobs mislead cost planning and reviewers |
| **AP-09+** | Semantic-cache-first; blind auto-routing mid-session; `hard-stop` over a process-local counter; cost baked into the span; preview or fast SKUs pinned in a production default; whole-repo offload ingesting `node_modules` — all in `anti-patterns.md` |

## §8 — Reference map (progressive disclosure)

Load a reference when you cross into its territory, not before. This file carries what you need to act correctly on the common case; everything volatile, provider-specific or lookup-shaped lives below.

| File | Load when | Inside |
|---|---|---|
| `sota-snapshot.md` | **Before quoting any number** | The only price sheet: dated rows, confidence labels, tripwire dates, quarantined conflicts, refresh procedure |
| `runtime-patterns.md` | Building or retrofitting the runtime spine | Choke point, ledger schema, surface policy, bounding, fallback chain, budget stores |
| `adapters.md` | Wiring or debugging any provider | Usage-field mapping, reasoning-inclusion semantics, cache exposure per adapter, partner-cloud multipliers, authoring skeleton |
| `caching-and-batch.md` | Tuning cost on a working system | TTL decision rules, break-even arithmetic, prefix stability, batch triage, discount stacking |
| `observability.md` | Instrumenting, or "where do I enforce this?" | OTel emission, attribution, showback→chargeback, FOCUS, and the gateway-vs-library decision tree with virtual keys |
| `unit-economics.md` | Pre-sales modelling, client framing | Cost per query/user/workflow, token yield rate, nine-bucket TCO, eval as a budget line |
| `eval-costs.md` | Costing evals or CI | The deterministic-first pyramid, judge-cost cascades, metric choice as a cost decision |
| `claude-code-costs.md` | Deep dev-time work on Claude Code | Model lineup by task class, cache discipline, subagent economics, session hygiene, headless CI, subscription-vs-API |
| `gemini.md` | Working with Gemini | Tier names and GA-vs-preview status, implicit vs explicit caching, **additive** reasoning tokens, the >200k cliff, the startup cost notice |
| `multi-assistant.md` | Hedging across assistants | Plans A/B/C, the capability gate, auth paths after 2026-06-18, context-file sync |
| `anti-patterns.md` | Reviewing someone's code | All anti-patterns with detection commands |

## §9 — Continuous improvement

**This is a human-in-the-loop feedback loop, not model-weight reinforcement learning.** Nothing here trains anything. It is a documented capture-and-edit protocol that makes the skill's *guidance* compound across sessions. Apply it literally.

At the end of any session where this skill was **materially** used — a reference read, a template copied, a price quoted, a cost recommendation given — do four things:

1. **Capture.** Append one `{date, context, observation, action}` entry to `LEARNINGS.md`. A session with nothing notable **writes nothing**; an always-write rule produces a file nobody reads. The file caps at 200 entries and rotates to `LEARNINGS-archive-YYYY.md`.
2. **Edit (guarded).** Only for substantive change: a wrong number, a wrong default, a missing pattern, a broken recipe. **A pattern seen twice earns an edit; seen once, it earns a note.** Never silently change a template's public API.
3. **Version.** Bump `version` and `updated` here, add a `CHANGELOG.md` entry citing the LEARNINGS date, and tag model-authored entries `[auto]` so a human can distinguish and revert them. MAJOR = a template's public API changes or guidance reverses; MINOR = new guidance, reference, template or adapter; PATCH = price refresh, date stamps, clarifications. **A price refresh is a PATCH**, which keeps the version an honest signal of guidance change rather than data churn.
4. **Remember.** Write a **one-line pointer** — never a copy — into `C:\Users\viagr\.claude\projects\C--Users-viagr\memory\` so a future session recalls the correction *before* this skill triggers. Keep that file around ten lines, newest first: corrections that changed guidance survive, observations that did not, do not.

> **PROVENANCE GUARD — the rule that keeps this loop from destroying the skill.** A row's `verified` date may be advanced **only** by a session that fetched the primary source *in that session*. Any other update — a recalled number, a third-party page, a user's offhand correction — writes `confidence: low`, **leaves the old `verified` date untouched**, and adds a `note:` recording where the number came from. Without this, the maintenance mechanism launders a guess into "fresh, primary", `check-prices.mjs` reports FRESH, and the freshness protocol is defeated by its own upkeep. That is the single way this skill degrades from correct to confidently wrong.

**Tell the user what you changed, in one line, at session end.** Silent self-modification is not acceptable even when it is correct.

**Version 1.0.0 — 2026-07-19.** Built from `llm-finops-workspace/design/DESIGN.md`. Two adapters verified against recorded fixtures; four ship labelled unverified. Sixteen contested numbers are quarantined in the snapshot and resurfaced by `check-prices.mjs` on every run.
