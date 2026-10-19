# Icon-forward diagrams — icon on top, short label beneath, minimal boxes

The signature "gradient lane" look (SKILL.md §A.0) packs a **structured multi-line body**
into each node — great when every component needs 2–4 lines of detail (endpoints, steps,
attributes). But a lot of modern architecture/system pictures want the opposite: each
component is a **recognisable icon with a one-to-three-word caption and no box at all**,
with related components gathered into **soft coloured zones**. This reads like an AWS
reference architecture or a product-marketing system map — clean, scannable, "designed".
This file is the recipe for that look. It composes with the house style (banner, one hero
flow, legend, animation) — you're swapping *filled lanes* for *icon-over-label glyphs*.

## When to reach for icon-forward vs gradient lanes

| Choose **icon-forward** (this file) when… | Choose **gradient lanes** (§A.0) when… |
|---|---|
| The user says "icons", "no boxes / minimal boxes", "clean", "modern", "make it visual", "not just boxes" | Each node needs a real body of text (a request list, config, steps) |
| Infra/cloud with real service icons; a "system map" / component inventory with many nodes | A control-plane vs data-plane story with a few rich lanes |
| Mixed AWS + logical + SaaS components | The detail *is* the point and would be lost as a bare caption |

They **mix freely**: icon-forward glyphs placed inside a couple of gradient lanes, or one
HTML-table node dropped into an icon-forward zone. Pick per node, not per diagram.

## The node primitive — glyph over caption, transparent, no box

Three variants, all render as an icon with the label directly beneath and **no fill/stroke**:

**(a) Concept node (emoji glyph)** — for logical/abstract components (Model, Orchestration,
Guardrails, Intent, an agent, a pipeline):
```
style: text;html=1;align=center;verticalAlign=top;fillColor=none;strokeColor=none;whiteSpace=wrap;spacingTop=2;
value: <font style='font-size:64px'>🧠</font><br><b style='font-size:15px;color:#1a3a5c'>Model</b>
geometry: ~170–190 wide × 120 tall (glyph ≥64px; 72px on hero/landing diagrams)
```

**(b) Real service icon (AWS/Azure/GCP stencil)** — the built-in stencil already renders
the caption *below* the icon (`verticalLabelPosition=bottom`), which is exactly this look:
```
style: sketch=0;outlineConnect=0;fontColor=#1b2a4a;strokeColor=#ffffff;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=14;fontStyle=1;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.<NAME>;fillColor=<AWS-CATEGORY-HEX>;
value: Route 53
geometry: ≥80 square, 80–96 typical (AWS icons are square — a non-square box stretches them)
```
Resolve `<NAME>` + category colour with `python scripts/find_icon.py "<service>"`. Because
the caption sits on the page (not the icon), use a **dark** `fontColor`. AWS category
fills: Compute `#ED7100` · ML/AI `#01A88D` · Database `#4D72F3` · Storage `#7AA116` ·
Networking/Edge `#8C4FFF` · Security/Identity `#DD344C` · Analytics `#C925D1` · Management `#E7157B`.

**(c) Non-AWS brand / logical-with-no-stencil** — Temporal, Firecracker, MCP, Qdrant,
Neo4j, Postgres… Prefer a **concept node (a)** with a fitting emoji (Temporal ⏱️ ·
Firecracker 🔥 · MCP 🔌 · Qdrant 🧭 · Neo4j 🕸️ · Postgres 🐘 · warehouse 🏬 · stream 🌊).
**Do not rely on an embedded `data:` brand logo when you need to PNG-proof the diagram** —
the static viewer can't render data-URI images (see
[rendering-and-proofing.md](rendering-and-proofing.md)); a flat brand chip (brand-hex
rounded box + white label) is the other fallback.

**Labels stay terse — 1 to 3 words.** The icon carries recognition; the caption
disambiguates. "Route 53", "Model", "Vector store", not a sentence.

