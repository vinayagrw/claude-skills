---
name: competitive-battle-cards
description: Build one-page competitive battle cards from internal content (call notes, lost-deal notes, wiki, product docs) plus public research, and run win-loss analysis on a CSV of closed deals to find patterns and leading signals. Every claim is sourced. Use when the user names a competitor, asks how to beat or position against someone, wants a battle card, or wants win-loss or predictive deal insights, or when presales-ai routes here.
---

# Battle cards and win-loss

Read `deal-context.json` first if it exists.

## Battle card
1. **Gather.** Internal first: search the notes, docs and transcripts the user points to for
   the competitor name. Then public: the competitor's site, pricing page, release notes,
   review sites. Record each finding with its source.
2. **Fill the card** using `references/battle-card-template.md`:
   - The 10-second take
   - Why we win (with proof) and why we lose (honest)
   - Feature and approach comparison, scored ahead, even or behind
   - Pricing and packaging differences (public facts only)
   - Objections they plant and our replies
   - Trap questions the buyer can ask the competitor
   - Proof points: customer stories and numbers we can cite
3. **Tailor** to the persona and industry in `deal-context.json` when present.
4. **Render** as HTML (visual first: a score strip, colour-coded comparison, tap to expand
   for detail) plus a markdown copy. Put `Sources` and `Last updated` in the footer.
5. **Check:** every claim has a source, nothing says the competitor "can't" without a cited
   reason, and there are no em-dashes or semicolons.

## Win-loss
```bash
python3 scripts/winloss.py deals.csv -o out/winloss.md
```
CSV columns (any extra columns are used as factors): `deal_id, outcome (won|lost|no_decision),
amount, segment, competitor, lane, cycle_days, demo_done, poc_done, se_hours, loss_reason`.

It reports win rate overall and by each factor, the factors that move win rate most (lift vs
baseline, with sample size), top loss reasons, and 3 to 5 **leading signals**. Groups under 5
deals are marked low sample. Wording is "linked with", never "causes" or "predicts".

Then write 3 actions: what to change in battle cards, proposals and qualification. If the
two-lane pilot is running, compare lane 1 and lane 2 outcomes.
