---
name: drawio-creative-diagrams
description: >-
  Author polished, genuinely creative, fully-editable draw.io / diagrams.net
  diagrams (.drawio files) from any input — a design doc, TDR, spec, architecture
  description, API flow, data table, or a one-line idea. Goes beyond plain
  boxes-and-arrows by using draw.io's expressive features: gradient-filled lanes,
  embedded HTML-table labels, a semantic colour system, swimlane/container
  grouping, meaning-bearing edge styles (control vs data vs identity paths),
  legends, and — where they fit better — embedded Mermaid or CSV-driven
  generation. Use this whenever the user wants to diagram, visualise, draw, map
  out, or "make a draw.io" of anything — architecture, flowchart, sequence, ER,
  org chart, state machine, network — even if they only say "diagram this",
  "visualise this spec", "turn this doc into a picture", or paste a document and
  ask for a figure. Output is always a ready-to-open .drawio file.
---

# Creative draw.io diagrams

Your job: turn the user's intent into a `.drawio` file that is **correct, instantly
openable, and visually expressive** — a diagram a staff engineer would be happy to
paste into a design review, not a sterile grid of identical rectangles.

Three things make a draw.io diagram *good*:
1. **It's structurally valid** — opens in draw.io on the first try, every time.
2. **It carries meaning in its form** — colour, grouping, and line style encode
   information, so the reader understands the system before reading a single label.
3. **It stays editable** — real shapes and text, never a flattened image, so the
   user can tweak it.

## Step 0 — Read for the intention, then choose a metaphor that *performs* it

Before any cells, before picking a path, do the most important step: **understand what
the source is really trying to say, then invent a visual structure that demonstrates that
idea in a cool, almost self-explaining way.** A diagram that merely lists the components
is a wiring diagram; a diagram whose *shape* dramatizes the central insight is the thing
people remember. This is where the creativity lives — not in the colours, in the framing.

Work it in three quick beats:

1. **Name the one thing.** Read the doc and finish the sentence "this is really about
   ___." A handoff TDR is *really about* who controls the live call and how audio bypasses
   the orchestrator. A rate-limiter spec is *really about* a gate that fills and drains.
   An ETL job is *really about* a river with checkpoints. Find that spine first.
2. **Pick a metaphor / layout that enacts it.** Let the structure carry the message before
   any label is read:
   - a **pipeline / river** → a strong left→right axis with checkpoints on it
   - **control vs. data planes** → two stacked bands, the data plane thick and animated,
     the control plane dashed above it
   - a **state machine** → a ring or orbit, not a column
   - a **decision / triage** → a fan-out from one hot node
   - **layers / tiers** → nested gradient bands, depth = altitude
   - **a thing that bypasses the system** (the surprising insight) → draw that path
     *physically going around* the orchestrator, thick and animated, so the eye catches
     the exception immediately.
   The right metaphor makes the diagram legible at a glance and makes the "aha" visible.
3. **Decide what should move.** Animation (§A.5b) is part of the storytelling: the live
   path should *flow*. Plan which flows animate while you're still choosing the layout,
   not as an afterthought.

Only once you know *what shape tells this story* do you drop down to choosing a path and
emitting cells. Spend the thinking here; the rest is execution.

## Pick the authoring path first

Most diagrams → **Path A (hand-authored mxGraph XML)**. It's the most expressive and
the only path that supports gradients, HTML-table labels, nested containers, and
custom edge semantics. Reach for B or C only when they're genuinely a better fit.

| Situation | Path |
|---|---|
| Architecture, system, infra, mixed-shape, "make it look great", anything bespoke | **A — mxGraph XML** (default) |
| A plain flowchart / sequence / ER / state / gantt the user will keep tweaking as text | **B — embedded Mermaid** |
| Many near-identical nodes from tabular data (org chart, inventory, host list) | **C — CSV import block** |

You can also **combine**: an XML canvas with a Mermaid shape embedded in one corner is valid.

When unsure, default to **A** — it never blocks you on a feature.

---

## Path A — hand-authored mxGraph XML (the creative default)

### A.0 The signature look — make it *obviously* designed

