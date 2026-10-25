# SOTA Snapshot — the skill's only price sheet

**Snapshot date: 2026-07-19.** This is the *one* file in `llm-finops` permitted to contain literal
dollar figures. `SKILL.md`, every other reference, every template and the project-context snippet
carry model names and relative statements only, and point here. `scripts/check-prices.mjs` enforces
that with a tree-wide `\$\d` guard, and `scripts/init-finops.mjs` generates `templates/pricing.ts`
from the tables below. Do not hand-edit `pricing.ts`; edit this file and regenerate.

Why the one-file rule matters: a price copied into a second location is a price that will not be
updated at the next refresh. The worst outcome this skill can produce is not "no number" — it is a
confidently wrong number in a client-facing estimate.

---

## 0. Freshness gate — read before quoting any number

Age is measured from the row's `verified` date to today, not from the snapshot date.

| Age of `verified` | What you may say |
|---|---|
| ≤ 30 days | Quote it, suffixed `(as of YYYY-MM-DD, <source>)`. |
| 31–60 days | Quote it, suffixed `(as of YYYY-MM-DD — verify before client-facing use)`. |
| **> 60 days** | **Do not state the number.** Say "priced around $X–$Y as of YYYY-MM-DD; this is over 60 days old and must be re-verified", then offer to fetch the live page. |
| Any age, confidence `low`, or anything from §4 QUARANTINE | Never in a proposal, estimate, deck or other client artifact without fetching the primary source first. Internal reasoning only. |

Run `node scripts/check-prices.mjs` to get this as an exit code rather than a judgement call. It
prints `FRESH / AGING / STALE / KNOWN-WRONG` per row and re-emits §7 so open questions resurface.

### Scheduled changes — diary these now

These are *known* future price events. A cost model built today that ignores them is wrong on a
date you can already name.

| Date | Event | Action required |
|---|---|---|
| 2026-07-20 | Claude Fable 5 access on claude.ai plans moves to metered usage credits. Conversion rates unpublished. | Check the live usage-credits page; record the actual conversion in `LEARNINGS.md`. Until then, subscription Fable 5 economics are **unmodellable**. |
| 2026-07-24 | Claude Opus 4.7 fast mode removed. | `rg 'speed.*fast|--fast'` over configs. |
| 2026-07-28 | MCP spec RC lands (`ttlMs` / `cacheScope` tool-result caching). | Re-read §5; new cost lever below the prompt-caching layer. |
| 2026-08-05 | Claude Opus 4.1 retires. | `rg 'claude-opus-4-1'`. |
| 2026-08-31 | **Claude Sonnet 5 intro pricing ends.** | Any $/task model built on intro pricing is wrong from 2026-09-01. |
| **2026-09-01** | **Sonnet 5 steps up 50%: 2/10 → 3/15 per MTok.** | Sonnet-heavy workflows get 50% more expensive overnight. This is the first dated price *increase* a major provider has pre-announced — model it explicitly, do not average it away. |

### Parser contract (for `check-prices.mjs` / `init-finops.mjs`)

Every table under §2 and §3 marked `<!-- machine-readable -->` uses bare decimal USD per 1M tokens
(no `$` sign inside cells — the unit is in the column header), ISO dates, `confidence` in
`{high, medium, low}`, and a source key resolved in §8. Rows in §4 QUARANTINE are deliberately
*not* machine-readable and must never be emitted into `pricing.ts`.

## 1. Confidence labels

`high` = read off a primary vendor page or API in a session that fetched it.
`medium` = primary source but derived (a multiplier on a verified base), or a primary source whose
prose did not state the relationship explicitly. `low` = third-party tracker, competitor comparison,
or a single unconfirmed source. A `low` row is not a lie, it is an *unowned* number — say so in the
text every time you use one.

---

## 2. Model prices

All figures USD per 1M tokens ("MTok"). `cache_read` is the Anthropic/Gemini cached-input read rate.
Batch pricing is a flat 0.5x multiplier on every provider in this table (§3.2) unless noted.

### 2.1 Anthropic — first-party list

