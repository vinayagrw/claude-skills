# Excalidraw style, palette & mode recipes

Table of contents:
1. The curated Excalidraw palette (exact hexes)
2. Font families & size scale
3. Sketch mode vs clean mode — field-by-field recipe
4. Signature "cool features" — recipes (frames, sticky notes, highlighter, hero path, legend)
5. Quick role → style cheat sheet

---

## 1. The curated Excalidraw palette

Use these exact values — they're Excalidraw's own quick palette, so the board looks
native. Each role pairs a **light `backgroundColor`** with a **saturated `strokeColor`**.

| Role | backgroundColor | strokeColor | use for |
|---|---|---|---|
| Primary / blue | `#a5d8ff` | `#1971c2` | the default service / main actor |
| Success / green | `#b2f2bb` | `#2f9e44` | stores, "done", happy path |
| Warning / yellow | `#ffec99` | `#f08c00` | decisions, attention, queues |
| Danger / red | `#ffc9c9` | `#e03131` | errors, external risk, "do not" |
| Accent / purple | `#eebefa` | `#9c36b5` | identity / auth / special |
| Neutral / ink | `#f1f3f5` or `transparent` | `#1e1e1e` (text), `#868e96` (frames) | infra, labels, regions |

Conventions:
- **Text** is almost always `strokeColor: #1e1e1e` on `transparent` background.
- **Frames** use a light grey stroke (`#868e96` / `#bbb`), transparent fill.
- **Highlighter** strokes use the *yellow* `#ffec99` (or any role colour) at `opacity ~40`.
- Bind a colour to a *role* and reuse it; the legend teaches it once.

---

## 2. Font families & size scale

`fontFamily`: **1** = hand-drawn (Excalifont/Virgil — the board's voice), **2** = normal
(Helvetica/Nunito — crisp deliverable), **3** = code (Cascadia — for code/JSON snippets).

`fontSize` scale: **16** small (body/labels) · **20** medium (node labels) · **28** large
(section headers) · **36** XL (board title). `lineHeight`: `1.25`.

- Title: fontSize 36, fontFamily 1.
- Node label: fontSize 20, fontFamily 1.
- Code snippet inside a note: fontFamily 3, fontSize 16.

---

## 3. Sketch mode vs clean mode

Apply one mode **consistently** across the whole board. The mode is a small set of field
choices — set them the same on every element.

### Sketch mode (brainstorm, wireframe, "rough it out") — the default
```
roughness:    1   (2 for very loose)
fontFamily:   1   (hand-drawn)
fillStyle:    "hachure"   (sketchy fill lines)  — or "cross-hatch"
strokeWidth:  1–2          (hero arrow 4)
roundness:    { "type": 3 } on rects, { "type": 2 } on arrows
angle:        a few notes at ±0.03 rad (~±2°) for a pinned-paper feel
arrows:       a mid bend point for a hand-drawn curve, e.g. [[0,0],[60,10],[160,0]]
spacing:      loose, organic — it should feel alive, not gridded
```

### Clean mode (architecture, "make it presentable", deliverable)
```
roughness:    0   (architect — near-straight lines)
fontFamily:   1 for charm, or 2 for a crisp corporate look
fillStyle:    "solid"
strokeWidth:  2   (hero arrow 4)
roundness:    { "type": 3 } on rects, { "type": 2 } on arrows
angle:        0 everywhere; snap notes to even columns/rows
arrows:       straight or a single right-angle bend; even gaps
spacing:      aligned columns, even gutters
```

Both modes keep the palette, frames, bound labels, a hero path, and (optionally) a
freedraw underline. **Sketch ≠ messy; clean ≠ lifeless.** Default to **sketch** when the
intent is ambiguous — it's what Excalidraw is loved for — and tell the user which you used.

---

## 4. Signature "cool features" — recipes

These are the moves that make a board read as *hand-made Excalidraw*, not a generic
export. Excalidraw has no gradients or animation, so these carry the personality.

**Titled frame (a region/lane/phase).** A `frame` with a `name`; children set
`frameId` to it. Cleanest way to label "these belong together".
→ see [element-schema.md](element-schema.md) §5.

**Sticky-note node.** A coloured rectangle (palette role) + a **bound text label** + a
leading emoji. Always wire both halves of the binding (note `boundElements` ⇄ text
`containerId`). → §2/§3 of element-schema.

**Highlighter swipe.** A `freedraw` stroke, `strokeColor #ffec99`, `strokeWidth ~18`,
`opacity ~40`, a roughly horizontal squiggle placed *behind* a key note (earlier in the
`elements` array) — marker-on-whiteboard emphasis. → §6 of element-schema.

**Hand-drawn circle / underline.** A `freedraw` loop around the "you are here" node, or a
wavy underline beneath the title. Low-effort, high-charm.

**Hero path.** The one most important arrow at `strokeWidth 4`, darker `strokeColor`
(`#1e1e1e`), bound at both ends; every other arrow at `strokeWidth 1–2`. The eye lands on
it first.

**Dashed annotation rail.** Cross-cutting concerns (auth, audit, store) as `strokeStyle
"dashed"` arrows or notes off the main axis, so "the spine" and "the things that touch it"
read apart.

**Legend note.** A neutral note listing the colour roles and line styles, so the reader
decodes the board once. A small `rectangle` + bound multi-line text, or a few stacked
text lines with tiny colour swatches (small rectangles).

**Code/JSON chip.** A note with `fontFamily 3` text for an endpoint or payload — keeps
code legible against the hand-drawn body.

---

## 5. Quick role → style cheat sheet

| You're drawing… | shape | bg / stroke | extra |
|---|---|---|---|
| Main service / app | rectangle | `#a5d8ff` / `#1971c2` | bound label + emoji |
| Data store / "done" | rectangle or ellipse | `#b2f2bb` / `#2f9e44` | 🗄️ |
| Decision / gate | diamond | `#ffec99` / `#f08c00` | yes/no arrows out |
| Error / external risk | rectangle | `#ffc9c9` / `#e03131` | 🚫 / ⚠️ |
| Identity / auth | rectangle | `#eebefa` / `#9c36b5` | 🔐, dashed arrows |
| Actor / user | ellipse | `transparent` / `#1e1e1e` | 👤 above it |
| Region / lane | frame | — / `#868e96` | `name` = region title |
| Emphasis behind a node | freedraw | `#ffec99`, opacity 40 | strokeWidth ~18 |
| Hero flow | arrow | — / `#1e1e1e` | strokeWidth 4, bound |
| Cross-cutting concern | arrow | — / role colour | strokeStyle dashed |
