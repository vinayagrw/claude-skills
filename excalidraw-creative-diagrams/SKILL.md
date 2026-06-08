---
name: excalidraw-creative-diagrams
description: >-
  Author expressive, genuinely creative, fully-editable Excalidraw diagrams
  (.excalidraw scene files) from any input — a design doc, spec, architecture
  description, API flow, brainstorm, wireframe, or a one-line idea. Plays to
  Excalidraw's hand-drawn whiteboard identity: sketchy roughness, the Excalifont
  hand lettering, hachure fills, the curated Excalidraw colour palette, sticky-note
  clusters, titled frames, bound text labels, hand-drawn bound arrows, and
  freedraw highlighter accents — with a switchable "sketch" (loose, brainstorm)
  vs "clean" (tidy, deliverable) house style. Also drives Excalidraw's expressive
  layer: draw-on / keyframe animation (animated SVG / GIF via excalidraw-animate &
  Excalimate), elbow arrows, frames-as-presentation-slides, clickable element links
  & hyperlinks, live embeds, crowfoot arrowheads, and the Mermaid-to-Excalidraw text
  path. Use this whenever the user wants an Excalidraw diagram, a whiteboard sketch,
  a wireframe, an animated hand-drawn diagram, or says "make an excalidraw", "sketch
  this", "whiteboard this", "animate this excalidraw", "diagram this in excalidraw",
  even if they only paste a doc and ask for a hand-drawn figure. Output is always a
  ready-to-open .excalidraw file. (For draw.io / .drawio output or in-file flow
  animation, use the drawio-creative-diagrams skill instead.)
---

# Creative Excalidraw diagrams

Your job: turn the user's intent into an `.excalidraw` scene that is **correct,
instantly importable, and full of Excalidraw's hand-drawn charm** — a board that
feels like a thoughtful person sketched it on a whiteboard, not a sterile export.

Three things make an Excalidraw scene *good*:
1. **It's structurally valid** — imports into excalidraw.com / the editor on the first
   try, with every binding intact (labels stick to boxes, arrows follow shapes).
2. **It carries meaning in its form** — colour, grouping, frames, and hand-drawn line
   weight encode information, so the reader gets the system before reading a label.
3. **It stays editable** — real Excalidraw elements with live bindings, never a
   flattened image, so the user can grab a box and the arrows follow.

## Step 0 — Read for the intention, then choose a metaphor that *performs* it

Before any elements, do the most important step: **understand what the source is
really trying to say, then invent a visual structure that demonstrates that idea in a
cool, almost self-explaining way.** A diagram that merely lists components is a wiring
chart; a diagram whose *shape* dramatizes the central insight is the one people
remember. The creativity lives in the framing, not the colours.

1. **Name the one thing.** Finish "this is really about ___." A handoff doc is *really
   about* who controls the live call; a rate-limiter is *really about* a gate that fills
   and drains; an onboarding flow is *really about* the moments a user can drop off.
2. **Pick a metaphor / layout that enacts it** — a pipeline → left-to-right rail with
   checkpoints; a decision → a fan-out from one hot node; layers → stacked frames;
   a loop/lifecycle → a ring; a comparison → parallel columns; "a thing that bypasses
   the system" → draw that path physically going around the box.
3. **Pick the mode** (see §3). Brainstorm / ideation / wireframe / "rough it out" →
   **sketch mode**. Architecture you'll present / "make it clean" → **clean mode**.

Only once you know *what shape tells this story* do you start emitting elements.

## 1. The scene skeleton (non-negotiable)