<!-- machine-readable: prices -->

| model_id | provider | in /MTok | out /MTok | cache_read /MTok | status | verified | effective | source | confidence |
|---|---|---|---|---|---|---|---|---|---|
| claude-fable-5 | anthropic | 10 | 50 | 1 | GA | 2026-07-19 | 2026-06-09 | S1 | high |
| claude-opus-4-8 | anthropic | 5 | 25 | 0.50 | GA | 2026-07-19 | 2026-05-28 | S1 | high |
| claude-opus-4-7 | anthropic | 5 | 25 | 0.50 | GA | 2026-07-19 | — | S1 | high |
| claude-opus-4-6 | anthropic | 5 | 25 | 0.50 | GA | 2026-07-19 | — | S1 | high |
| claude-opus-4-5 | anthropic | 5 | 25 | 0.50 | GA | 2026-07-19 | — | S1 | high |
| claude-opus-4-8-fast | anthropic | 10 | 50 | — | Preview | 2026-07-19 | 2026-05-28 | S1 | high |
| claude-opus-4-1 | anthropic | 15 | 75 | 1.50 | Deprecated, retires 2026-08-05 | 2026-07-19 | — | S1 | high |
| claude-sonnet-5 (intro) | anthropic | 2 | 10 | 0.20 | GA, intro thru 2026-08-31 | 2026-07-19 | 2026-06-30 | S1 | high |
| claude-sonnet-5 (standard) | anthropic | 3 | 15 | 0.30 | GA | 2026-07-19 | **2026-09-01** | S1 | high |
| claude-sonnet-4-6 | anthropic | 3 | 15 | 0.30 | GA | 2026-07-19 | — | S1 | high |
| claude-sonnet-4-5 | anthropic | 3 | 15 | 0.30 | GA | 2026-07-19 | — | S1 | high |
| claude-haiku-4-5-20251001 | anthropic | 1 | 5 | 0.10 | GA | 2026-07-19 | — | S1 | high |
| claude-haiku-3-5 | anthropic | 0.80 | 4 | 0.08 | GA (legacy) | 2026-07-19 | — | S1 | high |

Non-token Anthropic line items (verified 2026-07-19, S1, high): web-search server tool 10.00 per
1,000 searches *plus* tokens; Managed Agents runtime 0.08 per session-hour while running *plus*
tokens; `inference_geo: "us"` data residency on 4.6+ is a 1.1x multiplier on all token categories.
"Claude Platform on AWS" is a third, distinct billing model — AWS Marketplace Claude Consumption
Units at 0.01/CCU, tokens rated in USD at first-party rates then converted. It is **not** Bedrock.

### 2.2 Google Gemini — first-party list

<!-- machine-readable: prices -->

| model_id | provider | in /MTok | out /MTok | cache_read /MTok | status | verified | effective | source | confidence |
|---|---|---|---|---|---|---|---|---|---|
| gemini-3.1-pro-preview (≤200k prompt) | google | 2 | 12 | — | **Preview** | 2026-07-09 | — | S2 | high |
| gemini-3.1-pro-preview (>200k prompt) | google | 4 | 18 | — | **Preview** | 2026-07-09 | — | S2 | high |
| gemini-3.5-flash | google | 1.50 | 9 | 0.15 | GA (current default) | 2026-07-09 | 2026-05-19 | S2 | high |
| gemini-3-flash-preview | google | 0.50 | 3 | — | **Preview** | 2026-07-09 | — | S2 | high |
| gemini-3.1-flash-lite | google | 0.25 | 1.50 | 0.025 | GA | 2026-07-09 | — | S2 | high |
| gemini-2.5-pro (≤200k prompt) | google | 1.25 | 10 | 0.125 | GA | 2026-07-09 | — | S2 | high |
| gemini-2.5-pro (>200k prompt) | google | 2.50 | 15 | 0.125 | GA | 2026-07-09 | — | S2 | high |
| gemini-2.5-flash | google | 0.30 | 2.50 | 0.03 | GA | 2026-07-09 | — | S2 | high |
| gemini-2.5-flash-lite | google | 0.10 | 0.40 | — | GA (cheapest text) | 2026-07-09 | — | S2 | high |

