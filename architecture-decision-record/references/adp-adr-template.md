# ADP ADR — fill-in skeleton

Mirror of the official template
(<https://tangoanalytics.atlassian.net/wiki/spaces/ADP/pages/4564516871>).
Copy this, replace every `{placeholder}`, and fill every heading (`N/A` if truly not
applicable — don't delete headings). One decision per record.

---

## Status legend

| Status | Meaning | Lozenge colour |
|--------|---------|----------------|
| Proposed | Under discussion; not yet ratified | Blue |
| Accepted | Ratified; in force | Green |
| Rejected | Considered and declined | Red |
| Deprecated | No longer recommended, not yet replaced | Yellow |
| Superseded | Replaced by a later ADR (linked) | Grey |

---

## ADR-NNN: {short imperative title}

| Field | Value |
|-------|-------|
| Status | Proposed |
| Draft date | YYYY-MM-DD |
| Ratified date | YYYY-MM-DD (blank until a human signs off) |
| Deciders | {names / roles who sign off} |
| Affected planes | {Build & Foundry / Data / Run & Channels / Defend & Trust / Govern & Deploy / Operate & Workforce} |
| Affected capabilities | {e.g. 1 Runtime, 20 Agent Registry} |
| Review-by | YYYY-MM-DD |

## Context and Problem Statement

Frame the situation and the forces in 2–4 sentences. Phrase the core as a question:
"How should ADP … ?" Keep it neutral — no answer yet. Add a diagram if it helps.

- **Requirement:** {what must be true}
- **Constraint:** {deadline, vendor-neutral, single-file portability, etc.}
- **Non-functional target:** {latency, scale/throughput, cost ceiling, maintenance burden}
- **Existing context:** {what's already true in ADP this must fit — 6 planes, 40-cap taxonomy, design tokens, etc.}

## Decision Drivers

The criteria the options are judged against — *why this decision is hard*.

- {driver 1 — e.g. must stay single-file portable}
- {driver 2 — e.g. vendor-neutral / white-labelable}
- {driver 3 — e.g. reversible within one sprint}
- {driver 4 — e.g. persona X's primary workflow must not regress}

## Considered Options

Real alternatives on the table (2–5), named so they're referenceable. No straw men.

1. **Option A** — {one line}
2. **Option B** — {one line}
3. **Option C** — {one line}

### Option A: {name} — RECOMMENDED

| Dimension | Assessment |
|-----------|------------|
| Complexity | {Low / Med / High} |
| Effort / cost | {} |
| Portability (single-file, offline) | {} |
| Vendor-neutrality | {} |
| Reversibility | {} |
| Persona impact | {} |

**Architecture:** {diagram or description}

**Sequence Diagram:** {diagram or description}

- **Pros:** {}
- **Cons:** {}

### Option B: {name}

| Dimension | Assessment |
|-----------|------------|
| Complexity | {} |
| Effort / cost | {} |
| Portability (single-file, offline) | {} |
| Vendor-neutrality | {} |
| Reversibility | {} |
| Persona impact | {} |

**Architecture:** {}

**Sequence Diagram:** {}

- **Pros:** {}
- **Cons:** {}

## Trade-off Analysis

State the decisive trade-off honestly — the one thing you give up to get the thing you want.

## Decision Outcome

**Chosen option:** "Option A", because {the decisive reason, tied to the drivers above — one or two sentences}.

### Consequences

- **Good** {what becomes easier / what risk we retire}.
- **Bad** {what becomes harder / what we're now committed to}.
- **Neutral / follow-on** {what we'll need to revisit, and when}.

### Confirmation

How we will confirm the decision was actually implemented — ideally machine-checkable.

| How we'll confirm | Owner | When |
|-------------------|-------|------|
| {e.g. CI check asserts no shared JS module across mockups} | {name} | {PR gate} |

## Risks & Technical Debt

Name the debt you are knowingly taking on.

| Risk / debt taken on | Likelihood | Impact | Mitigation / payoff plan |
|----------------------|------------|--------|--------------------------|
| {e.g. duplicated CAP data drifts across files} | Med | Med | {lint check + single source-of-truth doc} |
| {security/compliance risk if this is a Defend & Trust or Govern & Deploy call} | {} | {} | {} |

## Action Items

1. {implementation step} — owner, target date
2. {follow-up / doc update}
3. Update the ADR Register with the final status

## More Information

- **Prior art / SOTA consulted:** {standards, other platforms, internal precedent}
- **Related ADRs / design docs:** {ADR-XXXX; Jira JEDI-XXXX; links}
- **Open questions deferred:** {what we deliberately did NOT decide here}

---

> **Rule:** never edit an Accepted ADR to "fix" drift — write a new ADR that supersedes it.
> The supersession chain is the record of how ADP's thinking evolved.
