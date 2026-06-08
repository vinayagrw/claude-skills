# CSS-driven SVG animation — the modern + latest layer

CSS animation lives in an internal `<style>` block and is the **portable, accessible,
context-proof** layer: it runs when the `.svg` is opened directly, inlined in HTML, **and**
even when the file is used as an `<img>` or CSS `background-image` (the one place SMIL-script
can't reach — see [smil-and-filters.md](smil-and-filters.md) for the full matrix). Animate
**`transform`/`opacity`** for anything continuous (GPU-cheap); reach for the newer primitives
below when they unlock something CSS couldn't do before.

**The one cross-cutting rule:** every technique here works inside a **standalone `.svg`**
(CSS in `<style>`) *except* the two that need a host document — **scroll-driven animations**
(need a scroll container) and **View Transitions** (need page navigation). Those require the
SVG to be **inline in HTML**.

Table of contents: 1) `@property` · 2) scroll-driven · 3) motion path · 4) `d:path()` morph ·
5) `color-mix`/relative color · 6) View Transitions · 7) `prefers-reduced-motion` · 8) perf ·
9) standalone-support quick table.

---

## 1. `@property` — smoothly animate gradients, angles, counters

Registering a custom property with a `syntax` type makes the browser **interpolate** it.
Untyped `var()` is a string and snaps; a typed one animates. This is the unlock for animating
**gradient color stops, conic/gradient angles, and raw numbers** — impossible before.

```css
@property --hue { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
.blob { background: conic-gradient(from var(--hue), #f0f, #0ff, #f0f);
        animation: spin 4s linear infinite; }
@keyframes spin { to { --hue: 360deg; } }
```
Color-stop morph: register two `<color>` props and animate them inside `linear-gradient(var(--a), var(--b))`.
**Standalone `.svg`:** ✅. **Support:** Baseline (mid-2024) — Chrome/Edge 85+, Safari 16.4+,
Firefox 128+. **Fallback:** declare a plain `background`/`color` *before* the typed one.

## 2. Scroll-driven animations — `scroll()` / `view()`

Drive a normal `@keyframes` by **scroll progress** instead of time. `animation-timeline: scroll()`
ties to a scroll container; `view()` ties to an element's pass through the viewport.
`animation-range` restricts the slice (e.g. `entry`/`cover`/`exit`). Zero-JS scroll reveals.

```css
.reveal { animation: draw linear both; animation-timeline: view();
          animation-range: entry 0% cover 40%; animation-duration: 1ms; /* Firefox needs nonzero */ }
@keyframes draw { from { stroke-dashoffset: 1000; opacity: 0; } to { stroke-dashoffset: 0; opacity: 1; } }
```
**Standalone `.svg`:** ❌ in practice — needs a scrolling host. To scroll-reveal SVG, inline it
in HTML and use the page scroll. **Support:** Chrome/Edge 115+, Safari 26+ (Sept 2025);
Firefox behind a flag. **Fallback:** gate behind `@supports (animation-timeline: scroll())`;
otherwise the element shows its static end-state. → an **inline-in-HTML** technique.

## 3. CSS Motion Path — move along a curve, no JS

`offset-path` = the route (`path("M…")`, `ray(45deg closest-side)`, `circle()/polygon()`);
`offset-distance` (0–100%) is the animatable position; `offset-rotate: auto` turns the element
to face travel; `offset-anchor` picks which point rides the path.

```css
.comet { offset-path: path("M10,80 C40,10 120,10 150,80 S260,150 290,80");
         offset-rotate: auto; animation: fly 3s ease-in-out infinite; }
@keyframes fly { to { offset-distance: 100%; } }
```
**Standalone `.svg`:** ✅ — a clean way to send a `<g>`/icon along a curve you also draw.
**Support:** broad (Chrome/Edge/Firefox/Safari for the core `path()`/`offset-distance`/`offset-rotate`;
`ray()`/shapes newer — `@supports`-test if relied on). **Fallback:** element stays at its normal spot.

## 4. Shape morph via CSS `d: path()` (+ a note on `interpolate-size`)

The CSS `d` property overrides a `<path>`'s `d` and **is animatable** — morph in keyframes.
**Hard constraint:** the two paths need the **same count and type of commands** or nothing animates.