Gemini explicit-cache **storage** is billed per MTok per hour on top of the read rate: 1.00 for
3.5 Flash and 2.5 Flash, 4.50 for 2.5 Pro (2026-07-09, S2, high). Storage is why explicit caching
loses money below roughly four hits per hour per cache.

Two Gemini-specific traps worth stating every time: **(a)** the >200k-token surcharge on 3.x Pro
doubles input, while Claude 5-era models price 1M context flat — long-context work can invert the
"Gemini is cheaper" assumption; **(b)** "Flash" no longer means cheap. 3.5 Flash is 3x the price
of 3 Flash Preview and 6x Flash-Lite on input. Pin exact versions; never route to "the current
Flash".

The skill's shipped default chain is `gemini-3.1-flash-lite` → `gemini-3.5-flash` (quality-sensitive)
→ Sonnet-class metered → Claude Code CLI failsafe → deterministic fallback. Note that **no Preview
SKU appears in any default path** — Preview pricing and availability change without notice, and
`gemini-3-flash-preview` is cheaper than the GA Flash precisely because it carries that risk.

### 2.3 OpenAI — first-party list

<!-- machine-readable: prices -->

| model_id | provider | in /MTok | out /MTok | cache_read /MTok | status | verified | effective | source | confidence |
|---|---|---|---|---|---|---|---|---|---|
| gpt-5.6-sol | openai | 5 | 30 | 0.50 | GA | 2026-07-19 | 2026-07-09 | S3 | high |
| gpt-5.6-terra | openai | 2.50 | 15 | 0.25 | GA | 2026-07-19 | 2026-07-09 | S3 | high |
| gpt-5.6-luna | openai | 1 | 6 | 0.10 | GA | 2026-07-19 | 2026-07-09 | S3 | high |
| gpt-5.4 | openai | 2.50 | 15 | 0.25 | GA | 2026-07-19 | — | S3 | high |
| gpt-5.4-mini | openai | 0.75 | 4.50 | 0.075 | GA | 2026-07-19 | — | S3 | high |
| gpt-5.4-nano | openai | 0.20 | 1.25 | 0.02 | GA | 2026-07-19 | — | S3 | high |
| gpt-5.4-pro | openai | 30 | 180 | — | GA | 2026-07-19 | — | S3 | high |
| gpt-4.1 | openai | 2 | 8 | 0.50 | GA (legacy) | 2026-07-19 | — | S3 | high |
| gpt-4.1-mini | openai | 0.40 | 1.60 | 0.10 | GA (legacy) | 2026-07-19 | — | S3 | high |
| gpt-4.1-nano | openai | 0.10 | 0.40 | 0.025 | GA (legacy) | 2026-07-19 | — | S3 | high |

OpenAI cache **write** is 1.25x input (gpt-5.6-sol 6.25, terra 3.125, luna 1.25). GPT-5.x carries two
orthogonal surcharge axes a three-column sheet silently drops: **long context** = 2x input / 1.5x
output, and **priority processing** = 2x both. Confirmed on Azure meters (§3.1); assume the same
axes exist first-party and check before quoting a long-context job.

> **Supersedes prior research.** The May–July dossiers carried GPT-5.6 pricing from third-party
> trackers only and quarantined it. GAP-2 (2026-07-19) fetched `developers.openai.com` directly and
> the numbers matched, so these rows are now `high`, not quarantined.

### 2.4 Partner clouds — derived, not independently sourced

Neither Bedrock nor Azure OpenAI needs its own base rates. Both price off the first-party list and
apply a routing-tier multiplier. Store the multiplier, derive the rate — that is why these rows are
`medium` (derived from a `high` base) rather than `low` (unowned).

<!-- machine-readable: multipliers -->

