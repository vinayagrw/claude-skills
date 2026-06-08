# SMIL + filters — declarative animation that plays in a standalone `.svg`

Everything here "just plays" when a `.svg` is opened directly, **with no JS, no build step**.
SMIL (`<animate>` & friends) is native to SVG, runs even inside `<img>`/CSS-background, and is
the **only** declarative way to do path-morphing and motion-along-a-path with zero script.
Filters are presentation-only and also run everywhere. The two things that do **not** run in
`<img>`/background contexts are `<script>` and external resource loads — so bake any
JS-computed value (path length, morph frames) into the file as a literal.

Contents: 0) SMIL support · 1) the SMIL elements · 2) draw-on · 3) path morph · 4) filters
(turbulence/gooey/glow/shadow) · 5) animated gradients · 6) clip/mask reveal · 7) particle on
path · 8) **rendering-context matrix** · sources.

---

## 0. SMIL state of support (2026)
Chrome **never actually removed** SMIL — it filed an intent-to-deprecate (~2016), then
**suspended it** after pushback; SMIL keeps shipping in Chrome/Edge, Firefox, and Safari. The
deprecation was reversed precisely because **path morphing and animation-inside-`<img>` have no
CSS/WAAPI equivalent**. Use `xlink:href` for hrefs for max compatibility (modern browsers also
accept bare `href`); declare `xmlns:xlink="http://www.w3.org/1999/xlink"` if you use it.

## 1. The SMIL elements
The animation element goes **inside** the element it targets (or `href`s another).

```xml
<!-- 1a. animate one attribute -->
<rect x="10" y="40" width="20" height="20" fill="tomato">
  <animate attributeName="x" from="10" to="170" dur="2s" repeatCount="indefinite"/>
</rect>

<!-- 1b. animateTransform — the ONLY way to SMIL rotate/scale/translate -->
<rect x="-15" y="-15" width="30" height="30" fill="#48f" transform="translate(100 50)">
  <animateTransform attributeName="transform" type="rotate"
                    from="0 0 0" to="360 0 0" dur="3s" repeatCount="indefinite" additive="sum"/>
</rect>
```
- `rotate` takes `angle cx cy`. A second `animateTransform` on the same `transform` **replaces**
  the first unless you use `additive="sum"`.
- **`set`** = instant, non-interpolated switch (visibility/fill flips): `<set attributeName="fill" to="limegreen" begin="2s"/>`.

**Pacing & easing:** `values` + `keyTimes` (equal counts, start 0 end 1, non-decreasing) and —
for real easing — `calcMode="spline"` + `keySplines` (N−1 cubic-bézier tuples, each `x1 y1 x2 y2`
in 0..1; **ignored unless `calcMode="spline"`**):
```xml
<animate attributeName="cx" values="20; 180" dur="1.5s" repeatCount="indefinite"
         calcMode="spline" keyTimes="0; 1" keySplines="0.42 0 0.58 1"/>   <!-- ease-in-out -->
```

**Chaining** with `begin="otherId.end"` (offsets ok: `a.end+0.3s`; events ok: `begin="click"`,
`begin="btn.click"`). **The #1 gotcha:** `fill="freeze"` holds the final value; the default
`fill="remove"` **snaps back** — that's why a fade-in sometimes vanishes again.

## 2. Draw-on / handwriting
Make one dash as long as the whole path and animate `stroke-dashoffset` to 0. **Use
`pathLength="1"`** so the dash math is just `1` regardless of real geometry — no `getTotalLength()`.

```xml
<!-- SMIL -->
<path d="M10,80 C60,10 140,10 190,80" fill="none" stroke="#222" stroke-width="3"
      pathLength="1" stroke-dasharray="1 1">
  <animate attributeName="stroke-dashoffset" from="1" to="0" dur="2s" fill="freeze"/>
</path>
```
```xml
<!-- CSS variant — also runs inside <img> -->
<style> .draw{ stroke-dasharray:1; stroke-dashoffset:1; animation:draw 2s ease forwards; }
         @keyframes draw{ to{ stroke-dashoffset:0; } } </style>
<path class="draw" d="M10,80 C60,10 140,10 190,80" fill="none" stroke="#222" stroke-width="3" pathLength="1"/>
```
If it draws backwards, swap `from`/`to`. **Stagger** a whole illustration by giving each path an
incremental `begin`/`animation-delay`, sequenced the way a human would actually draw it.

