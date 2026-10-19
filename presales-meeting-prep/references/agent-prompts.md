# Agent prompt templates

Fill in the `{placeholders}`. Every prompt ends with the COMMON block, also filled in.

**COMMON block** (append to every prompt)

> Read "{folder}/research/00-facts.md" first and treat it as settled. If you find a fact that contradicts it, correct 00-facts.md with the source and say so in your summary.
>
> Today is {today}. Cover the last 12 months, weighted to the last 3. Use WebSearch and WebFetch, and fetch primary sources where you can.
>
> Style: no em dashes and no semicolons anywhere. Grep your file before returning.
>
> Write to "{folder}/research/{file}". Every claim needs a source URL and a date, tagged [verified] or [inferred].
>
> End with the extra sections named in the prompt, then "Implications for {our_company}" (5 bullets).
>
> Return a 10-line summary only, and note any gaps.

## 1. Company: `01-company.md`

> Research {company} ({industry}) for a {our_company} presales meeting with {person}, {role}. Their priorities: {priorities}.
>
> Cover:
> - strategy and leadership
> - latest earnings and investor themes, or funding if private
> - segment and revenue mix
> - divestitures and M&A
> - AI announcements
> - partnerships
> - restructuring and layoffs
> - use of vendors and offshore teams

## 0. Identity gate: `00-facts.md`

> Establish the settled facts about {company} ({url}) before anyone else researches. Read the site footer, legal and about pages, product pages and the latest press releases.
>
> Write a table of fact, value, source URL, date, tag: legal name, brand history, what they sell and to whom, industry and sub-segment, products, current CEO and C-suite with start dates, owner or investors, HQ, scale claims, latest launch. Flag any conflict between sources.
>
> Do not do the COMMON block's first paragraph. Return the industry in one line so the other prompts can be filled in.

## 2. People: `02-person.md`

> Research the public professional footprint of {person}, {role} at {company}, plus the current C-suite listed in 00-facts.md. Known background: {background}. Stakeholder URLs: {stakeholder_urls}.
>
> Cover:
> - career timeline
> - LinkedIn posts, comments and reposts (themes and the language they use)
> - talks, articles, podcasts, patents, GitHub
>
> Use public professional information only, never personal or family details. If LinkedIn is login-walled, say so and use search snippets.
>
> Extra sections: "What they likely care about", "Rapport hooks" and, per stakeholder, 3 conversation openers tied to AI and their remit.

## 3. Hiring: `03-hiring.md`

> Research {company}'s ACTIVE hiring. Find the ATS behind the careers page (Workday, Greenhouse, Lever, Ashby, BambooHR and so on) and query its public API or JSON feed for a live count. Then LinkedIn Jobs and Indeed. State the open role count and the date you checked. Zero open roles is a finding, say what it implies.
>
> Cover:
> - role titles, locations and seniority
> - tech stack, tools and certifications named in job descriptions
> - posting dates
>
> Include a table of roles with a URL and date for each. Then infer which capability gaps and initiatives the roles point to.

## 4. Product and tech: `04-product-tech.md`

> Research {company}'s products and technology relevant to {role}:
> - product lines and architecture
> - cloud and platform moves
> - the legacy footprint and acquisitions still being integrated
> - AI in their products
> - key partners and certifications
> - outages and customer complaints, from status trackers and reviews
>
> Extra section: "Pain points (hypotheses)".

## 5. Industry: `05-industry.md`

> Research the {industry} landscape as it bears on {priorities}:
> - market size and growth
> - regulation and deadlines
> - standards bodies and protocols
> - technology trends and AI use cases
> - major deals
>
> Add the industry-specific items from the add-ons list below.
>
> Extra section: "Opportunity areas for {company}".

## 6. Competitors: `06-competitors.md`

> Research {company}'s competitors in three tiers. Include the user's named rivals: {known_rivals}.
> - **Direct (3):** sell the same job to the same buyer.
> - **Industry leaders (3):** set direction and own buyer relationships, including platforms that could absorb the category.
> - **Startups (3):** show where AI is taking the category, ideally funded in the last 24 months.
>
> Also search "who else sells to the same buyer through the same channel" (marketplaces, partner directories, review sites). Give the reason for each pick and an alternates list with why each was not picked.
>
> For each, cover:
> - AI and agentic launches
> - product strategy
> - moves related to {priorities}
> - M&A
> - signs of speed to market
>
> Include a comparison table and a section per competitor.
>
> Extra section: "Where {company} is behind or at risk".

## 7. Leader social: `07-leader-social.md`

