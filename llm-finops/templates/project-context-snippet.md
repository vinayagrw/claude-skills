## LLM cost rules for this repo

Paste this into the repo's agent context file. It encodes the cost rules that must survive
a session ending. Deliberately carries **no prices** — this block gets copied into other
repositories and read months later, and an embedded number would travel with a
verification date that had quietly stopped being true. For any actual figure, read
`references/sota-snapshot.md` in the `llm-finops` skill, or run
`node scripts/compare-providers.mjs`.

### Where this block belongs

Put the shared, tool-neutral version in **`AGENTS.md`** and keep it under about 150 lines,
then have `CLAUDE.md` pull it in with a one-line import:

```
@AGENTS.md
```

plus any Claude-specific notes below that line. Whether Claude Code reads `AGENTS.md`
natively is genuinely contested — sources from mid-2026 disagree, and this skill does not
assert either way. The import works under **both** readings, and it avoids the Windows
symlink route, which needs elevated privileges or developer mode. If you only keep one
file, keep `CLAUDE.md`.

### Runtime rules — what the shipped app costs

1. **One metered choke point.** Every provider call goes through `meteredLlm()`. Raw SDK
   calls are forbidden outside `adapters/`. A meter with a bypass is not a meter — one
   unmetered call site silently leaves the ledger and the first sign is an invoice that
   does not reconcile.
2. **Provider-reported usage only. Never estimate tokens from character counts.** A
   `chars/4` heuristic drifts silently and makes reconciliation against the invoice
   impossible. If a response carries no usage object, set `estimated: true` and raise a
   counter — do not guess.
3. **Price on the SERVED model, never the requested one.** Aliases resolve to dated
   snapshots, deployment names hide the real model, partner-cloud ids carry region
   prefixes, and a free tier can silently downgrade you under load. Pricing the requested
   model prices a system you did not run.
4. **Every metered surface needs a zero-cost deterministic fallback**, registered with it.
   A surface without one cannot be registered. This is also what makes a hard budget stop
   survivable rather than an outage.
5. **Instrumentation never breaks the response path.** Ledger writes, sink dispatches and
   telemetry emissions are try/catch, fire-and-forget and bounded. A metering failure must
   never change what the user receives.
6. **Label every call with a `surface` and a `stage`.** A multi-call pipeline logged under
   one label hides its own unit economics — you learn the pipeline costs too much but not
   which step to fix.
7. **Choose a budget mode explicitly** in config: `advisory`, `soft-degrade` or
   `hard-stop`. The defect is not which one you pick, it is having exactly one behaviour
   that nobody chose. Move off `advisory` when the app has real customer traffic, spend is
   charged back per tenant, autonomous agent loops are involved, or a single tenant can
   drive unbounded volume.
8. **`hard-stop` needs a shared counter.** Process-local budget counters are per-replica:
   across N instances a cap is an N-times cap, it resets on every deploy, and it is the
   mode with the strongest safety claim that is most likely to be silently inert. Use a
   shared store or a gateway virtual key.
9. **Ask "does this need a model at all?" first.** Lookup tables, regex, and deterministic
   compute are a total saving with a quality improvement, since deterministic numbers do
   not hallucinate. This is the most under-used lever in the list.
10. **Ask "is a human waiting for this right now?"** If not, batch it — the asynchronous
    discount is roughly half, on every major provider, and it stacks with cache reads.

### Dev-time rules — what building it costs

11. **Match compute to consequence.** Use the cheap tier for mechanical work, the workhorse
    tier for ordinary feature work, and the frontier tier only where reasoning is the
    actual product. Escalate a tier only after the tier below has already failed on the
    same problem.
12. **Do not switch model or provider mid-session to save money.** It invalidates the
    prompt cache, which is usually worth far more than the rate difference being chased.
    Decide the tier at session start.
13. **Protect the cache prefix.** Invalidation cascades `tools -> system -> messages`:
    changing a tool definition kills the entire cache. Keep the stable prefix
    byte-identical and put anything volatile — timestamps, session ids, the user's actual
    question — after it. Verify with a nonzero cache-read token count; that is the only
    reliable signal.
14. **Prefer a CLI over an MCP server** where both exist. A CLI costs tokens only when
    invoked; an MCP server's tool definitions sit in the cached prefix on every request,
    and changing them invalidates everything.
15. **Every subagent declares its model, and defaults to the cheap tier.** Inheriting means
    a frontier session spawns frontier explorers. Every subagent prompt ends with a
    digest-return contract: return a short digest, cite file paths and line numbers, never
    paste file contents. Cap concurrent fan-out at about four interactively.
16. **Never run two agents concurrently on one working tree.** You pay full price for a
    session that then redoes its own work. Use separate worktrees for real parallelism.
17. **Thinking bills as output.** Turn it off for mechanical edits. Do not use a fast mode
    as a cost lever — it is a latency purchase at a premium.
