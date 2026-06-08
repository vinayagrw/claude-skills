---
name: markdown-craft
description: >-
  Author beautiful, modern, platform-aware Markdown — READMEs, docs, guides,
  changelogs, comparison pages, GitHub profiles, release notes — that use the
  full expressive range of GitHub-Flavored Markdown (centered hero headers,
  shields.io badges, > [!NOTE] alert callouts, <details> collapsibles, Mermaid
  diagrams, dark/light <picture> logos, aligned tables, task lists, footnotes,
  <kbd> keys, math) instead of a flat wall of text. Use this whenever the user
  writes, formats, beautifies, restructures, or "makes nice" any Markdown or
  .md file — a README, documentation, a guide, a comparison, a changelog, an
  announcement, or a GitHub profile — even if they only say "write up a readme
  for X", "format this doc", "make this look good on GitHub", or "turn these
  notes into a doc". Also use when downgrading rich Markdown to render safely
  on a stricter target (npm, PyPI, plain CommonMark).
---

# Markdown craft

Your job: turn the user's intent into a Markdown document that is **correct on its
target renderer, instantly scannable, and uses the medium's real expressive range** —
a doc that reads as *designed*, not a flat dump of paragraphs.

Markdown is a **rendered medium**, not plain text. The same three things make a doc good
as make a diagram good:

1. **It renders correctly on the target.** GitHub, GitLab, npm, PyPI, VS Code, and a bare
   CommonMark parser support *different* feature subsets. A `> [!NOTE]` that shows as a
   literal `[!NOTE]` blockquote on npm is a bug, not a flourish. Know the target first (§1).
2. **Its form carries meaning.** Hierarchy, alignment, badges, callouts, and tables let a
   reader grasp the structure in five seconds before reading a word. Walls of prose don't.
3. **It degrades gracefully.** Rich features fall back to something readable when a feature
   isn't supported, and the *content* survives even stripped to ASCII.

## Step 0 — Name the archetype, then build its canonical shape

Before typing any heading, decide **what kind of document this is** — each archetype has a
shape readers already expect, and matching it is most of the perceived quality. Finish the
sentence "this is really a ___" and reach for that skeleton:

| Archetype | It's really about… | Canonical spine |
|---|---|---|
| **Project README** | *should I use this, and how do I start?* | centered hero (logo + tagline + badges + nav) → one-liner → why → **quick start** → usage → features → contributing/license |
| **Guide / tutorial** | *walk me from zero to working* | goal up top → prerequisites → numbered steps with checkpoints → "you should now see…" → troubleshooting `<details>` |
| **Reference / API doc** | *look up one exact thing fast* | terse intro → ToC → flat sections per symbol, each with signature + params table + example → stable anchors |
| **Comparison / decision** | *which option, and why* | the verdict first → a feature matrix table → per-option pros/cons → a recommendation callout |
| **Changelog / release notes** | *what changed and does it affect me* | reverse-chronological → version headings → grouped (Added/Changed/Fixed/Removed) → ⚠️ breaking-change callouts |
| **Announcement / landing** | *make me care in 10 seconds* | bold hero → the hook → a visual (gif/diagram) → 2–3 benefit cards → one CTA |
| **GitHub profile** | *who is this person* | banner → short bio → tech badges → stats cards → pinned highlights |

Pick the archetype, then lay down its spine *before* prose. If the request spans two (a
README *with* a comparison table inside), nest the smaller one as a section.

## 1. Know your renderer — the iron rule

**The single most common failure is shipping a feature the target can't render.** Markdown
has no universal feature set; GitHub-Flavored Markdown (GFM) is the richest common dialect,
but publish targets strip different things. Confirm where this doc will live, then stay
inside that column:

