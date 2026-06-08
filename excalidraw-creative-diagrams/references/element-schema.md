# Excalidraw element schema — exact fields + copy-paste skeletons

Table of contents:
1. Base fields (every element)
2. Rectangle / ellipse / diamond
3. Text (standalone + bound label)
4. Arrow / line (+ bindings)
5. Frame
6. Freedraw (accents/highlighter)
7. Worked example — two notes, bound labels, bound hero arrow (copy this pattern)

Excalidraw's import (`restore`) fills missing optional fields with defaults, so a scene
can open without every key. But **ids, type, geometry, points, and both halves of every
binding** are what actually matter — get those exact.

---

## 1. Base fields (present on every element)

| field | type | typical / default | notes |
|---|---|---|---|
| `id` | string | unique | bindings are by id — never reuse |
| `type` | string | — | rectangle/ellipse/diamond/arrow/line/text/frame/freedraw/image/embeddable |
| `x`,`y` | number | — | top-left in scene coords (for linear: anchor of points[0]) |
| `width`,`height` | number | — | bbox size |
| `angle` | number | `0` | radians; keep 0 in clean mode, ±0.03 for sketch tilt |
| `strokeColor` | string | `#1e1e1e` | saturated palette hex |
| `backgroundColor` | string | `transparent` | light palette hex or `transparent` |
| `fillStyle` | string | `solid` | `hachure` / `cross-hatch` / `solid` |
| `strokeWidth` | number | `2` | 1 thin · 2 bold · 4 hero |
| `strokeStyle` | string | `solid` | `solid` / `dashed` / `dotted` |
| `roughness` | number | `1` | 0 clean · 1 sketch · 2 loose |
| `opacity` | number | `100` | 0–100 (use ~40 for highlighter) |
| `groupIds` | string[] | `[]` | same value → moved/treated as one cluster |
| `frameId` | string\|null | `null` | id of the frame this belongs to |
| `roundness` | obj\|null | `{ "type": 3 }` rects / `{ "type": 2 }` lines / `null` sharp | |
| `seed` | int | vary | drives the jitter — vary per element |
| `version` | int | `1`+ | any increasing int |
| `versionNonce` | int | vary | vary per element |
| `isDeleted` | bool | `false` | |
| `boundElements` | array\|null | `null` | `[{ "type":"text"\|"arrow", "id":"…" }]` — the *back* half of bindings |
| `updated` | int | `1` | ms timestamp; a constant like `1` is fine |
| `link` | string\|null | `null` | optional hyperlink |
| `locked` | bool | `false` | |

> Derive `seed`/`versionNonce` from the element index (e.g. `1000+i`, `2000+i`) so they
> vary without needing randomness.

---

## 2. Rectangle / ellipse / diamond (the note shapes)

Same fields as base; `type` switches the silhouette. A sticky-note:

```json
{
  "id": "n-api", "type": "rectangle",
  "x": 240, "y": 160, "width": 220, "height": 100, "angle": 0,
  "strokeColor": "#1971c2", "backgroundColor": "#a5d8ff",
  "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
  "roughness": 1, "opacity": 100,
  "groupIds": [], "frameId": null, "roundness": { "type": 3 },
  "seed": 1001, "version": 4, "versionNonce": 2001, "isDeleted": false,
  "boundElements": [ { "type": "text", "id": "t-api" } ],
  "updated": 1, "link": null, "locked": false
}
```

- `ellipse` for actors/start-end, `diamond` for decisions.
- The `boundElements` line is what makes the label below stick to this note.

---

## 3. Text — standalone and bound label

Extra fields beyond base: `text`, `fontSize`, `fontFamily`, `textAlign`,
`verticalAlign`, `containerId`, `originalText`, `lineHeight`.

- `fontFamily`: **1** = hand-drawn (Excalifont/Virgil), **2** = normal (Helvetica/Nunito),
  **3** = code (Cascadia). Use 1 for the board's voice, 3 for code snippets.
- `fontSize`: 16 (S) · 20 (M) · 28 (L) · 36 (XL). Title = 28–36.
- `lineHeight`: `1.25`.

**Standalone title:**
```json
{
  "id": "title", "type": "text",
  "x": 240, "y": 60, "width": 520, "height": 45, "angle": 0,
  "strokeColor": "#1e1e1e", "backgroundColor": "transparent",
  "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
  "roughness": 1, "opacity": 100, "groupIds": [], "frameId": null,
  "roundness": null, "seed": 1500, "version": 3, "versionNonce": 2500,
  "isDeleted": false, "boundElements": null, "updated": 1, "link": null, "locked": false,
  "text": "🛰️ Notification Service", "fontSize": 36, "fontFamily": 1,
  "textAlign": "left", "verticalAlign": "top",
  "containerId": null, "originalText": "🛰️ Notification Service", "lineHeight": 1.25
}
```