## 3. Path morphing — `<animate attributeName="d">`
```xml
<path fill="#f39" d="M50,10 L90,90 L10,90 Z">
  <animate attributeName="d" dur="3s" repeatCount="indefinite"
    values=" M50,10 L90,90 L10,90 Z ;  M10,10 L90,10 L50,90 Z ;  M50,10 L90,90 L10,90 Z "/>
</path>
```
**Hard requirement:** every path in `values` must have the **same number and type of commands,
in the same order** — else it snaps/twists. (`keyPoints` is for `animateMotion`, NOT for `d`.)
**Fallback when point counts differ:** precompute with **flubber**
(`flubber.interpolate(a, b, {maxSegmentLength: .1})`), sample at several `t`, and **bake** the
results into a SMIL `values` list so the file stays JS-free. GSAP MorphSVG is the commercial
auto-point-mapping equivalent.

## 4. Filters — the "wow" layer (run in every context)
Animate a filter by putting `<animate>` **inside the filter primitive**.

```xml
<!-- 4a. water/wobble: turbulence + displacement -->
<filter id="wobble">
  <feTurbulence type="fractalNoise" baseFrequency="0.02 0.04" numOctaves="2" result="noise">
    <animate attributeName="baseFrequency" dur="8s" repeatCount="indefinite"
             values="0.02 0.04; 0.04 0.02; 0.02 0.04"/>
  </feTurbulence>
  <feDisplacementMap in="SourceGraphic" in2="noise" scale="20" xChannelSelector="R" yChannelSelector="G"/>
</filter>
```
`fractalNoise` = smooth water/clouds, `turbulence` = sharper flame; big `scale` warps text to mush.

```xml
<!-- 4b. gooey/metaball merge: blur + steep alpha contrast -->
<filter id="goo">
  <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>
  <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo"/>
  <feBlend in="SourceGraphic" in2="goo"/>
</filter>
```
The alpha row (`…0 0 0 18 -7` → `alpha*18 − 7`) snaps blurred edges into one blob. **Caveat:**
degrades to plain blur in Safari/Firefox — test and keep a graceful fallback.

```xml
<!-- 4c. pulsing glow: blur + merge (crisp original on top) -->
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur stdDeviation="3" result="b">
    <animate attributeName="stdDeviation" values="2;6;2" dur="2s" repeatCount="indefinite"/>
  </feGaussianBlur>
  <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
```
Glow spills past the box — set the filter region (`x/y=-50%`, `w/h=200%`) or it clips.
`<feDropShadow dx dy stdDeviation flood-color flood-opacity/>` is the shorthand; animate its
attrs the same way. **Perf:** filters re-rasterize each frame — animate parameters sparingly;
prefer animating opacity of a pre-rendered glow layer (see [creative-techniques.md](creative-techniques.md) Part C).

## 5. Animated gradients (CSS can't; SVG can)
```xml
<linearGradient id="g">
  <stop offset="0" stop-color="#f06">
    <animate attributeName="stop-color" values="#f06;#06f;#0f6;#f06" dur="6s" repeatCount="indefinite"/>
  </stop>
  <stop offset="1" stop-color="#06f"/>
</linearGradient>
```
Sliding **sheen** via `gradientTransform` (use `animateTransform`, set `gradientUnits="userSpaceOnUse"`):
```xml
<linearGradient id="sheen" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="60" y2="0">
  <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".8"/>
  <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  <animateTransform attributeName="gradientTransform" type="translate" from="-60 0" to="200 0" dur="2s" repeatCount="indefinite"/>
</linearGradient>
```
A stop animation goes **inside** the `<stop>`; a gradient-position/transform animation goes
**inside the gradient**, outside the stops.