| platform | routing tier | multiplier vs first-party | applies to | verified | source | confidence |
|---|---|---|---|---|---|---|
| aws-bedrock | global (`global.` inference profile) | 1.0 | Sonnet 4.5 / Haiku 4.5 / Opus 4.5 and later | 2026-07-19 | S4, S5 | high |
| aws-bedrock | regional / geo inference profile (US, EU, JP, AU) | 1.1 | same | 2026-07-19 | S4, S5 | high |
| aws-bedrock | any tier, Opus 4.1 and earlier | 1.0 (flat legacy, no split) | pre-4.5 models | 2026-07-19 | S1 | high |
| aws-bedrock | GovCloud | 1.2 | — | 2026-07-19 | S6 | **low — do not seed, see §4** |
| azure-openai | Global Standard (`Gl` meters) | 1.0 | all current families | 2026-07-19 | S7 | high |
| azure-openai | Data Zone Standard (`Dz` meters) | 1.1 | all current families | 2026-07-19 | S7 | high |
| azure-openai | Regional Standard (`regnl` meters) | 1.1 | **legacy families only** — no `regnl` meter exists for any GPT-5.x | 2026-07-19 | S7 | medium |
| any | batch / async | 0.5 | Anthropic, OpenAI, Google | 2026-07-19 | S1, S2, S3 | high |

Spot-verified: Claude Opus 4.8 on Bedrock Global is at **exact parity** with the Anthropic list on
all five dimensions (input 5, output 25, 5m cache write 6.25, 1h cache write 10, cache read 0.50) —
AWS Marketplace, 2026-07-19, S5, high. The general parity rule rests on both vendors' stated
"no premium on global" language, not a row-by-row check of every model.

> **Seeding trap — assert `output > input` on every text row.** The Azure Retail Prices API returns
> GPT-5.6 Terra Data Zone `Inp Std DZ` = 16.50 and `Opt Std DZ` = 2.75. Those two are **transposed**
> upstream (correct: input 2.75, output 16.50), reproduced across two independent fetches. A naive
> API-driven seeder would encode a 6.6x input overcharge. `pricing.ts` ships this assertion at load
> time. (2026-07-19, S7, medium on the transposition being upstream; high on the values as returned.)

### 2.5 Structural multipliers you should derive, not store

Anthropic cache rates are strictly derived from input rate (S1, 2026-07-19, high):
**5-minute cache write = 1.25x input, 1-hour cache write = 2x input, cache read = 0.1x input.**
Cache reads break even at two calls. Batch stacks with caching: a cached read inside a batch is
**5% of base input** — the cheapest token this skill knows how to buy.

---

## 3. Plans, quotas and platform fees

### 3.1 Anthropic plans and the Claude Code spend benchmark

| Item | Price | Verified | Source | Confidence |
|---|---|---|---|---|
| Claude Pro (Claude Code included) | 20/mo, 17/mo annual | 2026-07-19 | S8 | high |
| Claude Max 5x / Max 20x | 100 / 200 per user/mo | 2026-07-19 | S8 | high |
| Claude Team standard / premium seat | 20–25 / 100–125 per seat/mo | 2026-07-19 | S8 | high |
| Enterprise Claude Code, API billing | ~13 per active day; 150–250/mo per developer; 90% of devs under 30/day | 2026-07-19 | S9 | high |

Exact Pro/Max rolling 5-hour and weekly window caps are **unpublished**, so a quantitative
Max-vs-API break-even cannot be computed — only the band comparison above.

### 3.2 Gemini CLI / Code Assist — the arbitrage that closed

| Item | Price / quota | Verified | Source | Confidence |
|---|---|---|---|---|
| Gemini CLI free, personal Google account | 0; 1,000 model requests/day — **consumer path retired 2026-06-18** | 2026-07-19 | S10 | high |
| Gemini CLI via unpaid API key | 0; 250 req/day, Flash only — **contested, see §4** | 2026-07-19 | S10 | low |
| Google AI Pro / Ultra CLI caps (moved to Antigravity 2026-06-18) | included; 1,500 / 2,000 req/day | 2026-07-19 | S10 | medium |
| Gemini Code Assist Standard / Enterprise | 19–22.80 / 45–54 per user/mo — **third-party, see §4** | 2026-07-19 | S11 | low |