A modern model will, unprompted, produce coloured boxes + arrows + a legend. That is the
**baseline**, and it is not the bar. The point of this skill is a recognisable house
style that reads as *deliberately composed* — so when someone opens your file they think
"someone designed this", not "a tool emitted this". For any **system / architecture /
flow / sequence-of-services** diagram, compose with this spine by default:

1. **A gradient banner header** across the top — title + a small subtitle/status line in
   a lighter tint. Anchors the page and sets the palette. (recipe in palette-and-recipes)
2. **A clear flow axis of "lanes", not bare boxes.** Each primary node is a gradient-
   filled lane with a **bold emoji-prefixed title** and a short *structured body*
   (1–4 lines: the endpoint, the steps, the key attribute) — `align=left;verticalAlign=top`.
   A lane carries information; a 120×60 rectangle with one word does not.
3. **One "hero" path.** Pick the single most important flow (the data/media path, the
   happy path, the money path) and draw it as a **thick accent edge** (e.g. orange
   `strokeWidth=4`) so the eye lands on it first. Everything else stays thin. A diagram
   where every edge looks identical is doing no explanatory work.
4. **A side rail for cross-cutting concerns** — identity, data stores, audit, external
   parties — placed *off* the main axis (a right-hand column), connected with dashed
   edges. This separates "the spine of the system" from "the things that touch it".
5. **At least one structured-data node** where the content is tabular — an HTML-`<table>`
   label (a request list, a config block, a mode/role matrix) embedded *inside* a node
   instead of as loose boxes. This is the single most distinctive draw.io move.
6. **A legend** decoding the colour roles and the line styles.
7. **Optional but high-impact:** a numbered stage rail (①②③ pills down the left edge)
   that turns a static picture into a *walkable sequence*; and consistent emoji glyphs
   for instant category recognition.

You don't need all seven on a three-box flowchart — scale to the subject. But for
anything with ≥4 components, hitting points 1–6 is what separates skill-made from
default. The **distinctiveness bar** at the end of this file is the explicit test.

Restraint is part of the style: **one** accent colour, the semantic palette for
everything else, generous whitespace, strong alignment. Distinctive ≠ noisy.

### A.1 The skeleton is non-negotiable

Every `.drawio` file is this shape. The cells `id="0"` and `id="1"` are the root and
the default layer — they are **always the first two cells** and are never rendered.
Every other cell sets `parent="1"` (or the id of a container).

```xml
<mxfile host="app.diagrams.net" agent="Claude">
  <diagram id="d1" name="Page-1">
    <mxGraphModel dx="1422" dy="820" grid="1" gridSize="10" guides="1" connect="1"
                  arrows="1" fold="1" page="1" pageScale="1"
                  pageWidth="1640" pageHeight="1180" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <!-- your shapes and edges go here -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

A **vertex** (box) and an **edge** (arrow) look like this:

```xml
<mxCell id="api" value="API" parent="1" vertex="1"
        style="rounded=1;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;">
  <mxGeometry x="200" y="120" width="160" height="60" as="geometry" />
</mxCell>
<mxCell id="e1" value="calls" parent="1" edge="1" source="api" target="db"
        style="html=1;rounded=1;endArrow=block;">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
```

### A.2 Hard rules (break these and the file fails to open)

These come straight from the format; treat them as invariants, not suggestions:

- **`0` and `1` first**, in that order. Everything else has a valid `parent`.
- **Unique `id`** on every cell. Reuse = silent corruption.
- **Every vertex has an `<mxGeometry ... as="geometry"/>` child** with x/y/width/height.
- **Edges** carry `edge="1"` and either `source`+`target` ids, or fixed
  `sourcePoint`/`targetPoint` inside their geometry (used for floating arrows, e.g.
  Mermaid-free sequence diagrams).
- **Coordinates snap to the 10px grid** (every x/y/width/height divisible by 10).
  Off-grid shapes look subtly broken and resist alignment.
- **Escape the label.** `value` is XML, so `&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`. With
  `html=1`, you then write HTML *as entities*: a bold tag is `&lt;b&gt;`. To show a
  literal `<` in the rendered label you need `&amp;lt;` — so **avoid literal angle
  brackets in label text**; use `[ ]` or `‹ ›` instead. This one bites hardest.

Always **validate before delivering** — see §A.7.

### A.3 The creative toolkit — make form carry meaning

This is what separates a memorable diagram from a default one. Detailed style strings,
the full palette, and copy-paste recipes live in
[references/style-reference.md](references/style-reference.md) and
[references/palette-and-recipes.md](references/palette-and-recipes.md) — read them when
you author. The essentials:

- **Semantic colour, not decoration.** Use the standard draw.io palette and bind each
  hue to a *role* (a service, a layer, a status), then reuse it consistently so the
  reader learns the legend once. The six base pairs:

  | Role | fillColor | strokeColor |
  |---|---|---|
  | Primary / default | `#dae8fc` | `#6c8ebf` |
  | Success / start | `#d5e8d4` | `#82b366` |
  | Warning / decision | `#fff2cc` | `#d6b656` |
  | Error / end / danger | `#f8cecc` | `#b85450` |
  | Neutral / infra | `#f5f5f5` | `#666666` |
  | External / 3rd-party | `#e1d5e7` | `#9673a6` |

