# Gemini runtime guidance

Gemini is this skill's **default runtime provider** (see `SKILL.md` and `templates/config/llm.ts`). That
choice was made deliberately and against one piece of contrary evidence — the cheapest tier at the current
cross-provider floor is not Gemini's — so the reasons matter and are stated below rather than assumed.

This file covers what you need to *bill Gemini correctly and cheaply at runtime*. For the Gemini CLI as a
dev-time coding assistant, see `references/claude-code-costs.md`. For every dollar figure, see
`references/sota-snapshot.md` — no prices appear here, only relative statements and status.

Everything below is dated. Where sources conflict, the conflict is stated rather than resolved by picking a
side.

---

## 1. Model tiers, by name and status

Status is the load-bearing column, not price. A **Preview** SKU can be withdrawn without a deprecation window;
two fast modes were pulled within eight weeks in mid-2026 and a consumer CLI product line was retired outright.

| Model | Class | Status | Runtime role |
|---|---|---|---|
| `gemini-3.1-pro` | Flagship | **Preview** | Not usable in a default path. Long context (1M). |
| `gemini-3-pro` | Flagship | GA | Widest context (2M). Long-context work only. |
| `gemini-3.5-flash` | Workhorse | **GA** — made the platform default 2026-05-19 | **The quality-sensitive escalation tier** in the shipped chain. |
| `gemini-3-flash` | Workhorse | **Preview** | Materially cheaper than 3.5 Flash. Attractive, and disqualified — see §2. |
| `gemini-3.1-flash-lite` | Budget | **GA** | **The shipped primary.** Cheapest GA tier. Classification, extraction, routing, bulk. |
| `gemini-2.5-pro` | Prior gen | GA | Legacy compatibility only. |
| `gemini-2.5-flash` | Prior gen | GA | Legacy compatibility only. |
| `gemini-2.5-flash-lite` | Prior gen | GA | Cheapest text model in the lineup; prior-generation quality. |

Source: `ai.google.dev/gemini-api/docs/pricing`, page last updated 2026-07-09, fetched 2026-07-19.
Confidence: **high** (primary vendor page).

**The naming trap.** "Flash" no longer means "cheap". `gemini-3.5-flash` costs roughly 3x `gemini-3-flash`
per token in both directions — a *newer* Flash that is *more* expensive than the Flash it succeeded. Any cost
model that treats "Flash" as a price class rather than a product name is wrong. Pin exact versioned ids.
(Same source, same date, confidence high.)

**Nano Banana image models** bill per *image token* at rates one to two orders of magnitude above text output.
Irrelevant to most work and a genuine budget trap the moment multimodal output is enabled without a cap.
(Same source, confidence high.)

---

## 2. The rule: no default path may depend on a Preview SKU

`gemini-3-flash` is meaningfully cheaper than the GA workhorse and would be the obvious default on price
alone. It is Preview. The shipped default does not use it, and this is the skill applying its own AP-14 to
itself: defaulting a production template to a SKU the vendor can withdraw without notice is precisely the
failure the skill teaches you to avoid, and the 2026 record shows it is not hypothetical.

Concretely:

- **Primary, escalation and failsafe tiers must all be GA.** Preview SKUs may appear in an experiment, an
  eval sweep, or an explicitly-overridden config — never in the chain a shipped app falls back through.
- **The cheaper Preview option is documented, not hidden.** You can switch to it in one line in
  `templates/config/llm.ts`. Do it with eyes open, and write the withdrawal risk into whatever cost model you
  hand a client.
- **Pin the versioned id, never a floating alias.** An alias re-points on the vendor's schedule; your cost
  model does not re-point with it. Record the *served* model returned in the response alongside the requested
  one — a nonzero drift rate means your cost model describes a system you do not have.

---

## 3. Context caching: implicit vs explicit

Source: `ai.google.dev/gemini-api/docs/caching`, updated 2026-07-07, fetched 2026-07-19. Confidence: **high**.

