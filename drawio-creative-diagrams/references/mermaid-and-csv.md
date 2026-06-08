# Path B (Mermaid) and Path C (CSV) — details

## Path B — embedded Mermaid

### When
Standard **flowchart / sequence / class / state / ER / gantt / pie** that the user will
keep editing as text. Mermaid is the supported text-diagram path in draw.io now —
**PlantUML is deprecated in app.diagrams.net from the end of 2025**.

### How the user inserts it
In draw.io: **Arrange ▸ Insert ▸ Mermaid** (or the toolbar `+` ▸ Mermaid). Paste the
Mermaid code, click *Insert*. It becomes a single shape. To edit later: select it,
press **Enter**, edit the code, *Apply*. The Mermaid source stays live inside the file.

### Two ways to deliver
1. **Simplest — hand over the Mermaid code** in your reply (or in a `.mmd` file) and
   tell the user the Insert path above. Most reliable, because draw.io does the layout.
2. **Pre-embedded shape** — wrap the Mermaid so it renders on open. The cell uses the
   mermaid shape and stores the code in the style; draw.io re-lays-it-out on load:

   ```xml
   <mxCell id="m1" parent="1" vertex="1"
     style="shape=mermaid;whiteSpace=wrap;html=1;"
     value="graph LR&#10;  A[&quot;Client&quot;] --&gt;|&quot;POST&quot;| B[&quot;API&quot;]&#10;  B --&gt; C[(&quot;DB&quot;)]">
     <mxGeometry x="40" y="40" width="400" height="200" as="geometry" />
   </mxCell>
   ```

   Note `&#10;` for newlines inside the code, and the usual XML escaping. Because draw.io
   versions vary in how they round-trip an embedded mermaid shape, prefer option 1 unless
   the user specifically wants a single self-rendering file.

### Authoring rules (match the Figma/Mermaid conventions)
- Keep it simple unless the user asks for detail.
- Default to `graph LR` / `flowchart LR` direction.
- **Quote all node and edge text**: `A["Login service"] -->|"valid token"| B["Home"]`.
- Supported types: `graph`/`flowchart`, `sequenceDiagram`, `classDiagram`,
  `stateDiagram-v2`, `erDiagram`, `gantt`, `pie`. Avoid the word `end` as a node id.
- You can colour `graph`/`flowchart` nodes with `style id fill:#d5e8d4,stroke:#82b366`
  — but sparingly, unless asked.

---

## Path C — CSV-driven generation

### When
**Many near-identical nodes from tabular data**: org charts, host/server inventories,
service catalogues, team rosters, asset lists — anything that's "one shape per row" with
relationships defined by a column.

### How the user inserts it
**Arrange ▸ Insert ▸ Advanced ▸ CSV**, paste the block below (config header + data),
click *Import*. draw.io builds and auto-lays-out the shapes and connectors.

### The block format
A header of `#`-prefixed directives, then a CSV with a header row. `%columnName%`
substitutes a cell's value into labels/styles.

```text
## Hover over a node to see its data; edit the config above the data.
# label: %name%&lt;br&gt;&lt;i&gt;%role%&lt;/i&gt;
# style: rounded=1;whiteSpace=wrap;html=1;fillColor=%fill%;strokeColor=#6c8ebf;
# namespace: csvimport-
# connect: {"from":"manager","to":"name","invert":true,"style":"edgeStyle=orthogonalEdgeStyle;rounded=1;endArrow=block;"}
# width: auto
# height: auto
# padding: 12
# layout: auto
name,role,manager,fill
Ada,VP Eng,,#dae8fc
Grace,Eng Mgr,Ada,#d5e8d4
Linus,Staff Eng,Grace,#d5e8d4
Margaret,Senior Eng,Grace,#fff2cc
```

Key directives:
- `# label:` — the node label template (HTML allowed, `%col%` substitution).
- `# style:` — base style; embed `%col%` to vary fill/stroke per row.
- `# connect:` — JSON: draw an edge from the column named `from` matching the column
  named `to`. `invert:true` flips arrow direction. Repeat the directive for multiple
  relationship types (e.g. reports-to vs collaborates-with) with different styles.
- `# stylename` / multiple styles — map a category column to different style strings.
- `# layout:` — `auto`, `horizontaltree`, `verticaltree`, `organic`, etc.

### Hard limitation
CSV import is a script restricted to **built-in library shapes** and **cannot create
nested containers** (a shape that holds child shapes). If the design needs swimlanes,
gradient lanes, HTML-table nodes, or bespoke grouping → use **Path A** instead. CSV is
for breadth (many nodes), Path A is for depth (rich, structured nodes).

### Delivering Path C
Since the CSV block isn't itself a `.drawio` file, either:
- give the user the block + the Insert path (they get full auto-layout), or
- if they want a ready `.drawio`, run the import mentally and emit Path-A XML for the
  rows (only worth it for small N; for large N, prefer the CSV block).