- **Gradients + shadows for depth.** `gradientColor=#...;shadow=1;rounded=1;arcSize=6`
  turns a flat box into a lane that reads as a "surface". Use on the major containers.
- **HTML labels are your superpower.** With `html=1` a label can hold `&lt;b&gt;`,
  `&lt;font color='#...'&gt;`, line breaks `&lt;br&gt;`, and — the real unlock — a full
  `&lt;table&gt;`. Embed a mini data grid (a request table, a mode matrix, a config
  block) *inside* a node instead of scattering loose text. This is the single most
  under-used draw.io feature.
- **Containers group meaning.** Put related shapes inside a `swimlane` (a titled box)
  or draw a labelled backdrop rectangle behind a cluster. Grouping is information.
- **Edges should mean something.** Don't make every arrow identical. Encode the *kind*
  of connection in stroke colour, width, and dash:
  - control / signalling → thin solid, primary colour
  - data / media / heavy traffic → thick solid, a hot colour, to draw the eye
  - identity / auth / async → dashed
  - "reference / weak" → dotted, grey
  Then add a **legend** node decoding the line styles. A diagram that distinguishes a
  control path from a data path is doing real explanatory work.
- **Glyphs and stage markers.** A leading emoji (🔐 ☎️ ⚙️ 🗄️) gives instant
  category recognition. Numbered pill markers down a rail (①②③) turn a static picture
  into a walkable sequence.

### A.4 Layout discipline (so "creative" doesn't become "cluttered")

- Establish a **flow axis** (top→bottom or left→right) and keep every primary edge
  moving along it; cross-traffic (legends, stores, identity) goes to the side.
- Standard box ≈ `160×60`; major lanes wider. Leave **40–60px** between siblings
  horizontally, **80–120px** vertically — crowding reads as broken.
- **≤ ~40 cells per page.** Past that, split into a second `<diagram>` page rather than
  shrinking everything.
- Align everything to the grid and to each other; a shared left edge does more for
  perceived quality than any colour.

### A.4b Anti-overlap rules — no lines through boxes, no colliding shapes

The fastest way to make a diagram look broken is an edge slicing through a box, or two
shapes overlapping. draw.io's auto-router will, left to its own devices, send a
connector straight along a box's border or across the middle of an unrelated node. You
must route deliberately. These rules prevent it:

1. **Reserve gutters.** Keep a clear channel (≥80px) between the main spine and any side
   rail, and route spine↔side-rail edges *down the middle of that gutter* with explicit
   waypoints — **never onto a box's border**. If the spine's right edge is at x=900 and
   the side rail starts at x=1000, route the connecting edges at **x≈950**, not x=900.
2. **Pick exit/entry faces** with `exitX/exitY` + `entryX/entryY` so each edge leaves and
   enters the side that faces its target. A right-rail box should exit *left*; a box below
   should be entered from the *top*. This alone removes most loop-backs and crossings.
3. **Add waypoints to steer around obstacles.** If an edge would otherwise pass over a
   third box, give it `<mxPoint>` waypoints that take it into a gutter or above/below the
   obstacle. Don't rely on the auto-router for any non-adjacent connection.
