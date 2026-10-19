# Visual styles: the picker and the catalogue

Every visual this skill makes uses one **icon style**. Do not choose it silently. Offer the
user a short list, recommend one, then build in the chosen style. This file is shared by
every visual skill (draw.io, Excalidraw, animated SVG, solution design, presales), so a
style looks the same wherever it is used.

## The picker

1. **Shortlist 4 or 5 styles.** Always offer A, B, C and D. Add 1 or 2 from E to H that
   fit the request (see "Pick extras by request" below).
2. **Ask once** with `AskUserQuestion`, one option per style. Each option's label is
   `<letter> · <name>` and its description is the one-line look. Put the recommended style
   first and add "(Recommended)" to its label. When the host supports option previews, put
   a 6-icon sample strip of that style in `preview`.
3. **Skip the question** when the user already named a style ("blueprint", "isometric",
   "like option C"), when memory holds a saved style preference, or when the run is
   non-interactive (a subagent or scheduled task). Use the recommended style and say which
   one in one line.
4. **Show it.** Write the style in the legend or footer, for example `Style: C · Solid glyph tiles`.
5. **Remember it.** If the user says "always use this", save it as a feedback memory.

### Pick extras by request

| The request is about | Recommend | Add as extra |
|---|---|---|
| Cloud or Kubernetes architecture | C | E Official vendor icons |
| Exec or board deck, a calm one-pager | A | G Gradient glass |
| Platform layers, infra stack, data platform | B | E Official vendor icons |
| Technical spec, TDR, engineering review | D | H Mono outline |
| Workshop, brainstorm, early idea | F | A Duotone line |
| Marketing page, landing hero, product launch | G | A Duotone line |
| Confluence, print, a doc that must copy cleanly | H | D Blueprint |
| Anything else | C | the closest match from the rows above |

## The catalogue

Icon size rules hold in every style: stencil icons and tiles at least **80×80**, glyphs at
least **64px**, captions 14 to 16px bold. One colour per meaning, used the same way across
the whole diagram.

| Code | Style | Look | Best for |
|---|---|---|---|
| A | Duotone line | Thin dark stroke glyph over one soft accent circle | Calm, premium, exec |
| B | Isometric | A 3D block with the glyph on its top face | Layers, platforms, infra |
| C | Solid glyph tiles | Bold coloured rounded tile, white glyph | Dense diagrams, fast scanning |
| D | Blueprint | Navy fine lines on a light grid tile with a corner callout | Engineering, specs |
| E | Official vendor icons | Real AWS, Azure, GCP or Kubernetes service icons | Cloud reference architecture |
| F | Hand-drawn sketch | Rough strokes, hachure fill, sticky-note colours | Workshops, ideas |
| G | Gradient glass | Two-stop gradient tile, soft glow, white glyph | Marketing, heroes |
| H | Mono outline | One ink colour, no fill, even stroke | Print, docs, Confluence |

### Palettes

| Style | Fill | Stroke or glyph | Accent set (by meaning) |
|---|---|---|---|
| A | `#A7E8CF` circle | `#0B6E4F` stroke 3px | swap the pair per meaning: `#C9D7FF`/`#2B3FA0`, `#FFD9C2`/`#B5461A` |
| B | top `#B3ADF2`, left `#8F86E8`, right `#5F55C9` | glyph `#2E2873` | per meaning recolour the three faces from one hue |
| C | `#1E9E6E` green, `#E05A2B` orange, `#4B47B8` indigo | `#FFFFFF` | green = data or docs, orange = AI or code, indigo = services or storage |
| D | `#EAF3FC` with a `#C9DDF2` 10px grid | `#0E3F7A` stroke 2px | dashed `#0E3F7A` callout tick in the top right corner |
| E | vendor icon as shipped | vendor colours | zone fills only: soft tints of each trust zone |
| F | `#FFE9A8`, `#C3F0CA`, `#BDE0FE` | `#1E1E1E` rough stroke | Excalidraw roughness 1 or 2 |
| G | `#6A5AE0` to `#C04FD8`, or `#14B8A6` to `#2563EB` | `#FFFFFF` | soft outer glow at 25% opacity |
| H | none | `#1F2937` stroke 2px | emphasis with weight, not colour |