| Feature | GitHub | GitLab | npm / PyPI | VS Code preview | Bare CommonMark |
|---|---|---|---|---|---|
| Tables, task lists, strikethrough (GFM core) | ✅ | ✅ | ✅ | ✅ | ❌ |
| `> [!NOTE]` **alert callouts** | ✅ | ⚠️ own syntax | ❌ literal text | ⚠️ ext-dependent | ❌ |
| **Mermaid** ` ```mermaid ` diagrams | ✅ | ✅ | ❌ | ⚠️ ext-dependent | ❌ |
| `<details>` / `<summary>` collapsibles | ✅ | ✅ | ⚠️ usually | ✅ | depends on HTML pass-through |
| Raw HTML subset (`<div align>`, `<img width>`, `<kbd>`, `<sub>`) | ✅ (sanitized) | ✅ | ⚠️ **much** stripped | ✅ | depends |
| `<picture>` dark/light auto-switch | ✅ | ⚠️ | ❌ | ⚠️ | ❌ |
| Shields.io / image **badges** | ✅ | ✅ | ✅ | ✅ | ✅ (they're just images) |
| Footnotes `[^1]` | ✅ | ✅ | ❌ | ⚠️ | ❌ |
| Math `$…$` / `$$…$$` (KaTeX) | ✅ | ✅ (different) | ❌ | ⚠️ | ❌ |
| Emoji shortcodes `:rocket:` | ✅ | ✅ | ❌ (use Unicode 🚀) | ⚠️ | ❌ |

**Practical rules that follow:**
- **Badges and Unicode emoji are the universal currency** — they're plain images and text,
  so they work *everywhere*, including npm/PyPI. Prefer Unicode 🚀 over `:rocket:` shortcodes
  unless you know the target expands them.
- **A package README (npm/PyPI) is a stripped target.** No Mermaid, no alerts, much HTML
  removed. Lead with badges + a code block; put diagrams as committed PNGs, not Mermaid.
- **When you use a GitHub-only feature, give it a graceful fallback** (see §4): an alert's
  text still reads fine as a blockquote; a `<picture>` needs a plain `<img>`/`![]()` inside
  it so non-supporting renderers show *something*.
- **When unsure of the target, ask or assume GitHub** (the common case) and say so at handoff.

The full, copy-pasteable recipe for every feature below lives in
[references/formatting-cookbook.md](references/formatting-cookbook.md) — **read it when you
author**; it has the exact syntax, the gotchas, and the per-renderer caveats.

## 2. The toolkit — features that do real work

Reach for these deliberately; each earns its place by making the doc *more scannable*, not
just more decorated. (Syntax + caveats for all of them: the cookbook.)

- **Centered hero header** — `<div align="center">` wrapping a logo (`<img width>`), an `#`
  title, a one-line tagline in **bold** or a `<sub>`, a row of badges, and a `·`-separated
  nav line of anchor links. This is the single highest-impact move for a README.
- **Badges (shields.io)** — encode *live status* at a glance: version, build, coverage,
  license, downloads, your own `for-the-badge` style flat chips. Group them on one line.
  Restraint: 3–6 that mean something beat a rainbow of twelve.
- **Alert callouts** — `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`,
  `> [!CAUTION]`. Use them to lift the one thing a reader must not miss out of the prose.
  One or two per page; a page of callouts is a page of noise.
- **Collapsibles** — `<details><summary>` to fold long output, optional config, FAQ answers,
  "show me the full example". Keeps the default view short while the depth stays one click away.
- **Mermaid** — a `flowchart`/`sequenceDiagram`/`gitGraph` in a fenced block renders as a
  real diagram on GitHub/GitLab with zero image files. Best for architecture, flows, states.
- **ASCII diagrams & trees** — box-drawing art (`┌─┐ ├ │`) in a plain code fence is the *one*
  diagram that renders identically **everywhere**, npm/PyPI included. Reach for it for file
  trees, layered stacks, and as the portable fallback when Mermaid won't render on the target.
- **Tables with alignment** — `:---`, `:--:`, `---:`. The most under-used quality lever:
  any time you're writing parallel prose ("X does A, Y does B, Z does C"), it's a table. When
  you need spanned cells, stacked content, or styling a Markdown table can't express, drop to a
  raw HTML `<table>` (`colspan`/`rowspan`) — but only then; pipes are more readable and portable.
- **Dark/light `<picture>`** — swap a logo by `prefers-color-scheme` so it looks right in both
  GitHub themes. Always nest a fallback `<img>`.
- **Smaller touches** — task lists `- [x]`; `<kbd>Ctrl</kbd>+<kbd>C</kbd>` for keys; footnotes
  `[^1]` for asides; `diff` code fences to show changes in red/green; `<sub>`/`<sup>`; a `<!-- -->`
  comment to leave editor notes that don't render.

## 3. The signature look — what separates crafted from default

The features are table stakes; **hierarchy, restraint, and scannability are the signature.**

- **Five-second test.** A reader skimming only the headings, badges, and bolded lead lines
  should understand what this is and where to go. If they can't, the structure is wrong —
  fix that before polishing prose.
- **One hero element.** A centered logo *or* a banner *or* a hero diagram — pick one focal
  point per page. Competing heroes cancel out.
- **Lead, don't bury.** First screen answers "what is this and why should I care" in one or
  two lines. Quick-start/TL;DR before the deep dive; details behind `<details>`.
- **Tabular over prose.** Parallel facts → a table. Options → a matrix. Steps → a numbered
  list with checkpoints. Reserve paragraphs for genuine narrative.
