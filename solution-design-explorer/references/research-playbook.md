# Research Playbook

The research is what makes the deliverable credible instead of plausible. Two passes (initial survey, then gap-closing) plus a recency refresh, all done with **parallel subagents** so you stay inside the context budget and finish fast.

## Why parallel subagents

Each research strand is independent — how-the-community-does-it doesn't depend on the SOTA-refresh. Running them as separate `Agent` calls in a single message means they execute concurrently, each burns its own context (not yours), and you receive distilled briefs back. Spawn them all in one turn; don't fire one, wait, then fire the next.

A lesson learned the hard way: **don't force subagents to return a rigid JSON schema.** Structured-output schemas have failed repeatedly here ("subagent completed without calling StructuredOutput"). Ask for a **markdown brief** instead — headed sections, bullet findings, inline source citations, an explicit confidence note. Free-form is far more robust and just as usable.

## Pass 1 — initial survey (run concurrently)

Spawn one subagent per strand. Strands to use (pick the 3–5 that fit the topic):

- **A — Approaches the field uses.** "Find the top distinct *families* of approach for <problem>. For each: what it is, when it wins, where it breaks, maturity (experimental→standard). Aim for ~3–5 families, not vendors. Cite sources; flag any vendor-self-reported numbers as such."
- **B — Domain specifics.** "Identify the hard, domain-particular sub-problems in <domain> that a generic design would get wrong, and how practitioners actually model each. Cite sources."
- **C — Last ~2 months SOTA.** "What has changed in <field> in roughly the last 8 weeks — new models, frameworks, specs, benchmarks, product launches, research. Date-stamp every item. Distinguish hype from substance. Cite sources." (Use `WebSearch`/`WebFetch`; the `deep-research` skill is an option for a heavier pass.)
- **D — Axis the topic demands.** Reliability/eval, security, cost, regulatory — whatever is load-bearing.

## Pass 2 — gap-closing (after the red-team)

Once the critique section (C1, C2, …) exists, spawn a second wave aimed precisely at the open gaps: one subagent per cluster of related critiques. "Resolve or refute the following concerns about <design>: C1 …, C2 …. For each, what does the evidence say? If unresolved, say so." Fold answers back in and note what each changes.

## Adversarial-evidence checklist

Apply to every non-trivial claim before it enters the doc:

- [ ] **Source named?** No source → mark as assumption or cut.
- [ ] **Vendor self-reported?** Accuracy/throughput numbers from the vendor selling the thing are marketing until independently reproduced. Exclude from headline claims; you may mention "vendor reports X (unverified)."
- [ ] **Refuted or contested?** If a once-cited claim has been challenged, drop it and note the contest. (Past examples that got excluded: "25% better" / "1–5% to review" style vendor stats with no independent backing.)
- [ ] **Recency?** Is this still true given the SOTA pass? Frameworks and model rankings churn monthly.
- [ ] **Primary > secondary.** Prefer the paper/spec/changelog over a blog summarizing it.
- [ ] **Fact vs. proposal.** If it's your design intent, not an observed fact, mark it.

Being visibly willing to exclude weak evidence is a credibility *gain*, not a gap. Say what you threw out and why.

## Source ledger (Appendix A)

Maintain a running table as you research; emit it as the appendix:

| # | Claim (short) | Source | Confidence | Notes |
|---|---|---|---|---|
| 1 | <one line> | <link / paper / vendor> | High/Med/Low | e.g. "vendor self-reported — excluded from accuracy claims" |

High = independent/primary + reproducible. Med = single credible source. Low = inference, contested, or vendor-only.

## SOTA-refresh method (the differentiator)

Most design docs are silently stale. To make §12 land:
1. Run strand C with explicit date bounds ("roughly the last 8 weeks from <today's date>").
2. After the design is drafted, re-read it against the C findings and ask: *what did we get wrong, what's now standard that we under-specified, what shipped that changes positioning?*
3. Write §12 as concrete deltas to the design, not a news roundup. Each item should change something or explicitly confirm a choice.
4. Date-stamp the section so a future reader knows the freshness window.