An `.excalidraw` file is a single JSON object. Get this shell exactly right or it
won't import:

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [ /* every shape, arrow, and text, in draw order */ ],
  "appState": { "viewBackgroundColor": "#ffffff", "gridSize": null },
  "files": {}
}
```

Every element shares a base shape. The fields that *must* be present and correct are
`id`, `type`, `x`, `y`, `width`, `height`:

```json
{
  "id": "box-api", "type": "rectangle",
  "x": 200, "y": 120, "width": 200, "height": 90, "angle": 0,
  "strokeColor": "#1971c2", "backgroundColor": "#a5d8ff",
  "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
  "roughness": 1, "opacity": 100,
  "groupIds": [], "frameId": null, "roundness": { "type": 3 },
  "seed": 482014, "version": 12, "versionNonce": 991823, "isDeleted": false,
  "boundElements": [ { "type": "text", "id": "t-api" } ],
  "updated": 1, "link": null, "locked": false
}
```

Read [references/element-schema.md](references/element-schema.md) for the **exact field
list per element type** (rectangle/ellipse/diamond, text, arrow/line, frame, freedraw)
and copy-paste skeletons. Read it when you author — getting bindings right is the whole
game.

### Hard rules (break these and bindings/render fail)

- **Unique `id`** on every element. Bindings are by id; a reused id silently corrupts.
- **`x`/`y`/`width`/`height` are numbers** on every element.
- **Bindings are bidirectional — both halves or it breaks** (this is the #1 mistake):
  - A **label inside a box**: the *text* has `"containerId": "box-api"`, **and** the
    *box* lists it: `"boundElements": [{ "type": "text", "id": "t-api" }]`. Miss the
    second half and the label floats free instead of sticking.
  - An **arrow between boxes**: the *arrow* has `"startBinding": {"elementId":"box-a","focus":0,"gap":4}`
    and `"endBinding": {...}`, **and** each box lists the arrow:
    `"boundElements": [{ "type": "arrow", "id": "arr-1" }]`. Miss it and the arrow
    won't follow the shape when it's moved.
- **Arrows/lines need a `points` array, ≥2 points, relative to the element's `x,y`** —
  e.g. `"points": [[0,0],[160,0]]`. The element `x,y` is the first point's anchor.
- **`seed` and `versionNonce` are integers.** Vary them per element (any integers;
  derive from the index so you don't need randomness) — identical seeds make identical
  jitter, which looks copy-pasted.
- Excalidraw fills missing optional fields with defaults on import, but **don't rely on
  it for the fields above** — they're what the validator errors on.

Always **validate before delivering** — see §5.

## 2. The signature look — make it *obviously* an Excalidraw board

The Excalidraw *editor* renders a **still, gradient-free** board — its charm is the
hand-drawn line, not gradients. But the file is far from static: it's the input to an
animation ecosystem (draw-on + keyframe → animated SVG/GIF) and supports elbow arrows,
clickable links, embeds, and frames-as-slides (see **Animation & cool features** below).
Lean into all of it, or you'll produce a flat boxes-and-arrows chart that happens to be
sketchy. The house-style spine:

1. **A hand-lettered title** — a large `text` element (fontSize 28–36, fontFamily 1) as
   the board's header, optionally underlined with a **freedraw** stroke for that
   marker-on-whiteboard feel.
2. **Sticky-note nodes, not bare rectangles.** Each primary node is a coloured note
   (semantic `backgroundColor` from the palette) with a **bound text label** and a
   leading emoji. Colour is bound to a *role* and reused, so the reader learns it once.
3. **Titled frames for regions.** Group a cluster (a subsystem, a lane, a phase) inside
   a named `frame` — the frame's title is the region label. Frames are Excalidraw's
   cleanest way to say "these belong together".
4. **One hero path.** Draw the single most important flow as a **bolder, darker arrow**
   (strokeWidth 4) so the eye lands on it; keep the rest thin. An identical-arrows
   diagram does no explanatory work.
5. **A side rail of annotations** — cross-cutting concerns (identity, store, audit) as
   **dashed** callout arrows or notes off the main axis.
6. **Freedraw accents** — a highlighter swipe (thick stroke, low opacity yellow) behind
   a key node, a hand-drawn circle around the "you are here", a wavy underline. These are
   the moves that read as *hand-made* and that a generic export never has.
7. **A legend** note decoding the colour roles and the line styles.

You don't need all seven on a three-box sketch — scale to the subject. For anything with
≥4 nodes, hitting 1–5 is what separates skill-made from default. The **distinctiveness
bar** at the end is the explicit test.

The **Excalidraw curated palette** (use these exact hexes — light fill + saturated
stroke per role; full table + recipes in
[references/style-and-modes.md](references/style-and-modes.md)):

| Role | backgroundColor | strokeColor |
|---|---|---|
| Primary / blue | `#a5d8ff` | `#1971c2` |
| Success / green | `#b2f2bb` | `#2f9e44` |
| Warning / yellow | `#ffec99` | `#f08c00` |
| Danger / red | `#ffc9c9` | `#e03131` |
| Accent / purple | `#eebefa` | `#9c36b5` |
| Neutral / ink | `#f1f3f5` (or transparent) | `#1e1e1e` |

## 3. Sketch mode vs clean mode (switchable house style)

Excalidraw can be a loose brainstorm *or* a tidy deliverable. Decide from the intent
(Step 0) and apply the mode **consistently across the whole board** — mixing them looks
accidental. The difference is a handful of fields:

