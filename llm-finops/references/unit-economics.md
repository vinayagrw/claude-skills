# Unit economics for LLM features

This file exists for one job: **producing a cost figure you can defend in front of a client.** Not a token
count, not a per-MTok rate — a number attached to a business unit ("per conversation", "per document", "per
resolved ticket"), paired with a quality metric, carrying an honest uncertainty band, and reproducible when
prices move.

Getting this wrong is the most expensive mistake in the whole skill, because it is the only one that leaves
the building. Every dollar figure lives in `references/sota-snapshot.md`; nothing here quotes a price.

---

## 1. Why cost-per-token is the wrong unit

Nobody buys tokens. Clients buy conversations answered, documents processed, tickets resolved, claims
adjudicated. A per-token figure cannot be compared to anything the client already budgets, cannot be
sanity-checked by a non-engineer, and moves for reasons that have nothing to do with value delivered.

The FinOps Foundation's guidance converges on the same point from the finance side: measure **cost per unit of
business value**, and treat token counts as an input rather than an output. Its Token Economics work
prescribes unit costs at three grains — **per query, per user, per workflow** — which maps directly onto the
three grains below. (Sources: `finops.org/wg/token-economics-saas/`, 2026-06-03;
`finops.org/insights/token-economics-the-atomic-unit-of-ai-value/`, 2026-05-10. Confidence: **high** —
primary publisher.)

Two context numbers worth carrying into a client conversation, both from State of FinOps 2026
(`data.finops.org`, June 2026, confidence **high**): **98% of FinOps practitioners now manage AI spend** (up
from 63% in 2025 and 31% in 2024), and **73% of organisations blew their original AI budget**. The second is
the one that earns you the right to talk about uncertainty bands instead of point estimates.

---

## 2. The three grains

Report all three. Each answers a different person's question, and a stakeholder given only one will
mentally construct the other two, badly.

### Grain 1 — cost per interaction (per query / per call)

*The engineer's number.* Total metered spend over a period divided by request count, broken down by surface
and pipeline stage.

- **Comes from:** `ledger.summarize()` — `costPerRequest`, plus the by-surface and by-stage breakdowns.
- **Use it for:** finding where the money is, and nothing else.
- **Do not present it alone.** It is the most volatile of the three and the least meaningful to a buyer.
- **Watch:** a fat single surface label means you cannot attribute (AP-06). Fix the labels before modelling.

### Grain 2 — cost per session (per conversation / per document / per user-month)

*The product owner's number.* The unit the feature is actually experienced in.

- **Comes from:** `costPerSession`, or spend divided by distinct documents/conversations processed.
- **This is the grain most pre-sales questions are really asking.** "What does the chatbot cost?" means "per
  conversation", every time.
- **Model it as** `turns per session x cost per turn`, and state both factors separately — because they have
  completely different drivers and completely different uncertainty. Turn count is a *product* question and is
  usually the larger source of error.
- **Watch:** the distribution is heavily right-skewed. A handful of long sessions dominate the mean. Report
  median and p95, not just the mean, or your average will be wrong for almost every individual session.

### Grain 3 — cost per outcome (per workflow / per resolved case)

*The buyer's number.* Spend divided by **successful business outcomes**, not attempts.

This is where the money hides. The denominator excludes failed attempts, retries, refusals, fallbacks and
abandoned sessions — all of which cost full price and deliver nothing. The Foundation calls the surviving
fraction **token yield rate**: the share of generated tokens that contribute to a real business action, net of
failures and retries. (Source: `finops.org/insights/token-economics-the-atomic-unit-of-ai-value/`, 2026-05-10,
confidence **high**.)

- **Comes from:** ledger spend for a period divided by outcomes counted in your application's own domain
  events, cross-checked against `fallbackRate`, `degradedRate` and `retryCostShare` in `summarize()`.
- **Why it moves the conversation:** a 20% failure rate means cost per outcome is 25% above cost per attempt.
  That gap is usually a bigger lever than any model swap — and it is a *quality* fix, which reframes the
  engagement from "make the AI cheaper" to "make the AI work", which is the conversation you want.
- **Watch:** if you cannot count outcomes, you cannot compute this grain. Instrument the outcome event before
  you instrument anything else.

---

## 3. Never report cost without a quality metric

**Rule: every cost figure ships paired with a quality figure, in the same table, from the same period.**

The reason is mechanical, not decorative. Cost is trivially reducible — route everything to the cheapest tier,
truncate context, disable reasoning, cap output — and every one of those levers trades accuracy for money. An
unpaired cost metric therefore creates an incentive to silently degrade the product, and the degradation
appears in the numbers as *success*. The FinOps Foundation states this as the **cost/accuracy/performance
triumvirate**: the three are inseparable and optimising one in isolation is meaningless. (Source:
`finops.org/wg/cost-estimation-of-ai-workloads/`, 2025-09-15, confidence **high**.)

Pick a quality metric you already compute deterministically, so pairing costs nothing:

| Feature shape | Cheap paired quality metric | Cost of computing it |
|---|---|---|
| Grounded generation / RAG | Citation validity — cited ids ⊆ allow-list | Free, deterministic |
| Extraction | Schema validity + required-field completeness | Free, deterministic |
| Classification | Accuracy against a labelled fixture set | Free after labelling |
| Chat / prose | Sampled judge score (flash-tier), plus refusal and fallback rates | Low — see `eval-costs.md` |
| Any | Task success rate, fallback rate, degraded rate | Free — already in `summarize()` |

The reference project computed a RAGAS-style faithfulness score deterministically, with **no judge tokens at
all**, by checking claim–citation overlap. Deterministic-first pairing is the cheapest honesty you will ever
buy.

Practical form for a client deck — one row per configuration, never a cost column on its own:

| Configuration | Cost / conversation | Citation validity | Fallback rate |
|---|---|---|---|
| Budget tier everywhere | (lowest) | 91% | 6% |
| Budget + escalation on quality-tagged calls | (mid) | 98% | 2% |
| Frontier everywhere | (highest) | 98% | 2% |

That table sells the middle row by itself. A cost-only version sells the top row and creates a support problem
six weeks later.

---

## 4. The nine-bucket TCO checklist

The token invoice is **one of nine** cost layers. Presenting only the token bill as "the AI cost" is the most
common way a pre-sales estimate ends up materially low. Walk this list explicitly, and write "in scope" /
"out of scope" / "client-provided" next to each — the discipline of naming a bucket you are excluding is what
protects you when it appears later.

(Source: `finops.org/insights/token-economics-the-atomic-unit-of-ai-value/`, 2026-05-10, confidence **high**.)

| # | Bucket | Typically missed because | Ask yourself |
|---|---|---|---|
| 1 | **Foundation-model inference** | — this is the one everyone counts | Are evals, retries and fallbacks included? (See §5.) |
| 2 | **Cloud compute & storage** | It sits on a different invoice | Vector DB, embedding jobs, app hosting, queues |
| 3 | **Data-centre / facilities** | Only relevant self-hosted | Skip for API-only; dominant for DIY |
| 4 | **Networking & egress** | Invisible until a large-payload workload ships | Document ingest, multimodal, cross-region |
| 5 | **Embedded SaaS AI features** | Already being paid for elsewhere | AI seats in tools the client already licenses |
| 6 | **Engineering / MLOps / governance headcount** | Not a token cost, so not modelled | Prompt maintenance, eval curation, incident response, model migrations |
| 7 | **Data acquisition / licensing** | Assumed free | Corpora, annotation, labelled eval sets |
| 8 | **Shadow AI** | By definition unmeasured | Individual subscriptions and keys outside the platform |
| 9 | **Training / fine-tuning** | Deferred to "phase 2" | One-off training runs plus per-token serving premiums |

Two buckets deserve naming out loud in almost every engagement because they are the ones that turn a green
estimate red: **bucket 6** (a prompt is a maintained artifact, not a one-time write — model migrations alone
can consume weeks) and **bucket 8** (a per-team key inventory is the Crawl-stage FinOps deliverable precisely
because nobody has one).

**Evaluation spend belongs inside bucket 1 as its own explicit line, never folded into application inference.**
It can rival or exceed the app workload. See `references/eval-costs.md`.

---

## 5. Build models on measured tokens, never on sticker price

**The rule: sticker price is an input to a cost model. It is never the cost model.**

Three independent effects break naive per-MTok comparison, and they do not cancel:

**a) Tokenizer inflation (~30%).** Claude 5-era models — Opus 4.7+, Fable 5, Sonnet 5 — emit roughly 30% more
tokens for identical text than the 4.5 generation. A rate quoted against a 4.5-era token count behaves like a
materially higher one. (Sources: R1/R8 dossiers, as_of 2026-07-19, confidence **medium** — vendor-adjacent
reporting rather than a single primary page.)

