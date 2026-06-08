# Palette & copy-paste recipes

Reusable, known-good fragments for Path A. Adjust ids/coords/text; keep the structure.

## The semantic palette (memorise these six)

| Role | fillColor | strokeColor | gradientColor (for lanes) |
|---|---|---|---|
| Primary / default | `#dae8fc` | `#6c8ebf` | `#c9dcfb` |
| Success / start / healthy | `#d5e8d4` | `#82b366` | `#c5e0c4` |
| Warning / decision / pending | `#fff2cc` | `#d6b656` | `#ffe9a8` |
| Error / end / danger | `#f8cecc` | `#b85450` | `#f4b8b4` |
| Neutral / infra / store | `#f5f5f5` | `#666666` | `#e6e6e6` |
| External / 3rd-party | `#e1d5e7` | `#9673a6` | `#d3bfe0` |

Accent (for hot data paths / call-outs): orange `#e8732a` stroke, deep-blue header
`#16294A`. Bind each colour to a *role in this diagram* and keep it consistent.

## Recipe: title banner

```xml
<mxCell id="banner" parent="1" vertex="1"
  style="rounded=1;arcSize=8;html=1;whiteSpace=wrap;fillColor=#16294A;gradientColor=#2F5597;strokeColor=#0B1A33;fontColor=#FFFFFF;fontSize=20;align=center;verticalAlign=middle;shadow=1;"
  value="&lt;b&gt;System name&lt;/b&gt;&lt;br&gt;&lt;font color='#AFC6F0' size='1'&gt;one-line subtitle / status&lt;/font&gt;">
  <mxGeometry x="40" y="24" width="1520" height="72" as="geometry" />
</mxCell>
```

## Recipe: gradient service lane with structured body

```xml
<mxCell id="svc" parent="1" vertex="1"
  style="rounded=1;arcSize=4;html=1;whiteSpace=wrap;align=left;verticalAlign=top;spacingLeft=14;spacingTop=10;fillColor=#e2f7f3;gradientColor=#bdebe2;strokeColor=#0e8c7a;fontColor=#064b41;fontSize=12;shadow=1;"
  value="&lt;b&gt;📞 Service name&lt;/b&gt;&amp;nbsp;&lt;font color='#5A6B80' size='1'&gt;role&lt;/font&gt;&lt;br&gt;&lt;br&gt;&lt;font face='monospace'&gt;POST /endpoint&lt;/font&gt;&lt;br&gt;① step one&lt;br&gt;② step two">
  <mxGeometry x="300" y="380" width="600" height="180" as="geometry" />
</mxCell>
```

## Recipe: HTML-table node (data grid inside a box)

```xml
<mxCell id="grid" parent="1" vertex="1"
  style="rounded=1;arcSize=6;html=1;whiteSpace=wrap;align=center;verticalAlign=middle;fillColor=#ffffff;strokeColor=#9dbdf0;fontSize=11;shadow=1;"
  value="&lt;table cellpadding='4' style='font-size:11px;border-collapse:collapse;width:100%'&gt;&lt;tr style='background:#1A56C4;color:#ffffff'&gt;&lt;td&gt;Col A&lt;/td&gt;&lt;td&gt;Col B&lt;/td&gt;&lt;td&gt;Col C&lt;/td&gt;&lt;/tr&gt;&lt;tr&gt;&lt;td&gt;v1&lt;/td&gt;&lt;td&gt;v2&lt;/td&gt;&lt;td&gt;v3&lt;/td&gt;&lt;/tr&gt;&lt;tr style='background:#F0F5FF'&gt;&lt;td&gt;v4&lt;/td&gt;&lt;td&gt;v5&lt;/td&gt;&lt;td&gt;v6&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;">
  <mxGeometry x="320" y="120" width="560" height="120" as="geometry" />
</mxCell>
```

## Recipe: the four meaning-bearing edges

