# Design Patterns & Comparison

The design-patterns section makes one argument visually: **there is no single winning pattern — the right architecture is a composition, and each pattern earns its place only where its trade-offs fit.** Lay out the candidates, give each its own diagram, then a side-by-side comparison, a decision tree, and the recommended composite.

This catalog is tuned for **AI-agent / LLM systems** (the Anthropic "Building Effective Agents" taxonomy). For non-AI topics, substitute the relevant pattern family (integration patterns, data-flow patterns, distributed-system patterns) but keep the same structure: one diagram per pattern, a comparison matrix, a decision tree, a composite.

## The agent pattern catalog (A–G)

For each, write: one-paragraph description, a Mermaid diagram, "when it wins / where it breaks," and a one-line verdict for the specific topic.

| ID | Pattern | Taxonomy name | Typical verdict |
|---|---|---|---|
| A | Single-call extraction | Augmented LLM | Collapses on large schemas / hard tasks; fine only as an inner call. |
| B | Prompt chaining | Prompt chaining | The dependable fast-path backbone (parse → extract → validate). |
| C | Routing | Routing | The front door — classify input class, dispatch to a specialist. |
| D | Orchestrator-workers | Parallelization + orchestrator-workers | Often the core — split work into parallel sub-tasks, defeats big-task collapse. |
| E | Evaluator-optimizer | Evaluator-optimizer | For the hard long tail only — generate → verify → re-do. |
| F | Autonomous ReAct | Agent | A bounded inner engine, never the top-level controller. |
| G | HITL checkpoint | (cross-cutting) | Mandatory gate for anything below the confidence threshold. |

Also worth a mention as also-rans (note why they lost for this topic): **Blackboard** (shared workspace, multiple specialists) and **Map-Reduce** (split by page/shard then merge) — and the durable-workflow substrate (e.g. Temporal) they all sit on.

## The comparison matrix (the payload)

This table is what readers screenshot. Color-grade cells (🟢 good / 🟠 mixed / 🔴 poor). Suggested dimensions:

| Dimension | Why it matters |
|---|---|
| Build complexity | What it costs to ship and maintain. |
| Latency | p50/p95 for the user-visible path. |
| Cost per item | Token/compute spend at volume. |
| Accuracy on the easy ~80% | Most inputs are routine — does the pattern handle them cheaply and correctly? |
| Accuracy on the hard ~20% | The long tail is where value and risk concentrate. |
| Per-field / per-unit confidence | Can it tell you *which* parts to trust? |
| Provenance / observability | Can you trace why it produced an output? |
| Predictability | Bounded steps & cost, or open-ended? |
| Eval difficulty | How hard to measure quality. |
| Best role | Where this pattern belongs in a composite. |

The honest conclusion almost always: cheap deterministic patterns (B, C) own the easy majority; expensive reasoning patterns (D, E, F) earn their cost only on the hard minority; G wraps the whole thing; A is an inner primitive, not an architecture.

## Decision tree ("which pattern when")

A Mermaid flowchart that walks the reader from problem shape to pattern stack. Typical decision axes, in order:
1. Schema/task size → large ⇒ decompose (D), small ⇒ B may suffice.
2. Multiple distinct input classes? → yes ⇒ add routing (C).
3. Ambiguity / hard long tail present? → yes ⇒ add evaluator-optimizer (E) on the tail.
4. Open-ended tool exploration needed? → only then a bounded ReAct (F), never top-level.
5. Materiality / risk of being wrong → high ⇒ HITL gate (G) with tight thresholds.

## Recommended composite

A single diagram showing how the chosen patterns layer on the durable substrate, with a one-line rationale: *spend compute where ambiguity lives; keep the easy majority boring, cheap, and observable.*

## Anti-patterns (learned from critique + SOTA)

State these so reviewers know you've considered them:
- **One giant prompt** doing classify + extract + validate + reconcile — collapses, unobservable, un-evaluable.
- **LLM-as-judge as the *sole* verifier** — weak at evidence verification; do deterministic span/constraint checks first, use the model to adjudicate residue.
- **Autonomous agent as top-level controller** — unpredictable cost/latency, hard to audit; bound it inside a deterministic workflow.
- **Verbalized confidence** ("rate your confidence 0–1") as the gate — poorly calibrated; use consensus/calibration instead.
- **Blind overwrite on re-run** — destroys prior human corrections; diff and preserve.
- **Restart-from-scratch on failure** — use a durable workflow so a long job resumes, not restarts.