4. **Entering a node inside a container** (e.g. one chip inside a conference box): come in
   from the nearest *outside* face and go straight in along an **empty margin** — do not
   traverse the container's interior across its other children. Routing along the empty
   strip *below* a row of chips, then turning up into the target, beats cutting across the
   row.
5. **Leave breathing room:** ≥40px clear around every box, ≥50px between stacked lanes
   (edges and their labels need that gap). Crowding reads as a collision even when nothing
   technically overlaps.
6. **Park labels in clear space.** An edge label sitting on top of another box looks like
   a bug. Shorten the label or nudge the edge so the label lands in open canvas.
7. **Don't stack parallel edges on one line.** Two edges between the same columns should
   use different entry points (`entryY=0.3` vs `0.7`) so they read as two flows.

**Nesting is allowed and good** — a small label/table/chip fully *inside* a larger lane is
intentional structure, not an overlap. The bug is *partial* overlap (two shapes half on
top of each other) and *edges crossing boxes they don't connect to*.

### A.5 A worked micro-example (control vs data path + HTML-table node)

This is the *pattern* to scale up — note the gradient lane, the embedded table, and the
two visually distinct edge types.

```xml
<mxCell id="web" value="&lt;b&gt;🖥️ Web&lt;/b&gt;&lt;br&gt;&lt;table cellpadding='3' style='font-size:11px'&gt;&lt;tr style='background:#1A56C4;color:#fff'&gt;&lt;td&gt;User&lt;/td&gt;&lt;td&gt;Act&lt;/td&gt;&lt;/tr&gt;&lt;tr&gt;&lt;td&gt;alice&lt;/td&gt;&lt;td&gt;join&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;"
        parent="1" vertex="1"
        style="rounded=1;html=1;whiteSpace=wrap;align=left;verticalAlign=top;spacingLeft=12;spacingTop=8;fillColor=#dae8fc;gradientColor=#c9dcfb;strokeColor=#6c8ebf;shadow=1;">
  <mxGeometry x="120" y="80" width="240" height="140" as="geometry" />
</mxCell>
<mxCell id="api" value="⚙️ API" parent="1" vertex="1"
        style="rounded=1;html=1;fillColor=#d5e8d4;gradientColor=#c5e0c4;strokeColor=#82b366;shadow=1;">
  <mxGeometry x="160" y="300" width="160" height="60" as="geometry" />
</mxCell>
<mxCell id="ctrl" value="control" parent="1" edge="1" source="web" target="api"
        style="html=1;rounded=1;endArrow=block;strokeColor=#6c8ebf;strokeWidth=2;">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="data" value="media (heavy)" parent="1" edge="1" source="web" target="api"
        style="html=1;rounded=1;endArrow=block;strokeColor=#e8732a;strokeWidth=4;exitX=1;exitY=0.5;entryX=1;entryY=0.2;">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
```

### A.5b Animation & interactive flourishes (the "cool features")

draw.io supports genuinely dynamic touches that make a diagram feel alive in the app and
in the interactive viewer/lightbox. Use them to **show motion and direction**.

- **Flow animation on edges** — `flowAnimation=1` makes the stroke "march" along the
  edge, visibly showing the direction of flow. This is the headline effect.
  **Animate every edge that represents something actually moving** — the request path, the
  media path, the identity token, the state write. In a "live system" diagram (anything
  about traffic, calls, streams, events, pipelines) a half-animated picture reads as
  half-finished: the reader wonders why some flows are frozen. Default to **animating the
  whole live story**, and create contrast with *weight and colour and dash*, not by
  leaving lines static:
  - **hero path** → thick + hot (`strokeWidth=4;strokeColor=#e8732a`) + `flowAnimation=1`
  - **primary spine** → medium (`strokeWidth=3`) + `flowAnimation=1`
  - **control / identity plane** → thin **dashed** + `flowAnimation=1` (the dashes march,
    which looks great and still reads as "secondary")
  The only edges you'd leave un-animated are ones that depict a *static relationship*
  rather than a flow — a "contains", "is-a", or pure legend connector. When in doubt on a
  live-system diagram, animate it. (A quick check after authoring: every `edge="1"` that
  carries a verb in its label should almost certainly have `flowAnimation=1`.)

  ```xml
  <mxCell id="flow1" parent="1" edge="1" source="a" target="b" value="request"
    style="html=1;rounded=1;edgeStyle=orthogonalEdgeStyle;endArrow=block;strokeColor=#1a56c4;strokeWidth=3;flowAnimation=1;">
    <mxGeometry relative="1" as="geometry" /></mxCell>
  ```

  An animated *hot* hero path: `strokeColor=#e8732a;strokeWidth=4;flowAnimation=1;`.
  Where animation renders: the draw.io **editor** and the **interactive viewer/lightbox**
  (and the embeddable `viewer.diagrams.net` GraphViewer). A flat **PNG/JPG export is a
  still frame** — animation won't show there. So when animation matters, deliver the
  `.drawio` (or an interactive HTML/SVG-lightbox), and say so.

