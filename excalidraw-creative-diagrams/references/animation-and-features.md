# Excalidraw animation & innovative features — field reference + recipes

Excalidraw's editor renders a still board, but the `.excalidraw` file drives an animation
ecosystem and supports many features beyond boxes-and-arrows. All of these are plain fields
the validator accepts. Table of contents:

1. Animation (draw-on + keyframe) — how to author for it, how to play/export
2. Elbow arrows
3. Arrowheads (incl. crowfoot for ER)
4. Frames as presentation slides
5. Element links & hyperlinks
6. Live embeds (embeddable / iframe)
7. Images
8. Mermaid → Excalidraw

---

## 1. Animation — draw-on + keyframe

The file itself has no "play" button in the editor (just like a draw.io PNG can't show
flowAnimation). Animation is produced by tools that **consume** your `.excalidraw`:

| Tool | What it does | Export | URL |
|---|---|---|---|
| **excalidraw-animate** | "Draws on" each element stroke-by-stroke in **`elements` array order**; simple, fast | **animated SVG** (+ screen-capture GIF/WebM) | `https://dai-shi.github.io/excalidraw-animate/` |
| **Excalimate** | Full keyframe timeline: opacity, position, scale, draw-progress, camera pan/zoom; MCP server | **MP4 / WebM / GIF / animated SVG / Lottie** | `https://excalimate.com` |
| **Excaliframe** (VS Code) | Auto-export a scene to static or animated SVG on save | animated SVG | VS Code marketplace |

**The lever you control from the file: `elements` array order.** excalidraw-animate reveals
elements in array order (elements with no explicit order are Order=0 and animate in creation
order; default ~500ms each, grouped sets share ~5s). So **build the array front-to-back along
your story**: title → spine stage 1 → its arrow → stage 2 → its arrow → … → organs → legend.
That ordering *is* the animation choreography — no special field required.

Fine-tuning (optional): the animator UIs let you set a per-element **Order** and **Duration**;
those are applied in-tool. Don't hand-write a custom-order field — the robust, portable signal
is array order. Reserve `customData` (a free-form `Record<string,any>` on every element) only
if a specific tool documents a key.

**Deliver-and-say:** hand over the `.excalidraw` and tell the user to drop it into
excalidraw-animate (or Excalimate) to watch it draw on / export an animated SVG/GIF — it will
not animate in the plain editor.

---

## 2. Elbow arrows

A smart orthogonal arrow that bends at 90° and re-routes as bound shapes move — the clean way
to wire a spine without hand-placing bend points.

```json
{ "id":"e1","type":"arrow","elbowed": true,
  "x":380,"y":160,"width":180,"height":80,
  "strokeColor":"#1e1e1e","strokeWidth":2,"roughness":0,"roundness": null,
  "points":[[0,0],[180,0],[180,80]],
  "startBinding":{"elementId":"a","focus":0,"gap":6},
  "endBinding":{"elementId":"b","focus":0,"gap":6},
  "startArrowhead":null,"endArrowhead":"arrow",
  "seed":701,"version":4,"versionNonce":9701,"isDeleted":false,
  "boundElements":[],"updated":1,"link":null,"locked":false,
  "angle":0,"groupIds":[],"frameId":null,"fillStyle":"solid",
  "strokeStyle":"solid","opacity":100,"backgroundColor":"transparent","lastCommittedPoint":null }
```

Key field: **`"elbowed": true`**. Keep `roughness:0` and `roundness:null` for crisp right
angles. Still bind both ends (and list the arrow on both shapes' `boundElements`) so it tracks.

---

## 3. Arrowheads (including crowfoot for ER)

`startArrowhead` / `endArrowhead` accept (from the Excalidraw source):

```
null, "arrow", "bar", "dot", "circle", "circle_outline",
"triangle", "triangle_outline", "diamond", "diamond_outline",
"crowfoot_one", "crowfoot_many", "crowfoot_one_or_many"
```

For an **ER diagram**, use crowfoot: a "one-to-many" relation →
`"startArrowhead":"crowfoot_one","endArrowhead":"crowfoot_many"`.

---

## 4. Frames as presentation slides

A `frame` (type `"frame"`, with a `name`) is also a **slide**. Excalidraw's presentation mode
walks frame→frame in order, and frames export individually. So a board built as a stack of
titled frames doubles as a deck. Children set `"frameId":"<frame id>"`. (See element-schema §5.)

---

## 5. Element links & hyperlinks

Every element has `"link": string | null`.

- **External hyperlink** — `"link":"https://confluence/…/TDR-002"`. A link badge appears; click
  opens the URL. Use to jump to the source doc, a runbook, a dashboard.
- **Internal element/frame link** — `"link":"https://excalidraw.com/?element=<targetId>"`. When
  opened on excalidraw.com, clicking pans/zooms the canvas to that element or frame. Great for a
  table-of-contents: an overview chip whose link is the id of its detail frame. (The link is
  host-matched — it navigates inside the editor on the same host. Harmless as a plain link
  elsewhere.) The query key is `element`; the value is the **target element/frame id**.

Set `link` to the *current host* so it resolves: `https://excalidraw.com/?element=fr-A`.

---

## 6. Live embeds (embeddable / iframe)

Drop a live web pane onto the board.

```json
{ "id":"yt1","type":"embeddable","link":"https://www.youtube.com/watch?v=…",
  "x":1200,"y":120,"width":480,"height":300,
  "strokeColor":"#1e1e1e","backgroundColor":"transparent","fillStyle":"solid",
  "strokeWidth":2,"strokeStyle":"solid","roughness":0,"opacity":100,"angle":0,
  "groupIds":[],"frameId":null,"roundness":null,"seed":801,"version":3,
  "versionNonce":9801,"isDeleted":false,"boundElements":[],"updated":1,"locked":false }
```

- `"type":"embeddable"` + a `link` URL (YouTube, Figma, CodeSandbox, a webpage; Excalidraw
  validates allowed providers). `"type":"iframe"` is the raw-iframe variant.
- Excalidraw renders the live content inside the box on the canvas.

---

## 7. Images

```json
{ "id":"img1","type":"image","fileId":"<hash>", "x":100,"y":100,"width":240,"height":160,
  "status":"saved","scale":[1,1], "...common fields...": null }
```

The pixels live in the top-level `files` map keyed by `fileId`:

```json
"files": { "<hash>": { "mimeType":"image/png","id":"<hash>",
  "dataURL":"data:image/png;base64,iVBOR…","created":1,"lastRetrieved":1 } }
```

Match `image.fileId` to a `files` key, or the image renders as a broken placeholder.

---

## 8. Mermaid → Excalidraw

For a standard flow / sequence / ER / class / state diagram the user will keep editing as
text, the cleanest path is **Mermaid-to-Excalidraw**: write Mermaid, then on excalidraw.com use
*Insert ▸ Mermaid* (or the `@excalidraw/mermaid-to-excalidraw` package). It converts to **native,
fully-editable Excalidraw elements** (real shapes you can restyle into the house look), not an
image. Use `LR` direction by default and quote node/edge text. This is the Excalidraw analog of
the drawio embedded-Mermaid path — reach for it when the diagram is a textbook flow the user
wants to keep tweaking as code, and hand-authoring every node would be busywork.
