# Document Skeleton (combined deliverable)

This is the section skeleton for the single combined Technical Design deliverable. It has a **core spine** (always) plus **AI-mode sections** (include only when AI/ML is load-bearing). Scale each section to its real complexity; delete what doesn't apply instead of padding. Numbering is a suggestion — keep it consistent within a doc.

Markers used below:
- `[CORE]` — always include.
- `[AI]` — include in agent-ify / AI-system mode.
- `[OPT]` — include when relevant (audience, topic).

---

## Title block
`# <Topic> — Technical Design & Architecture`
One-line subtitle: what this is, who it's for, version/date. Date-stamp it — the SOTA section's value depends on the reader knowing when "recent" was.

## 0. How to read this document `[CORE]`
- Persona legend (the panel from `references/personas.md`, each with a one-line stake).
- What's **decided** vs. **proposed** vs. **open**. A reader should never mistake a proposal for an observed fact.
- Optional reading paths ("execs read §1, §13; architects read all").

## 1. Requirements `[CORE]`
- **1.1 Functional** — what it must do, as crisp capabilities.
- **1.2 Non-functional** — latency, throughput, accuracy targets, availability, cost envelope.
- **1.3 Constraints** — verbatim from the brief/reference deck: stack, security/identity rules, data-residency, budget, timeline, "agents must not do X" rules. These recur as reality checks throughout.

## 2. The top approaches the community uses `[CORE]`
The survey from research Strand A. For each approach (aim ~3–5 *families*, not vendors):
- What it is, in one paragraph.
- When it wins / where it breaks.
- Maturity (experimental → production-standard).
Close with a note on which are *layered* vs. *mutually exclusive* — mature fields usually layer (legacy substrate + modern layer), they don't pick one.

## 3. Recommended approach — thesis (pre-critique) `[CORE]`
A clear, opinionated recommendation **before** you red-team it. State it as a thesis you will then attack in §10. For AI systems this is often the **fast-path / slow-path** thesis: a cheap deterministic path handles the easy majority; an expensive reasoning path handles the ambiguous long tail; a gate routes between them. Generalize the idea: *spend the expensive compute only where the difficulty actually lives.*

## 4. High-level architecture `[CORE]`
- A Mermaid architecture diagram (see `references/mermaid-cookbook.md`).
- Prose walkthrough of the main flow, end to end.
- Trust boundaries / where untrusted input is contained.

## 5. Component deep-dive `[CORE]`
One subsection per major component. Write the rationale **through the personas** — "the security lead requires X, so this component does Y." Include the unglamorous components (intake/triage, validation, error handling), not just the exciting model.

## 6. Confidence, calibration & human-in-the-loop `[AI]`
"The part everyone hand-waves." Cover honestly:
- Why naive confidence (raw logprobs / "the model said 0.95") is unreliable.
- What actually works: multi-sample consensus / self-consistency; calibration (isotonic/Platt/ensemble voting); tracking the **silent-failure rate** (confidently wrong), not just accuracy.
- **Confidence-gated straight-through processing**: per-field / per-risk thresholds decide auto-accept vs. route-to-human.
- The **HITL review queue** as a first-class product surface, not an afterthought.
Include a Mermaid diagram of the confidence-gating flow.

## 7. Data, multi-tenancy, security & governance `[CORE]`
- Data model / storage choices and why.
- Multi-tenancy & isolation.
- Identity & access (auth flow, least privilege, credential handling).
- Untrusted-input handling (e.g., parse hostile documents in a sandbox; treat document/user text as **data, not instructions** — prompt-injection defense for AI systems).
- Any data-rights / training-corpus governance if a data flywheel is in play.

## 8. Design patterns & comparison `[CORE]`
The Step-4 content: each candidate pattern with a diagram, the comparison matrix, the decision tree, and the recommended composite. For AI, pull from `references/design-patterns.md`. Headline message: **the right architecture is a composition, not a single winner.** (If this section grows large, it's the natural thing to split into a companion `<Topic>_Design_Patterns.md` — but default to keeping it inline.)

## 9. Fit to the brief & delivery `[OPT]`
How the design maps to the reference proposal/RFP: budget tier, timeline, phased/thin-foundation build, reuse targets. Keep honest about what fits and what doesn't.

## 10. Design critique — red-teaming our own approach `[CORE]`
Attack the §3 thesis. List concrete critiques **numbered C1, C2, …**: failure modes, weak assumptions, scaling cliffs, eval blind spots, cost surprises. Be specific. Separate "gaps the research itself flagged" from "substantive critiques." End with **what the critique changes** about the recommendation.

## 11. Concluding research — closing the gaps `[CORE]`
The gap-closing pass: for each open critique/question, the finding that resolves (or fails to resolve) it. Note explicitly when something remains unresolved — false closure is worse than an open question.

## 12. What we missed — last-2-months SOTA refresh `[CORE]`
The Strand-C content, sharpened against the now-drafted design. Date-stamped. Cover: the one thing the design got *wrong* in light of recent work; the biggest design miss; architecture/reliability/cost refinements that are now standard; a market reality check (who shipped what recently, how far autonomy actually is). This section is a major credibility differentiator — most design docs are silently stale.

## 13. Final recommendation & honest scope `[CORE]`
- **13.1** The recommendation in one paragraph.
- **13.2** Honest scope — what the stated budget/timeline *actually* buys vs. the full vision. Resist over-promising; a credible "here's the MVP, here's wave 2" beats a fantasy.
- **13.3** (if pre-sales) the close — see §14.

## 14. How we help — the close `[OPT]`
Pre-sales / client-facing only. The differentiator and delivery angle. See `references/presales-framing.md`. Keep it earned, not boastful — tie each claim to something concrete in the design.

## Appendix A — Source ledger `[CORE]`
Table: claim → source → confidence (high/med/low) → notes (e.g., "vendor self-reported, excluded from accuracy claims"). Makes the doc auditable and signals intellectual honesty.

---

## Tips
- **Lead with the useful.** A reader skimming §1 and §13 should get the gist. Don't bury the recommendation.
- **Show, don't tell.** Diagrams, concrete field examples, real numbers (cited), small tables over walls of prose.
- **Honesty is a feature.** Excluded claims, open questions, and "what this won't do" build more trust than uniform confidence.
