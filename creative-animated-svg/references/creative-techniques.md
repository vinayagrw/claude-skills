# Creative techniques, the JS ecosystem & the craft layer

The effect catalog is table stakes; **timing is the signature.** Three backends exist — pick
right and 90% of "wow" follows: **CSS `@keyframes`** (best default: `transform`/`opacity`/
`stroke-dashoffset`, GPU-cheap, free reduced-motion), **SMIL** (self-contained, best for
`animateMotion` + chained `begin`), **JS** (only for runtime values, arbitrary `d` morph,
scroll-binding, physics, orchestration). The biggest "designed vs amateur" lever is **easing +
restraint** (Part C), not the effect.

Part A = effect catalog · Part B = when a JS lib earns its weight · Part C = the craft checklist.

---

## Part A — Signature visual effects

**A1. Self-drawing line art.** `stroke-dasharray`/`stroke-dashoffset` both = path length, animate
offset → 0. Use `pathLength="1"` so you hardcode `1` regardless of geometry. **Stagger** each
path's `animation-delay`/`begin` in the order a human would draw it. For calligraphy with varying
width, draw the filled art and dashoffset-animate a center-line **mask** so the thick/thin shape
reveals. (Full code in [smil-and-filters.md](smil-and-filters.md) §2.)

**A2. Particles along a path / flow-in-a-pipe.** Zero-JS: SMIL `animateMotion` + `<mpath>`
(§7 there). Many particles/trails/variable speed: JS `path.getPointAtLength(t)` per frame, fade
trailing copies by index. **Cheapest "flow":** a thick stroke pipe + a dashed stroke on top with
animated `stroke-dashoffset` (marching ants) reads as continuous flow for almost nothing.

**A3. Liquid / gooey / blobs.** Gooey filter (blur + alpha-contrast `feColorMatrix`) over a group
of moving circles → mercury merge (§4b there; degrades in Safari/FF — test). Organic blob = morph
`d` between matched-point shapes (SMIL) or GSAP MorphSVG for dissimilar shapes. Purely decorative
blobs: animating `transform`+`border-radius` on a div is cheaper than morphing.

**A4. Glitch / scanline / RGB-split.** RGB split = 3 channel-tinted copies offset a few px and
jittered on `steps()` timing (or two pseudo-element copies clipped with jumping `clip-path`
insets). Displacement glitch = `feTurbulence` + `feDisplacementMap`, animate **`seed`** (cheap),
not `baseFrequency`. Scanlines = `repeating-linear-gradient` overlay with slow `translateY`. Keep
glitches **intermittent** (random short bursts) — constant glitch reads as broken.

**A5. Looping ambient backgrounds.** Mesh gradient = 3–4 large blurred radial gradients drifting
on eased, **out-of-phase** keyframes. Living grain = one `feTurbulence fractalNoise`, subtly
animate `baseFrequency`/`seed`, keep `numOctaves` 1–2. Floating shapes = blurred blobs each on its
own slow loop with **coprime durations** (17s/23s/29s) so the composite period is huge and the
loop is imperceptible.