**Implicit caching** is on by default for all 2.5+ models with no code change and **no write surcharge and no
storage fee**. Google passes savings through automatically when a request hits cache. Cached tokens are
reported in the usage payload (`total_cached_tokens`), which is the only proof a hit occurred — never assume.

This is a genuine structural advantage over Anthropic, where cache *writes* carry a surcharge and you must
place explicit markers. On Gemini, correct prompt layout is the entire technique.

**When implicit applies — and the cliff below which it silently does nothing.** There is a minimum prefix
length. Below it, caching no-ops with no error and no signal other than a zero in the usage field:

| Model family | Minimum prompt tokens for a cache hit |
|---|---|
| Gemini 3.5 Flash, 3.1 Pro Preview | ~4,096 |
| Gemini 2.5 series | ~2,048 |

(Same source, same date, confidence high.) A short system prompt plus a short user turn will never cache. If
your workload sits just under the threshold, padding the stable prefix with genuinely useful content — a
richer schema, few-shot examples, a fuller instruction block — can pay for itself; padding it with filler
cannot.

**How to maximise hit rate** (identical discipline to Anthropic, which is why it is worth learning once):
- Stable content **first**: system prompt, tool definitions, schema, retrieved corpus.
- Volatile content **last**: user turn, timestamp, request id, session id. A UUID before the prefix boundary
  destroys the entire prefix.
- Send similar-prefix requests **close together in time** — caches expire.

**Explicit caching** — creating a named cache object with a TTL — still exists for the classic
`generateContent` API but is **not supported in the newer Interactions API**. Google is steering everyone to
implicit. Use explicit only when both are true: (a) you are on the classic API, and (b) the same large prefix
is reused often enough per hour to beat the hourly storage fee, which implicit caching does not charge. Below
roughly a handful of hits per hour per cache, explicit caching *loses money* relative to doing nothing. Work
the arithmetic with the current storage rate from `references/sota-snapshot.md`; the break-even moves when the
rate does.

**Cached-token pricing** sits at roughly a tenth of standard input, comparable to Anthropic's cache-read
multiplier — but without Anthropic's write surcharge. (Same source, confidence high.)

---

## 4. Reasoning tokens: Gemini bills them ADDITIVELY

**This is the single most important billing fact in this file.** Get it wrong and you undercount output cost
by the entire thinking budget — silently, with no error, producing confident wrong numbers.

Verified against five primary vendor API references on 2026-07-19. Confidence: **high**.

| Provider | Inclusion semantics | Billable output |
|---|---|---|
| **Gemini** | **Sibling addend** — `thoughtsTokenCount` is reported *alongside* `candidatesTokenCount`, not inside it | `candidatesTokenCount + thoughtsTokenCount` |
| Anthropic | Nested breakdown inside the output count | `outputTokens` (adding reasoning again double-bills) |
| OpenAI | Nested breakdown inside the output count | `outputTokens` |
| Bedrock | Normalises reasoning to `null`, not `0` | `outputTokens`; treat `null` as *unknown*, not *none* |

So the majority convention is nested, and **the skill's default provider is the outlier**. A cost function
written for "everyone else" and applied to Gemini reports an output cost missing every thinking token — which
on a reasoning-heavy workload can be most of the output.

**What ships as a result:**

- `reasoningInOutput` is an **explicit per-adapter flag**, never a uniform assumption. A single uniform cost
  function is wrong for half the providers under either choice, so there is no "safe default" to pick.
- Two mirror-image invariants in `templates/adapters/usage-invariants.test.ts`, and both **fail loudly** rather than defaulting:
  - `reasoningInOutput: true` -> assert `reasoningTokens <= outputTokens`.
  - Gemini -> assert `promptTokenCount + thoughtsTokenCount + candidatesTokenCount === totalTokenCount`.
- `null` (not reported) is distinguished from `0` (reported as none), so a reasoning-share metric on Bedrock
  says "unknown" instead of confidently saying 0%.

