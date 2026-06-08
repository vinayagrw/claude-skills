---
name: tdr-author
description: >-
  Author Technical Design Records (TDRs) — structured, Confluence-paste-ready
  design docs that record a decision with rationale, rejected alternatives,
  concrete contracts, and an implementation gap audit. Use this whenever the
  user wants to write, structure, or refine a TDR, technical design doc, design
  record, RFC, architecture/solution-design doc, or "a spec for Confluence" —
  even if they only say "write up the design for X", "document this decision",
  "turn this into a design doc", or "make a doc the team can review". Also use
  when converting an existing design doc to be Confluence-paste-safe (flat
  tables, ASCII diagrams, no <details>).
---

# TDR Author

A TDR (Technical Design Record) is the team-internal cousin of an RFC/design doc: it records **a decision with its rationale and rejected alternatives**, is reviewable/approvable, and precedes implementation. It is the right artifact when the work involves a real choice (architecture, data model, API shape, build-vs-buy) rather than a mechanical task.

This skill produces a TDR that is (a) **decision-first**, (b) **grounded in the actual codebase**, and (c) **Confluence-paste-ready**. The output is two files kept in sync: a Mermaid master (renders on GitHub) and an ASCII copy (pastes cleanly into Confluence).

## When this fits vs. when it doesn't

A TDR shines when there's a decision to defend and alternatives to weigh. It's the wrong shape for a pure how-to (use a runbook/README), a product requirements doc (PRD — no implementation detail), or a single narrow choice that fits on one page (a plain ADR is lighter). If the user's request is really one of those, say so and offer the lighter format instead of forcing the full skeleton.

## Workflow

Work through these in order. Don't skip the grounding step — an ungrounded TDR full of invented API shapes is worse than no TDR.

1. **Understand the decision.** What is being decided, what forces it, who the readers are. If the user hasn't said, ask — a TDR with no decision is just notes.
2. **Ground in the codebase.** Before writing any contract, payload, table name, or endpoint, **read the real code**. Grep for the actual types/handlers/schemas. Every concrete shape in the doc must trace to something you verified, OR be explicitly marked `(confirm)` so a reader knows it's a proposal, not observed fact. This is the single biggest quality lever — invented field names that look authoritative are the most damaging failure mode.
3. **Draft the sections** using `references/template.md` as the skeleton. Scale each section to its complexity — a trivial decision needs three sentences in §3, not three paragraphs. Cut sections that genuinely don't apply rather than padding them.
4. **Write the decision log (§1) early.** It forces clarity: each row is a decision, a status, and a one-line rationale. Status uses lozenges — `🟢 DECIDED`, `🔵 PROPOSED`, `🟡 OPEN`, `⚪ DEFERRED`. If you can't fill a rationale in one line, the decision isn't clear yet.
5. **Diagrams: author in Mermaid, then translate to ASCII.** See `references/paste-safety.md` for the ASCII cookbook. Prefer simple linear/branch shapes; a diagram that needs 20 boxes is usually two diagrams.
6. **Gap audit (§13) + blocker sub-specs (§14).** A design-complete TDR is not build-complete. §13 lists what an implementer still needs (prioritised 🔴 blocks-now / 🟠 / 🟡). §14 then writes the concrete contracts for the 🔴 items inline — the API request/response shapes, the table schema, the validation loop, etc. This is what turns "nice design" into "someone can start coding."
7. **Dual output.** Write two files (see below), then run the paste-safety lint on the Confluence copy.

## Dual output (this is mandatory for this skill)

Write both, in the user's specs directory (default `docs/superpowers/specs/`, or wherever they keep specs):

- `<topic>-design.md` — **Mermaid master.** Diagrams as ` ```mermaid ` blocks; renders on GitHub and in the repo. This is the source of truth for editing.
- `<topic>-confluence.md` — **ASCII paste copy.** Byte-identical content EXCEPT: every Mermaid block is replaced by an ASCII diagram in a plain code block, all tables are top-level, and there are no `<details>` blocks. This is what gets pasted into Confluence.

Keeping them in sync by hand is the cost of dual output; when you change one, change the other. If the user only wants one, default to the Confluence copy — a doc that doesn't paste is a doc that doesn't get read.

## Confluence paste-safety (non-negotiable for the `-confluence.md` file)

Confluence Cloud auto-converts pasted Markdown, but three things silently break. The whole reason this skill exists is to get these right:

1. **No tables inside blockquotes.** A Markdown table whose rows start with `>` does **not** convert — it renders as broken text. Keep the callout text in the blockquote, but pull the table out to top level (blank line above and below).
2. **No `<details>`/`<summary>`.** Confluence shows the raw HTML or strips it. Replace with a plain bold label + the content (e.g. a code block).
3. **No Mermaid in the paste copy.** A ` ```mermaid ` block pastes as its source text, not a diagram. Use ASCII diagrams in plain code blocks instead.

Everything else — top-level tables, code blocks, emoji, blockquote *text*, headings — pastes fine. Full rules and the ASCII diagram cookbook are in `references/paste-safety.md`. After writing the Confluence copy, run:

```
python <skill-dir>/scripts/paste_safety_lint.py <path-to-confluence.md>
```

It flags the three breakers with line numbers. Fix everything it reports.

## Grounding discipline

- **Read before you write a contract.** Endpoints, payload field names, table names, type shapes — verify against the repo. Cite the file you read (e.g. "from `personaMapper.formToSavePayload`").
- **Mark proposals.** Anything you're proposing rather than observing gets `(confirm)` or a "proposed" note, so reviewers know what's load-bearing fact vs. design intent.
- **Prefer cross-references over duplication.** If exact node/type shapes live in another doc, link it and restate only what this decision needs.

## The section skeleton (see `references/template.md` for the fill-in version)

```
0.  Page properties      — status, owner, date, target release, related docs
1.  Decision log         — table: # | Decision | Status | Rationale
2.  Summary (TL;DR)      — the decision in one paragraph
3.  Context & problem    — why now; the gap(s) that force this
4.  Goals & non-goals    — what's in, what's explicitly out
5.  Current state        — how it works today (or "greenfield")
6.  Proposed design      — the recommended approach + diagram
7.  Detailed design      — contracts, schemas, payloads, mappings
8.  Alternatives         — A vs B table + "why not B"
9.  Open questions       — each with a proposed direction + owner
10. Risks & mitigations  — table
11. Rollout / milestones  — M1..Mn, sequenced
12. References & glossary
13. Gap audit            — low-level items still to specify (🔴/🟠/🟡)   [full rigor]
14. Sub-specs for blockers — concrete contracts for the 🔴 items          [full rigor]
```

Reuse the same skeleton for every TDR so a reader who's seen one can navigate any of them. Number them TDR-001, TDR-002, … if the team keeps a series.

## Reference files

- `references/template.md` — the full skeleton with placeholders and inline guidance; copy it and fill in.
- `references/paste-safety.md` — Confluence paste rules + an ASCII-diagram cookbook (linear, branch, fan-in/out, sequence-as-lanes, loop-back).