- **Curved & smooth edges** — `curved=1` for flowing bezier connectors;
  `edgeStyle=orthogonalEdgeStyle;rounded=1` for clean rounded right-angles.
- **Line jumps at crossings** — `jumpStyle=arc;jumpSize=8` makes an edge hop over edges
  it crosses, so dense diagrams stay legible.
- **Surface effects** — `glass=1` (glassy sheen), `sketch=1` (hand-drawn look — a strong
  signature option if the user wants personality), `comic=1`, and
  `gradientDirection=north|south|east|west|radial` to aim a lane's gradient.
- **Tooltips & clickable links** — wrap a cell in an `<object>` (a.k.a. UserObject) to
  attach a hover tooltip and/or a hyperlink (jump to a Confluence page, a runbook,
  another diagram page). The `<mxCell>` becomes a child of the `<object>`:

  ```xml
  <object label="⚙️ core-api" tooltip="POST /supervisor/calls/{id}/join — checks Cognito group"
          link="https://confluence/…/TDR-002" id="core">
    <mxCell parent="1" vertex="1"
      style="rounded=1;html=1;fillColor=#dae8fc;gradientColor=#c9dcfb;strokeColor=#6c8ebf;shadow=1;">
      <mxGeometry x="300" y="380" width="600" height="160" as="geometry" />
    </mxCell>
  </object>
  ```

- **Layers** — add extra layer cells under `<root>` (`<mxCell id="lyr-overlay" parent="0"
  style="" />`) and parent shapes to them, so the user can toggle an overlay (e.g. a
  "security view") on/off. The default layer is the mandatory `id="1"`.

> Animation/tooltips/links/layers live in the file as ordinary style keys and `<object>`
> wrappers — `validate_drawio.py` accepts them. When you use animation, mention in the
> hand-off that it plays in draw.io / the interactive viewer, not in a static image.

### A.6 Multi-page

Add more `<diagram>` blocks inside `<mxfile>` for additional pages (e.g. an overview
page + a per-component detail page). Each has its own `<mxGraphModel>`.

### A.7 Verify before you claim it's done — evidence, not assertion

The single most damaging thing you can do here is tell the user "done — it's valid and
animated" without having checked. A diagram that won't open, or that the user opens to
find half the lines frozen, breaks trust instantly. So **evidence before claims, always**:
do not write any success/completion wording until you have run the checks *in this turn*
and read their actual output. "Should be valid" / "looks animated" are not evidence.

Run the bundled validator. It catches the structural failure modes above (missing root
cells, duplicate ids, vertices without geometry, edges with dangling source/target,
off-grid coords) **and runs a quality pass that flags anti-overlap violations**: two boxes
partially overlapping (reported as an error) and an edge whose route crosses a third box
it doesn't connect to (reported as a `QUALITY` warning). The edge check is route-aware —
it respects your exit/entry faces and waypoints, so a *properly* routed edge is not flagged.

```bash
python scripts/validate_drawio.py <path-to-file>.drawio
```

Before claiming completion, confirm **each** of these against real output — fix and re-run
until every one is clean:

1. **Validator exit is clean** — the run prints `[OK]` with **0 errors and no QUALITY
   warnings**. Fix every `QUALITY` line (reroute the edge via waypoints / exit-entry faces /
   a gutter per §A.4b, or move the colliding box) and re-run until clean.
