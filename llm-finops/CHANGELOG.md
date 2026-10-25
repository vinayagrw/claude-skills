# Changelog

All notable changes to the `llm-finops` skill. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[semantic](https://semver.org/), with the version living in `SKILL.md` frontmatter.

## What each bump means here

The version number tracks **guidance**, not data. That distinction is what keeps it an
honest signal — a version that churns every time a vendor moves a price tells you nothing
about whether the advice changed.

| Bump | When |
|---|---|
| **MAJOR** | A template's public API changes (adapter interface, ledger entry shape, budget-mode semantics), or a recommendation reverses. Anything that breaks code someone already copied, or contradicts what they were previously told. |
| **MINOR** | New guidance, a new reference, a new template, a new adapter. Additive. |
| **PATCH** | A price refresh, re-stamped dates, clarifications, typo fixes. |

**A price refresh is a PATCH.** Prices move on a schedule the skill already knows about;
if a refresh bumped MINOR the version would climb continuously while the advice stood
still.

## Conventions

- Entries authored by a Claude Code session rather than by the user are tagged **`[auto]`**.
  This is not decoration: it is what lets a human scan for model-authored changes and
  revert them independently of approved ones. Self-modification that cannot be audited is
  self-modification that cannot be trusted.
- Substantive entries cite the `LEARNINGS.md` date that prompted them, so a change can be
  traced back to the observation that caused it.
- **Never write a literal dollar figure in this file.** `scripts/check-prices.mjs` fails
  the build on one, and the reason is the same everywhere in this skill: a price recorded
  in a second location will not be updated at the next refresh, and a stale number stated
  confidently is worse than no number at all. Describe the change ("Sonnet-class input
  rate stepped up as scheduled") and point at `references/sota-snapshot.md`.

---

## [1.1.0] — 2026-07-20 `[auto]`

### Added
- **Product-behaviour trigger phrasing in the description.** The description now names
  outcome-shaped requests that contain no cost, model or AI vocabulary — "auto-draft replies
  to tickets", "summarise uploaded documents", "classify incoming emails", "extract fields
  from PDFs", "let users ask questions about their data" — with the rule that if shipping the
  behaviour means calling a model per user action, it has a per-request bill and belongs here.

  **Why.** A triggering probe across six prompts scored 6/6 on outcome (the four positives
  fired, the two near-miss negatives correctly did not), but the one case it rated only
  *medium* confidence was the prompt with no cost vocabulary whatsoever — a plain feature
  request that happens to require an LLM. That is precisely the highest-value trigger for
  this skill, because it is the moment metering is cheapest to add and the moment nobody
  thinks to ask for it. The previous wording leaned on build-shaped verbs ("build an app",
  "add an AI feature"); a request phrased purely as product behaviour could slip past.

  MINOR rather than PATCH: this is new guidance about when the skill applies, not a
  re-stamped date. No template API changed, so it is not MAJOR.

### Note on verification
The 6/6 probe was a **self-report proxy** — the probing session was told it was measuring
triggering, which biases it toward noticing the skill. Real triggering happens mid-task with
no such prompt. Treat the score as directional. The negative cases (EC2/RDS rightsizing,
database "cost per query") were cleanly repelled by the explicit Do-NOT clause, which is the
more robust half of the result. This change should be re-probed before it is trusted, and
over-triggering is now the risk to watch: the added phrasing is deliberately broad.

---

## [1.0.0] — 2026-07-19

Initial build.

### Added

- **`SKILL.md`** — entry point. Freshness gate ahead of the router, so no guidance is
  reachable without passing it; a dev-time/runtime router; seven invariants, each stated
  as a pointer into specific machinery rather than as an aphorism; both quick paths;
  the anti-pattern index; and the continuous-improvement loop.
- **`references/sota-snapshot.md`** — the price sheet, and the only file in the skill
  permitted to contain literal dollar figures. Dated rows carrying `source`, `verified`
  and `confidence`; an effective-date axis for scheduled step-ups; a quarantine section
  for numbers the research could not confirm; a known-unknowns list; and the refresh
  protocol including the provenance guard.
- **Eight further references** covering the dev-time playbook, runtime patterns, adapter
  usage-field mapping, the caching ladder and batch triage, gateways and budgets,
  observability and eval cost, unit economics, and anti-patterns.
- **Templates** — the metered choke point, ledger with pluggable sinks, generated
  `pricing.ts`, three-mode budget module with an injected `BudgetStore`, fallback chain
  with a per-reason retry table, telemetry, tests, and six provider adapters.
- **`scripts/check-prices.mjs`** — per-row freshness verdicts plus the tree-wide
  dollar-literal guard. The guard is what converts "prices live in one file" from a
  convention into a failing exit code.
- **`scripts/init-finops.mjs`** — idempotent, non-destructive template scaffolding;
  generates `pricing.ts` from the snapshot; injects the project-context snippet behind
  markers so re-running updates it in place.
- **`scripts/check-headless.mjs`** — the capability gate for CLI offload. Reads `--help`
  before probing, spawns under a hard timeout with stdin closed, and never merges stderr
  into stdout in a way that would corrupt an exit code.
- **`scripts/compare-providers.mjs`** — ranks providers on measured cost per task by
  applying tokens-per-task inflation factors to a workload shape, rather than on posted
  rate per million tokens.
- **`scripts/lib/snapshot.mjs`** — the single snapshot parser shared by the three scripts
  that read it. Rows whose confidence is `low` are filtered out at parse time, so a
  quarantined number cannot reach `pricing.ts` even if a future edit forgets the rule.
- **`LEARNINGS.md`** — the cross-session capture log, with its schema, its cap, and the
  provenance guard stated in full.
- **`templates/project-context-snippet.md`** — pasteable dev-time rules for a new repo,
  carrying no prices at all, because this file propagates off-machine into repositories
  the skill will never see again.

### Decisions worth recording, because they will look arbitrary later

- **Cheapest GA flash-class model is the shipped default primary, not the provider's own
  current default.** The provider's default sits several times above its cheap tier, so
  accepting it would have produced a cost-first template that wasn't.
- **No Preview SKU appears in any default path.** Preview SKUs are cheaper precisely
  because they can be withdrawn mid-quarter, and two were within eight weeks. Defaulting
  a production template to one would be the anti-pattern this skill teaches, committed by
  the skill.
- **Budget mode defaults to `advisory`**, with `soft-degrade` and `hard-stop` shipped and
  switchable in one field, and named triggers for when to escalate. Per-agent envelopes
  are enforced even in advisory mode: advisory means "do not let a threshold break the
  user's app", not "let a looping agent spend without limit".
- **Four of six adapters ship carrying a `STATUS: UNVERIFIED` header.** They were written
  from provider specifications and never executed against a live endpoint. Their failure
  mode is a wrong `costUsd` rather than a crash, which is silent — so they are labelled,
  and `templates/VERIFY.md` gives the smoke test. Unverified code presented as proven is
  the same defect class as an unverified price.
- **All scripts are Node with zero dependencies; no PowerShell ships.** On a corporate
  Windows build the execution policy blocks unsigned scripts, so the user's first contact
  with the tooling would plausibly be an error; and redirecting a native executable's
  stderr in PowerShell 5.1 can report failure for a clean exit, which is exactly the bug
  that would make a capability check lie.

[1.0.0]: https://semver.org/