### 3.3 Gateways, observability and eval platforms

| Item | Price | Verified | Source | Confidence |
|---|---|---|---|---|
| OpenRouter token pricing | 0% markup, provider pass-through | 2026-07-19 | S12 | high |
| OpenRouter platform fee | 5.5% (0.80 min) on Stripe credit purchase; 5% BYOK after 1M req/mo | 2026-07-19 | S12 | high |
| LiteLLM proxy OSS (virtual keys + `max_budget`) | 0 self-hosted; infra + ops only. Enterprise list not public | 2026-07-19 | S13 | high |
| Portkey Developer / Production | 0 / 49 per mo (+9 per extra 100k req). **Budget limits are Enterprise-only** | 2026-05-29 | S14 | medium |
| Helicone Hobby / Pro / Team | 0 (10k req) / 79 / 799 per mo — **maintenance mode since 2026-03-03** | 2026-07-19 | S15 | medium |
| Langfuse Cloud Hobby / Core / Enterprise | 0 (50k units) / 29 (100k units, overage 8 per 100k) / 2,499 per mo | 2026-07-19 | S16 | high |
| Langfuse Pro | 199/mo — **contested, see §4** | 2026-07-19 | S16 | medium |
| Arize Phoenix OSS | 0, self-host or free cloud tier, uncapped, ELv2 | 2026-07-19 | S17 | high |
| Typical LLM-as-judge assessment | 0.01–0.10 per assessment | 2026-07-19 | S16 | medium |
| Galileo Luna-2 SLM evaluator | 0.02 per MTok, 152ms avg (vendor-reported) | 2026-07-06 | S18 | low |

---

## 4. QUARANTINE — do not quote, do not seed into `pricing.ts`

> **Everything in this section is a number the research could not confirm.** These figures are
> recorded so a future session knows what to go verify, and so nobody re-derives them from scratch.
> They must never appear in an estimate, a deck, or `pricing.ts`. If you need one of these numbers,
> fetch the primary source first — then move the row up into §2/§3 with a `high` label and today's
> date, per §6.

| # | Contested figure | The conflict |
|---|---|---|
| Q1 | **Gemini free-API-key daily cap** | 250 req/day Flash-only (geminicli.com) vs 1,500 RPD for Gemini 3 Flash (third-party trackers). Google no longer publishes fixed rate-limit tables and defers to the per-account AI Studio dashboard, so both may be right for different accounts. |
| Q2 | **Gemini Code Assist seat prices** (19/22.80 Standard, 45/54 Enterprise) | Third-party trackers only; the cloud.google.com page truncated on fetch. |
| Q3 | **Gemini 3 Pro at 2/12 with 2M context** | BenchLM (third-party); not itemized on the official pricing page fetch. |
| Q4 | **Gemini implicit-cache discount** (90% for 2.5+, 75% for 2.0) | Official docs confirm implicit caching passes a discount through but do not state the percentage. |
| Q5 | **Bedrock Intelligent Prompt Routing fee** | One source says no separate fee; another says 1.00 per 1k routing requests. Unresolved; the AWS pricing page is JS-rendered and did not transcribe. The claimed "up to 30% cost cut" is likewise unaudited. |
| Q6 | **Bedrock GovCloud at 1.2x** | Two fetches returned an Opus 4.8 table at 6 / 30 / 7.50 / 12 / 0.60 labelled GovCloud — internally consistent at 1.2x, but the label association could not be confirmed. |
| Q7 | **Azure per-region price variation within a tier** | Only `eastus` was sampled. No evidence of variation found, but the negative is not established. |
| Q8 | **Langfuse Pro 199 vs 249** | 199 from langfuse.com (primary); 249 from braintrust.dev (a competitor). Prefer 199; re-verify. |
| Q9 | **Arize AX Pro at 50/mo for 50k spans** | Sourced from a competitor's comparison article (laminar.sh), not arize.com. |
| Q10 | **Braintrust 2.50/1k scores, LangSmith 2.50/1k traces** | Both from a single third-party comparison (morphllm.com). |
| Q11 | **Gemini 3.5 Pro at ~15/60** | Rumor and press reporting only. Not GA as of 2026-07-19 — **unpriceable**, do not model it. |
| Q12 | **Claude usage-credit conversion for Fable 5** (2026-07-20 switch) | Dollar conversions and per-plan allotments unpublished. Subscription Fable 5 economics cannot be modelled at all until this lands. |
| Q13 | **Semantic-cache hit rates of 70–95%** | Vendor claims. Production figures cluster at **20–45%** — budget with those. The related "60–80% eval cascade savings" and "30K–1.5M/month at 1M spans/day" are vendor-blog numbers with no published methodology. |
| Q14 | **Claude Code auto-compact ~13k-token trigger buffer** | Third-party teardown (decodeclaude.com), not official. Treat CLI internals as indicative, never as contract. |
| Q15 | **Claude Code native AGENTS.md support** | One June-2026 source says no (import/symlink only); others claim native support landed in spring. Verify before prescribing a context-file sync recipe. |
| Q16 | **FinOps "alert at 75%" ladder** | Appeared only in aggregated snippets. The only concretely sourced ladder is ~70 / 90 / 100 alert / throttle / kill; the FinOps Foundation deliberately publishes no percentages. Present the ladder as a practitioner default, not a standard. |
| Q17 | **Gemini on Vertex AI rates** | Not researched. Claude-on-Vertex is documented as global / multi-region / regional with a 10% premium on the latter two, but that is Claude, not Gemini. No Vertex rows ship; `pricing.ts` alerts loudly on an unknown model rather than defaulting. |