**b) Tokens-per-task variation.** The same task on different models and harnesses consumes very different
token counts. One measured comparison put a Gemini CLI run at roughly 65% more input tokens than Claude Code
on the same task. (Confidence **low** — a single measured example. Design around the direction; do not quote
the magnitude.)

The arithmetic that follows is the whole point:

> A model 30% cheaper per token that burns 65% more tokens for the same task is **more expensive**.

**c) Prompt engineering swings token cost 5–10x.** Few-shot examples, retrieved context volume and output
verbosity move the token count by an order of magnitude — far more than any tier choice. (Source:
`finops.org/wg/cost-estimation-of-ai-workloads/`, 2025-09-15, confidence **high**.) Which means: **a cost model
is only valid for the prompt it was measured against.** Re-measure after any material prompt change, and say
so when you hand the model over.

### The measurement procedure

1. **Build a task fixture** — 20–50 representative real inputs, spanning the actual distribution including the
   long tail, not five happy-path examples.
2. **Run it against each candidate** with `scripts/compare-providers.mjs`.
3. **Capture provider-reported token counts.** Input, output, cache-read, cache-write, and thinking tokens
   separately. Never `chars/4` (AP-03). Never assume reasoning inclusion semantics — they differ by vendor and
   Gemini is the outlier (AP-13, `references/gemini.md` §4).
