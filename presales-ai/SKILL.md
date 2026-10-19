---
name: presales-ai
description: Front door for presales work. Use when the user asks for help with an RFP, RFI, security questionnaire, proposal, battle card, competitor, win-loss, market research, buyer persona, lead or deal qualification, deal prioritisation, the two-lane SE engagement model, discovery, or call and email scripts, or says "presales", "deal pack" or "help me win this deal". Asks a few questions, writes a shared deal-context.json, then hands off to rfp-response-builder, competitive-battle-cards, deal-qualification-desk or presales-meeting-prep.
---

# Presales AI: the front door

One skill to call. It asks once, records the answers, then routes to the specialist skills.
Every specialist reads the same `deal-context.json`, so the user is asked each fact once.

## Step 1: Read what the prompt already says
Pull out anything already given: the job, account, competitor, persona, inputs (files, CRM
export, notes), deadline and format. If a `deal-context.json` exists in the working folder,
load it and ask only about what is missing.

## Step 2: Ask once
Use `AskUserQuestion` with 2 to 4 questions in one round. Skip any question the prompt or
the context file already answers. Skip the round entirely in non-interactive runs and state
the assumptions in one line.

1. **What do you need?** (header `Job`)
   - Answer an RFP, RFI or security questionnaire
   - Win against a competitor (battle card or win-loss)
   - Qualify, score or route deals (includes research and personas)
   - Prep a meeting, discovery or outreach scripts
   - Full deal pack (all of the above, in order)
2. **Which account and who is the buyer?** (header `Account`) Offer "I'll type it" and
   "Research it from the web".
3. **What inputs do you have?** (header `Inputs`, multiSelect) Questionnaire file, CRM or
   deal CSV, call notes or transcripts, internal docs or wiki export, none yet.
4. **When is it due and in what format?** (header `Deadline`) Today, this week, no rush.

## Step 3: Write `deal-context.json`
Write it in the working folder. Schema and example: `references/deal-context.md`.
Never put credentials in it. Mark anything guessed with `"guessed": true`.

## Step 4: Route

| Job | Hand off to | Then |
|---|---|---|
| RFP, RFI, security questionnaire, proposal | `rfp-response-builder` | |
| Competitor, battle card, win-loss, predictive insight | `competitive-battle-cards` | |
| Market research, persona, lead score, deal priority, lane | `deal-qualification-desk` | |
| Discovery, call script, email, personalised content | `presales-meeting-prep` | reads persona and lane from context |
| Full deal pack | all four, in this order | qualify → research and persona → battle card → meeting prep → proposal |

Invoke each skill with the Skill tool, passing the path of `deal-context.json` as the
argument. Each one writes its outputs into `deal-context.json` under `outputs`, so the next
one can build on it (for example the lane picked by deal-qualification-desk sets the depth
of the meeting prep).

## Step 5: Close
List what was made, as file links, with what still needs a human: red answers that need an
SME, guessed facts, and anything to verify before it goes to the buyer.

## Rules for every presales output
- **Sourced or flagged.** Every factual claim cites a source document or URL. No source
  means the claim is marked red and routed to an SME. Never invent a security control,
  certification, customer name or metric.
- **Human gate.** Nothing is sent to a buyer by this suite. It drafts, a person sends.
- **Correlation, not prophecy.** Win-loss and scoring outputs say "linked with", never "causes".
- **House style.** No em-dashes or semicolons in prose. HTML outputs are visual first. Any
  diagram uses the style picker in `drawio-creative-diagrams/references/visual-styles.md`.
- **Connectors are optional.** Use CRM, enrichment or call-recording connectors when they
  are connected. Otherwise work from CSV and files. If a needed connector is not authorised,
  say so once and fall back.
