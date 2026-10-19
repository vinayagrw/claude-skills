---
name: rfp-response-builder
description: Draft answers to RFPs, RFIs and security questionnaires (SIG, CAIQ, custom xlsx or docx) and prepare proposals, from the user's own answer library and documents. Every answer cites a source and gets a green, amber or red confidence. Unsourced answers go to an SME, never guessed. Includes a consistency check across answers and a bid or no-bid view. Use when the user shares a questionnaire or RFP, or asks for a proposal, or when presales-ai routes here.
---

# RFP, RFI and security questionnaire responses

Read `deal-context.json` first if it exists (see `presales-ai/references/deal-context.md`).

## Step 1: Split the questionnaire
```bash
python3 scripts/split_questionnaire.py <file.xlsx|.csv|.md|.txt> -o out/questions.jsonl
```
It finds the question column, keeps the section and row id, and skips headers and blanks.
For docx or PDF, extract the text first (the docx or pdf skill) and pass the .txt.

## Step 2: Load or build the answer library
`answers.jsonl` in the working folder, one entry per line. Schema: `references/answer-library.md`.
If there is none, build it from past responses and docs the user points to. Each entry needs
`source` and `last_verified`. Entries older than 12 months are stale.

## Step 3: Match and draft
```bash
python3 scripts/match_answers.py out/questions.jsonl answers.jsonl -o out/drafts.jsonl
```
It scores each question against the library (token overlap) and sets confidence:
- **green**: a strong match with a fresh source. Reuse it, adapt the wording.
- **amber**: a partial match, or a stale source. Draft it and flag it for review.
- **red**: no match. Draft only from a document you can cite. If none, write
  `SME needed: <owner area>` and leave the answer empty.

Then read each amber and red row and improve the draft from the user's documents. Cite the
file and section. **Never invent a control, certification, number or customer.**

## Step 4: Consistency check
```bash
python3 scripts/consistency_check.py out/drafts.jsonl
```
Flags the same topic answered with different numbers or yes and no (for example uptime
99.9 vs 99.95, or "SSO: yes" vs "SSO: roadmap"). Fix every conflict before you continue.

## Step 5: Write back and report
- Write the answers into the buyer's file and format (xlsx skill for spreadsheets, docx skill
  for Word). Keep their columns. Add `Confidence` and `Source` columns only in an internal copy.
- Report counts by colour, the list of SME questions grouped by owner, and conflicts fixed.
- Offer to add approved new answers back to `answers.jsonl`.

## Proposals
Use `references/proposal-outline.md`. Map each section to the buyer's evaluation criteria and
win themes, pull persona and competitor from `deal-context.json`, and run the same
cite-or-flag rule. Add a **bid or no-bid** box at the top: coverage % (green plus amber over
total), red count, deadline risk and fit score if qualification ran.

## Done means
- Every answer is green with a source, amber with a source and a review flag, or red with an owner.
- `consistency_check.py` reports 0 conflicts.
- No em-dashes or semicolons in the prose you wrote.
