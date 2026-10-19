---
name: presales-meeting-prep
description: Deep, multi-agent research and a meeting pack for any presales or client meeting, for any industry, company or person. Use when the user says "prepare for a meeting with X", "presales prep", "research this company/person", "account research", "help me prepare for a call with <name> at <company>", or gives a client URL, background or priorities. Runs in waves (identity gate, core research, extension lenses, challenge, synthesis) and covers company, leaders, active hiring, leader social posts, product and tech, industry, tiered competitors (direct, industry leaders, startups), today vs target architecture, top 5 challenges today and tomorrow, AI opportunities, a future roadmap, the user's weekly industry reports, a red team and a verification log. Produces a sourced research folder, a brief with discovery questions and objections, and on request an HTML brief, a deck, a primer and other extras.
---

# Presales meeting prep

Generic for any company, industry or person. Never hard-code a client, sector, regulation or name into this skill. Everything specific is discovered by the agents and written to the client folder.

## 1. Inputs
Use what the user already gave. Ask once, in one message, only for what is missing and needed:
- **Company** (name or URL), plus the **person** and role. Either can be optional.
- **Priorities**, background, meeting date.
- **Known rivals** the user wants included (optional).
- **Product URLs** to deep dive (optional, else the agents pick the main products).
- **Stakeholder LinkedIn URLs** (optional) and **client data files** (optional).
- **Depth:** quick, standard (default) or deep.
- **Our side:** default Ciklum offers (engineering, AI, modernization, data, delivery pods).
- **Save location:** default `~/Documents/Pre Sales/<Company>/` unless memory names another. State the folder in the first message.

## 2. Waves
Waves run in sequence. Agents inside a wave run in parallel in ONE message. Build prompts from `references/agent-prompts.md`. Every agent writes its own file under `<folder>/research/` and returns 10 lines or fewer. Never read agent transcripts. After each wave give the user 4 to 6 takeaways.

| Wave | Files | Depth |
|---|---|---|
| 0 Identity gate | 00-facts.md (what they sell, legal name, industry, products, leaders, owner, scale) | all |
| 1 Core research | 01 company, 02 people, 03 hiring (active roles), 04 product and tech, 05 industry, 06 competitors (3 direct, 3 leaders, 3 startups) | all |
| 2 Extension lenses | 07 leader social (30 days), 11 product deep dive, 12 top 5 challenges, 13 AI opportunities and roadmap, 19 weekly news mapping | standard, deep |
| 2b Extra lenses | 08 architecture today vs target, 09 positioning critique, 10 buyer economics, 17 industry analogy, 18 solution design for the biggest manual pain | deep |
| 3 Challenge | 14 red team with 3 personas, 15 verification log, 16 decision framework | standard (14, 15), deep (all) |
| 4 Synthesis | 00-meeting-brief.md | all |

Notes:
- **Wave 0 first, always.** A wrong premise poisons every later file. Later agents read 00-facts.md first and update it when they correct a fact. The checkers in wave 3 spread corrections to every file.
- **Walled sites.** If LinkedIn or another source is login-walled, say so and offer to read it through the user's logged-in browser, read only. Never like, follow, connect or message.
- **Weekly reports.** Before wave 2, follow `references/routine-hook.md` to find the user's own industry reports and feed them to file 19.
- **Stakeholder mode.** With LinkedIn URLs, 02-people adds conversation openers per person, framed around AI and their remit.
- **Client data.** With files, add `20-client-data.md`: what the data shows and what we could solve with it.

## 3. Brief
Write `00-meeting-brief.md` from `references/brief-template.md`.
- Grep the research files for conflicting numbers and dates, settle them from 00-facts.md or flag them.
- Keep the core to about 2 pages, with deeper sections after.
- Tag anything inferred.

## 4. Optional outputs
Offer these early, build only on a yes:
- **HTML brief** as an Artifact. Load `artifact-design` first, then follow `references/html-template-notes.md`.
- **Visual style:** when the user says yes to the HTML brief, deck or architecture diagram, ask once for a style from `references/visual-styles.md` (A Duotone line, B Isometric, C Solid glyph tiles, D Blueprint, plus 1 or 2 extras, recommended first) and use it for every visual in the pack.
- **Pitch deck** via `Artifact` quickstart `intent: slides`, outline in `references/deck-outline.md`. List every slide number and title on delivery.
- **Technical primer** (`07-technical-primer.md`): glossary of every term of art, why each discovery question is asked, what good and bad answers sound like, pains in plain English.
- **Others:** leadership deck, exec memo, talk track, stakeholder map, KPI dictionary, capability or feature catalogue (top N with user stories, value and ROI), bid gap register, ROI page, architecture diagram (draw.io), objection drill, follow-up email draft.

## 5. Close
Ask "what did we miss and why", list open gaps and `[placeholders]`, and offer a better reusable prompt for the next run.

## Rules
- **Public professional information only.** Never personal, family or home details.
- **Every claim** gets a URL, a date and a [verified] or [inferred] tag.
- **Never invent** metrics, quotes or our case studies. Use `[placeholders]` and list them.
- **Outages, complaints and third-party data** are things to ask about, never facts to state to the client.
- **Dates.** Today bounds the window, weighted to the last 3 months. Convert relative dates (2w, 1mo) to approximate dates.
- **Style gate.** No em dashes and no semicolons in any generated text. Grep every file before delivery and fix hits.
- **Diagrams.** Icons at least 80px, glyphs at least 64px, short labels.
- **Pages.** Check the rendered layout and every toggle state before saying done.
- **Tokens.** Full output goes to files, summaries stay short, waves are sequential.