## Grouping — soft zones with a VISIBLE border

Gather related glyphs into **soft translucent zones** — the only "boxes" in this look, and
only where grouping carries meaning. Give them a **clearly visible 2px border** so the
grouping reads (faint 1px borders at low opacity disappear):
```
style: rounded=1;arcSize=6;html=1;dashed=1;dashPattern=8 6;strokeColor=<zoneStroke>;strokeWidth=2;fillColor=<zoneTint>;opacity=40;verticalAlign=top;align=left;spacingLeft=16;spacingTop=8;fontSize=17;fontStyle=1;fontColor=<zoneStroke>;
```
- **`opacity=40` is load-bearing.** The validator treats any vertex with `opacity≤40` as a
  backdrop and **exempts it from the overlap/edge-crossing checks** — so glyphs placed *on
  top* of a zone (parent=`1`, not children) don't flag, and two zones may overlap (a
  ring-around-a-core). Above 40 it reads as a solid box and the overlaps are (correctly)
  flagged. So either keep zones `opacity≤40`, **or** make the glyphs true children of the
  zone (parent=zone id, relative geometry) and use full opacity.
- **Primary/core zone → solid border** (`dashed=0`); secondary zones → dashed. 2px on both.
- **Per-zone soft colours** so layers are distinguishable at a glance (stroke / tint):
  edge `#7e57c2/#efe9fb` · interface `#4a78c2/#e6eefb` · intent `#2f9e8f/#e2f4f1` ·
  orchestration `#c98a00/#fdf2dd` · platform-core `#7a5aa6/#efe9f7` · foundation `#4a8a4a/#e8f4e6`;
  rails: security `#c0435a/#fbe9ec` · observability `#3f5b9e/#e8ecf8` · outcome `#b58a00/#fbf3d9` ·
  hitl `#b0568a/#f8e9f2` · estate `#8a6d3b/#f2ece0`. For a non-infra diagram, pick a fitting
  soft colour per zone from the same low-saturation family.
- Give each zone a numbered/emoji title ("① Edge & delivery", "🔒 Security & Identity").

## Category / build-source coding WITHOUT a box fill — the pill badge

A filled node encodes a category by its fill; an icon-forward node can't. When a diagram
has a category axis (build source, ownership, status, maturity), put a small rounded
**pill badge** directly beneath the label:
```
style: rounded=1;arcSize=60;html=1;fillColor=<tint>;strokeColor=<stroke>;fontColor=<dark>;fontSize=10;fontStyle=1;align=center;verticalAlign=middle;
value: OTB ✅            (category word + optional status glyph)
geometry: ~104–112 × 20–22, centred under the node (one grid-row below the caption)
```
Example palette (stroke / tint / dark-text) for a build-source axis — adapt the words to
your axis: OTB `#82b366/#e7f3e2/#3d6b2e` · Customized `#6c8ebf/#e7effc/#2f5588` ·
Tango-native `#d79b00/#fff0da/#8a5a00` · COTS `#9673a6/#efe7f5/#6b4a86` ·
Estate `#8a8a8a/#eeeeee/#555555`. Status glyph: ✅ done · ◐ partial · ○ missing. Decode
the badge colours in the legend. A lighter-weight alternative is a coloured `●` dot inline
in the caption, but the pill reads cleaner and is the default. **Omit badges entirely on
diagrams that have no category axis** — don't add noise.

## Emoji-as-icon craft (so it looks designed, not casual)

- Size the glyph **≥64px** (72px on hero/landing diagrams) so it reads as a real icon; caption bold 14–16px beneath. Never shrink a glyph to dodge an overlap — widen the zone/spacing/page instead.
- **Curate for consistency.** Pick a coherent family; avoid quirky/ambiguous marks (a big
  ❓ or 🦾 looks like a placeholder). **Never reuse the same emoji for two different nodes
  on one page** — it makes them look like the same thing. If two concepts fight for the same
  glyph, differentiate (ambiguity 🤔 vs capability 🧩 vs external 🔌).
