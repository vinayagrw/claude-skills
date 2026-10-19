# Using the user's weekly industry reports

The user may run scheduled research routines that write weekly industry reports. Reuse them before wave 2.

## Find them
1. List routine definitions: `ls ~/.claude/scheduled-tasks/*/SKILL.md`. Read each frontmatter description to learn its industry and output path. If a scheduled tasks tool is loaded, also list tasks to see whether each is enabled.
2. Find reports: glob `*deep-dive*.md` and `*weekly*.md` under the output paths named in the routines, `~/Documents/Personal/` and the user's synced Documents folder.
3. Pick the routine whose industry matches 00-facts.md. Match by meaning, not by exact name. A frontier or AI tech routine is always useful as a second source. If none matches, say so and offer a one-off deep dive using the closest routine's prompt with the client's industry lenses swapped in.

## Use them
- Load the latest 2 to 4 reports. Grep them for the client, its rivals, its partners and its vendors.
- Map sections to the pack:
  - themes, headwinds, contradictions → risks
  - capital tracker, AI vendor grades, value capture → opportunities and competitor context
  - 30/60/90 day implications → talk track and discovery questions
  - watchlist → names to mention
  - data integrity flags → claims not to repeat
- Recurring themes across weeks are durable. One-week items are weak signals.
- Cite report path and date in file 19 and the brief.

## Staleness
If the newest report is more than 10 days older than the meeting date, warn the user, offer to re-enable or run the routine, and fill the gap with live web research.