4. **Multiply by the dated rate** from `references/sota-snapshot.md`, having first run
   `scripts/check-prices.mjs` to confirm the rows are FRESH.
5. **Report real cost per task**, with the distribution — median and p95, not the mean alone.

This procedure is also the durable answer to price volatility. When a rate changes — and one Sonnet 5 change
is already scheduled for 2026-09-01 — you re-run the script instead of re-litigating the decision from memory.

### Levers, with published effect sizes

Useful for framing an optimisation roadmap. All from FinOps Foundation working-group papers (2025-05-23 and
2026-06-03), confidence **medium** — these are aggregated practitioner ranges, not measurements of *your*
workload. Present them as "what teams typically achieve", never as a commitment.

| Lever | Reported saving | Notes |
|---|---|---|
| Model right-sizing / tiered routing | 40–90% | The largest structural lever. Tier spreads run 5–25x. |
| Prompt caching | 20–90% on cached tokens | Higher end where a large stable prefix repeats. Layout discipline is free. |
| Batch API | flat 50% | Universal across Anthropic, OpenAI, Google. Stacks with caching on Anthropic. |
| Token trimming / context management | 20–40% | Also improves quality more often than it hurts it. |
| RAG instead of long context | enables 5–10x smaller models | Second-order saving via tier reduction. |
| Semantic caching | budget for 20–45% real hit rate | Needs TTL + version invalidation, per-tenant scoping, false-positive monitoring. |

Note what is **not** a cost lever: fast/priority modes are a **latency purchase** at a multiple of standard
price, typically not batchable. Buying one is fine; calling it optimisation is not.

---

## 6. Presenting a defensible estimate to a client

### Structure

1. **The unit and the volume assumption, first and in the client's own vocabulary.**
   *"Per resolved support conversation, assuming ~6 turns and ~2,000 tokens of retrieved context per turn."*
   If the estimate is later wrong, it will almost always be because a volume assumption was wrong — so put
   the assumptions where they can be challenged, at the top, before anyone has anchored on a number.

2. **A range, never a point.** A single figure implies a precision you do not have and will be quoted back to
   you as a commitment.

3. **Three scenarios, sized by what actually drives the variance.** Volume and turns-per-session dominate;
   model choice is usually second.

   | Scenario | Driver | What it represents |
   |---|---|---|
   | Conservative | High turn count, low cache hit rate, escalation on most calls | What a bad month looks like |
   | Expected | Measured medians from the fixture | The planning number |
   | Optimised | Caching working, batch lane used, routing tuned | Achievable after ~1 quarter of tuning |

4. **The paired quality metric for each scenario** (§3). Without it the client buys the conservative scenario
   and asks why it costs so much, or buys the optimised one and gets the quality that goes with it.

5. **The uncertainty band, stated with its cause.** This is the credibility move. Say *why* it is wide, not
   just that it is:
   - Prices are dated and can change — one increase is already scheduled for 2026-09-01. Quote the `as_of`
     date next to the figure.
   - Turns per session and document length are product behaviours measured after launch, not before.
   - Cache hit rate depends on real traffic patterns; model 0% for the conservative case.
   - Any figure derived from an **UNVERIFIED** adapter or a `low`-confidence source is labelled as such — a
     confidently-stated unverified number is a build defect in this skill, and a professional one in a deck.

6. **What is out of scope**, using the nine buckets by name (§4).

7. **How the number will be kept honest.** Metering ships in the first commit; the ledger reconciles against
   the provider invoice monthly; the model is re-derived when a price row goes STALE. A client who hears
   "here's how we'll know if this estimate was wrong" trusts the estimate more than one who hears a bigger
   promise.

### Phrases to use, and to avoid

| Say | Not |
|---|---|
| "Between X and Y per conversation, most likely near Z, as of \<date\>" | "About X per conversation" |
| "This assumes ~6 turns; at 12 turns it roughly doubles" | "It scales linearly" |
| "Token spend is one of nine cost layers; here are the other eight" | "The AI costs X" |
| "That figure is third-party sourced and unverified" | (silence) |
| "We meter from day one and reconcile monthly against the invoice" | "We'll monitor it" |

### The maturity framing, honestly

The Foundation's Crawl / Walk / Run ladder is useful shorthand — Crawl: key inventory and basic visibility;
Walk: workload attribution and optimisation; Run: chargeback with policy enforcement. Two honest caveats when
you use it: the GenAI journey is **compressed** (teams jump to value governance far earlier than the classic
cloud path predicted), and **showback comes before chargeback, always** — departmental visibility without
moving money builds the optimisation behaviour that makes chargeback survivable. (Source:
`finops.org/wg/finops-for-ai-overview/`, updated 2026-02-17, confidence **high**.)

One structural fact to state early, because it shapes the architecture and therefore the estimate: **provider
invoices attribute at best to an API key or project.** They carry no concept of business unit, app, feature or
tenant. Per-customer or per-team cost is therefore something you *build* — a choke point that stamps
attribution tags, with cost derived downstream against a versioned price sheet. If the client wants
chargeback, that instrumentation is a line item, not an assumption. (Source:
`finops.org/wg/token-economics-saas/`, 2026-06-03, confidence **high**.)