**Operational corollary.** Thinking bills as output, and output is the expensive direction on every Gemini
tier. Thinking budget is therefore a first-class cost lever: cap it, or disable it, for mechanical work
(extraction, classification, reformatting, routing) where reasoning buys nothing. Enable it deliberately for
the calls that were escalated *because* they are hard.

See `references/adapters.md` for the full usage-field mapping table and the never-subtract-twice rule.

---

## 5. The >200k context pricing cliff on Pro tiers

Gemini Pro tiers price in **two bands** by prompt size. Above roughly 200k input tokens, both input and output
rates step up — input roughly doubles, output steps up materially. Flash and Flash-Lite tiers do not have this
cliff. Claude 5-era models price 1M context flat, with no band at all.

Source: `ai.google.dev/gemini-api/docs/pricing`, updated 2026-07-09, fetched 2026-07-19. Confidence: **high**
for 3.1 Pro Preview and 2.5 Pro. **Unverified**: whether the same surcharge applies uniformly across all 3.x
Pro variants — this was left as an open question in the research pass and is *not* confirmed. Do not state it
as fact; check the live pricing page before quoting it to a client.

**Why this matters more than it looks.** It can invert the whole "Gemini is cheaper" conclusion for exactly
the workload people reach for Gemini to do — whole-repo analysis, long-document processing, large-corpus RAG.
A job that sits at 250k tokens per call on a Gemini Pro tier may cost more than the same job on a flat-priced
Claude model, despite Gemini's lower headline rate.

**What to do:**

1. **Route on context length, not just task type.** Add a threshold check before the model choice: if the
   assembled prompt exceeds the band boundary, re-price both candidates before committing.
2. **Prefer trimming to paying the band.** Retrieval, chunking or summarisation that keeps the prompt under
   the boundary is usually cheaper than the surcharge, and often produces better output.
3. **Flash-Lite and Flash have no cliff** — for bulk work at large context, the budget tier is doubly correct.
4. Model the cliff in `scripts/compare-providers.mjs` scenarios; a projection that assumes one flat rate for a
   long-context workload is wrong in the expensive direction.

---

## 6. Free-tier quotas — conflicting sources, treat with care

Free-tier quota is the **least reliable** area in this file. Sources conflict, the vendor stopped publishing
some numbers, and one widely-cited figure is launch-era. Everything in this section is labelled accordingly.

| Auth path | Cost | Reported quota | Confidence |
|---|---|---|---|
| Google account (Code Assist for individuals) | Free | 1,000 model requests/user/day | **medium** — vendor doc, but see caveats |
| Unpaid Gemini API key | Free | 250 model requests/day, **Flash model only** | **low** — conflicts with a separately-reported 1,500 RPD figure; unresolved |
| Vertex AI express mode | Free 90 days | Account-specific, variable | low |
| Paid API key / Vertex billing | Metered | Dynamic shared quota, no fixed cap | high |

Sources: `geminicli.com/docs/resources/quota-and-pricing/` and `docs.cloud.google.com/gemini/docs/quotas`,
both live 2026-07-19; `ai.google.dev/gemini-api/docs/rate-limits`, updated 2026-07-03.

**The caveats that matter more than the numbers:**

- **The 250-vs-1,500 free-API-key conflict is unresolved.** It was flagged in the research pass and never
  reconciled against a primary page. Do not quote either figure as fact.
- **The famous "60 requests/minute" figure is launch-era** (vendor blog, 2025-06-25) and no longer appears in
  current docs. The rate-limits page now publishes no fixed per-model free-tier tables at all, directs users
  to a dashboard, and states that limits "are not guaranteed". Confidence: **low** on any RPM number.
- **One prompt is not one request.** The vendor's own quota page warns that a single agentic prompt can spawn
  multiple model requests. A 1,000-request/day quota is emphatically not 1,000 prompts/day, and for agentic
  work the ratio can be several-fold.
