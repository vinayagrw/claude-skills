# The hedged multi-assistant playbook

**Scope:** dev-time only. How to get cheap breadth — repo maps, usage sweeps, bulk
summarisation — without paying frontier-tier prices for it, and without building an
architecture that depends on a capability nobody has verified.

**No dollar figures appear in this file.** Prices live in `references/sota-snapshot.md`.
Every factual claim below carries `source`, `as_of`, and `confidence` (`high` = vendor's own
documentation; `medium` = inference from vendor docs or a strong secondary read; `low` =
third-party or single-source).

---

## 0. The stance, stated once

> **The spine is Plan C: a cheap-tier subagent with a digest-return contract.**
> Everything else in this file is an optimisation layered on top of it, and every one of
> those optimisations is allowed to fail without invalidating anything.

This is a deliberate design decision, not caution for its own sake. Through spring 2026 the
dominant cheap-breadth recipe was "shell out to a free Gemini CLI for repo-wide analysis."
That recipe's foundation was removed in June 2026 (§2). A playbook whose backbone rests on
an unverified third-party CLI capability is a playbook that silently breaks — and it breaks
in the worst possible way: the recipe still *reads* correct, so a future session confidently
emits it and the user discovers the failure at the shell.

So: the default costs you nothing to adopt and cannot be retired by another vendor's product
decision. CLI offload is documented, gated, and clearly labelled as optional.

---

## 1. The three plans

| Plan | What it is | Status |
|---|---|---|
| **Plan C — cheap-tier analyzer subagent** | A cheap-tier subagent (Haiku-class) with a strict digest-return contract. No second vendor, no second auth path, no capability gate, no cross-tool context-file sync. | **THE DEFAULT.** Recommended unconditionally. |
| **Plan B — metered Gemini over HTTP** | Skip every CLI; call the HTTP API from a small script. Pin the **cheapest GA Flash-class** model, never the current default Flash. Batch it. | Always available. Unaffected by any CLI product change. |
| **Plan A — CLI offload** | Shell out for a repo-wide read-only scan; return only a digest so the paid context stays clean. | **An optimisation behind a capability gate.** Never architecture. |

**The rule this skill enforces on itself:** never emit a CLI-offload recipe without first
stating *"run `node scripts\check-headless.mjs`; if it fails, use Plan C."*

---

## 2. What actually changed, and how confident we are

Google retired the standalone Gemini CLI for consumer tiers on **2026-06-18**, announced
2026-05-19. Free personal Google accounts, AI Pro and AI Ultra users had the CLI and the
Code Assist IDE extensions stop serving requests. Organisations on Code Assist Standard or
Enterprise, and API-key or Vertex users, were explicitly unaffected.
**Source:** developers.googleblog.com transition post, 2026-05-19. **Confidence: high** —
this is Google's own statement.

The replacement is the **Antigravity CLI** (`agy`), a Go-based agent-first CLI sharing the
Antigravity desktop harness. Migration converts commands to skills; MCP servers carry over
after a config key rename. It reads workspace `AGENTS.md` and `GEMINI.md` natively.
**Source:** agentpedia.codes deep dive, 2026-05-20. **Confidence: low** (single third-party
source).

> ### ⚠ The load-bearing unknown
>
> **Whether the Antigravity CLI has a headless one-shot mode is UNCONFIRMED.**
>
> A single third-party deep dive (agentpedia.codes, 2026-05-20) reports finding **no
> documented headless/non-interactive flag** equivalent to the old `gemini -p`, and
> speculates that programmatic invocation may be reserved for the Antigravity SDK.
> **Confidence: low.** This is one writer's reading of the docs, *not* a Google statement
> that headless is absent.
>
> **Do not treat this as settled in either direction.** Do not tell a user headless is gone;
> do not assume it works. **Run the gate.** A capability check that takes two seconds beats
> an assertion either way.

**Free-tier quota, also contested.** One tracker reports a free API key at a low daily
request cap, Flash-only; other trackers cite a substantially higher figure for Flash. Google
no longer publishes fixed rate-limit tables. **Confidence: low, and the sources genuinely
disagree** — check your own AI Studio dashboard rather than quoting either. Three quota
mechanics *are* documented and matter more than the number: quotas are **per-request, not
per-token**; one agent-mode prompt can trigger multiple model requests; and CLI and Code
Assist agent mode **share one combined quota**, resetting at midnight Pacific.
**Source:** developers.google.com Code Assist quotas page, live 2026-07-19.
**Confidence: high** for the mechanics, **low** for any specific number.

