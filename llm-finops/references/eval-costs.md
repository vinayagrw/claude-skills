# Evaluation spend as its own budget line

Evaluation is not free telemetry. Every LLM-as-judge call is a paid inference call, billed the same way your
application's calls are, and it is the cost line most likely to be discovered rather than planned.

**The headline finding: naive eval can rival or exceed the application workload it measures.** For agentic
apps — an agent session of hundreds of LLM calls, multiplied by a three-to-five-metric eval stack — eval spend
has been reported reaching roughly **10x the baseline autonomous agent workload**. (Source:
`galileo.ai/blog/scaling-judge-compute-ai-evaluation`, 2026-07-06, confidence **medium** — a vendor blog with
a commercial interest in the claim; the order-of-magnitude framing is corroborated by the per-assessment costs
below, the specific 10x figure is not independently verified.)

Typical judge cost runs to **cents per assessment, spanning roughly an order of magnitude** — see the dated
per-assessment range in `references/sota-snapshot.md` (source: Langfuse LLM-as-a-judge docs, fetched
2026-07-19, confidence **medium** — vendor documentation, stated as a typical range rather than measured).
Multiply that by span volume before deciding it is a rounding error.

So: **eval gets its own line in the budget, its own ledger surface, and its own cap.** Not a footnote under
"inference". No dollar figures appear below; every rate lives in `references/sota-snapshot.md`.

---

## 1. The governing principle

> **Compute must match consequence.**

Do not run a frontier agentic judge on a greeting. Do not run the cheapest possible classifier on a financial
transaction. This is the same rule that governs runtime routing in this skill, applied to the eval layer —
which is why it is worth stating once and reusing.

It has a corollary that most teams get backwards: the expensive decision is not *which* judge, it is *how many
things get judged by a model at all*. Most eval questions do not need a model.

---

## 2. The deterministic-first pyramid

Three tiers. Work top-down, and only fall to the next tier when the one above genuinely cannot answer the
question.

```
                  ┌───────────────────────────────┐
   Tier 3         │  Frontier judge               │   escalation + release gates only
   rare           │  (cascade escalation, gates)  │   ~100x tier-2 input cost
                  ├───────────────────────────────┤
   Tier 2         │  Cheap-tier judge             │   sampled + risk-weighted
   sampled        │  (Flash-Lite / Haiku class)   │   batched + cached rubric
                  ├───────────────────────────────┤
   Tier 1         │  Deterministic assertions     │   100% of cases
   everything     │  ZERO LLM cost                │   run first, always
                  └───────────────────────────────┘
```

### Tier 1 — deterministic checks, free, on everything

Run these on 100% of cases. They cost nothing but CPU, they are perfectly reproducible, and in practice they
catch the majority of real regressions — because most real regressions are structural, not subtle.