---

## 5. Non-price SOTA deltas that change cost engineering (May–Jul 2026)

These are not prices, but each one breaks a cost model built without it.

**Tokenizer inflation — the reason sticker $/MTok misleads.** Claude Opus 4.7+, Fable 5 and Sonnet 5
tokenize roughly **30% more tokens for the same text** than prior Claude models. Gemini CLI was
measured consuming ~65% more input tokens than Claude Code on an identical task (432K vs 261K).
Consequence: a model that is 20% cheaper per token can be more expensive per task. **Build cost
models from measured tokens-per-task-per-model**, never from list rates alone — that is what
`scripts/compare-providers.mjs` exists for. (2026-07-19, S1/S2/S9, medium — the ~30% figure is
consistently reported but is not a single published vendor number.)

**Reasoning-token inclusion differs by provider — and the default provider is the outlier.**
Verified against five primary API references on 2026-07-19 (GAP-1, high):

| Surface | Output field | Reasoning field | Semantics |
|---|---|---|---|
| Gemini `generateContent` | `candidatesTokenCount` | `thoughtsTokenCount` | **ADDITIVE** — billable output = candidates + thoughts |
| Anthropic Messages | `usage.output_tokens` | `…_details.thinking_tokens` | breakdown (subset) — adding it double-counts |
| OpenAI Responses | `usage.output_tokens` | `…_details.reasoning_tokens` | breakdown (subset) |
| OpenAI Chat Completions | `usage.completion_tokens` | `…_details.reasoning_tokens` | breakdown (subset) — *medium* confidence, inferred |
| Bedrock Converse | `usage.outputTokens` | *none exists* | folded in; normalize `reasoningTokens` to `null`, **not 0** |

Adapters carry an explicit `reasoningInOutput` flag for exactly this reason. Never re-derive output
tokens by tokenizing the response body: Anthropic bills full thinking tokens while returning a
shorter summary, and OpenAI/Bedrock do not return reasoning text at all.

**Gemini CLI consumer retirement (cutoff 2026-06-18, announced 2026-05-19).** Free personal accounts,
AI Pro and AI Ultra lost CLI and Code Assist IDE access. This invalidates the entire pre-June
"free `gemini -p` offload" recipe genre. The replacement Antigravity CLI (`agy`) **reportedly has no
documented headless `-p` equivalent** — that comes from a single third-party deep-dive, not a Google
statement, so treat it as unsettled in both directions. This is why the skill's offload spine is a
cheap-tier subagent that needs no second vendor, with the CLI path gated behind
`scripts/check-headless.mjs`. (2026-07-19, S10 + third-party, **low** on the headless claim.)