### 2.1 Auth-path table (as of 2026-07-19)

| Auth path | Status after 2026-06-18 | Headless one-shot? | Confidence |
|---|---|---|---|
| Free personal Google account | Dead for CLI | n/a | high |
| Google AI Pro / Ultra | Dead for CLI (moved to Antigravity) | Antigravity: **undocumented** | high / **unverified** |
| Gemini Code Assist Standard / Enterprise | Unaffected | **Unverified — run the gate** | **low** |
| **API key** (free tier or paid) | Unaffected | **Yes — HTTP API, no CLI involved** | high |
| Vertex AI | Unaffected | Yes | high |

Note the Code Assist row. An earlier draft of this table read *"Gemini CLI retained — likely
yes,"* which shipped a guess as a table cell. Under ADDENDUM F a guess is either labelled or
it is not a row. It is labelled `low` and it points at the gate.

### 2.2 The architectural consequence — say this out loud

**The runtime architecture contains zero CLI dependency on any Google tool.** The shipped
provider chain reaches Gemini **only over HTTP** (`templates/adapters/gemini.ts`). No
production code path shells out to `gemini`, `agy`, or anything else Google ships as a
binary.

This is not incidental. It is the reason the June 2026 retirement — a change that invalidated
an entire genre of published cost recipes — costs this skill exactly one optional dev-time
section and nothing else. The failsafe transport in the runtime chain is the **Claude Code
CLI**, which is a *different* vendor from the primary, so no single product decision can
remove both. Keep it that way: if a future session is tempted to add `spawnSync('agy', ...)`
to a runtime template, that is the anti-pattern this skill exists to prevent, committed by
the skill.

---

## 3. Plan C — the default spine

A cheap-tier subagent doing read-only breadth work, returning a digest.

**Why it wins by default:** no second vendor, no second auth path, no capability gate, no
context-file sync between two tools, no quota to run out of at midnight Pacific, and no
third-party product roadmap in your dependency graph. It costs one frontmatter line.

```markdown
---
name: repo-analyzer
description: Read-only breadth analysis — repo maps, usage sweeps, multi-file summaries.
model: haiku          # G1: NEVER `inherit`. Inherit means a frontier session
                      # spawns frontier explorers and you pay frontier prices for grep.
tools: Read, Grep, Glob
---

You perform read-only analysis. You never edit files.

RETURN CONTRACT (this is the cost control — obey it literally):
Return ONLY a digest of at most 300 words. Never paste file contents. Cite absolute
file paths and line numbers instead of quoting. If you must show code, show at most
the single load-bearing line. Stop after 6 turns and report what you have.
```

**The digest contract is the whole economic argument.** Subagent isolation saves money only
because the verbose intermediate work dies with the subagent. A subagent that returns
everything it read has cost you a second context window and saved you nothing — you paid for
isolation and then threw it away. Caps: exploration 300 words, analysis 400, review 600,
implementation report 250.

**Before dispatching, ask G7:** would grep, glob, a test runner, or a five-line script answer
this? Read-only breadth is exactly the class of question where deterministic tools often win
outright, at zero cost and with no hallucination risk. Dispatch a model when the question
needs judgement, not when it needs coverage.

Full subagent economics — when fan-out saves versus burns, the seven guardrails, the
per-class envelope table — are in `references/claude-code-costs.md` §3.

---

## 4. Plan B — metered Gemini over HTTP

When you genuinely want Gemini's context window or its price point for bulk read-only work,
call the API. No CLI, so nothing here can be retired out from under you.

Four rules, each of which is a real trap:

1. **Pin the cheapest GA Flash-class model, not the vendor default.** "Flash means cheap"
   became false in 2026: the model Google made the default everywhere on 2026-05-19 sits
   several times above the Flash-Lite class on input (source: `ai.google.dev` pricing page,
   as of 2026-07-09, confidence **high**). For read-heavy scans, input price dominates
   totally. Accepting a default here is a multi-fold overpay for nothing. Exact ids and rates:
   `references/sota-snapshot.md`.