The promptfoo assertion taxonomy makes the tier concrete (source: promptfoo docs, page dated 2026-07-18,
confidence **high** — the tool's own reference):

- **String / structural:** contains, not-contains, regex, starts-with, exact match.
- **Format validators:** is-json, is-sql, is-xml, schema conformance.
- **Cost and latency assertions** — fail a case when cost-per-call exceeds a threshold. This is the tier-1
  check that makes cost a *test failure* rather than a monthly surprise. Ship it.
- **Classic overlap scores:** ROUGE, BLEU, METEOR, Levenshtein.
- **Custom JS/Python:** your domain invariants.
- **Embedding-only metrics:** answer similarity, context entity recall — near-free.

Two domain-specific tier-1 checks worth building because they replace expensive judges outright:

- **Citation validity** — cited ids ⊆ the allow-list you supplied. This is a grounding check with zero judge
  tokens. The reference project computed a RAGAS-style faithfulness F1 deterministically this way and paid no
  judge cost at all for its headline quality metric.
- **Schema and required-field completeness** for extraction — no judge can tell you more than the schema
  already does.

**The rule:** if a deterministic check can answer it, a model must not be asked. Every judge call that a regex
could have replaced is pure waste, and it is *slower* and *less reproducible* too.

### Tier 2 — cheap-tier judges, sampled

Flash-class and Haiku-class models for span-attached scoring. The spread between the cheapest usable judge
(budget tier, batched) and a frontier judge is roughly **100x on input tokens** — model choice is the single
biggest eval-cost lever, larger than sampling rate. (Source: vendor pricing pages fetched 2026-07-19,
confidence **high** for the rates; the ratio is derived arithmetic.)

Sampling design — and the argument against naive sampling:

- A **sampling percentage** on the evaluator (5% is a common documented example) plus filters on trace name,
  tags, user id and metadata. Prefer **observation-level** evaluators (seconds) over trace-level (minutes) to
  avoid backlogs. (Source: Langfuse docs, fetched 2026-07-19, confidence **medium**.)
- Layer **a small random fraction plus targeted oversampling of high-risk routes**, and treat the resulting
  scores as statistical estimates with uncertainty rather than facts. (Source: qaskills offline-vs-online
  guide, 2026, confidence **low** — single practitioner source.)
- **The counterpoint, and it is a good one:** naive sampling makes you stop seeing tail failures, which is
  exactly where agentic risk concentrates. For agentic workloads, *cheap-judge-on-everything plus
  frontier-on-escalation* beats *frontier-on-a-sample* at comparable cost and much better coverage. (Galileo,
  2026-07-06, confidence **medium**.)

Resolve those two positions by workload shape: **sample** simple, high-volume, low-consequence surfaces;
**cheap-judge everything with escalation** on agentic and high-consequence surfaces.

### Tier 3 — frontier judges, rare and deliberate

Reserve for: escalated borderline verdicts from the cascade (§4), release gates, and periodic calibration of
the cheap judges against a small gold set. Never as the default scorer, never on everything.

Three-judge **ensembles** are the expensive end — reported to reach Cohen's kappa around 0.95 against mid-0.6
for a single judge, at a 3x cost multiplier. Buy that agreement only where the consequence justifies it.
(Galileo, 2026-07-06, confidence **low** — single source.)

---

## 3. Metric choice is a cost decision

Not all quality metrics cost the same, and the expensive ones are not always the informative ones.

- **RAGAS faithfulness = 2 LLM calls per sample** — one to extract claims from the answer, one to verdict each
  claim against context. Output-token cost scales with the **number of claims**, so long answers are
  disproportionately expensive. (Sources: RAGXplain arXiv 2505.13538; RAGAS docs. Confidence **high** — the
  call structure is documented.)
- **Answer Correctness** is the most token-hungry classic metric (detailed breakdown plus classification).
- **Token-efficient alternatives exist and are officially positioned as such:** Response Groundedness gives a
  raw score with far fewer tokens than Faithfulness's per-claim reasoning; Context Relevance is cheaper than
  Context Precision/Recall. (Source: `docs.ragas.io` NVIDIA metrics, seen 2026-07-19, confidence **medium** —
  observed via search, direct fetch was rate-limited.)
- **Answer Similarity and Context Entity Recall are embedding-only** — effectively free. Promote them into
  tier 1.

Practical caps that hold across metric choices (source: qaskills RAGAS guide, 2026-05-01, confidence **low** —
single practitioner source, but the advice is uncontroversial):

- Cap judge prompts at roughly **4,000 input tokens** per example. Most metrics work fine within it.
- **Temperature 0** for reproducibility — a nondeterministic judge makes every regression ambiguous and buys
  you a re-run.
- Prefer **a single judge call over a multi-step judge chain**. Chains multiply cost for modest gains.

---

## 4. Judge-cost cascades

A cascade routes every item to the cheapest judge and escalates **only low-confidence or borderline verdicts**
to a frontier judge. It is the structural pattern that makes cheap-judge-on-everything affordable.

```
  every item
      │
      ▼
  ┌─────────────────────┐   confident pass/fail   ┌────────────┐
  │ cheap-tier judge    │ ──────────────────────► │  verdict   │
  │ (batched, cached    │                         └────────────┘
  │  rubric, temp 0)    │
  └─────────┬───────────┘
            │ borderline / low confidence  (target: a small single-digit %)
            ▼
  ┌─────────────────────┐
  │ frontier judge      │ ──► verdict + calibration signal for the cheap tier
  └─────────────────────┘
```

**Reported effect: 60–80% reduction in eval bills** for teams that wire a cascade, against frontier-on-
everything. Frontier-on-everything at high span volume reaches five-to-seven-figure monthly bills. (Source:
`futureagi.com/blog/best-llm-judge-models-2026/`, 2026, confidence **low** — vendor blog, single source. Treat
the direction as sound and the percentages as marketing-adjacent.)

**Design notes that decide whether it works:**

- **The escalation rate is the whole economic model.** If more than a small single-digit percentage escalates,
  the cheap judge's rubric is under-specified or the confidence signal is miscalibrated — fix that before
  blaming the pattern. Instrument the escalation rate as a first-class metric.
- **Give the cheap judge a decisive rubric.** Small judges (<10B) *degrade* with complex prompts and
  chain-of-thought, while large judges *benefit* from examples and CoT — so the rubric that works for your
  frontier judge is the wrong rubric for your cheap one. Write two. (Source: arXiv 2501.17178, Jan 2025 —
  **flagged as over six months old**; methodology still current, confidence **medium**.)
- **Small tuned judges can beat large prompted ones.** A 1.5B domain-tuned judge has been reported
  outperforming a 120B prompted judge on domain-specific evaluation, and a well-prompted small judge
  outperforming previously fine-tuned 70B judges. If your eval volume is large and your domain narrow, a tuned
  small judge is a real option. (Sources: Galileo 2026-07-06; arXiv 2501.17178. Confidence **low**.)
- **Calibrate.** Periodically send a sample of *confident* cheap-judge verdicts to the frontier judge too. A
  cascade whose cheap tier has silently drifted is a cascade that stopped evaluating.

**Stack the discounts — this is where the real reduction comes from, and it is not controversial:**

1. **Cache the rubric.** The rubric plus few-shot block is byte-identical across thousands of calls — the
   ideal caching target. Anthropic bills cache hits at a fraction of input; Gemini caches implicitly with no
   write surcharge. Put the rubric first and the item under evaluation last (AP-04).
2. **Batch everything.** Judges are not latency-sensitive by definition, so the flat batch discount available
   from all three major vendors applies cleanly to offline eval.
3. **On Anthropic these stack**, driving a judge call's marginal input cost toward a small fraction of base.
4. **Cache results, not just prompts.** Re-running an unchanged eval should cost zero — see §5.

---

## 5. CI controls: how unchanged evals cost nothing

CI is where eval spend quietly becomes continuous. Four controls, in order of how much they save:

**a) Disk cache keyed on a content hash.** Cache API responses keyed on a hash of prompt files plus config
(e.g. `hashFiles('prompts/**', 'promptfooconfig.yaml')`), with a 24h TTL. Effect: **a PR that does not touch
prompts re-runs the eval suite for zero API cost.** This is the single highest-leverage CI control and it is
roughly six lines of workflow YAML. (Source: promptfoo CI/CD docs, page dated 2026-07-18, confidence **high**.)