```xml
<!-- control / signalling -->
<mxCell id="e_ctrl" parent="1" edge="1" source="a" target="b" value="control"
  style="html=1;rounded=1;edgeStyle=orthogonalEdgeStyle;endArrow=block;strokeColor=#6c8ebf;strokeWidth=2;">
  <mxGeometry relative="1" as="geometry" /></mxCell>
<!-- data / media (heavy, hot) -->
<mxCell id="e_data" parent="1" edge="1" source="a" target="c" value="media"
  style="html=1;rounded=1;edgeStyle=orthogonalEdgeStyle;endArrow=block;startArrow=oval;startFill=1;strokeColor=#e8732a;strokeWidth=4;fontColor=#b5500f;fontStyle=1;">
  <mxGeometry relative="1" as="geometry" /></mxCell>
<!-- identity / auth (dashed) -->
<mxCell id="e_auth" parent="1" edge="1" source="idp" target="a" value="JWT"
  style="html=1;rounded=1;edgeStyle=orthogonalEdgeStyle;endArrow=block;strokeColor=#7a33c9;strokeWidth=2;dashed=1;dashPattern=6 4;fontColor=#3e146e;">
  <mxGeometry relative="1" as="geometry" /></mxCell>
<!-- weak / reference (dotted, grey) -->
<mxCell id="e_ref" parent="1" edge="1" source="x" target="y" value="ref"
  style="html=1;rounded=1;endArrow=open;strokeColor=#9aa7b8;strokeWidth=1.5;dashed=1;dashPattern=2 4;fontColor=#5a6b80;">
  <mxGeometry relative="1" as="geometry" /></mxCell>
```

## Recipe: legend (decodes the encoding)

```xml
<mxCell id="legend" parent="1" vertex="1"
  style="rounded=1;arcSize=4;html=1;whiteSpace=wrap;align=left;verticalAlign=top;spacingLeft=14;spacingTop=10;fillColor=#fbfcfe;strokeColor=#9aa7b8;fontColor=#233247;fontSize=12;dashed=1;dashPattern=8 4;shadow=1;"
  value="&lt;b&gt;🗺️ Legend&lt;/b&gt;&lt;br&gt;&lt;br&gt;&lt;font color='#6c8ebf'&gt;&lt;b&gt;▬▬&lt;/b&gt;&lt;/font&gt; control&lt;br&gt;&lt;font color='#e8732a'&gt;&lt;b&gt;▬▬▬&lt;/b&gt;&lt;/font&gt; data / media&lt;br&gt;&lt;font color='#7a33c9'&gt;&lt;b&gt;– –&lt;/b&gt;&lt;/font&gt; identity&lt;br&gt;&lt;font color='#9aa7b8'&gt;&lt;b&gt;· ·&lt;/b&gt;&lt;/font&gt; reference">
  <mxGeometry x="1010" y="864" width="520" height="170" as="geometry" />
</mxCell>
```

## Recipe: numbered stage marker (walkable sequence rail)

```xml
<mxCell id="stage1" parent="1" vertex="1"
  style="rounded=1;arcSize=40;html=1;whiteSpace=wrap;align=center;verticalAlign=middle;fillColor=#1A56C4;strokeColor=none;fontColor=#FFFFFF;fontSize=10;fontStyle=1;shadow=1;"
  value="①&#10;Pre-session">
  <mxGeometry x="228" y="430" width="44" height="96" as="geometry" />
</mxCell>
```

## Recipe: actor + store + decision

```xml
<mxCell id="actor" parent="1" vertex="1" value="👤 User"
  style="shape=umlActor;html=1;verticalLabelPosition=bottom;verticalAlign=top;fillColor=#16294A;strokeColor=#16294A;fontColor=#16294A;">
  <mxGeometry x="120" y="200" width="60" height="110" as="geometry" /></mxCell>
<mxCell id="db" parent="1" vertex="1" value="🗄️ Store"
  style="shape=cylinder3;html=1;fillColor=#f5f5f5;gradientColor=#e6e6e6;strokeColor=#666666;">
  <mxGeometry x="1040" y="620" width="120" height="100" as="geometry" /></mxCell>
<mxCell id="dec" parent="1" vertex="1" value="valid?"
  style="rhombus;html=1;whiteSpace=wrap;fillColor=#fff2cc;strokeColor=#d6b656;">
  <mxGeometry x="400" y="400" width="120" height="80" as="geometry" /></mxCell>
```

## Composition checklist for a "wow" architecture diagram

1. Banner with gradient + status.
2. A clear flow axis of 3–5 gradient service lanes; bind one palette colour per service.
3. One HTML-table node where there's structured data to show (a request list, a config,
   a mode matrix) instead of loose text.
4. Two visually distinct edge types minimum (e.g. control vs data) so the topology reads
   at a glance; route any "bypass" path with `exitX/entryX` so it's obviously separate.
5. Side column for cross-cutting concerns (identity, store, audit) off the main axis.
6. A legend decoding colours + line styles.
7. Optional: numbered stage rail to make it walkable; emoji glyphs for category recall.
8. Validate; deliver with a one-paragraph read-me of the encoding.