- **Consistent visual vocabulary.** If 🚀 means "getting started" once, it means it every
  time. Pick a small emoji set bound to section *roles* and reuse it; don't sprinkle randomly.
- **Whitespace and rhythm.** Blank line between blocks; `---` rules to separate major movements;
  don't run six H2s with no air. Generous spacing reads as considered.
- **Restraint.** One accent move, not ten. Distinctive ≠ noisy — a wall of badges, rainbow
  emoji, and five callouts in a row reads as *less* polished, not more.

## 4. Accessibility & portability — the floor

- **Real alt text** on every meaningful image (`![Coverage 98%](…)`, not `![](…)`); decorative
  images get empty alt. Badges should say what they show.
- **Don't rely on color or emoji alone** to carry meaning — pair the ✅/❌ with a word, since
  screen readers and stripped renderers may drop the glyph.
- **One `#` H1 per document**, then no skipped levels (don't jump H2→H4). The heading tree *is*
  the document outline and the anchor namespace.
- **Meaningful link text** — `[the install guide](…)`, never `[click here](…)`; matters for
  screen readers and for skimming.
- **Degrade to ASCII intact.** The content must survive with every emoji, badge, and HTML block
  stripped. If removing the decoration loses information, the information was in the wrong place.

## 5. Verify before you claim it's done — evidence, not assertion

The most damaging thing you can do is tell the user "done — it'll render great" without
checking, then have them open a README full of literal `[!NOTE]` text or a broken logo link.
**Evidence before claims, always:** don't write any success wording until you've run the checks
*this turn* and read the output.

Run the bundled linter on the file you wrote:

```bash
python scripts/lint_markdown.py <path-to-file>.md
```

It catches the failures that actually embarrass: more than one H1 or skipped heading levels,
**broken relative links and missing local images**, **unresolved `[#anchor]` table-of-contents
links**, malformed alert callouts (`> [!NOTES]` typos), **unbalanced `<details>`/`<summary>` or
code fences**, dangling reference-style links, and inconsistent table columns. ASCII `[OK]`/`[FAIL]`,
exit 0/1.

Before claiming completion, confirm **each** against real output — fix and re-run until clean:

1. **Linter is clean** — `[OK]`, 0 errors. Warnings are judgment calls; resolve or justify them.
2. **It renders on the target.** For anything non-trivial, actually preview it — render the
   Markdown to HTML (GitHub's preview, a local renderer, or VS Code) and *look*, especially at
   Mermaid, alerts, the hero block, and dark/light images. "Should render" is not evidence.
3. **The archetype reads.** Back to Step 0: does the five-second skim reveal what this is and
   where to go, in the right shape for its kind? If it degenerated into flat prose, lift it first.

Only then tell the user it's done: give the **file path as a clickable link**, name the target
renderer you wrote for, and call out which rich features need that target (so they don't paste it
somewhere it breaks).

## The distinctiveness bar — the real test before you ship

Correctness is the floor; **distinctiveness is the bar.** Run it honestly: *if this is just
headings + paragraphs + a couple of bullet lists, you've produced the baseline a plain editor
gives for free — go back and lift it.* For any substantial doc (a README, a guide), clear most:

- [ ] **Archetype shape** chosen deliberately and followed (Step 0), not a generic dump.
- [ ] A **hero / focal element** (centered header, banner, or hero diagram) — exactly one.
- [ ] **Badges** that encode real status, grouped and restrained.
- [ ] At least one **table or Mermaid diagram** doing explanatory work that prose would do worse.
- [ ] **≥1 alert callout** lifting the must-not-miss point out of the body.
- [ ] **Progressive disclosure** — quick-start/TL;DR up top, depth folded into `<details>`.
- [ ] A **consistent emoji/section vocabulary**, used as wayfinding, not confetti.
- [ ] **Renderer target named** and every rich feature supported there (or gracefully degraded).

## Correctness checklist (the floor — never skip)

- [ ] **Target renderer identified**; no feature used that it can't render (or it degrades — §4).
- [ ] **One H1**, no skipped heading levels; ToC anchors resolve to real headings.
- [ ] **All relative links and local images exist**; link text is meaningful.
- [ ] **Alerts** use a valid type and the exact `> [!TYPE]` form; **`<details>` has a `<summary>`**;
      code fences and HTML tags are balanced.
- [ ] **Tables** have consistent columns and a separator row; alignment markers intentional.
- [ ] **Verified, not assumed (§5):** ran `lint_markdown.py` *this turn*, saw `[OK]`, and previewed
      the render before any completion claim.
- [ ] Delivered as a clickable path with the target renderer named and rich-feature caveats noted.