**b) Path filters.** Run eval workflows only when prompt files, eval configs or the model-facing code actually
change. A README typo must not trigger a judge run. Same source, same confidence.

**c) Tiered cadence — small on PR, full nightly.**

| Stage | Suite size | Judge tier | Lane | Gate |
|---|---|---|---|---|
| **PR** | 20–30 cases | Deterministic + cheap-tier only | Sync (latency matters) | Pass-rate threshold (e.g. ≥95%) + cost/latency assertions |
| **Nightly** | 200+ cases | Deterministic + cheap + cascade escalation | **Batch** (50% off) | Trend + regression alert |
| **Release** | Full + security scan | Frontier gate on critical routes | Batch where possible | Hard gate |

(Case counts: qaskills RAGAS guide, 2026-05-01, confidence **low**. Cadence structure: promptfoo CI/CD docs,
2026-07-18, confidence **high**.)

**d) Fail the build on cost, not just quality.** Tier-1 cost assertions belong in the PR gate. A prompt change
that triples token consumption at constant quality is a regression, and this is the only place it gets caught
before production.

**Offline is where batch belongs.** Nothing in a nightly eval needs synchronous latency. Every offline eval
run on the sync API is paying double for nothing.

---

## 6. Platform metering is its own cost line

Eval platforms meter you too, and this line is routinely omitted from estimates because it arrives on a
different invoice.