## Recipes by format

### draw.io
Build each icon as a **tile cell** plus a **glyph cell** grouped together. The glyph is a
built-in shape or an emoji, or for E a stencil from `cloud-architecture-stencils.md`.

- **A** tile: `ellipse;fillColor=#A7E8CF;strokeColor=none;` 80×80. Glyph on top, offset
  +10px right and up: `strokeColor=#0B6E4F;strokeWidth=3;fillColor=none;`
- **B** use `shape=isoCube2;isoAngle=15;fillColor=#8F86E8;strokeColor=none;` 100×100, glyph
  above the top face with `fontColor=#2E2873`.
- **C** tile: `rounded=1;arcSize=22;fillColor=#1E9E6E;strokeColor=none;` 96×96. Glyph:
  `fontColor=#FFFFFF;fontSize=64;` or a shape with `strokeColor=#FFFFFF;fillColor=none;strokeWidth=4;`
- **D** tile: `rounded=1;arcSize=6;fillColor=#EAF3FC;strokeColor=#0E3F7A;strokeWidth=1;`
  and set the page `grid=1;gridColor=#C9DDF2;`. Glyph: `strokeColor=#0E3F7A;strokeWidth=2;fillColor=none;`
- **E** follow `cloud-architecture-stencils.md` at 80×80 or more.
- **G** tile: `rounded=1;arcSize=24;fillColor=#6A5AE0;gradientColor=#C04FD8;gradientDirection=south;shadow=1;strokeColor=none;`
- **H** tile: none. Glyph: `strokeColor=#1F2937;strokeWidth=2;fillColor=none;`
- **F** is not native to draw.io: use `sketch=1;curveFitting=1;jiggle=2;` on every cell,
  or hand off to the Excalidraw skill.

### Excalidraw
- **F** is the native look: `roughness: 1`, `fillStyle: "hachure"`, sticky-note fills.
- **A, C, D, G, H**: set `roughness: 0` (clean mode), `strokeSharpness: "round"`, and use
  the palettes above. C uses `fillStyle: "solid"`. D adds a frame with a light grid of
  thin lines behind the tiles. G has no gradients, so use the first gradient stop as a solid fill.
- **B**: draw three polygons (top, left, right faces) per block with the face colours.
- **E**: embed the vendor SVG as an image element.

### SVG and HTML
- Define each glyph once in `<defs>` as a `<symbol>` and reuse it with `<use>`.
- **A**: `<circle r="30" fill="#A7E8CF"/>` then the glyph `stroke="#0B6E4F" stroke-width="3" fill="none"`.
- **B**: three `<polygon>` faces per block at 30 degrees, glyph on the top face.
- **C**: `<rect rx="20" fill="#1E9E6E"/>` with a white stroked glyph.
- **D**: a `<pattern>` grid of `#C9DDF2` lines filling the tile, navy glyph, dashed corner tick.
- **G**: `<linearGradient>` fill plus `filter: drop-shadow(0 6px 16px rgb(106 90 224 / .35))`.
- **H**: `stroke="currentColor"` so the icon follows light and dark themes.
- In HTML, put the palette in CSS custom properties so the chosen style is one class
  (`.style-a` to `.style-h`) on the root.

### Mermaid
Mermaid cannot draw these icon treatments. Get as close as it allows with `classDef`:
C as solid fills with white text, D as `fill:#EAF3FC,stroke:#0E3F7A`, H as
`fill:none,stroke:#1F2937`. When the style matters, offer a draw.io or SVG version as well.

## Sample strip (for previews)
To show the user a style before building, render 6 icons (document, receipt, sparkle, flow
arrows, database, code) in that style, side by side, 96px each. A small SVG is enough.

A ready sample of every style (E vendor icons aside) is in `visual-style-samples.html`. Open it, or screenshot it with headless Chrome, to show the user before they pick.