- Emoji concept nodes and square AWS stencils **mix well** — the contrast (flat emoji +
  crisp vector service icon) is a recognised modern look, not an inconsistency.

## Keep coordinates on-grid

Centring a glyph/badge in a column puts its `x = centre − width/2`, which is usually **off
the 10px grid** → a flurry of benign "off the grid" hints. Snap `x,y` to the nearest 10
(`round(v/10)*10`) as you place them (do it centrally in a generator), so the validator
stays fully clean and the real warnings stand out.

## Generator scripts for repetitive grids

When the diagram is many similar icon+label nodes laid out in a grid (a service inventory,
a layered stack, a bucket dashboard), **write a small Python generator** that emits the XML
from a table of `(id, zone, col, row, icon/resIcon, label, category, status)`. It
guarantees consistent geometry and rhythm, snaps coordinates in one place, makes "add a
node / recolour a zone / bump icon size" a one-line change, and pairs perfectly with the
render→eyeball loop. Helpers to include: `emoji_node`, `aws_node`, `badge`, `zone`,
`banner`, `legend`, `hero_edge` — each returning an `<mxCell>` string; assemble per page.

## Worked micro-pattern

```xml
<!-- soft zone with a visible 2px border (backdrop: opacity=40) -->
<mxCell id="z1" parent="1" vertex="1" value="&lt;b&gt;① Foundation&lt;/b&gt;"
  style="rounded=1;arcSize=6;html=1;dashed=1;dashPattern=8 6;strokeColor=#4a8a4a;strokeWidth=2;fillColor=#e8f4e6;opacity=40;verticalAlign=top;align=left;spacingLeft=16;spacingTop=8;fontSize=17;fontStyle=1;fontColor=#4a8a4a;">
  <mxGeometry x="40" y="200" width="1160" height="240" as="geometry"/></mxCell>
<!-- real AWS icon, caption below, on top of the zone -->
<mxCell id="ic_bed" parent="1" vertex="1" value="Bedrock"
  style="sketch=0;outlineConnect=0;fontColor=#1b2a4a;strokeColor=#ffffff;verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=14;fontStyle=1;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.bedrock;fillColor=#01A88D;">
  <mxGeometry x="80" y="250" width="80" height="80" as="geometry"/></mxCell>
<!-- build-source pill badge beneath it -->
<mxCell id="bd_bed" parent="1" vertex="1" value="COTS ◐"
  style="rounded=1;arcSize=60;html=1;fillColor=#efe7f5;strokeColor=#9673a6;fontColor=#6b4a86;fontSize=10;fontStyle=1;align=center;verticalAlign=middle;">
  <mxGeometry x="70" y="370" width="104" height="22" as="geometry"/></mxCell>
<!-- concept node (emoji), no box -->
<mxCell id="c_mem" parent="1" vertex="1" value="&lt;font style='font-size:64px'&gt;🗄️&lt;/font&gt;&lt;br&gt;&lt;b style='font-size:15px;color:#1a3a5c'&gt;Memory&lt;/b&gt;"
  style="text;html=1;align=center;verticalAlign=top;fillColor=none;strokeColor=none;whiteSpace=wrap;">
  <mxGeometry x="240" y="240" width="180" height="120" as="geometry"/></mxCell>
```

## Verify (icon-forward especially needs an eyeball pass)

Validate as always, **and render a PNG and look at it** — see
[rendering-and-proofing.md](rendering-and-proofing.md). The validator can't see: an AWS
stencil that renders as a **blank square** (wrong `resIcon`), a caption that wraps onto
three lines, a glyph that's too small, a badge colliding with the row below, or a zone that
crowds its icons. One glance at the render catches all of them. AWS/emoji glyphs render in
the proof pipeline; embedded `data:` logos do not (they'll look broken in the PNG but are
fine in real draw.io).