- **Braintrust** meters *scores* (a free monthly allowance, then per-thousand).
- **LangSmith** meters *traces* (a free allowance, then per-thousand).
- **Langfuse** free tier includes a storage allowance plus a capped number of evaluation runs; Pro is a
  monthly seat/plan fee.

(Sources: Braintrust/Morph comparison articles, 2026. Confidence **low** — third-party comparison content; the
exact Langfuse Pro tier was flagged as conflicting between sources and is **unverified**. Rates are in
`references/sota-snapshot.md`; re-check the vendor page before quoting any of them.)

The FinOps consequence: **a cheap-judge strategy that multiplies score volume can increase your platform bill
while decreasing your token bill.** Model both. Scoring 100% of spans with a free judge is not free if your
platform charges per score.

---

## 7. Offline vs online: build in this order

1. **Offline regression suite first** — 30–50 hand-written cases covering the real input distribution
   including the tail. Deterministic assertions on all of them. This is your ratchet, and it costs nothing to
   run.
2. **Online sampling second** — a low sampling rate, one judge rubric, plus cheap heuristics on everything.
3. **Cascade escalation third**, once you have enough verdicts to calibrate a confidence threshold.
4. **Ensembles and frontier gates last**, and only on the surfaces where consequence justifies them.

(Source: qaskills offline-vs-online guide, 2026, confidence **low** — single practitioner source, but the
sequencing is consistent across the other sources here.)

**Detection latency is the trade you are making.** Offline sampled eval surfaces a regression in the next
batch, not on the turn it happened. That is an acceptable trade for most workloads and an unacceptable one for
high-consequence routes — which is precisely why those routes get cheap-judge-on-everything instead of
sampling.

---

## 8. Wiring eval into the ledger

Eval spend must land in the **same ledger** as application spend, on its own surface, so it is visible in the
same `summarize()` output rather than living in a separate spreadsheet nobody opens.

- **Surface labels:** `eval:ci`, `eval:nightly`, `eval:online-sample`, `eval:judge-escalation`. Per-stage
  labelling matters as much here as in the app (AP-06) — "the eval suite is expensive" is not actionable;
  "the escalation tier is 70% of eval spend" is.
- **Its own budget envelope.** A per-agent envelope is enforced in every budget mode including `advisory` —
  and a runaway eval loop is exactly the case that envelope exists for.
- **Report eval spend as a percentage of application spend** in `summarize()`. That single ratio is the number
  that tells you whether the pyramid is working. If it climbs above the share you budgeted, the fix is almost
  always "too much is reaching tier 2 or 3", not "the judge model is too expensive".
- **Present it separately to clients.** In the nine-bucket TCO (`references/unit-economics.md` §4), eval is an
  explicit line inside foundation-model inference, never folded silently into per-conversation cost. A client
  who learns later that quality assurance was excluded from the estimate will not be reassured that it was
  technically in a different bucket.