| | **Sketch mode** (brainstorm, wireframe, "rough it out") | **Clean mode** (architecture, "make it presentable") |
|---|---|---|
| `roughness` | `1` (or `2` for very loose) | `0` (architect — near-straight lines) |
| `fontFamily` | `1` (hand-drawn) | `1` for charm, or `2` (normal) for a crisp deliverable |
| `fillStyle` | `hachure` (sketchy lines) or `cross-hatch` | `solid` |
| `strokeWidth` | `1`–`2` | `2`, hero `4` |
| corners | `roundness {type:3}`, allow a slight `angle` (±2°) on a few notes | `roundness {type:3}`, `angle 0`, snap to a tidy grid |
| arrows | a mid bend-point for a hand-drawn curve | straight or single right-angle bend |
| spacing | loose, organic | aligned columns/rows, even gutters |

Both modes still use the same palette, frames, bound labels, and a hero path. **Sketch
≠ messy** and **clean ≠ lifeless** — clean mode keeps `fontFamily 1` and a freedraw
underline if you want the board to still feel like Excalidraw. When unsure which mode,
default to **sketch** (it's what people reach for Excalidraw to get) and say so.

## Animation & cool features — Excalidraw's expressive layer

The static editor shows a still board, but the `.excalidraw` file feeds a small ecosystem
that brings it alive, and the format has high-impact features well beyond boxes-and-arrows.
Reach for these the way the drawio skill reaches for flow animation: to **show motion and
carry meaning**, not as gimmicks. Full field reference + recipes in
[references/animation-and-features.md](references/animation-and-features.md).

**Animation (draw-on + keyframe).** Two routes, both consume your `.excalidraw`:
- **excalidraw-animate** (`https://dai-shi.github.io/excalidraw-animate/`) — "draws on" each
  element stroke-by-stroke **in `elements` array order**. You control the reveal sequence
  by *ordering the array in narrative order* (title → spine left-to-right → organs → legend).
  Exports an **animated SVG** (screen-capture for GIF/WebM).
- **Excalimate** (`https://excalimate.com`) — a full keyframe timeline (opacity, position,
  scale, draw-progress, camera pan/zoom), exports **MP4 / WebM / GIF / animated SVG / Lottie**,
  with an MCP server for AI-driven animation.

  Like draw.io animation inside a PNG, **the plain editor doesn't play it** — deliver the
  `.excalidraw` and tell the user to load it into the animator (or hand over the exported
  animated SVG/GIF). Author *for* it: keep the `elements` array in the order you want things
  to appear — that ordering is the lever, so build front-to-back along your story.

**Elbow arrows** — `"type":"arrow","elbowed":true` (keep `roughness:0`). Smart orthogonal
routing that bends at 90° and re-routes when shapes move. The **clean-mode default** for any
spine/flow — fewer crossings, no manual bend points.

**Crowfoot arrowheads** — `"endArrowhead":"crowfoot_many"` (also `crowfoot_one`,
`crowfoot_one_or_many`) for ER / cardinality. Full set: arrow, bar, circle(_outline),
triangle(_outline), diamond(_outline), dot, crowfoot_one / _many / _one_or_many.

**Frames as presentation slides** — each `frame` is a slide; Excalidraw's *presentation mode*
walks frame→frame. Stacking regions as frames (as this skill already does) means the board
doubles as a deck for free.

**Element links & hyperlinks** — every element has a `link` field:
- External: `"link":"https://…"` — a clickable hyperlink (jump to the TDR, a runbook).
- Internal nav: `"link":"https://excalidraw.com/?element=<targetId>"` — clicks through to
  another element/frame when opened on excalidraw.com (e.g. an overview chip → its detail
  frame). Host-matched, so it navigates inside the editor.

**Live embeds** — `"type":"embeddable","link":"<url>"` drops a live web pane on the board
(YouTube, a Figma frame, a CodeSandbox, a webpage). `"type":"iframe"` for raw iframes.

**Images** — `"type":"image"` with a `fileId` into the top-level `files` map (a base64 dataURL).

**Mermaid → Excalidraw** — for a standard flow / sequence / ER / class diagram the user will
keep editing as text, generate **Mermaid** and convert it via *Insert ▸ Mermaid* on
excalidraw.com (the Mermaid-to-Excalidraw tool), which yields native, fully-editable
Excalidraw elements — not an image. The Excalidraw analog of the drawio Mermaid path.

> All of these are ordinary fields (`elbowed`, `link`, `type`, `customData`) —
> `validate_excalidraw.py` accepts them. When you use animation, say in the hand-off that it
> plays in excalidraw-animate / Excalimate (or as the exported animated SVG/GIF), not in the
> plain editor.

## 4. Anti-overlap & layout discipline — keep it readable

The fastest way to look broken is an arrow slicing through a box, or two notes colliding.
Excalidraw won't auto-route for you, so place deliberately:

- **Leave air:** ≥40px between sibling notes, ≥60px between rows. Crowding reads as a
  collision even when nothing technically overlaps.
- **Route arrows around obstacles.** If an arrow would pass over a third note, add a mid
  **bend point** to `points` (e.g. `[[0,0],[80,0],[80,120],[200,120]]`) so it goes around.
  Bind both ends so it still tracks the shapes.
- **Bound text fits its box.** A label longer than its note wraps, but size the note for
  it — don't let a one-line note hold three lines of text.
- **Group intentional clusters** with a shared `groupIds` value (or a `frame`) — the
  validator treats grouped/framed shapes as deliberate and won't flag them as collisions.
- **Full containment is fine** (a note inside a frame, a label inside a note). The bug is
  *partial* overlap (two notes half on top of each other) and *arrows crossing unrelated
  notes*. The validator's QUALITY pass flags exactly those.
- Establish a **flow axis** (left→right or top→bottom) and keep primary arrows moving
  along it; annotations and stores go to the side.

## 5. Verify before you claim it's done — evidence, not assertion

The most damaging thing you can do is tell the user "done — it's valid" without checking.
A scene that won't import, or whose labels float off their boxes, breaks trust instantly.
So **evidence before claims, always**: do not write any success wording until you've run
the checks *in this turn* and read the actual output. "Should import" is not evidence.

Run the bundled validator. It catches malformed JSON, bad/duplicate ids, non-numeric
geometry, linear elements without points, **bindings that reference missing elements,
and broken bidirectional bindings** (the label-floats-free / arrow-won't-follow bug), plus
a **QUALITY pass** for colliding shapes and arrows crossing unrelated notes.

```bash
python scripts/validate_excalidraw.py <path-to-file>.excalidraw
```

Before claiming completion, confirm **each** against real output — fix and re-run until
clean:

1. **Validator is clean** — prints `[OK]` with **0 errors and no QUALITY warnings**, and
   no "binding doesn't list … back" warnings (those mean a label or arrow will detach).
2. **Bindings are whole** — every bound label has both halves; every bound arrow is listed
   on both shapes. The validator's bidirectional check is your proof.
3. **The intention reads** — look back at Step 0: does the shape dramatize the one thing,
   in the chosen mode, consistently? If it degenerated into bare boxes, lift it first.

Only then tell the user it's done. Give the **file path as a clickable link** and how to
open it (drag the `.excalidraw` onto excalidraw.com, or *Menu ▸ Open*), note the mode you
chose, and briefly call out the visual encoding (what the colours / frames / line-weights
mean and what metaphor the layout uses) so they can read it — and edit it.

## The distinctiveness bar — the real test before you ship

Correctness is the floor; **distinctiveness is the bar**. Run it honestly: *if this is
just coloured rectangles + arrows, you've produced the baseline, not skill-made work — go
back and lift it.* For any board with ≥4 nodes, clear most of these:

- [ ] **Hand-lettered title** (large text, fontFamily 1), ideally with a freedraw underline.
- [ ] Nodes are **coloured sticky-notes with bound labels + emoji**, palette bound to roles.
- [ ] **≥1 titled frame** grouping a region (or clear `groupIds` clusters).
- [ ] **One hero path** stands out (bolder/darker arrow); other arrows are thinner.
- [ ] **≥1 freedraw accent** (highlighter swipe, hand-drawn circle, underline) — the move
      a generic tool can't make.
- [ ] Cross-cutting concerns on a **dashed side rail**, off the main axis.
- [ ] **Legend** decoding colour roles and line styles.
- [ ] Mode (sketch / clean) chosen deliberately and applied **consistently**.
- [ ] Expressive layer used where it fits: **elbow arrows** for clean spines, **draw-on
      order** so it animates in excalidraw-animate, **element links** for clickable nav,
      embeds / crowfoot / frames-as-slides. If it's a "live"/flow story, plan the animation.

## Correctness checklist (the floor — never skip)

- [ ] Top-level `type:"excalidraw"`, `elements` is a list, `appState` + `files` present.
- [ ] All ids unique; every element has numeric `x/y/width/height`; types are known.
- [ ] **Every bound label and bound arrow has BOTH halves** (containerId/startBinding +
      the matching `boundElements` entry).
- [ ] Arrows/lines have a `points` array (≥2 points, relative to x,y); routes don't cross
      unrelated notes (add bend points).
- [ ] `seed`/`versionNonce` are varied integers; one mode applied consistently.
- [ ] Palette is semantic and reused; **one** hero path.
- [ ] **Verified, not assumed (§5):** ran `validate_excalidraw.py` *this turn*, saw `[OK]`
      with no QUALITY warnings and no broken-binding warnings, before any completion claim.
- [ ] Delivered as a clickable path with a one-paragraph read-me of the visual encoding.