**A6. Animated charts / counters.** Bars grow via `transform: scaleY()` from 0 with
`transform-origin: bottom` (NOT `height` — that's layout). Line draws via the A1 dashoffset trick.
Pie/donut/progress ring = circle with `stroke-dasharray` = circumference, animate
`stroke-dashoffset`. Counter tick-up = JS/WAAPI interpolate a number with `Math.round` per frame,
ease-out to decelerate into the final value. Stagger so the chart "assembles."

**A7. Glow / shimmer / gradient text.** Neon = layered `drop-shadow`/`text-shadow`, pulse the
**opacity of a static glow layer** (not blur radius per-frame). Shimmer/gradient text =
`background: linear-gradient(...)` + `background-clip: text; color: transparent;` animate
`background-position` over `background-size: 200%` — stays on the compositor at 60fps.

**A8. Isometric / parallax.** SVG coords are 2D; CSS 3D transforms don't apply reliably to *inner*
nodes. Robust pattern: **stacked SVG layers as separate DOM elements** in a `perspective` +
`transform-style: preserve-3d` container, each a different `translateZ`/movement. Parallax = move
background layers less than foreground (`transform` only); mouse-parallax maps pointer → small
eased per-layer `translate`.

**A9. Morphing icon states.** **Don't morph `d` if you can avoid it.** Hamburger→close = three
strokes you `transform` (top/bottom rotate ±45° & translate to cross, middle `opacity:0`) — pure
CSS, reversible, `aria-expanded`. Play→pause and true morphs: crossfade two paths (opacity+scale)
for robustness, or interpolate `d` (SMIL/MorphSVG) with **matched point counts & winding** or it
twists.

---

## Part B — JS ecosystem & when to reach for it

**2025 fact:** Webflow made **all of GSAP free**, including MorphSVG, DrawSVG, MotionPath,
SplitText, ScrollTrigger — commercial use included. The historical reason to avoid the premium
plugins is gone.

| Tool | Best at | Reach for it when (vs plain CSS/SMIL) |
|---|---|---|
| **GSAP core** | orchestrated timelines, precise sequencing, scroll-binding | complex multi-step choreography or scroll scenes CSS can't sequence. Overkill for one transition. |
| **GSAP DrawSVG** | draw-on with start/end % + easing | you need runtime % control; a one-shot draw → just CSS dashoffset. |
| **GSAP MorphSVG** | morph arbitrary `d`, auto point-mapping (no twist) | morphing dissimilar shapes/logos — the one thing plain CSS genuinely can't do well. |
| **GSAP MotionPath** | many objects on a path with rotation/offset | one particle → SMIL `animateMotion` is lighter. |
| **anime.js v4** | concise modern tweening, nice stagger/timeline, WAAPI-based | library ergonomics without GSAP's size. Not needed for trivial CSS. |
| **Lottie / dotLottie** | render After-Effects-designed JSON (intricate particles/morphs) | a motion designer built it in AE. **Don't** use for simple icons — heavier than an SVG. |
| **Vivus** | one thing: SVG line-drawing | draw-on with sync options, no hand-rolling. Increasingly replaced by CSS `pathLength`. |
| **SVG.js** | programmatically build/manipulate SVG + small anim module | you generate SVG from data in JS. Not an animation powerhouse. |
| **Snap.svg** | classic "jQuery for SVG" | legacy only — **largely unmaintained, don't start new work on it.** |
| **Web Animations API** (`element.animate`) | native keyframes + play/pause/reverse, zero deps | you need JS control but want no library. The floor before adding any dep. |

**Rule of thumb:** CSS/SMIL covers draw-on, dashoffset, transform/opacity loops, gradient sweeps,
gooey/turbulence filters, transform-based icon toggles — most of Part A. A JS lib earns its weight
only for: **arbitrary `d` morphing** (MorphSVG), **scroll/physics/orchestrated timelines** (GSAP),
**runtime values & counters** (WAAPI/anime), **AE-designed sequences** (Lottie). Skip Snap.svg.

---

## Part C — The craft checklist (what makes it award-winning)

**Easing & motion quality**
- [ ] **Never ship `linear`** except continuous loops (rotation, marquee, marching dashes). Use
      ease-**out** for things arriving (decelerate into place), ease-**in** for things leaving.
- [ ] Default to a **custom `cubic-bezier`** over the generic `ease`. Add **overshoot** for life:
      `cubic-bezier(0.34, 1.56, 0.64, 1)` (Y>1 overshoots) — snappy. Springy for playful brands,
      subtle for serious UIs. Prefer **springs** (`linear()` spring curves) where available.
- [ ] **Anticipation & follow-through:** a tiny wind-up opposite the move + a small settle past
      target sell weight.

**Choreography**
- [ ] **One hero motion.** Pick a single focal animation; everything else is quiet support.
      Constant motion everywhere = noise. Glitch/sheen should be intermittent, not perpetual.
- [ ] **Stagger** (40–80ms) so multiple elements read as choreography, not a flat simultaneous pop.
      Sequence draw-on the way a human builds the thing.
- [ ] **Timing budget:** UI feedback 150–300ms; expressive/hero moments 0.6–2s; ambient loops 15s+.

**Seamless looping**
- [ ] Make **0% and 100% keyframes identical** (one shared rule so they can't drift).
- [ ] Multi-element ambient: **coprime durations** (17s/23s/29s) so the composite never visibly
      repeats. Motion-path loops: return to start or fade out before the teleport. A tiny duration
      nudge (5.05s not 5.00s) can dodge a one-frame wrap blink.

**Accessibility**
- [ ] Honour `prefers-reduced-motion` — wrap non-essential motion in `no-preference`, or kill it in
      `reduce` and show a static end-state. **Reduce, don't always remove** (swap big movement/parallax/spin for a gentle fade). Decorative SVG → `aria-hidden="true"`; toggles → `aria-expanded`/`aria-pressed`.

**Performance**
- [ ] **Animate only `transform`/`opacity`** (and `stroke-dashoffset`) for continuous motion —
      GPU/compositor, 60fps. Avoid per-frame `width`/`height`/`x`/`y`/`cx`/`cy`/`d`/`fill`/`stroke`
      (layout/paint). `scaleY()` not `height`; `translate()` not `top/left`.
- [ ] **Filters are the perf trap** — blur/drop-shadow/gooey/displacement re-rasterize each frame.
      Animate filter *params* sparingly; prefer animating opacity of a pre-rendered glow/blur layer;
      bound glitch bursts; keep `feTurbulence numOctaves` low; measure big blurs on mobile.
- [ ] `will-change: transform` **only** on the few animated nodes, not blanket.

**File size** — prefer inline CSS/SMIL SVG over Lottie JSON for simple icons; minify (SVGO), drop
editor metadata, use `pathLength="1"` for clean resolution-independent dash math.

---

## Bottom line
1. **Default to CSS** — dashoffset draw-on, transform/opacity loops, `background-clip:text` sheen,
   transform-based icon toggles cover most "cool" with zero deps and free accessibility.
2. **SMIL for portable self-contained assets** — especially `animateMotion` particles & path morph.
3. **Add JS only** for arbitrary `d` morph (MorphSVG, now free), scroll/physics/orchestration
   (GSAP), counters/runtime values (WAAPI/anime), AE sequences (Lottie). Skip Snap.svg.
4. **The craft layer — custom easing, stagger, overshoot, restraint, seamless loops,
   reduced-motion, transform-only — is the signature.** The effect is table stakes; the timing wins.

## Sources
CSS-Tricks [handwriting strokes](https://css-tricks.com/how-to-get-handwriting-animation-with-irregular-svg-strokes/) ·
Codrops [animate along a path](https://tympanus.net/codrops/2022/01/19/animate-anything-along-an-svg-path/) ·
Codrops [creative gooey](https://tympanus.net/codrops/2015/03/10/creative-gooey-effects/) ·
expensive.toys [RGB split](https://expensive.toys/blog/css-rgb-split-effect) ·
CSS-Tricks [grainy gradients](https://css-tricks.com/grainy-gradients/) ·
SVGenius [animated charts](https://svgenius.design/blog/creating-animated-charts-and-graphs-with-svg) ·
Codrops [free GSAP plugin demos](https://tympanus.net/codrops/2025/05/14/from-splittext-to-morphsvg-5-creative-demos-using-free-gsap-plugins/) ·
GSAP [SVG docs](https://gsap.com/svg/) ·
ICS Media [library comparison](https://ics.media/en/entry/14973/) ·
Josh Comeau [prefers-reduced-motion](https://www.joshwcomeau.com/react/prefers-reduced-motion/) ·
Josh Comeau [springs & linear()](https://www.joshwcomeau.com/animation/linear-timing-function/) ·
[easings.net](https://easings.net/)
