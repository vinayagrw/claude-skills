# Claude Code cost mechanics — dev-time reference

**Scope:** what your *coding assistant* costs while you build. This is `[dev-time]` spend.
It is not the same bill as the inference your shipped app pays per user request — see
`references/unit-economics.md` for why summing them makes both unactionable.

**No dollar figures appear in this file.** Every price lives in `references/sota-snapshot.md`,
which is the only file a freshness script has to police. When you need a number, read the
snapshot; when you need a *decision*, read this file. Statements here are relative
("roughly a tenth of base input", "a step up of several times") and stay true across
repricings in a way that a pasted number does not.

**Provenance convention** (ADDENDUM F): every factual claim below carries `source`,
`as_of`, and `confidence`. `high` = the vendor's own documentation. `medium` = vendor
docs by inference, or a strong secondary read. `low` = third-party or single-source —
treat as a hypothesis to verify, never as a fact to quote to a client.

---

## 1. The model lineup, by task class

Pick the tier from the task, then pin it for the session. Model *ids* and prices are in
`references/sota-snapshot.md`; what follows is the tier logic, which is stable.

| Task class | Tier | Effort | Thinking | Why |
|---|---|---|---|---|
| Bulk read-only: map a repo, find usages, summarise many files | **cheap** (Haiku-class) | low | off | You are paying for coverage, not judgement |
| Mechanical edit: rename, codemod, import fix, formatting | **workhorse** (Sonnet-class) | low | off | Deterministic transform; reasoning adds cost, not quality |
| Ordinary feature work — the 80% case | **plan-with-frontier / execute-with-workhorse** | default | on | Buys frontier reasoning only where reasoning is the product |
| Hard design, gnarly concurrency bug, security-sensitive path | **frontier** (Opus-class) | high | on | Consequence is high; compute should match consequence |
| Last resort, after frontier already failed on the same problem | **frontier-max** (Fable-class) | high | forced on | Several times the workhorse tier per session, and the cost dial does not exist here |
| Review a diff | workhorse for style/correctness; frontier for security or cross-cutting | — | — | Feed `git diff`, not the repo |
| CI / automation | workhorse, pinned explicitly | low | off | Determinism and a stable cost baseline matter more than headroom |

Source: Claude Code model-config docs + models overview, fetched 2026-07-19. Confidence: **high**.

**The rule under all of it: compute must match consequence.** The same spread — roughly
5–25x between the cheap and frontier tiers — recurs at every layer of this skill. It is the
single largest structural lever you have.

**And the lever above that one:** before any of this, ask whether code can compute the
answer. Grep, glob, a codemod, a test runner, or a five-line script costs nothing and does
not hallucinate. This is the most under-used cost lever in practice.

### 1.1 Effort and thinking are a cost dial

Thinking tokens **bill as output tokens**, and default thinking budgets run to tens of
thousands of tokens per request on the high tiers (source: Claude Code model-config docs,
2026-07-19, confidence **high**). Consequences:

- Turning thinking off for a rename is free money. It cannot improve a mechanical edit.
- On fixed-budget models, a `MAX_THINKING_TOKENS` cap is blunt but effective.
- The frontier-max tier **cannot disable thinking at all** (source: Anthropic models
  overview, 2026-07-19, confidence **high**). That is a first-order reason it is never a
  default — you are buying a floor of output-priced tokens on every single request.

### 1.2 What *not* to route on

- **Do not switch model or provider mid-session to save money.** It invalidates the prompt
  cache (§2), and the cache loss typically exceeds the tier delta. Decide the tier at
  session start. If you must switch, clear first and accept it as a new session.
- **Do not treat fast mode as a cost lever.** It is priced at a multiple of standard for a
  latency benefit (source: Anthropic pricing page, 2026-07-19, confidence **high**). It is a
  latency purchase.
- **Audit any config that pins a fast SKU.** Two specific fast modes were withdrawn within
  an eight-week window in mid-2026 (source: Anthropic model deprecation notices, 2026-07-19,
  confidence **high**). A hardcoded fast flag is now a live breakage, not merely a cost item.

---

## 2. Prompt caching: your job is not to earn hits, it is to avoid destroying them

Claude Code applies prompt caching automatically (source: Claude Code costs doc, 2026-07-19,
confidence **high**). Cache reads price at roughly a tenth of base input; a short-TTL write
costs a modest premium over base input and breaks even after a single hit, and a long-TTL
write costs more and breaks even after two (source: Anthropic prompt-caching docs,
2026-07-19, confidence **high**). Hits refresh the TTL for free.