## 6. Reveal via clipPath / mask
```xml
<!-- hard-edge wipe: growing rect in a clipPath -->
<clipPath id="wipe"><rect x="0" y="0" height="60" width="0">
  <animate attributeName="width" from="0" to="200" dur="1.5s" fill="freeze"/></rect></clipPath>
<text x="10" y="42" font-size="40" fill="#222" clip-path="url(#wipe)">HELLO</text>
```
**clipPath = hard edge, solid shapes only. mask = supports gradients/opacity → soft edges**
(in a mask, **white = visible, black = hidden**; backwards = inverted reveal). Set
`clipPathUnits="userSpaceOnUse"` if your shapes look 0–1 scaled.

## 7. Particle / dot-follows-line
Reuse the **same path** for the visible line and the dot's motion via `<mpath>`:
```xml
<path id="route" d="M10,110 Q60,0 110,60 T210,20" fill="none" stroke="#bbb" stroke-width="2"/>
<circle r="5" fill="#0bf">
  <animateMotion dur="4s" repeatCount="indefinite" rotate="auto"><mpath xlink:href="#route"/></animateMotion>
</circle>
```
Author the moving element at the **origin (0,0)** — `animateMotion` *adds* to any `cx`/`cy`.
`rotate="auto"` faces it along the tangent. `<mpath>` keeps line+motion in sync and DRY. Combine
with §2 to draw the line in while the dot leads it (sync the `dur`). Stagger several dots with
different `begin`.

## 8. Rendering-context matrix — what actually runs
| Loading context | SMIL | CSS-anim in embedded `<style>` | `<script>` | external resources |
|---|---|---|---|---|
| **Standalone `.svg` opened directly** | ✅ | ✅ | ✅ | ✅ |
| **Inline `<svg>` in HTML** | ✅ | ✅ (+page CSS) | ✅ (+page JS) | ✅ |
| **`<img src="x.svg">`** | ✅ | ✅ | ❌ | ❌ |
| **CSS `background-image: url(x.svg)`** | ✅ | ✅ | ❌ | ❌ |
| **`<object>` / `<iframe>`** | ✅ | ✅ | ✅ | ✅ |

Common myth: "CSS doesn't run in `<img>`." That's about *external/page* stylesheets reaching in
— a `<style>` block **inside the SVG file** runs fine in `<img>`. That's why embedded-CSS and
SMIL are the two valid "plays anywhere" delivery paths.

**For a file that just opens and plays anywhere:** use SMIL and/or embedded `<style>` CSS,
**inline all assets** (no external fonts/images — convert text to paths or embed a font as a data
URI), avoid `<script>` for animation logic, and **bake** any JS-computed values into literals.

## Sources
caniuse [SVG SMIL](https://caniuse.com/svg-smil) ·
CSS-Tricks [SMIL on?](https://css-tricks.com/smil-on/) ·
CSS-Tricks [Guide to SVG Animations (SMIL)](https://css-tricks.com/guide-svg-animations-smil/) ·
SVG WG [Animations spec](https://svgwg.org/specs/animations/) ·
MDN [animateMotion](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/animateMotion) ·
MDN [mpath](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/mpath) ·
CSS-Tricks [How SVG line animation works](https://css-tricks.com/svg-line-animation-works/) ·
Stefan Judis [pathLength](https://www.stefanjudis.com/today-i-learned/pathlength-makes-makes-svg-path-animations-easier-to-manage/) ·
Motion [path morphing](https://motion.dev/tutorials/js-svg-path-morphing) ·
Codrops [feTurbulence texture](https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/) ·
Practical SVG [gooey](https://practical-svg.chriscoyier.net/chapter/practical-svg-ebook-12/) ·
Motion Tricks [masks & clipPaths](https://www.motiontricks.com/svg-masks-and-clippaths/) ·
Chris Coyier [embedded `<style>` runs in img/background (CodePen)](https://codepen.io/chriscoyier/pen/emvJjG)
