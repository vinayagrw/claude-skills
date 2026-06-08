---
name: solution-design-explorer
description: >-
  Produce a deep, research-backed technical design and architecture deliverable for
  a capability, product, or solution — a document that surveys how the community
  tackles the problem, reasons through it with multiple expert personas, proposes an
  architecture with diagrams, compares design patterns, red-teams its own approach,
  refreshes against the last ~2 months of state of the art, and ends with a
  recommendation. Use whenever the user wants to design or architect a solution,
  agent-ify a capability, explore how the community/industry does something, write a
  solution-architecture or technical design deep-dive, prepare a pre-sales /
  solution-design deliverable, compare approaches and patterns, or asks you to play
  multiple personas, challenge an approach and find gaps, or find the top N
  approaches for a technical problem. Especially apt for AI-agent,
  document-extraction, automation, platform, data, or integration design topics —
  reach for it even when the user only says do a proper design write-up for this.
---

# Solution Design Explorer

This skill produces **one comprehensive technical-design deliverable** (a single Markdown document) that takes a capability or solution from "here's the problem" to "here's the recommended architecture, why, the alternatives we rejected, where it breaks, and how to deliver it." It is research-first and intellectually honest: it surveys real-world approaches, weighs them with multiple expert lenses, draws the architecture, compares design patterns, then red-teams the whole thing and refreshes against the most recent state of the art before recommending.

