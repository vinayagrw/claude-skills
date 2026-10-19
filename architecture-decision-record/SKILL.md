---
name: architecture-decision-record
description: Draft an ADP Architecture Decision Record (ADR) in Tango's official template, capturing a decision's context, drivers, considered options, trade-off, outcome, consequences, confirmation, and risks. Use when the user records a technical decision for the Agent Development Platform / Project Jedi, asks to "write an ADR", or needs a Confluence-paste-ready ADR for the ADP space.
metadata:
  owner: "@vinay-tango"
  status: stable
  version: 2.0.0
  tags: [engineering, architecture, decision, adr, adp, confluence]
---

# ADP Architecture Decision Record (ADR)

Produces an ADR that matches Tango's official **ADP ADR template**
([Confluence source](https://tangoanalytics.atlassian.net/wiki/spaces/ADP/pages/4564516871)).
The full fill-in skeleton is in [references/adp-adr-template.md](references/adp-adr-template.md) —
follow it heading-for-heading.

## When to use this
- Recording a decision for the ADP / Project Jedi platform.
- The user says "write an ADR", "record this decision", or needs it in the ADP space.

## When an ADR is warranted (gate first)
Only write one for decisions that are **expensive to reverse**, **cross team/plane
boundaries**, or **constrain future decisions**. Anything smaller is a one-line note,
not an ADR. If it doesn't clear that bar, say so instead of producing a record.

## Rules that define this template
1. **One decision per record.** An ADR captures *why*, not a design spec.
2. **Fill every heading.** Write `N/A` rather than deleting a heading — the shape stays
   consistent across records.
3. **Immutability.** Once **Accepted**, never rewrite the substance. A material change
   means a **new** ADR that *supersedes* this one; the supersession chain is the audit trail.
4. **No straw-man options.** List only real alternatives that were genuinely on the table (2–5).
5. **Ratified date stays blank** until a human signs off.

## Structure (follow the reference skeleton exactly)
1. **Header table** — Status, Draft date, Ratified date, Deciders, Affected planes,
   Affected capabilities, Review-by.
2. **Context and Problem Statement** — 2–4 neutral sentences; phrase the core as a
   question ("How should ADP … ?"); no answer yet. Bullets: Requirement, Constraint,
   Non-functional target, Existing context.
3. **Decision Drivers** — the criteria options are judged against (why it's hard).
4. **Considered Options** — named list (Option A/B/C…).
5. **Per option** — an assessment table (Complexity, Effort/cost, Portability, Vendor-
   neutrality, Reversibility, Persona impact), Architecture, Sequence Diagram, Pros, Cons.
   Mark the recommended one `— RECOMMENDED`.
6. **Trade-off Analysis** — the decisive trade-off, honestly: what you give up to get what you want.
7. **Decision Outcome** — chosen option + the decisive reason, tied to the drivers.
8. **Consequences** — Good / Bad / Neutral-or-follow-on.
9. **Confirmation** — how the decision will be verified (ideally machine-checkable): table of
   How we'll confirm / Owner / When.
10. **Risks & Technical Debt** — table: Risk-or-debt / Likelihood / Impact / Mitigation.
11. **Action Items** — ordered, each with owner + target date; always end with
    "Update the ADR Register with the final status".
12. **More Information** — Prior art / SOTA, Related ADRs & Jira (JEDI-XXXX), Open questions deferred.

## Reference values
- **Six planes:** Build & Foundry · Data · Run & Channels · Defend & Trust · Govern & Deploy · Operate & Workforce.
- **Status lozenges:** Proposed (blue) · Accepted (green) · Rejected (red) · Deprecated (yellow) · Superseded (grey/neutral).

## Publishing to Confluence
When the user wants this pasted into the ADP space, hand off to the
**tango-confluence-ops** skill for the actual page edit. Then honor those conventions:
render **Status** cells as real status lozenges, **dates** as native date elements,
**people** as real mentions, and use **no em dashes**.

## Output
A complete ADR with every heading filled (or `N/A`), all tables populated, and at least
two real options assessed — ready to copy into a new page under the ADP ADR Register.