**Claude subscription usage-credit metering, 2026-07-20 (tomorrow, relative to this snapshot).**
Fable 5 on claude.ai plans moves to metered usage credits with unpublished conversions; the switch
has already slipped twice. Combined with the Gemini retirement, the free/subscription arbitrage era
is closing on both vendors simultaneously. Any offloading recipe must be gated on auth path and
re-verified quarterly. (2026-07-19, S1/S8, medium.)

**MCP 2026-07-28 spec RC (published 2026-05-21):** `ttlMs` and `cacheScope` tool-result caching,
stateless protocol, async tasks. Cost levers are now standardized at the protocol layer, which
extends the caching playbook *below* prompt caching for the first time. Pairs with Claude Code's
deferred tool loading (auto at ~10% context budget, cache-preserving). (2026-07-19, S19, medium.)

**Parallel subagents are the largest new spend amplifier.** Claude Code dynamic workflows (shipped
with Opus 4.8) run hundreds of parallel subagents in a single session; agent teams are reported at
~7x baseline tokens. A single session can now outspend a week of ordinary use. **Per-agent budget
envelopes are enforced even in advisory budget mode** precisely because of this — a looping agent
should only be able to kill itself. Do not enable dynamic workflows without them. (2026-07-19,
S9 + third-party, medium.)

**Fast-mode churn is an audit item.** Opus 4.6 fast was silently disabled 2026-06-29; Opus 4.7 fast
is removed 2026-07-24. Hardcoded `speed: "fast"` is now a config smell. Fast mode is a **latency
purchase at 2x**, never a cost lever. (2026-07-19, S1, high.)

**Landscape, for context rather than arithmetic:** FOCUS 1.4 (2026-06-08) targets AI token economics
but per-request cost may land as an OTel dataset rather than billing columns; OTel GenAI semconv
moved to its own repo, still Development status with no tagged release — **pin the version**;
Helicone went to maintenance mode after the Mintlify acquisition (2026-03-03), making it a risky
new-build bet; State of FinOps 2026 reports 98% of practitioners now manage AI spend and **73%
exceeded their AI budgets**. (2026-07-19, S16/S17/S20, medium.)

**Not new** — inherited established practice, listed so nobody spends a refresh cycle re-verifying
it: 50% batch discounts, 0.1x cache reads, cheap-tier judges, LiteLLM virtual-key budgets,
showback-before-chargeback, deterministic-first eval pyramids, CLAUDE.md/GEMINI.md context files.

---

## 6. Refresh protocol

**Cadence:** every 60 days, or on any §0 scheduled-change date, whichever comes first.
**Next scheduled refresh from this snapshot: 2026-09-17** — but 2026-08-31 and 2026-09-01 arrive
first, so the real next touch is 2026-08-31.

Follow these steps in order. They are deliberately mechanical; none requires judgement.

1. **Run the checker first.** `node scripts/check-prices.mjs`. Note every row printed `AGING`,
   `STALE` or `KNOWN-WRONG`. Only those rows need work — do not re-verify `FRESH` rows.
2. **Fetch the primary source for each flagged row, in this session.** S1 for Anthropic, S2 for
   Gemini, S3 for OpenAI, the Azure Retail Prices API (S7) for Azure meters, the AWS Marketplace
   product page (S5) for Bedrock. Marketplace pages beat `aws.amazon.com/bedrock/pricing`, which is
   JS-rendered and does not transcribe reliably.
3. **Apply the provenance guard.** This is the rule that keeps the whole protocol honest:

   > **A row's `verified` date may only be advanced by a session that fetched that row's primary
   > source in that same session.**
   >
   > If the number came from memory, a third-party page, a changelog, or another model's summary:
   > **leave the old `verified` date untouched**, set `confidence: low`, and add a `note:` recording
   > where the number came from. Then add it to §7 as an open question.

   Without this, the maintenance loop launders a recalled number into "fresh, primary", the checker
   reports FRESH, and the freshness protocol is defeated by its own mechanism. This is the single
   most likely way this skill degrades from correct to confidently wrong.