> Log posts, reposts and comments from the last 30 days by {company}'s leaders (from 00-facts.md) and its company page. If the site is walled, stop and report it so the main agent can offer the user's logged-in browser. Read only, never like, follow or message. Convert relative dates to approximate dates. Per post: date, author, theme, quote under 15 words, URL. Extra section: "What they are signalling" (priorities, hiring, partners, launches).

## 8. Architecture: `08-architecture.md`

> Reconstruct {company}'s likely architecture today from job posts, docs, integrations and acquisitions, then a target architecture. Mark every component [verified] or [inferred]. Produce a draw.io file with today and target views, icons at least 80px. Extra sections: "Gaps between today and target" and "Where {our_company} fits".

## 9. Positioning critique: `09-design-critique.md`

> Critique {company}'s website, messaging and product UX against its rivals. Use a scoring rubric with named dimensions, a 1 to 5 scale and the meaning of each score, so any total is explained. Extra section: "Quick wins".

## 10. Buyer economics: `10-buyer-economics.md`

> Analyse who funds decisions at {company}: owner type, funding, hold period or market cap, margins, pricing model, and which ROI levers (revenue, cost, risk, exit value) unlock budget. Extra section: "How to frame value for this buyer".

## 11. Product deep dive: `11-product-deep-dive.md`

> For each product ({product_urls}, or the main ones in 00-facts.md), fetch its page and cover: what it does today, how it works, who buys it, claims and proof, then tomorrow (12 to 24 months: market, regulation, AI shifts), then how to do it differently, then the {our_company} play.

## 12. Top 5 challenges: `12-top5-challenges.md`

> For each product and each cross-cutting area (distribution, stack, hosting, data, operations), list the top 5 challenges with the current system today and the top 5 tomorrow, each with evidence and a tag. Then "how to do it differently" and the {our_company} play. Finish with a matrix table.

## 13. AI opportunities and roadmap: `13-ai-roadmap.md`

> Do a SOTA scan of the last 60 days for AI in {industry} relevant to {company}. Rank 8 to 12 AI opportunities by value, feasibility and evidence. Then a future roadmap in 0 to 6, 6 to 12 and 12 to 24 month horizons, with today vs target for each capability, KPIs and risks. Separate what AI makes essential from marketing.

## 14. Red team: `14-red-team.md`

> Challenge the whole pack as three personas: our sales lead, a solutions architect and {company}'s CFO. Attack the framing, competitor picks, sources and offers. Research to close each gap you find. Extra section: "What we missed and why".

## 15. Verification: `15-verification-log.md`

> Check every file for completeness, correctness, truthfulness and technical accuracy. Use the Workflow tool to fan out one checker per file when available. Fix errors in place, apply corrections to 00-facts.md and log each claim checked with verdict and source.

## 16. Decision framework: `16-decision-framework.md`

> Explain how the pack was made: the process and why in that order, the criteria with what was looked at and why it matters, how competitors were picked and alternates rejected, the evidence rules, and what we still do not know.

## 17. Industry analogy: `17-industry-analogy.md`

> Explain how the core job in {industry} works today step by step, and how an AI-native version would work, in plain language with one simple flow each.

## 18. Solution design: `18-solution-design.md`

> Pick the biggest manual pain from 12 and 13. Survey how the market solves it today, design a target pipeline, debate it as three personas, red team it (hallucination, liability, data privacy), define KPIs and a 90 day pilot. Tag all numbers [inferred] unless sourced.

## 19. Weekly news mapping: `19-weekly-news-mapping.md`

> Read the report paths given ({report_paths}). Map each theme to {company} as a risk, opportunity or talk track, plus a {our_company} play. Rank the top 10. Flag the report dates and any staleness. Fill gaps after the last report from the live web.

## 20. Client data: `20-client-data.md`

> Read the client files at {data_paths}. Summarise what they show, data quality issues, and what we could solve with them, ranked by value.

## Industry add-ons (for prompt 5)
Examples only. Let the agent discover the real list for the client's industry.

| Industry | Add |
|---|---|
| Payments / fintech | schemes, PCI, EMV, acquiring, real-time rails, agentic payments |
| Retail / CPG | unified commerce, POS, loyalty, retail media, supply chain |
| Healthcare / life sciences | HIPAA, FDA, interoperability (FHIR), clinical trials, payer/provider |
| Banking / insurance | core modernization, Basel/Solvency, open banking, claims automation |
| Energy / fuel / utilities | forecourt standards, EV charging, grid, emissions rules |
| Manufacturing | Industry 4.0, OT security, digital twins, MES/ERP |
| Telecom / media | 5G, OSS/BSS, streaming, ad tech |
| Public sector | procurement vehicles, FedRAMP, accessibility |