**Bound label** (sits inside note `n-api`). Set `containerId` to the note, `textAlign`
`center` / `verticalAlign` `middle`, and position roughly centered — Excalidraw recomputes
exact placement on import. **The note must list this text in its `boundElements`** (see §2).
```json
{
  "id": "t-api", "type": "text",
  "x": 270, "y": 195, "width": 160, "height": 25, "angle": 0,
  "strokeColor": "#1e1e1e", "backgroundColor": "transparent",
  "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
  "roughness": 1, "opacity": 100, "groupIds": [], "frameId": null,
  "roundness": null, "seed": 1002, "version": 4, "versionNonce": 2002,
  "isDeleted": false, "boundElements": null, "updated": 1, "link": null, "locked": false,
  "text": "⚙️ API", "fontSize": 20, "fontFamily": 1,
  "textAlign": "center", "verticalAlign": "middle",
  "containerId": "n-api", "originalText": "⚙️ API", "lineHeight": 1.25
}
```

---

## 4. Arrow / line — with bindings

Extra fields: `points`, `lastCommittedPoint`, `startBinding`, `endBinding`,
`startArrowhead`, `endArrowhead`.

- `points`: array of `[x,y]` **relative to the element's `x,y`**, ≥2 entries. The element's
  `x,y` is where `points[0]` sits; `width`/`height` should match the points' bbox.
- `startBinding`/`endBinding`: `{ "elementId": "<shape id>", "focus": 0, "gap": 4 }`.
  `focus` ∈ −1..1 (where along the target it aims; 0 = center). `gap` = px standoff (~4–8).
- `endArrowhead`: `"arrow"` for arrows (or `triangle`/`dot`/`bar`); `null` for plain lines.
  `startArrowhead` usually `null`.
- **Each bound shape must list this arrow in its `boundElements`** (the back half).
- To **route around** an obstacle, add a mid point: `[[0,0],[90,0],[90,140],[260,140]]`.

```json
{
  "id": "arr-hero", "type": "arrow",
  "x": 460, "y": 210, "width": 180, "height": 0, "angle": 0,
  "strokeColor": "#1e1e1e", "backgroundColor": "transparent",
  "fillStyle": "solid", "strokeWidth": 4, "strokeStyle": "solid",
  "roughness": 1, "opacity": 100, "groupIds": [], "frameId": null,
  "roundness": { "type": 2 }, "seed": 1010, "version": 6, "versionNonce": 2010,
  "isDeleted": false, "boundElements": null, "updated": 1, "link": null, "locked": false,
  "points": [ [0, 0], [180, 0] ],
  "lastCommittedPoint": null,
  "startBinding": { "elementId": "n-api", "focus": 0, "gap": 4 },
  "endBinding": { "elementId": "n-db", "focus": 0, "gap": 4 },
  "startArrowhead": null, "endArrowhead": "arrow"
}
```

`line` is identical but `type:"line"` and `endArrowhead:null` — use for underlines,
brackets, dividers.

---

## 5. Frame (titled region)

```json
{
  "id": "frame-ingest", "type": "frame",
  "x": 200, "y": 130, "width": 560, "height": 260, "angle": 0,
  "strokeColor": "#bbb", "backgroundColor": "transparent",
  "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
  "roughness": 0, "opacity": 100, "groupIds": [], "frameId": null,
  "roundness": null, "seed": 1600, "version": 2, "versionNonce": 2600,
  "isDeleted": false, "boundElements": null, "updated": 1, "link": null, "locked": false,
  "name": "Ingest layer"
}
```

- The frame carries a `name` (its visible title). Child elements set
  `"frameId": "frame-ingest"`. Frames are the tidiest way to label a region/lane/phase.

---

## 6. Freedraw (hand accents / highlighter)

`type:"freedraw"` with a dense `points` array traces a marker stroke. Two signature uses:

- **Highlighter swipe** behind a key note: thick `strokeWidth` (e.g. 18), `strokeColor`
  `#ffec99`, `opacity` ~40, drawn as a roughly horizontal stroke under the text.
- **Hand-drawn circle / underline** for "you are here" emphasis.

```json
{
  "id": "hl-1", "type": "freedraw",
  "x": 250, "y": 205, "width": 200, "height": 10, "angle": 0,
  "strokeColor": "#ffec99", "backgroundColor": "transparent",
  "fillStyle": "solid", "strokeWidth": 18, "strokeStyle": "solid",
  "roughness": 1, "opacity": 40, "groupIds": [], "frameId": null,
  "roundness": null, "seed": 1700, "version": 5, "versionNonce": 2700,
  "isDeleted": false, "boundElements": null, "updated": 1, "link": null, "locked": false,
  "points": [ [0,0],[40,-2],[90,1],[140,-1],[200,0] ],
  "pressures": [], "simulatePressure": true, "lastCommittedPoint": [200,0]
}
```

