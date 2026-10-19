---
name: deal-qualification-desk
description: Market research, buyer personas, lead generation and qualification, and lead and deal prioritisation, plus the two-lane SE engagement model and its 30-day pilot tracker. Scores deals with MEDDPICC-style fields and fit, routes each to lane 1 (exploratory, self-serve) or lane 2 (named SE, tailored discovery, technical success criteria), and tracks SE hours per qualified opportunity, demo-to-next-stage conversion and time to technical decision. Use when the user asks to research a market or account, build personas, find or qualify leads, prioritise a pipeline, decide where SE time goes, or run the two-lane pilot, or when presales-ai routes here.
---

# Deal qualification desk

Read `deal-context.json` first if it exists.

## Market and account research
Use web research (and Apollo, Clay or HubSpot when connected and authorised). Output
`out/research.md`: market size signals, the account's priorities from public sources
(annual report, job posts, press), tech stack hints, trigger events, and named competitors.
Every line has a source URL and date.

## Buyer personas
Template: `references/persona-card.md`. One card per persona: role, goals, pains, what they
measure, objections, words they use, the content that moves them, and discovery questions.
Base them on the user's notes and calls first, research second. Mark guessed fields.

## Lead generation
From an ideal customer profile (industry, size, region, tech, trigger), list target accounts
with the reason each fits and its source. Never scrape personal contact data. Leave contact
lookup to a connected, authorised tool.

## Qualification and prioritisation
```bash
python3 scripts/score_deals.py deals.csv -c references/scoring.json -o out/scored-deals.csv
```
Scores 0 to 100 from MEDDPICC fields (metrics, economic buyer, decision criteria, decision
process, paper process, pain, champion, competition) plus fit. Weights and thresholds live in
`references/scoring.json`, so the team can tune them. Output adds `score`, `lane`, `gaps`
(the weakest fields, to fix next) and sorts by score times amount.

## The two-lane model
| | Lane 1: exploratory | Lane 2: qualified and complex |
|---|---|---|
| Rule | score below the lane-2 threshold, or no confirmed pain | score at or above threshold and confirmed pain and an economic buyer |
| SE time | none up front | a named SE owner |
| Experience | a short qualification step, then a reusable on-demand product tour or sandbox | tailored discovery, a custom demo, agreed technical success criteria |
| Moves up when | the qualification gaps close | |

## 30-day pilot tracker
```bash
python3 scripts/pilot_tracker.py pilot.csv -o out/pilot-tracker.html
```
`pilot.csv` columns: `deal_id, lane, start_date, qualified (y/n), se_hours, demo_date,
next_stage_date, tech_decision_date`. The page shows three headline numbers per lane: SE
hours per qualified opportunity, demo-to-next-stage conversion, and median days to technical
decision. It also shows a daily trend and a day-30 review panel that suggests coverage
changes (for example, raise the lane-2 threshold if lane-2 conversion is not higher than
lane 1). Template: `assets/pilot-tracker.html`. Pilot plan text: `references/two-lane-pilot.md`.
