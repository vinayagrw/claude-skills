# Research Playbook

The research is what makes the deliverable credible instead of plausible. Two passes (initial survey, then gap-closing) plus a recency refresh, all done with **parallel subagents** so you stay inside the context budget and finish fast.

## Why parallel subagents

Each research strand is independent — how-the-community-does-it doesn't depend on the SOTA-refresh. Running them as separate `Agent` calls in a single message means they execute concurrently, each burns its own context (not yours), and you receive distilled briefs back. Spawn them all in one turn; don't fire one, wait, then fire the next.

A lesson learned the hard way: **don't force plain `Agent` subagents to return a rigid JSON schema.** Structured output has failed repeatedly there ("subagent completed without calling StructuredOutput"). Ask those agents for a **markdown brief**: headed sections, bullet findings, inline source citations and an explicit confidence note. Free-form is more robust and just as usable. The exception is the Workflow tool (see "Workflow variant" below). Its `schema` option is enforced at the tool-call layer and is reliable, so use it there.

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

## Opened-page verification

"Cite sources" is not enough. Agents cite pages they never opened, misread them, or quote a secondary summary as if it were the primary. Before a claim with a number, a named regulator, a date or a named company enters the doc:

1. A **separate verifier** (not the agent that found it) opens the URL itself and is told to default to "does not support" when in doubt.
2. It records `verify_page_opened` (true or false), `verify_supports` (yes, partial, no or unreachable), `verify_date_seen` (the date shown on the page) and a one-line `verify_note`.
3. If the source is secondary, the verifier tries to open the primary (the ruling, the filing, the spec, the speech) and says whether it managed to.
4. **Default path (no Workflow):** after Pass 1 returns, spawn verifier subagents in parallel, one per strand or per batch of about 10 claims. Each returns a markdown table with the four verify_* columns, not JSON.
5. A claim whose page was never opened is capped at rung 7. A `no` is dropped, and you say so in the ledger notes.

## Evidence ladder

Grade every claim on one ladder, so grades mean the same thing across deliverables. "Does not tell you" is mandatory. It stops a true number from being read as a bigger claim.

| Rung | Tier | Does not tell you |
|---|---|---|
| 1 | Audited or independently reproduced result | Whether it transfers to your context |
| 2 | Primary record: regulation, ruling, filing, spec, contract | Whether anyone complies, adopts or performs |
| 3 | Revealed behavior: disclosed volume, retention, on-chain or scheme data | Why, or whether it pays off |
| 4 | Deployment scale or live status | Unit economics or quality |
| 5 | Independent survey or credible secondary reporting | Behavior. Sentiment only |
| 6 | Stated intent or self-report | Behavior, and certainly not money |
| 7 | Projection, award, vendor claim, unopened page | Anything |

Apply the ladder to your own best number too. Saying your headline figure sits on rung 3 is the test that the discipline is real.

## Source ledger (Appendix A)

Maintain a running table as you research. Emit it as the appendix:

| # | Claim (short) | Source | Rung | Verified | Notes |
|---|---|---|---|---|---|
| 1 | <one line> | <link> | 1 to 7 | opened, supports yes, <YYYY-MM-DD> | e.g. "vendor self-reported, kept out of headlines" |

**Machine-readable option.** When the findings will feed later work (pages, other designs, a running claims ledger), also write the ledger as a JSON array, one object per claim, with these fields: `id`, `claim`, `number`, `unit`, `event_date`, `publish_date`, `url`, `quote` (verbatim, under 15 words), `source_tier` (primary, secondary or vendor), `kind` (fact, projection, vendor_claim or opinion), `rung`, `confidence` (the verifier's certainty that the page supports the claim, separate from `rung`, which grades the type of evidence), `verify_page_opened`, `verify_supports`, `verify_date_seen`, `verify_note`. If the user already keeps a ledger, match its schema and append rather than starting a new file, and back it up first.

## Workflow variant

Use this only when the user has opted into multi-agent orchestration ("use a workflow", ultracode, or a direct ask). It runs Step 1 and the verification above as one orchestrated pipeline. This is a sketch, adapt it to the Workflow tool's API. `CLAIMS` is a schema for an array of objects with the research-side ledger fields (claim, number, unit, event_date, publish_date, url, quote, source_tier, kind). `VERDICT` is the four verify_* fields plus `rung` and `confidence`. If the Workflow tool is unavailable, use the default path above.

```js
// strands -> per-claim adversarial verify, with no barrier between them -> synthesis -> completeness critic
const rows = (await pipeline(STRANDS,
  s => agent(s.prompt + RULES, { phase: 'Research', schema: CLAIMS }),
  (r, s) => parallel(r.claims.map(c => () =>
    agent(verifyPrompt(c), { phase: 'Verify', schema: VERDICT, effort: 'low' })
      .then(v => ({ ...c, strand: s.key, ...v }))))
)).flat().filter(Boolean)
const brief = await agent(synthPrompt(rows), { phase: 'Synthesize' })
const gaps  = await agent(`What is missing from this brief? Strand not run, claim unverified, primary unopened? ${brief}`)
```

Put the house rules in `RULES`: real opened URLs only, short verbatim quotes, ISO dates, vendor figures tagged, never invent a source, person or quote. Feed what the critic finds into Pass 2.

## SOTA-refresh method (the differentiator)

Most design docs are silently stale. To make §12 land:
1. Run strand C with explicit date bounds ("roughly the last 8 weeks from <today's date>").
2. After the design is drafted, re-read it against the C findings and ask: *what did we get wrong, what's now standard that we under-specified, what shipped that changes positioning?*
3. Write §12 as concrete deltas to the design, not a news roundup. Each item should change something or explicitly confirm a choice.
4. Date-stamp the section so a future reader knows the freshness window.