This is why **cache economics dominate routing economics**. A clever router that shaves a
third off sticker price by switching tiers mid-conversation destroys a cached prefix worth
up to an order of magnitude more. Stickiness is a cost feature.

### 2.1 The invalidation hierarchy — memorise this

```
tools  →  system  →  messages
```

Changing anything at a level invalidates that level **and everything downstream**.

- Change a **tool definition** — add or remove an MCP server, enable a skill or plugin —
  and the *entire* cache dies.
- Change **system** — edit the project context file, toggle web search or fast mode — and
  system plus messages die.
- Change **messages** and only the edit point forward dies.

Source: Anthropic prompt-caching docs, 2026-07-19. Confidence: **high**.

### 2.2 Stable-first layout, byte-identical

Order every long-lived prompt — project context files, skill files, subagent definitions,
and any app prompt you write:

```
[ stable ]   tool definitions
[ stable ]   system / role
[ stable ]   project context, conventions, schemas, few-shot examples
             ── cache breakpoint ──
[ volatile ] today's date, session id, the user's actual question, per-request data
```

**Byte-identical means byte-identical.** A trailing whitespace change, a reordered JSON key,
a regenerated timestamp, or a UUID placed before the breakpoint is a full miss — and it
fails *silently*, at full price, with no error. Never interpolate a live date into a cached
prefix.

There is also a **minimum cacheable prefix** that varies by model; below it, caching
silently no-ops. The exact thresholds are model-specific and change per generation — look
them up in `references/sota-snapshot.md` rather than memorising them. Cache lookback checks
a bounded number of blocks behind a breakpoint, so very long turn gaps need a second
breakpoint (source: Anthropic prompt-caching docs, 2026-07-19, confidence **high**).

### 2.3 The seven silent cache killers

1. Adding or removing an MCP server mid-session. **Configure MCP before you start.**
2. Editing the project context file mid-session. Queue the edit; apply it after a clear.
3. Switching model mid-session.
4. Toggling fast mode or web search mid-session.
5. Letting more than the short TTL elapse between turns. Thinking-with-coffee is billable.
6. Installing or enabling a skill or plugin mid-session — it changes the tool surface.
7. Reordering or reformatting any part of the static prefix, including "harmless" tidying.

Every one of these is silent. None raises an error. All you see is a bigger bill.

### 2.4 How to verify a cache hit — do not assume

- **The only reliable signal is a nonzero `cache_read_input_tokens`** in the reported usage.
  If that field is zero across several turns of a long session, your cache is broken; find
  which of the seven killers you tripped.