2. **No preview SKUs.** A cheaper preview Flash exists, and a Pro preview exists. Preview and
   fast SKUs get withdrawn mid-quarter — two did within eight weeks in mid-2026. Pinning one
   in a template is the anti-pattern this skill teaches, committed by the skill.
3. **Watch the long-context cliff.** The Gemini Pro tier roughly doubles its input rate above
   a context threshold, while current Claude-generation models price their full window flat
   (source: vendor pricing pages, 2026-07-09 / 2026-07-19, confidence **high**). A whole-repo
   dump can silently move you across that boundary. "Gemini is cheaper for long context" can
   invert entirely — this is one of the specific claims `scripts/compare-providers.mjs`
   exists to settle empirically.
4. **Batch it.** Gemini, Anthropic and OpenAI all discount asynchronous batches by half
   (source: all three vendor pricing pages, 2026-07-19, confidence **high**). The triage
   question is simply: *is a human waiting for this response right now?* A nightly repo scan
   is not.

**And the trap that dwarfs all four:** sticker price is not spend. The Gemini CLI was measured
at roughly 65% more input tokens than Claude Code on one matched task (source: third-party
practitioner measurement, confidence **low** — single task, single observer, but the effect
direction is corroborated). A model priced 30% lower per token that burns 65% more tokens is
**more expensive**. Never compare per-MTok stickers. Run
`node scripts\compare-providers.mjs`, which measures tokens-per-task against a fixed fixture
and multiplies by the dated sheet to give a real cost per task. That script is the only
mechanism in this skill that settles the question *durably* rather than at one point in time.

---

## 5. Plan A — CLI offload, behind the gate

### 5.1 Run the gate first — always

`scripts/check-headless.mjs` is Node, zero-dependency, cross-platform. It is deliberately
**not** PowerShell: redirecting a native executable's stderr in PowerShell 5.1 wraps output
in error records and corrupts the exit code, and execution policy blocks scripts on a default
Windows install. Neither failure mode is acceptable in a capability probe whose entire job is
to answer a yes/no question honestly.

Its design, and why each step exists:

1. **Resolve the binary.** If it is not on `PATH`, print `NOT-INSTALLED` and stop. No probe.
2. **Inspect `--help` output first.** Look for a documented one-shot / non-interactive flag
   *before* attempting anything. This is the safe read: parsing help text cannot hang, cannot
   consume quota, and cannot mutate anything.
3. **Only then probe**, with `spawnSync` under a **hard timeout** and `shell: false`. The
   timeout is load-bearing: an unrecognised flag on an interactive CLI drops into a REPL and
   waits forever. Without the timeout, a capability check hangs the session it was meant to
   protect.
4. **Never redirect stderr in a way that corrupts the exit code.** Capture both streams
   separately and judge on `status` plus the expected token in stdout.
5. **Print exactly one verdict per binary:** `HEADLESS-OK`, `HEADLESS-ABSENT`, or
   `NOT-INSTALLED`.

```
> node scripts\check-headless.mjs
gemini : NOT-INSTALLED
agy    : HEADLESS-ABSENT   (no one-shot flag found in --help; probe timed out)
=> No verified headless path. Use Plan C (see multi-assistant.md section 3).
```

Re-run the gate **quarterly**, and whenever a user reports that an offload recipe stopped
working. The answer has changed once already and may change again in either direction — a
future Antigravity release adding headless support is just as plausible as it staying absent.

### 5.2 If, and only if, the gate passes

**Task split**, per consistent 2026 practitioner findings (confidence **medium** — many
independent sources agree, none is a vendor statement):

- **Gemini = breadth.** First-pass map of an unfamiliar codebase, "how do these modules
  relate", repo-wide scans for a deprecated API, summarisation, multimodal/screenshot
  analysis, experiments where cost matters more than precision.
- **Claude Code = depth.** The actual patch, anything on a critical path, refactors with
  tests in the loop, reasoning-heavy interactive steps, debugging.

**Intent-based routing** — a clean rule worth lifting verbatim: prompts containing
*fix / change / update / make* → apply results directly. Prompts containing
*review / analyze / suggest* → **return analysis only, never write**.

