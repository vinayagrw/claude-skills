# mxGraph style reference

Style strings are `;`-separated `key=value` pairs in a cell's `style="..."` attribute.
This is the vocabulary for Path A. Unknown keys are ignored, so it's safe to be
generous.

## Table of contents
1. Shape & box styling
2. Text & HTML labels
3. Edges (arrows)
4. Containers (swimlanes, groups, tables)
5. Connection points (exitX/entryX)
6. Common shapes & stencils
7. Gotchas

---

## 1. Shape & box styling

| Key | Effect | Example |
|---|---|---|
| `rounded` | 0 sharp, 1 rounded corners | `rounded=1` |
| `arcSize` | corner radius when rounded | `arcSize=8` |
| `fillColor` | interior colour | `fillColor=#dae8fc` |
| `gradientColor` | second colour → vertical gradient (depth!) | `gradientColor=#c9dcfb` |
| `strokeColor` | border colour; `none` for borderless | `strokeColor=#6c8ebf` |
| `strokeWidth` | border thickness | `strokeWidth=2` |
| `dashed` + `dashPattern` | dashed border | `dashed=1;dashPattern=6 4` |
| `shadow` | drop shadow (1=on) | `shadow=1` |
| `opacity` | 0–100 | `opacity=80` |
| `sketch` | hand-drawn look (1=on) | `sketch=1` |
| `glass` | glassy highlight overlay | `glass=1` |

## 2. Text & HTML labels

Set `html=1` to enable rich labels. Then the `value` may contain HTML **written as XML
entities** (`&lt;b&gt;`, `&lt;br&gt;`, `&lt;font color='#...'&gt;`).

| Key | Effect |
|---|---|
| `html=1` | enable HTML rendering in the label |
| `whiteSpace=wrap` | wrap long text inside the box |
| `align` | `left` / `center` / `right` |
| `verticalAlign` | `top` / `middle` / `bottom` |
| `spacingLeft/Top/Right/Bottom` | inner padding |
| `fontColor`, `fontSize`, `fontStyle` | `fontStyle=1` bold, `2` italic, `4` underline |
| `fontFamily` | e.g. `fontFamily=monospace` |

**HTML-table label** (the high-value trick — a data grid inside one node). Because the
whole thing is an XML attribute value, every `<` is `&lt;` and every `>` is `&gt;`:

```
value="&lt;b&gt;Live Calls&lt;/b&gt;&lt;br&gt;&lt;table cellpadding='4' style='font-size:11px;border-collapse:collapse'&gt;&lt;tr style='background:#1A56C4;color:#ffffff'&gt;&lt;td&gt;Agent&lt;/td&gt;&lt;td&gt;State&lt;/td&gt;&lt;/tr&gt;&lt;tr&gt;&lt;td&gt;alice&lt;/td&gt;&lt;td&gt;live&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;"
```

To display a literal `&` inside the label, write `&amp;amp;`. To display a literal
`<`, write `&amp;lt;` — easier to just avoid literal angle brackets and use `[ ]`.

## 3. Edges (arrows)

| Key | Effect | Example |
|---|---|---|
| `edgeStyle` | routing | `edgeStyle=orthogonalEdgeStyle` (clean right-angles) |
| `rounded` | rounded corners on bends | `rounded=1` |
| `endArrow` / `startArrow` | arrowheads | `endArrow=block;startArrow=oval` |
| `startFill` / `endFill` | filled head | `startFill=1` |
| `strokeColor` / `strokeWidth` | colour + weight (encode meaning!) | `strokeColor=#e8732a;strokeWidth=4` |
| `dashed` / `dashPattern` | dashed/dotted | `dashed=1;dashPattern=2 4` |
| `fontColor` / `fontSize` | label styling | |

**Encode edge semantics** (the explanatory payoff):
- control/signal → `strokeWidth=2;` solid, primary colour
- data/media/heavy → `strokeWidth=4;strokeColor=#e8732a;` solid, hot
- identity/auth/async → `dashed=1;dashPattern=6 4;`
- weak/reference → `dashed=1;dashPattern=2 4;strokeColor=#9aa7b8;endArrow=open;`

Routing waypoints (force a clean path) go inside the edge geometry:

```xml
<mxGeometry relative="1" as="geometry">
  <Array as="points"><mxPoint x="150" y="500" /></Array>
</mxGeometry>
```

## 4. Containers (swimlanes, groups, tables)

A **swimlane** is a titled container; children use coordinates **relative to the
swimlane's origin**, and set `parent="<swimlaneId>"`.

```
style="swimlane;rounded=1;startSize=30;html=1;fillColor=#f5f5f5;gradientColor=#e9e9e9;strokeColor=#666666;swimlaneFillColor=#ffffff;"
```

- `startSize` = title-bar height.
- `swimlaneFillColor` = body fill behind children.

Simpler alternative that avoids relative-coordinate math: draw a **plain labelled
backdrop rectangle** (`verticalAlign=top`) and place the cluster's shapes *on top* of it
as normal `parent="1"` cells positioned absolutely. Cells later in the XML render above
earlier ones, so author the backdrop first.

Native **table** shape: `style="shape=table;startSize=30;..."` with `shape=tableRow` and
`shape=partialRectangle` children — powerful but verbose; for most "table inside a node"
needs, the HTML-table label (§2) is faster and less error-prone.

## 5. Connection points

Pin where an edge attaches with normalised coords (0,0 = top-left, 1,1 = bottom-right):

```
exitX=1;exitY=0.5;exitDx=0;exitDy=0;   // leave source from right-middle
entryX=0;entryY=0.2;entryDx=0;entryDy=0; // enter target near its top-left
```

Use this to keep parallel edges from overlapping and to route a "bypass" path cleanly.

## 6. Common shapes & stencils

- Process box: `rounded=1;` · Decision: `rhombus;` · Start/End: `ellipse;`
- Cylinder/DB: `shape=cylinder3;` · Cloud: `ellipse;shape=cloud;`
- Actor: `shape=umlActor;` · Note: `shape=note;`
- Vendor icon stencils: `shape=mxgraph.aws4.lambda`, `shape=mxgraph.azure.*`,
  `shape=mxgraph.gcp2.*` — great for cloud-architecture diagrams. Pair with the vendor's
  colour for instant recognition.

## 7. Gotchas

- Label escaping is the #1 cause of broken files — see §2.
- Children of a swimlane use **relative** coordinates; absolute coords place them in the
  wrong spot. When in doubt use the backdrop-rectangle approach.
- `gradientColor` needs a `fillColor` to gradient *from*.
- Keep coords on the 10px grid.
- draw.io may reorder a cell's attributes and re-escape labels when it saves — that's
  normal and does not mean your file was wrong.
