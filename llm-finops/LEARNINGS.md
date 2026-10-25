# Learnings

A dated log of what this skill got wrong, what the user corrected, and what changed in the
world — captured from real invocations so the guidance compounds instead of resetting
every session.

This is **not** model-weight learning. It is a documented human-in-the-loop feedback loop:
a session observes something, writes it down here, and a later session reads it. Nothing
improves unless the writing actually happens, which is why the capture step is deliberately
the cheapest step in the whole protocol.

---

## Entry schema

Append newest at the bottom. Four fields, all required.

```
### YYYY-MM-DD — short title
- **context:** what was being done when this surfaced. Enough for a future session to
  judge whether the observation generalises or was specific to that repo.
- **observation:** what was actually wrong, missing, surprising, or corrected. State it
  concretely. "Pricing was stale" is not actionable; "the flash-lite row was 40 days old
  and the user had already seen a newer figure elsewhere" is.
- **action:** what you did about it. One of: `noted only` / `edited <file>` /
  `edited <file> + version bump <x.y.z>` / `escalated to user`.
- **provenance:** REQUIRED whenever the entry touches a number. Where the number came
  from: `fetched <URL> this session` / `user stated` / `recalled` / `third-party page`.
```

## When to write an entry

Write one when the skill was **materially** used — a reference was read, a template was
copied, a price was quoted, or a cost recommendation was given — **and** something notable
happened.

**A session where nothing notable happened writes nothing.** This is a deliberate change
from "always append". An unconditional log grows into a file too long for a future session
to read, at which point it gets skimmed or skipped and the whole mechanism quietly stops
working. An empty log is a working log with nothing to say.

## What earns an edit to the guidance

**Seen once, it earns a note. Seen twice, it earns an edit.**

One session's correction may be one repository's quirk. Two independent sightings is
evidence. When in doubt, log it here under a note and leave the reference files alone —
the cost of a redundant note is a few lines; the cost of a wrong edit to shared guidance is
every future session inheriting it.

Never silently change a template's public API. If an interface genuinely needs to change,
that is a MAJOR bump, a changelog entry, and a sentence to the user.

## Caps and rotation

Capped at **200 entries**. On reaching the cap, move the oldest entries to
`LEARNINGS-archive-YYYY.md` and leave a pointer here. The rule for what survives into the
archive summary is explicit: **corrections that changed guidance survive; observations
that did not, do not.**

## No dollar figures in this file

`scripts/check-prices.mjs` fails on a literal dollar figure anywhere outside
`references/sota-snapshot.md`, and this file is not exempt. Record *that* a rate changed
and point at the snapshot; do not record the rate itself. A number written here is a number
that will not be updated at the next refresh, and it will outlive its own accuracy.

---

## THE PROVENANCE GUARD — read before editing any price

> **A row's `verified` date in `references/sota-snapshot.md` may only be advanced by a
> session that fetched that row's primary source in that same session.**
>
> If the number came from memory, a third-party page, a changelog, a competitor's
> comparison table, or another model's summary: **leave the old `verified` date untouched**,
> set `confidence: low`, and add a `note:` recording where the number came from. Then add
> it to the snapshot's known-unknowns list so it resurfaces on the next check.

**Why this rule exists, stated plainly, because a future session will be tempted to skip
it.** Without the guard, the maintenance loop defeats the freshness protocol using the
protocol's own machinery. The failure runs like this:

1. A session recalls a price that differs from the sheet.
2. It reasonably judges "a wrong number is substantive, therefore I should fix it."
3. It edits the row. The row format demands a `verified` date and a `confidence` label, so
   it writes **today's date** and **high**.
4. `check-prices.mjs` now reports that row **FRESH**, with maximum confidence.

The number was never verified against anything. It is now indistinguishable from a number
that was — and it carries a freshness stamp that actively suppresses the check that would
have caught it. The skill has moved from *correct* to *confidently wrong*, and every
mechanism designed to prevent that reports success.

Substantiveness and provenance are orthogonal. The substantiveness guard asks *should this
change?*; only the provenance guard asks *do we actually know?* Recording a lower
confidence and an older date is not a failure to maintain the skill. It is the maintenance.

---

## Entries

### 2026-07-19 — worked example (seed entry, delete once real entries accumulate)
- **context:** Scaffolding a client demo BFF with one AI narration surface. The skill's
  runtime path was followed end to end: choke point, ledger, budget module, deterministic
  fallback.
- **observation:** The user asked why the ledger showed a nonzero cost for a call that had
  visibly streamed a fallback response. The answer was that the fallback was writing a
  ledger entry with `costUsd: 0` and the nonzero figure came from the *preceding* failed
  primary attempt, which is correct behaviour but reads as a bug. The retry's own spend was
  not obvious in the summary because retries share a `requestId` with the original.
- **action:** `noted only` — first sighting. If a second session hits the same confusion,
  `references/runtime-patterns.md` should surface retry cost share directly in the summary
  example rather than leaving it to be derived, and the anti-pattern index should gain a
  row for "retry spend is invisible because retries share a request id".
- **provenance:** n/a — behavioural observation, no number involved.

### 2026-07-19 — unbounded subagent fan-out exhausted a session limit during this skill's own eval
- **context:** Building and evaluating this skill. The eval phase dispatched a single
  workflow of 24 agents (12 task runs + 12 graders) in one wave, with no per-agent budget
  envelope and no concurrency ceiling beyond the platform default. 7 of 24 completed; the
  remaining 17 died mid-flight on a session usage limit. Three of the surviving runs had
  each executed `npm install`, so a large share of the spend went to dependency trees rather
  than to the work being measured.
- **observation:** This is the exact failure the skill's own research flagged as the largest
  new spend amplifier, and the skill already prescribes the mitigation (per-agent budget
  envelopes, always enforced regardless of budget mode). The guidance was correct and was
  not applied — which is the more useful finding. Two contributing specifics worth keeping:
  (1) the failure mode is *asymmetric and hostile to measurement* — the limit did not fail
  runs uniformly, it killed both with-skill cells of two scenarios while leaving their
  baselines intact, destroying comparability rather than merely reducing sample size;
  (2) agents that build real artifacts have wildly variable cost (a run that installs
  dependencies can cost orders of magnitude more than one that writes prose), so a flat
  per-agent envelope under-protects exactly the runs that need bounding most.
- **action:** `noted only` — first sighting, per the seen-once/seen-twice rule. If a second
  session hits this, the candidate edit is a new section in `references/claude-code-costs.md`
  covering **orchestrated agent workflows** as a distinct cost surface from interactive
  assistant use, carrying: a concurrency ceiling, envelopes sized by expected agent *class*
  rather than a flat number, a cheap pre-flight probe before committing a large wave, and
  ordering fan-out so that comparison cells fail together rather than apart. The dev-time
  playbook currently addresses interactive sessions and subagent economics, but not
  multi-wave orchestration as its own budget line.
- **provenance:** n/a — direct observation of this session's own failure; no number involved.

<!--
Template to copy for a new entry:

### YYYY-MM-DD — short title
- **context:**
- **observation:**
- **action:**
- **provenance:**
-->