- **The session usage command** shows a per-session block: total cost, API vs wall duration,
  and per-model input/output/**cache** token counts. Totals reset when you clear. Subscribers
  see plan usage bars rather than dollars.
  > **Naming hedge.** Official docs document `/usage`; many 2026 practitioner posts still
  > say `/cost` (source: Claude Code costs doc vs. community posts, 2026-07-19, confidence
  > **medium** — the two names are genuinely contested in the wild). Try `/usage`, fall back
  > to `/cost`, and check `claude --help` if neither exists. **Never hardcode either into
  > automation** — script against the headless JSON path in §5 instead.
- **The context audit command** (`/context`) shows what is actually consuming the window.
  Run it whenever a session feels expensive.
- **Targets:** cache reads above 80% of input tokens on a mature session is green; 50–80% is
  amber (find the invalidation); below 50% in a long session is red (a killer was tripped).
  These thresholds are practitioner convention calibrated against the pricing ratios, not a
  vendor standard — confidence **medium**.

### 2.5 Keep the static prefix small anyway

Caching a bloated prefix beats not caching it, but writes still cost a premium over base
input:

- Project context files under ~200 lines; a shared tool-neutral file under ~150. Adherence
  measurably degrades beyond that (source: community convention, 2026-07-19, confidence **low**).
- Move workflow instructions into on-demand skills rather than always-loaded context.
- **Prefer CLIs (`gh`, `az`, `aws`) over MCP servers.** A CLI costs tokens only when invoked.
  An MCP server's tool definitions sit in the cached prefix on *every* request and — worse —
  changing them nukes the entire cache.
- Use PreToolUse hooks to filter verbose tool output (e.g. grep test output down to
  failures) *before* it enters context. Unfiltered output is re-billed on every later turn.

---

## 3. Subagent token economics

Fan-out is a power tool with a guard, not a default. Each subagent runs in a fresh isolated
context; only its summary returns to the parent (source: Claude Code subagents doc,
2026-07-19, confidence **high**).

**It saves when:**
- The task produces **verbose output you do not want to keep** — test runs, log greps,
  dependency trees, doc fetches. The verbosity dies with the subagent instead of being
  re-billed on every subsequent parent turn.
- **Exploration would pollute the main context.** This is the real economics: main-context
  tokens are re-sent every turn. Thirty thousand tokens of dead exploration across forty
  turns is forty re-billings — mitigated by cache, but a cache read is a fraction of base
  input, not zero.
- The subagent can run a **cheaper tier** than the parent.

**It burns when:**
- Phases **share significant context** — each subagent re-gathers it from scratch, so you
  pay N times for one body of context.
- **Many parallel subagents each return long results** into the main conversation. You paid
  for isolation and then destroyed it by returning everything.
- The task was a **quick question**. A no-tools aside is cheaper: full context view, no tool
  calls, answer discarded.

### 3.1 The guardrails

| # | Guardrail |
|---|---|
| **G1** | Every subagent declares `model:` in frontmatter, defaulting to the **cheap tier**. `inherit` means a frontier session spawns frontier explorers — set the subagent-model environment variable globally rather than trusting memory. Override the built-in Explore agent, which is capped at the frontier tier. |
| **G2** | **Digest-return protocol.** Every subagent prompt ends with: *"Return ONLY a digest of at most N words. Never paste file contents. Cite absolute file paths and line numbers instead of quoting."* Caps: exploration 300 words, analysis 400, review 600, implementation report 250. |
| **G3** | **Per-agent envelope** — declare max turns and a token envelope per agent class (table below). |
| **G4** | **Fan-out cap** — 4 concurrent subagents interactively, 8 for a deliberately budgeted batch analysis. Past 8 you want a script, not agents. |
| **G5** | **Exactly one reflexion round** unless a second has been measured to help. Critique loops are quadratic in cost and asymptotic in value. |
| **G6** | Never enable dynamic workflows or agent teams without a spend checkpoint immediately before and after. If you cannot state the delta, you do not have a guardrail. |
| **G7** | Before dispatching any fan-out, ask whether grep, glob, a test runner, or a five-line script produces the same answer. |

| Agent class | Tier | Max turns | Token envelope (in+out) | Digest cap |
|---|---|---|---|---|
| Explorer / search | cheap | 6 | 60k | 300 w |
| Read-only analyzer | cheap | 8 | 120k | 400 w |
| Reviewer | workhorse | 6 | 80k | 600 w |
| Implementer | workhorse | 15 | 200k | 250 w |
| Adversarial final review | frontier | 4 | 100k | 600 w |

Envelope values are starting points calibrated from the reference project's per-surface
bounding, not vendor guidance — confidence **low**. Recalibrate against your own measurements
and log the result in `LEARNINGS.md`.

**Why G6 matters most right now:** dynamic workflows can spawn very large numbers of parallel
subagents in one session, and experimental agent teams have been measured at roughly seven
times the tokens of a standard session when teammates run in plan mode (source: Claude Code
subagents doc, 2026-07-19, confidence **medium** — the multiplier is vendor-stated but
workload-dependent). This is the largest new single-session spend amplifier in existence.
It is also why per-agent budget envelopes stay enforced even when the budget mode is
advisory.

---

## 4. Session hygiene

### 4.1 Clear versus compact

| Situation | Command | Why |
|---|---|---|
| Switching to an **unrelated** task | **clear** | Stale context is re-billed every turn — the top surprise-spend driver |
| Same task, context filling, history still needed | compact **with focus instructions** | Preserves task state at a fraction of the tokens |
| Same task, context filling, history *not* needed | clear + a three-line restatement | Almost always cheaper than compacting |
| Unsure what is eating the window | context audit first | Measure before you act |

**Bias toward clearing.** Developers under-clear because restating feels like work.
Restating a task costs a couple of hundred tokens; carrying eighty thousand tokens of dead
context across twenty turns does not.

Auto-compact fires near the context limit and restores task state afterward; microcompact
continuously offloads old large tool results to disk and references them by path. Both are
automatic (source: Claude Code costs doc + platform compaction docs, 2026-07-19, confidence
**high**). A third-party teardown reports a trigger buffer of roughly thirteen thousand
tokens — **indicative, not contractual** (source: decodeclaude.com compaction deep-dive,
seen 2026-07-19, confidence **low**).

Add a `# Compact instructions` section to your project context file so auto-compact
preserves the task, the decisions and their rationale, the file paths touched, and the open
questions — and drops tool output, file contents already written to disk, and superseded
plans.

### 4.2 Context-window thresholds

| Window used | Action |
|---|---|
| under 40% | Carry on |
| 40–60% | Run the context audit; note the biggest consumer |
| 60–75% | Compact with focus, or finish the current unit and clear |
| over 75% | Stop adding work. Commit, clear, restate. |
| Auto-compact fired unexpectedly | Treat as a signal you should have cleared twenty turns ago |

Thresholds are practitioner heuristics, not vendor guidance — confidence **low**.

### 4.3 The single-working-tree rule (hard)

> **Never run two agents concurrently on one working tree. Commit or stash between switches.**

Claude Code assumes a single-threaded working tree. A second agent editing simultaneously
produces "file has been unexpectedly modified" failures and stalls — you pay full price for
a session that then has to redo its own work, which makes this a cost problem as much as a
correctness one (source: consistent community reports, 2026, confidence **medium**).
Sequential handoff with commit boundaries also keeps `git log` attributable per assistant,
which is how you later measure whether a second assistant earned its keep.

For true parallelism use `git worktree` — separate directories, separate shells, merge
deliberately. On Windows: `git worktree add ..\feature-x`, then run each agent from its own
terminal window.

### 4.4 Session-start checklist (30 seconds)

Clear → pin the tier for this task class (§1) and do not plan to switch → configure MCP
servers **now**, not later → make project-context edits **now**, not later → set effort to
match the task class → confirm no other agent is touching this working tree.

---

## 5. Headless cost regression in CI

This is the only fully automatable checkpoint, and the only one whose output belongs in
version control.

```
claude --bare -p "<prompt>" --model <pinned-id> --output-format json
```

Parse `total_cost_usd` from the JSON result and assert it against a ceiling. The response
also carries a per-model breakdown (source: Claude Code headless doc, 2026-07-19,
confidence **high**).

```js
// scripts/cc-cost.mjs — Node only; no PowerShell (execution policy, stderr/exit-code
// corruption on native executables, and hang risk on an unrecognised flag).
import { spawnSync } from 'node:child_process';

const [, , prompt, model = 'PIN_ME', maxUsd = '0.50'] = process.argv;
const r = spawnSync('claude',
  ['--bare', '-p', prompt, '--model', model, '--output-format', 'json'],
  { encoding: 'utf8', timeout: 300_000, shell: false });

if (r.status !== 0) { console.error(r.stderr || 'claude failed'); process.exit(2); }
const cost = Number(JSON.parse(r.stdout).total_cost_usd);
console.log(`cost=${cost.toFixed(4)} model=${model}`);
process.exit(cost > Number(maxUsd) ? 1 : 0);
```

Why each flag matters:

- **`--bare` is the CI flag.** It skips hooks, skills, plugins, MCP, auto-memory and the
  project context file — which makes the run deterministic *and* gives it a cheaper startup
  context. It is slated to become the default (source: headless doc, 2026-07-19, confidence
  **high**).
- **Always pin `--model`.** An unpinned model in CI means your cost baseline shifts under you
  whenever a default changes — and defaults changed twice in the eight weeks before this
  skill was written.
- **`--output-format json`** is the contract. Never scrape prose; never parse a slash command.
- Piped stdin is capped at 10 MB (source: headless doc, 2026-07-19, confidence **high**).

Commit the per-invocation costs to a small CSV in the repo. **A pull request that triples the
cost of a CI check should be as visible as one that triples its runtime.** That visibility is
the entire point; the absolute number matters less than the delta.

### 5.1 Per-task budgets

Declare a token budget before starting a task class and compare after. Rough starting
envelopes: mechanical edit ~30k, bug fix with tests ~150k, single-module feature ~400k,
architecture session ~600k, full repo analysis on a cheap-tier subagent ~250k. These are
calibration seeds, confidence **low** — the point is having a number to be wrong about.

**Blowing a budget by 3x is a signal, not a failure.** Investigate: cache breakage,
unbounded fan-out, or genuinely harder work than estimated? The answer goes in `LEARNINGS.md`.

### 5.2 Org-level telemetry, if it ever matters

Enabling Claude Code telemetry with an OTLP metrics exporter emits `claude_code.cost.usage`
(USD), `claude_code.token.usage`, `claude_code.session.count`, and `claude_code.api_request`
events carrying model, cost, and token counts, attributed by user email, organisation id and
model (source: Claude Code monitoring-usage doc, 2026-07-19, confidence **high**). This is
the only near-real-time per-user cost stream that works on *every* setup — API key,
subscription, and partner clouds alike. Overkill for one engineer; a demo-able artifact for
a team pitch.

---

## 6. Subscription versus API

> **This is the most time-sensitive section in the skill.** Two vendors were closing
> subscription and free-tier arbitrage simultaneously as of 2026-07-19, and at least two
> rows below had known step-changes within 45 days. **If today is more than ~45 days past
> 2026-07-19, treat this section as expired and re-verify before acting on it.**

| Situation | Cheaper on | Why | Caveat |
|---|---|---|---|
| Daily driver, 4+ hrs/day | **Mid-tier plan** (Max 5x class) | Beats the published per-developer API benchmark band, with flat-rate cost certainty | Rolling 5-hour + weekly windows shared across all models and surfaces; **exact caps unpublished** |
| Heavy daily driver hitting those windows | **Top-tier plan** (Max 20x class) | Still under the top of the API band | Same |
| Occasional / bursty | **API key** | Pay only for what you use | No ceiling — set a Console spend limit |
| **CI / automation / headless** | **API key** | CI needs a per-invocation cost figure for regression checks; never burn a human's plan window on CI | — |
| Occasional overflow past plan windows | Plan + usage credits | Monthly spend limit, purchases, auto-reload | — |
| Bulk offline work (evals, backfills, bulk transforms) | **API + Batch** | Interactive sessions cannot use Batch | Batch discounts stack with caching to a small fraction of base input |

Plan names, plan prices and the API benchmark band are in `references/sota-snapshot.md`
(source: `claude.com/pricing` + Claude Code costs doc, 2026-07-19, confidence **high**).

### 6.1 The closing-arbitrage caveats — the point of this section

1. **Frontier-max on subscription moved to metered usage credits on 2026-07-20**, and the
   conversion rates were **unpublished** at the time of writing, having already slipped
   twice (source: Anthropic plan documentation, 2026-07-19, confidence **high** for the date,
   **unverified** for the rates). *"The top model is free under my plan" stopped being true,
   and nobody could yet model what it costs.* **Action: run the usage-credits command and
   record the actual conversion in `LEARNINGS.md`.**
2. **The consumer Gemini CLI path is already dead** (2026-06-18). Any recipe predating June
   2026 that promises a free CLI offload is stale regardless of how confidently it is
   written. See `references/multi-assistant.md`.
3. **Workhorse-tier intro pricing ended 2026-08-31, stepping up 50% on 2026-09-01** (source:
   Anthropic pricing page, 2026-07-19, confidence **high**). Any subscription-versus-API
   break-even computed on the intro rate moves. This is the first time a major provider
   shipped a *dated future price increase*, which is why the skill's price sheet carries an
   effective-date axis and not merely an as-of date.
4. **Free tiers have a demonstrated history of shrinking** — Google cut some API free-tier
   daily caps substantially in late 2025 (source: third-party reporting, confidence **low**).
   Never build a workflow whose economics depend on a free tier without a metered fallback.

**Standing rule:** re-verify this section quarterly, and gate every recipe on *which auth
path the user actually has* rather than on what a plan was called last quarter.

---

## 7. Where the numbers live

Nothing in this file is quotable to a client on its own. When you need a figure:

1. Read `references/sota-snapshot.md` and check its `LAST_VERIFIED` header.
2. Run `node scripts\check-prices.mjs`. If any row reports STALE or KNOWN-WRONG, re-fetch
   the primary source **in this session** before quoting.
3. A verified date may only be advanced by a session that fetched the primary source in that
   session. Any other update writes `confidence: THIRD-PARTY`, keeps the old date, and adds a
   note. This provenance guard is what stops the skill from laundering its own guesses.