Draw the highlighter **before** the note in the `elements` array so it sits behind, or
after with low opacity to sit on top — order = z-order.

---

## 7. Worked example — two notes, bound labels, bound hero arrow

This is the minimal *correct-bindings* pattern. Scale it up. Note how every binding has
**both halves**: the label's `containerId` + the note's `boundElements`, and the arrow's
`start/endBinding` + each note's `boundElements`.

```json
{
  "type": "excalidraw", "version": 2, "source": "https://excalidraw.com",
  "elements": [
    { "id": "n-api", "type": "rectangle", "x": 200, "y": 200, "width": 200, "height": 90,
      "strokeColor": "#1971c2", "backgroundColor": "#a5d8ff", "fillStyle": "solid",
      "strokeWidth": 2, "strokeStyle": "solid", "roughness": 1, "opacity": 100,
      "groupIds": [], "frameId": null, "roundness": { "type": 3 }, "angle": 0,
      "seed": 1001, "version": 4, "versionNonce": 2001, "isDeleted": false,
      "boundElements": [ { "type": "text", "id": "t-api" }, { "type": "arrow", "id": "arr-1" } ],
      "updated": 1, "link": null, "locked": false },
    { "id": "t-api", "type": "text", "x": 250, "y": 232, "width": 100, "height": 25,
      "strokeColor": "#1e1e1e", "backgroundColor": "transparent", "fillStyle": "solid",
      "strokeWidth": 2, "strokeStyle": "solid", "roughness": 1, "opacity": 100,
      "groupIds": [], "frameId": null, "roundness": null, "angle": 0,
      "seed": 1002, "version": 4, "versionNonce": 2002, "isDeleted": false,
      "boundElements": null, "updated": 1, "link": null, "locked": false,
      "text": "⚙️ API", "fontSize": 20, "fontFamily": 1, "textAlign": "center",
      "verticalAlign": "middle", "containerId": "n-api", "originalText": "⚙️ API",
      "lineHeight": 1.25 },
    { "id": "n-db", "type": "rectangle", "x": 560, "y": 200, "width": 200, "height": 90,
      "strokeColor": "#2f9e44", "backgroundColor": "#b2f2bb", "fillStyle": "solid",
      "strokeWidth": 2, "strokeStyle": "solid", "roughness": 1, "opacity": 100,
      "groupIds": [], "frameId": null, "roundness": { "type": 3 }, "angle": 0,
      "seed": 1003, "version": 4, "versionNonce": 2003, "isDeleted": false,
      "boundElements": [ { "type": "text", "id": "t-db" }, { "type": "arrow", "id": "arr-1" } ],
      "updated": 1, "link": null, "locked": false },
    { "id": "t-db", "type": "text", "x": 600, "y": 232, "width": 120, "height": 25,
      "strokeColor": "#1e1e1e", "backgroundColor": "transparent", "fillStyle": "solid",
      "strokeWidth": 2, "strokeStyle": "solid", "roughness": 1, "opacity": 100,
      "groupIds": [], "frameId": null, "roundness": null, "angle": 0,
      "seed": 1004, "version": 4, "versionNonce": 2004, "isDeleted": false,
      "boundElements": null, "updated": 1, "link": null, "locked": false,
      "text": "🗄️ Store", "fontSize": 20, "fontFamily": 1, "textAlign": "center",
      "verticalAlign": "middle", "containerId": "n-db", "originalText": "🗄️ Store",
      "lineHeight": 1.25 },
    { "id": "arr-1", "type": "arrow", "x": 400, "y": 245, "width": 160, "height": 0,
      "strokeColor": "#1e1e1e", "backgroundColor": "transparent", "fillStyle": "solid",
      "strokeWidth": 4, "strokeStyle": "solid", "roughness": 1, "opacity": 100,
      "groupIds": [], "frameId": null, "roundness": { "type": 2 }, "angle": 0,
      "seed": 1005, "version": 6, "versionNonce": 2005, "isDeleted": false,
      "boundElements": null, "updated": 1, "link": null, "locked": false,
      "points": [ [0,0],[160,0] ], "lastCommittedPoint": null,
      "startBinding": { "elementId": "n-api", "focus": 0, "gap": 4 },
      "endBinding": { "elementId": "n-db", "focus": 0, "gap": 4 },
      "startArrowhead": null, "endArrowhead": "arrow" }
  ],
  "appState": { "viewBackgroundColor": "#ffffff", "gridSize": null },
  "files": {}
}
```