**Wrapper shape.** A subagent that shells out and returns only a digest, so the large context
window does the heavy read while your paid context stays clean. Request structured output and
parse it — **never scrape prose**.

### 5.3 Operational hygiene — the offload is itself a cost bomb

- **A whole-repo flag will happily ingest `node_modules`, `.git`, `dist` and lockfiles.**
  Always pass an explicit include/exclude set. A cost recipe that dumps a dependency tree into
  a metered context has inverted its own purpose.
- **Read-only means read-only.** Any "skip confirmations" flag is for non-destructive analysis
  and nothing else.
- **Never apply an offloaded diff without review.** One practitioner measured very high
  hallucination rates in vision-heavy flows, improving substantially after model updates but
  remaining material (source: paddo.dev, 2026, confidence **low**). Treat every assistant as a
  junior developer: review every diff as if a human wrote it.
- **Rate-limit your bridge.** Free-tier quotas are per-request and shared across surfaces;
  unthrottled fan-out earns 429s, not savings.
- **MCP bridges exist** (a CLI-to-CLI bridge tool is the best-known option) but their
  compatibility with the current Antigravity CLI is **unverified** — confidence **low**. Gate
  them the same way.

---

## 6. Context-file sync

Use a shared tool-neutral **`AGENTS.md`** as the single source of truth, kept under ~150
lines, with the Claude-specific file reduced to a one-line `@AGENTS.md` import plus
Claude-specific notes.

> **Contested, so hedged.** Sources from June 2026 disagree on whether Claude Code natively
> reads `AGENTS.md`: one says it does not and requires an import or a symlink; others claim
> native support landed in spring 2026. **Confidence: low, both ways.** The `@AGENTS.md`
> import is correct under *both* readings and costs nothing if native support does exist —
> which is exactly why it is the prescription. **Do not use a symlink on Windows**; symlinks
> require elevation or developer mode.

Put the tool-neutral rules — routing philosophy, "don't pay a model for what code can
compute", the digest-return contract, the single-working-tree rule, session hygiene — in the
shared file. Put the Claude-specific syntax — effort levels, the usage command, `--bare`,
`cache_read_input_tokens` — in the Claude file.

**When not to bother:** if no non-Claude assistant will ever touch this repo, one file is
cheaper to keep coherent than two. Split when a second tool actually arrives, not in
anticipation. Maintaining independent divergent files is a documented drift pitfall
(confidence **medium**).

Remember that these files sit in the **cached prefix of every single request**, and that
editing one mid-session invalidates system and everything downstream. Queue edits; apply them
after a clear. See `references/claude-code-costs.md` §2.

---

## 7. The hard rule, restated

> **Never run two agents concurrently on one working tree. Commit or stash between switches.**

This matters twice as much the moment a second assistant is in play, which is why it is
repeated here: concurrent edits produce "file has been unexpectedly modified" stalls and you
pay full price for a session that then redoes its own work. Commit boundaries also keep
`git log` attributable per assistant — which is how you later measure whether the second
assistant earned its keep at all. Use `git worktree` for genuine parallelism. Full rationale:
`references/claude-code-costs.md` §4.3.

---

## 8. If the gate fails — the fallback plan, in order

1. **Use Plan C.** A cheap-tier subagent with a digest contract handles the overwhelming
   majority of read-only breadth work. This is not a consolation prize; it is the
   recommendation.
2. **If the analysis genuinely needs more context than one cheap-tier window holds**, use
   Plan B: the HTTP API, cheapest GA Flash-class model, batched, with an explicit file
   include/exclude set.
3. **If neither fits, decompose.** Split the repo by directory, run several bounded cheap-tier
   subagents under the fan-out cap of 4, and have each return a 300-word digest. N small
   digests are almost always cheaper and more reviewable than one enormous single-shot
   context.
4. **Record the outcome in `LEARNINGS.md`** — which binary, what the gate said, what you did
   instead. The gate's verdict is exactly the kind of environment-specific fact that should
   not have to be rediscovered next quarter.

**What you do not do:** you do not degrade to running breadth work on the frontier tier
because the cheap path was unavailable. That is a several-fold overpay for a task whose
defining characteristic is that it needs coverage rather than judgement.