4. **Promote or demote quarantine rows.** A §4 row you verified against a primary source moves into
   §2/§3 with `high` and today's date, and is struck from §4. A §2/§3 row that a fetch contradicts
   moves *down* into §4 with both figures and their sources stated. Movement in both directions is
   normal and expected.
5. **Update §0.** Remove scheduled-change rows whose date has passed and whose effect is now
   reflected in the tables. Add any newly announced dated events.
6. **Regenerate and verify.** `node scripts/init-finops.mjs` to regenerate `pricing.ts`, then
   `node scripts/check-prices.mjs` again — it must exit 0, including the tree-wide `\$\d` guard that
   fails if a dollar figure has leaked into any other file.
7. **Record it.** A price refresh is a **PATCH** semver bump (guidance did not change, data did).
   Add a `CHANGELOG.md` entry citing the `LEARNINGS.md` date. Tag model-authored edits `[auto]`.
   Tell the user in one line what changed. Silent self-modification is not acceptable even when
   it is correct.

---

## 7. Known unknowns — resurfaced by `check-prices.mjs` on every run

1. Antigravity CLI free-tier quotas, and whether any headless `-p` equivalent exists (Q-blocking for
   the CLI offload recipe).
2. Claude usage-credit dollar conversions and per-plan allotments (§4 Q12).
3. Whether Sonnet 5 intro pricing applies on Bedrock and Vertex, and how the 1.1x US-residency
   premium interacts with Claude Code cloud-provider auth.
4. Gemini 3.1 Pro Preview cache read/storage rates, and whether the >200k surcharge applies to all
   3.x models.
5. Gemini on Vertex AI rates (§4 Q17).
6. Whether every Bedrock Claude model matches first-party, or only Opus 4.8 (the one spot-checked).
7. Exact Pro/Max 5-hour and weekly window caps — needed for a real Max-vs-API break-even.
8. FOCUS 1.4's released column list; first tagged release of the OTel GenAI semconv.
9. Whether Gemini `thoughtsTokenCount` is ever priced differently from ordinary output tokens. If it
   ever diverges on any provider, the single `outputRate` multiplier in `computeCost` becomes wrong
   and a separate `reasoningRate` is required.

---

## 8. Source index

| Key | Source |
|---|---|
| S1 | platform.claude.com/docs/en/about-claude/pricing |
| S2 | ai.google.dev/gemini-api/docs/pricing |
| S3 | developers.openai.com/api/docs/pricing |
| S4 | docs.aws.amazon.com/bedrock/latest/userguide/global-cross-region-inference.html |
| S5 | aws.amazon.com/marketplace — Claude (Amazon Bedrock Edition) product pages |
| S6 | aws.amazon.com/bedrock/pricing (JS-rendered; unreliable transcription) |
| S7 | prices.azure.com/api/retail/prices (`api-version=2023-01-01-preview`) |
| S8 | claude.com/pricing |
| S9 | code.claude.com/docs/en/costs |
| S10 | geminicli.com quota documentation |
| S11 | aiproductivity.ai (third-party tracker) |
| S12 | openrouter.ai/docs/faq |
| S13 | docs.litellm.ai |
| S14 | portkey.ai/pricing |
| S15 | helicone.ai/pricing |
| S16 | langfuse.com/pricing and langfuse.com/docs |
| S17 | arize.com/phoenix |
| S18 | galileo.ai blog (vendor) |
| S19 | modelcontextprotocol.io specification 2026-07-28 RC |
| S20 | finops.org — State of FinOps 2026, FOCUS 1.4, Token Economics papers |

GAP-1 and GAP-2 primary API references (Anthropic Messages, Gemini generateContent, OpenAI
Responses/Chat, Bedrock TokenUsage, Nova extended-thinking) are cited inline in §5 and in
`references/adapters.md`.
