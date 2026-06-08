# TDR template (fill-in skeleton)

Copy this into `<topic>-design.md`, fill it in, then produce the `-confluence.md` ASCII copy. Replace `{{...}}`. Delete any section that genuinely doesn't apply rather than leaving it empty. Scale each section to the complexity of the decision — short is good.

Status lozenges used throughout: `🟢 DECIDED` · `🔵 PROPOSED` · `🟡 OPEN` · `⚪ DEFERRED`.

---

```markdown
# 🧩 TDR-{{NNN}} · {{Title}}

---

## 0. Page properties

| Field | Value |
|---|---|
| **Doc type** | Technical Design Record (TDR) |
| **Status** | 🔵 `PROPOSED` |
| **Author** | {{name/email}} |
| **Created** | {{YYYY-MM-DD}} |
| **Target release** | {{milestone / version}} |
| **Jira / tracker** | {{link}} |
| **Relates** | {{related docs}} |

---

## 1. Decision log

> ✅ **Decision (this TDR):** {{the headline decision in one sentence}}

| # | Decision | Status | Rationale (short) |
|---|---|---|---|
| D1 | {{decision}} | 🟢 `DECIDED` | {{one line}} |
| D2 | {{decision}} | 🔵 `PROPOSED` | {{one line — link to §9 if open}} |

---

## 2. Summary (TL;DR)

> 📌 **In one paragraph.** {{What is broken / needed, the chosen approach, and the outcome. A reader should be able to stop here and know the decision.}}

---

## 3. Context & problem statement

{{Why this is on the table now. The system/feature in scope. The concrete gap(s) that force a decision — be specific, name the real symptom.}}

> ⚠️ **The gap(s) that make this urgent**
> - **Gap 1 — {{name}}.** {{what's wrong, observably}}
> - **Gap 2 — {{name}}.** {{deeper issue}}

### 3.1 {{Why the naive fix isn't enough}} (optional)

{{A small worked example showing why the obvious approach fails. Tables here MUST be top-level, not inside the callout, for Confluence.}}

---

## 4. Goals & non-goals

| ✅ Goals | 🚫 Non-goals |
|---|---|
| {{goal}} | {{explicitly out of scope}} |

---

## 5. Current state

{{How it works today, grounded in real code — name the files/types/endpoints you read. If greenfield, say so.}}

**{{e.g. Today's flow:}}**

```
{{ASCII/text sketch or short transcript of current behaviour}}
```

---

## 6. Proposed design

> ✅ **{{Approach name}}.** {{One-paragraph statement of the chosen approach.}}

```mermaid
flowchart TB
    {{master diagram — replace with ASCII in the -confluence.md copy}}
```

### 6.1 {{Key flow}} (optional sub-flows)

{{Sequence or detail diagram + prose.}}

> ⚠️ **{{Any safety/gating note.}}**

---

## 7. Detailed design

{{The concrete contracts. GROUND THESE IN REAL CODE. Payloads, schemas, type shapes, field-by-field mappings. Mark anything proposed with (confirm).}}

### 7.1 {{Target contract A}}
```jsonc
{{verified shape}}
```

### 7.2 {{Mapping / table / schema}}

| {{from}} | {{to}} | {{logic}} |
|---|---|---|
| ... | ... | ... |

---

## 8. Alternatives considered

| Dimension | **A — {{chosen}}** | B — {{alternative}} |
|---|---|---|
| {{axis}} | {{...}} | {{...}} |

> 💡 **Why not B?** {{the disqualifying trade-off, in one or two sentences}}

---

## 9. Open questions

Each open question gets a proposed direction and an owner — an open question with no proposed answer is a TODO, not a decision input.

| # | Question | Status | Proposed direction | Owner |
|---|---|---|---|---|
| Q1 | {{question}} | 🟡 `OPEN` | {{recommendation}} | {{who}} |

### 9.1 {{Q1 — deeper design}} (optional, when a question deserves real architecture)

{{Recommendation + small diagram + rationale.}}

---

## 10. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| {{risk}} | Med | High | {{mitigation}} |

---

## 11. Rollout / milestones

1. **M1 — {{first shippable slice}}.** {{what it closes}}
2. **M2 — {{next}}.**
3. **M3 (later) — {{deferred}}.**

---

## 12. References & glossary

| Term | Meaning |
|---|---|
| {{term}} | {{definition}} |

---

## 13. Low-level details still to specify (implementation gap audit)   [full-rigor only]

> 📌 This TDR is **design-complete** but not **build-complete**. The items below are what an implementer still needs. Priority: 🔴 blocks the first milestone · 🟠 blocks its milestone · 🟡 polish.
>
> ✅ The 🔴 blockers are specified inline in §14.

### 13.1 {{Area, e.g. API & contracts}}
| # | Missing detail | Pri |
|---|---|---|
| L1 | {{e.g. exact request/response for endpoint X}} | 🔴 |
| L2 | {{...}} | 🟠 |

{{Repeat 13.2, 13.3, … grouped by area: persistence, external calls, mapping specifics, cross-cutting (auth/tenancy/idempotency), frontend, testing.}}

---

## 14. Sub-specs for the 🔴 blockers   [full-rigor only]

> ℹ️ Concrete contracts for the items that block the first milestone. Shapes follow the project's conventions. Field names are normative unless marked *(confirm)*.

### 14.1 {{e.g. API contracts (L1)}}
```jsonc
// Request / Response with real field names
```

### 14.2 {{e.g. Persistence (L7) — table schema}}
| Attribute | Type | Notes |
|---|---|---|
| ... | ... | ... |

### 14.3 {{e.g. a validate/repair or state-machine loop}}
```
{{ASCII flow in the -confluence.md copy; mermaid in the master}}
```
```