```css
.morph { animation: blob 6s ease-in-out infinite alternate; }
@keyframes blob {
  from { d: path("M50,10 C90,10 90,90 50,90 C10,90 10,10 50,10"); }
  to   { d: path("M50,20 C80,20 80,80 50,80 C20,80 20,20 50,20"); } }
```
**Standalone `.svg`:** ✅ (it's SVG-specific) **but Chromium-only** — Firefox/Safari don't
animate CSS `d`. **Portable fallback:** SMIL `<animate attributeName="d">`
(see [smil-and-filters.md](smil-and-filters.md) §3) or GSAP MorphSVG.
*Separately:* `interpolate-size: allow-keywords` / `calc-size()` animate intrinsic *box* sizes
(`height:0 → auto`) — Chromium 129+ only, unrelated to path geometry.

## 5. `color-mix()` + relative color — animated palettes from one base

`color-mix(in oklch, c1 70%, white)` blends (use `oklch`/`oklab` for even ramps). Relative
color `oklch(from var(--brand) calc(l + .1) c h)` derives a variant by tweaking channels. Pair
with `@property` `<color>` vars for smooth palette animation.

```css
.swatch { --brand: oklch(62% .2 28); fill: var(--brand);
          stroke: color-mix(in oklch, var(--brand) 70%, white); }
.swatch:hover { fill: oklch(from var(--brand) calc(l + .1) c h); }
```
**Standalone `.svg`:** ✅ on `fill`/`stroke`/`stop-color`. **Support:** `color-mix()` widely
available; relative color Baseline-newly (2024: Safari 16.4+, Chrome 119+, Firefox 128+).
**Fallback:** declare a plain hex first.

## 6. View Transitions — animate between states/pages

Same-document: `document.startViewTransition(() => updateDOM())`. Cross-document (MPA): the
pure-CSS `@view-transition { navigation: auto; }` on both same-origin pages; shared elements
(incl. an SVG logo) get a `view-transition-name` and morph across navigation.

```css
@view-transition { navigation: auto; }     /* both pages, same-origin */
.logo { view-transition-name: logo; }
::view-transition-group(logo){ animation-duration: .4s; }
```
**Standalone `.svg`:** ❌ HTML-only (needs navigation). **Support:** same-doc Chrome 111+/Safari 18+/Firefox 144+;
cross-doc Chrome 126+/Safari 18.2+, Firefox not yet. **Fallback:** graceful — instant nav,
wrap JS in `if (document.startViewTransition)`.

## 7. `prefers-reduced-motion` — the accessibility floor

Prefer the **opt-in** pattern: base styles calm, motion *added* under `no-preference`. When
motion conveys meaning, **replace** it with a crossfade rather than deleting it.

```css
@media (prefers-reduced-motion: no-preference) { .spinner { animation: spin 1s linear infinite; } }
/* or a global safety net: */
@media (prefers-reduced-motion: reduce) {
  *,*::before,*::after { animation-duration:.01ms!important; animation-iteration-count:1!important;
                         transition-duration:.01ms!important; } }
```
**Standalone `.svg`:** ✅ (standard media feature). Universally supported. *Note:* this can't
gate **SMIL** — for SMIL accessibility, prefer CSS or ship a reduced-motion variant.

## 8. Performance — stay on the compositor

Only **`transform` and `opacity`** (plus `stroke-dashoffset`) are GPU-composited — no layout,
no paint, 60fps. Animating `x`/`y`/`cx`/`cy`/`width`/`height`/`top`/`left` or big blurred
filters per-frame forces reflow/jank. Prefer a CSS `transform` on the element over SVG geometry
attributes. `will-change: transform` **sparingly** — only the few moving nodes, not permanently.

```css
.icon { will-change: transform; animation: float 2s ease-in-out infinite; }
@keyframes float { 50% { transform: translateY(-8px); } }   /* transform, not top: */
```

## 9. Standalone `.svg` support — quick table

| Technique | Works opening `.svg` directly? | Note |
|---|---|---|
| `@property` | ✅ | pure CSS |
| Scroll-driven `scroll()`/`view()` | ❌ (needs page scroll) | inline-in-HTML to scroll-reveal SVG |
| Motion Path `offset-path` | ✅ | great fit |
| `d: path()` morph | ✅ (Chromium) | SMIL `<animate d>` for cross-browser |
| `color-mix()` / relative color | ✅ | on `fill`/`stroke`/`stop-color` |
| View Transitions | ❌ (HTML-only) | needs navigation |
| `prefers-reduced-motion` | ✅ | can't gate SMIL |
| GPU compositing / `will-change` | ✅ | same model everywhere |

**Restate at handoff:** *none* of these run when the SVG is an `<img>` or CSS `background-image`
— that rasterizes to a static first frame. Use direct-open, `<object>`, or inline SVG for motion.

### Two corrections worth remembering (models get these wrong from memory)
1. **Scroll-driven animation is NOT a standalone-SVG technique** — it needs a scrolling host
   document, so an SVG scroll-reveal must be inline in HTML.
2. **`d: path()` and `interpolate-size`/`calc-size()` are Chromium-only** (not Baseline);
   `d: path()` also requires identical command counts. For portable shape morphing teach SMIL
   `<animate attributeName="d">`.

## Sources
web.dev [@property Baseline](https://web.dev/blog/at-property-baseline) ·
MDN [Scroll-driven animations](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations) ·
Josh Comeau [Scroll-Driven](https://www.joshwcomeau.com/animation/scroll-driven-animations/) ·
MDN [Motion path](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Motion_path) ·
MDN [d property](https://developer.mozilla.org/en-US/docs/Web/CSS/d) ·
CSS-Tricks [Animate SVG path changes in CSS](https://css-tricks.com/animate-svg-path-changes-in-css/) ·
MDN [color-mix()](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color-mix) ·
MDN [Using relative colors](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Colors/Using_relative_colors) ·
Chrome [View transitions 2025](https://developer.chrome.com/blog/view-transitions-in-2025) ·
MDN [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) ·
Motion [Web Animation Performance Tier List](https://motion.dev/magazine/web-animation-performance-tier-list) ·
Smashing [GPU Animation: Doing It Right](https://www.smashingmagazine.com/2016/12/gpu-animation-doing-it-right/)
