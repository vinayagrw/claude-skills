# Personas

Designing through a panel of named expert personas is the trick that keeps a design honest. A single author has one set of instincts and blind spots; a panel forces the trade-offs into the open — the security lead vetoes a convenient shortcut, the domain SME catches a mismodeled field, the ops/eval lead asks "how do we know this works in production?" The personas aren't decoration: their stakes should visibly drive component decisions in the deep-dive ("the security lead requires X, so this component does Y").

## How to use them

- Give each persona a **name, a role, and a one-line stake.** The name makes their voice traceable through the doc; the stake is what they refuse to compromise on.
- Put the panel in §0 as a legend.
- In the component deep-dive, attribute rationale to personas. When two personas conflict (they should, sometimes), show how the design resolves the tension — that's the most valuable kind of paragraph.
- 4–6 personas is the sweet spot. More dilutes; fewer misses an axis.

## Default panel for an AI agent / AI system

| Persona | Role | Stake (what they refuse to compromise) |
|---|---|---|
| Maya | AI / solution architect | The system is simple, composable, and the expensive compute goes only where ambiguity lives. |
| Dev | Domain SME | The hard domain cases are modeled correctly, not flattened into a generic schema. |
| Sam | MLOps / evals lead | Nothing ships without measurable quality; silent-failure rate is tracked, not just accuracy. |
| Priya | Security / identity lead | Untrusted input is contained; credentials never leak into model/tool sandboxes; least privilege throughout. |
| Alex | HITL / UX lead | The human-review experience is a first-class product, not a dumping ground for low-confidence output. |

## Adapting the panel to the topic

Swap personas so the panel covers the axes that actually matter for the design:

- **Data platform / analytics** → data engineer (pipeline correctness, lineage), data governance lead (PII, retention, residency), analytics consumer (query latency, semantics), platform/SRE (cost, scaling).
- **Integration / API** → integration architect (contracts, versioning), reliability lead (idempotency, retries, backpressure), security lead (authn/z, secrets), consumer DX advocate.
- **Migration / modernization** → migration architect (sequencing, cutover, rollback), risk owner (blast radius, dual-run), product owner (feature parity, downtime tolerance), cost owner.
- **Distributed system** → systems architect (consistency model, partitioning), SRE (failure modes, observability), security lead, capacity/cost lead.

If a topic has a dominant regulatory or financial dimension (e.g., ASC 842/IFRS 16 for leases, PCI for payments), add a persona who owns that — they keep the design tethered to the rules that can sink it.

## Voice discipline

Keep personas substantive, not theatrical. They exist to surface real engineering tension, not to roleplay. A good persona line reads like a senior engineer in a design review; a bad one is a costume. If a persona never disagrees with anyone, they're not earning their seat.