2. **Animation is actually there** — if you intended a live diagram, count it, don't assume.
   A one-liner is enough evidence, e.g.:
   ```bash
   python -c "import re;t=open('FILE.drawio',encoding='utf-8').read();print('edges',len(re.findall(r'edge=\"1\"',t)),'animated',t.count('flowAnimation=1'))"
   ```
   On a live-system diagram, every edge carrying a flow should be animated (§A.5b). If the
   counts say otherwise, you are not done.
3. **The intention reads** — look back at Step 0: does the shape you shipped actually
   dramatize the one thing? If it degenerated into boxes+arrows, lift it before delivering.

Only after those pass do you tell the user it's done. Then give the **file path as a
clickable link** and how to open it (double-click, or app.diagrams.net → *Open Existing
Diagram*), note that animation plays in the draw.io editor / interactive viewer (not in a
static PNG), and briefly call out the creative choices — what the colours/lanes/line-styles
encode and what metaphor the layout uses — so they can read the diagram and edit it.

---

## Path B — embedded Mermaid (editable text-diagram inside .drawio)

Best when the user wants a **standard flow / sequence / ER / state / gantt** they'll
keep editing as text. Mermaid stays live: in draw.io they select the shape, press
Enter, edit the code, Apply. (Note: **PlantUML is deprecated in app.diagrams.net from
end of 2025** — Mermaid is the supported text path now.)

See [references/mermaid-and-csv.md](references/mermaid-and-csv.md) for the exact
mechanism and how the Mermaid is stored in the file. The quick version: you can deliver
the Mermaid for the user to paste via *Arrange ▸ Insert ▸ Mermaid*, or wrap it in the
mxgraph mermaid shape so it renders on open. Keep Mermaid diagrams simple unless the
user asks for detail; use `LR` direction by default and quote all node/edge text.

---

## Path C — CSV-driven generation (many similar nodes from data)

Best for **org charts, host inventories, service catalogues** — anything that's "one
shape per row" with connections defined by a column. draw.io's *Arrange ▸ Insert ▸
Advanced ▸ CSV* turns a formatted CSV block into a laid-out, auto-connected diagram.

See [references/mermaid-and-csv.md](references/mermaid-and-csv.md) for the full
header-directive syntax (`# style:`, `# connect:`, `%column%` substitution, multiple
`stylename`s). Limitation: CSV import only uses **built-in library shapes** and can't
build nested containers — for those, use Path A.

---

## The distinctiveness bar — the real test before you ship

Correctness is the floor; **distinctiveness is the bar**. Run this honestly: *if this
diagram is just coloured boxes + arrows + a legend, you have produced the baseline, not
skill-made work — go back and lift it.* For any diagram with ≥4 components, it should
clear most of these:

- [ ] **Banner** header (gradient, title + subtitle/status).
- [ ] Primary nodes are **structured lanes** (gradient + emoji title + a body line or
      two), not bare one-word rectangles.
- [ ] **One hero path** stands out (thick accent edge); other edges are thinner.
- [ ] Cross-cutting concerns (identity / store / audit / external) sit on a **side rail**
      off the main axis, dashed.
- [ ] **≥1 HTML-table node** wherever there's tabular content to show.
- [ ] **Legend** decodes colour roles *and* line styles.
- [ ] Optional lift used where it helps: numbered **stage rail**, emoji glyphs.

## Correctness checklist (the floor — never skip)

- [ ] Picked the right path (A unless B/C clearly fit).
- [ ] Root cells `0`,`1` present and first; all ids unique; every vertex has geometry.
- [ ] Labels escaped; no literal `<`/`>` in label text.
- [ ] Colour is semantic and consistent; **one** accent colour only.
- [ ] Grid-aligned, on a clear flow axis, ≤ ~40 cells/page.
- [ ] **No overlaps:** no edge runs through a box it doesn't connect to; no two shapes
      partially overlap (full nesting is fine); labels sit in clear space (§A.4b).
- [ ] On a live-system diagram, **every flow edge is animated** (`flowAnimation=1`); only
      static relationships are left un-animated (§A.5b) — verified by counting, not assumed.
- [ ] **Verified, not assumed (§A.7):** ran `validate_drawio.py` *this turn* and saw `[OK]`
      with no QUALITY warnings; confirmed the animation count; no completion claim was made
      before that evidence existed.
- [ ] Delivered as a clickable path with a one-paragraph read-me of the visual encoding.