- **On the free Google-account tier you do not control which model serves your request.** Under load the
  service silently falls back from Pro-class to Flash-class. For deterministic model choice — which is a
  precondition for a cost model that means anything — you need a paid API key or Vertex.
- Quotas reset at midnight Pacific.

**The FinOps conclusion.** Free tiers are a *dev-time* and *exploration* resource. Do not build a runtime cost
model, a client commitment, or a capacity plan on a quota that is undocumented, non-deterministic in model
selection, and subject to change. If the app matters, it runs on a paid key.

---

## 7. Higher tokens-per-task: why the sticker price misleads

One measured comparison put a Gemini CLI run at roughly 432K input tokens against Claude Code's ~261K for the
same task — about 65% more. Source: third-party comparison articles, 2026. Confidence: **low** — a single
measured example, not a benchmark. Treat the *direction* as worth designing around and the *magnitude* as
indicative only.

The arithmetic is unforgiving and generalises well beyond this one data point:

> A model 30% cheaper per token that consumes 65% more tokens for the same task is **more expensive**.

Two independent effects break naive per-MTok comparison, and they push in opposite directions across vendors:
tokens-per-task variation (this section), and **tokenizer inflation** — Claude 5-era models emit roughly 30%
more tokens for identical text than the 4.5 generation, so an Anthropic rate behaves worse than it reads
against an older baseline (R1/R8 dossiers, as_of 2026-07-19, confidence: medium).

**Therefore:** never decide a provider from a price table. Run `scripts/compare-providers.mjs`, which executes
a fixed task fixture against each candidate, captures **provider-reported** token counts, and multiplies by the
dated rate from the snapshot to give real cost per task. That is also the only method that stays correct when
prices move — and one price move is already scheduled for 2026-09-01. When it lands, re-run the comparison
rather than re-arguing from memory.

---

## 8. The runtime cost notice (why the template warns at startup)

The user chose to keep Gemini as the default **after** being shown that the current cheapest-tier floor across
providers is not Gemini's, and that Gemini reportedly burns more tokens per task. That is a legitimate choice —
implicit caching with no write surcharge, a strong budget tier, wide context, and one vendor relationship are
real advantages — but it is a choice that should stay visible rather than calcify into an unexamined default.

So `templates/config/llm.ts` emits a **once-per-process, non-fatal** startup notice naming the configured
default model, its current per-MTok rates, and the cheapest tier in the price sheet, so the tradeoff appears in
the logs rather than only in documentation.

Constraints on that notice, which follow from the skill's core invariant that **instrumentation must never
break the response path**:

- It **never throws** and never blocks startup.
- It logs **once per process**, not per call.
- It **degrades gracefully**: if the price sheet is stale, it says so and prints the staleness rather than the
  rate; if the configured model is unlisted, it says "unlisted" rather than substituting a default rate (that
  substitution is AP-07, the silent-mispricing anti-pattern).

---

## 9. Quick decision rules

- **Default to `gemini-3.1-flash-lite`** (cheapest GA tier) for classification, extraction, routing, tagging
  and bulk transforms. Most calls in most apps are this shape.
- **Escalate to `gemini-3.5-flash`** when the call is tagged quality-sensitive — user-facing prose, chat,
  anything a client reads verbatim. Escalate on a tag, not on a guess.
- **Escalate cross-vendor** (Anthropic Sonnet-class) for hard reasoning and correctness-critical work; then
  the Claude Code CLI failsafe (subscription, near-zero marginal cost); then deterministic zero-cost output.
  Cross-vendor escalation is accepted here — but pin the choice for the life of a session, because switching
  mid-conversation destroys the cache prefix (AP-11).
- **Cap or disable thinking** for mechanical work. Thinking bills as output, additively, on this provider.
- **Batch anything with no human waiting.** The batch lane is a flat discount across all Gemini models.
- **Check context length before choosing a Pro tier.** The band boundary can invert the comparison.
- **Never build a plan on the free tier.** Non-deterministic model selection and undocumented limits.