It is **not** a codebase-grounded decision record (that's `tdr-author`) and **not** a quick how-to. It shines when the topic involves genuine design space — multiple viable approaches, real trade-offs, an architecture worth diagramming, and a recommendation worth defending.

## The shape of a great deliverable

The reason this workflow works is that it mirrors how a strong solution architect actually thinks: *don't trust your first instinct, find out what the field already knows, reason about it from several angles, draw it, then attack your own answer until only the strong parts survive.* Every phase below exists to fight a specific failure mode — shallow research, single-perspective tunnel vision, hand-waved architecture, untested confidence, and stale knowledge. Keep that "why" in mind and adapt the mechanics to the topic.

## Step 0 — Intake & mode detection

Before researching, pin down:

1. **The target.** What capability/solution is being designed? One sentence you could defend.
2. **Reference material.** Any brief, RFP, proposal deck (.pptx), PDF, prior doc, or links the user points to. Read them — they carry constraints (budget, timeline, existing stack, non-negotiables) that shape the whole design. For .pptx, use the `pptx` skill or unpack and extract `<a:t>` text; for .pdf use the Read tool's PDF support.
3. **Audience & purpose.** Internal architecture review? Pre-sales / client-facing? A build team? This sets tone and how much "how we help" framing to include (see `references/presales-framing.md`, optional).
4. **Constraints.** Stack, security/identity rules, data-residency, budget, delivery window. Capture them verbatim — they become a "Constraints" subsection and a recurring reality check.

**Detect the mode** — it changes which scaffolding you apply:

- **Agent-ify / AI-system mode** — the topic is an AI agent, LLM/ML pipeline, document extraction, classification, or intelligent automation. Apply the AI-specific scaffolding: fast-path/slow-path split, confidence & calibration, human-in-the-loop (HITL) review, evals, and the agent design-pattern catalog (A–G in `references/design-patterns.md`).
- **General solution-design mode** — platform, integration, data architecture, migration, distributed system, etc. Use the general scaffolding: approach survey, architecture, NFRs, and domain-appropriate patterns.

Many topics are hybrids. When unsure, lean toward including the AI scaffolding section only if AI is actually load-bearing in the design; don't bolt it on for flavor.

If the target, audience, or key constraints are genuinely unclear and you can't infer them from the reference material, ask — a design with the wrong constraints is worse than a slower one. Otherwise proceed on sensible defaults and state them.

## Step 1 — Parallel deep research

This is the backbone. Spawn **subagents in parallel** (one message, multiple `Agent` calls) so you cover ground fast and don't blow the context window. A good default fan-out is three to five strands; run them concurrently:

- **Strand A — How the community/industry tackles it.** Find the *top approaches* (aim for ~3–5 distinct families, not 3–5 vendors). For each: what it is, when it wins, where it breaks, maturity.
- **Strand B — Domain specifics.** The hard, domain-particular sub-problems (e.g., for leases: percentage rent, co-tenancy; for a payments system: idempotency, reconciliation). This is where generic designs die.
- **Strand C — Last ~2 months of state of the art.** What changed recently — new models, frameworks, specs, benchmarks, launches. Date-stamp findings. This is the single most common gap in design docs and a strong differentiator.
- **Strand D (optional) — Reliability/eval/security** or another axis the topic demands.

Have each subagent return a **markdown brief** (not a rigid JSON schema — rigid schemas have failed here before; free-form briefs are more robust). Tell each one to cite sources and flag confidence.

**Research discipline (this is what separates a credible doc from a slide of vendor claims):**
- **Be adversarial about evidence.** Exclude vendor self-reported accuracy, marketing numbers, and refuted claims. Prefer independent benchmarks, primary sources, and reproducible results. When you exclude something, you can say so — that honesty builds trust.
- **Keep a source ledger.** An appendix listing each non-trivial claim's source and your confidence. It makes the doc auditable.
- **Separate fact from proposal.** Mark anything you're proposing rather than observing.

See `references/research-playbook.md` for the subagent prompt templates, the adversarial checklist, and the source-ledger format.

## Step 2 — Multi-persona design reasoning

Design the solution by reasoning through it with a panel of expert personas, each defending their concern. This surfaces trade-offs a single voice misses — the security persona kills a convenient shortcut, the domain SME flags a field the architect glossed over, the ops/eval persona asks "how do we know it works in production?"

Pick a panel that fits the topic (default panel and how to adapt in `references/personas.md`). For an AI agent that's typically: a solution architect, a domain SME, an MLOps/evals lead, a security/identity lead, and a UX/HITL lead. For a data platform you might swap in a data engineer and a governance lead. Give each persona a name and a one-line stake so their voice stays distinct in the writeup.

Write the design *through* these lenses — component rationale should read like "the security lead requires X, so the architecture does Y."

## Step 3 — Draft the combined document

Use the section skeleton in `references/document-skeleton.md`. It's modular: a **core spine** that every deliverable has, plus **AI-mode sections** you include only in agent/AI mode. Scale each section to its real complexity — cut what doesn't apply rather than padding. The spine:

1. How to read this doc (persona legend, what's decided vs. open)
2. Requirements (functional, non-functional, constraints)
3. The top approaches the community uses (the survey from Step 1)
4. Recommended approach — thesis (pre-critique)
5. High-level architecture (with diagram)
6. Component deep-dive (with persona rationale)
7. *(AI mode)* Confidence, calibration & HITL — "the part everyone hand-waves"
8. Data, multi-tenancy, security & governance
9. Design patterns & comparison (Step 4)
10. Design critique — red-teaming our own approach (Step 5)
11. Concluding research — closing the gaps (Step 5)
12. What we missed — last-2-months SOTA refresh (Step 1C, sharpened)
13. Final recommendation & honest scope
14. (Optional) How we help — the close
15. Appendix: source ledger

## Step 4 — Design patterns & comparison

Lay out the candidate **design patterns** for the solution, each with its own diagram, then a side-by-side comparison and a "which pattern when" decision tree. For AI agents, use the catalog in `references/design-patterns.md` (single-call, prompt-chaining, routing, orchestrator-workers, evaluator-optimizer, autonomous ReAct, HITL checkpoint) plus a recommended composite. For non-AI topics, adapt to the relevant pattern family (e.g., integration patterns, data-flow patterns). The payload is the **comparison matrix** (build complexity, latency, cost, accuracy on the easy 80% vs. the hard 20%, observability, predictability, role) and the honest verdict that *the right answer is usually a composition, not a single winner.*

## Step 5 — Red-team, then close the gaps

After drafting the recommendation, **attack it.** Write a critique section that lists concrete failure modes, weak assumptions, and gaps (number them C1, C2, …). Be specific and adversarial — this is the most valuable section because it's the one a sharp reviewer would write anyway. Then do a **gap-closing research pass** (more subagents if needed) and fold the answers back in, noting what each finding changes about the recommendation. End with an **honest scope**: what the proposed budget/timeline actually buys vs. the full vision.

## Step 6 — Diagrams

Every major structural idea gets a **Mermaid diagram** — architecture, data/diff flows, confidence gating, each design pattern, the composite, the decision tree. Mermaid renders on GitHub and in most viewers and is editable, which beats static images.

Use the conventions and color legend in `references/mermaid-cookbook.md`. **Render-validate every diagram** before finishing — a broken diagram in a client-facing doc is worse than no diagram. Run:

```
python <skill-dir>/scripts/validate_mermaid.py <path-to-deliverable.md>
```

It extracts every ` ```mermaid ` block, renders each with mermaid-cli, and reports failures with the offending block. Fix everything it flags. (The script self-checks for `mmdc`/Chrome and tells you how to install them if missing.)

## Output location & naming

Write the deliverable where the user keeps their work (infer from the reference material's folder; default to the current working directory). Name it `<Topic>_Technical_Design.md` (e.g. `Lease_Abstraction_Agent_Technical_Design.md`). Keep it as one combined doc unless the user asks to split out a companion patterns doc.

## Reference files

- `references/document-skeleton.md` — the full combined section skeleton with inline guidance and the AI-mode sections.
- `references/research-playbook.md` — parallel-subagent prompt templates, the adversarial-evidence checklist, SOTA-refresh method, source-ledger format.
- `references/personas.md` — the default persona panel and how to adapt it per topic.
- `references/design-patterns.md` — the agent design-pattern catalog (A–G), comparison-matrix dimensions, decision-tree and composite guidance, anti-patterns.
- `references/mermaid-cookbook.md` — Mermaid conventions, the color legend, diagram catalog, and render-validation workflow.
- `references/presales-framing.md` — optional pre-sales / "how we help" framing and reference-architecture hooks. Include only when the audience is pre-sales/client-facing.
- `scripts/validate_mermaid.py` — render-validates all Mermaid blocks in a Markdown file.
