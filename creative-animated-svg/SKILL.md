---
name: creative-animated-svg
description: >-
  Author cool, modern, genuinely-animated SVGs — self-drawing line art, flow-along-path
  motion, morphing shapes, gooey/turbulence filters, animated gradients, looping ambient
  backgrounds, animated charts, glow/shimmer, loaders and hero graphics. Use this whenever
  the user wants an SVG that MOVES — an animated logo/icon/illustration, a draw-on diagram,
  an SVG loader or spinner, a scroll-driven reveal, an animated banner/hero, a morphing
  graphic, or asks to "animate this SVG / make it move / add motion". Covers both a
  self-contained .svg that plays the moment it's opened (CSS @keyframes + SMIL + filters)
  and SVG embedded in HTML for the full arsenal (scroll-driven, Web Animations API,
  GSAP/Lottie, interaction). Teaches the latest CSS features (@property, motion path,
  scroll-driven timelines, color-mix), the rendering-context rules that decide whether a
  file actually plays, accessibility (prefers-reduced-motion) and 60fps performance — and
  ships a validator. Reach for this even if the user doesn't say the word "animation" but
  clearly wants a graphic with movement.
---

# Creative animated SVG

Your job: turn the user's intent into an SVG that **actually moves, actually plays where
it's delivered, and uses motion to mean something** — a graphic that feels designed by
someone who understands timing, not a box that blinks.

Four things make an animated SVG *good*:
1. **It plays in the context it's delivered to.** The single biggest failure is shipping a
   file that renders a frozen first frame because it was dropped into an `<img>`. Choosing
   the delivery target (§1) is the first real decision, not an afterthought.
2. **Motion carries meaning.** The animation *dramatizes the idea* — a pipeline's data
   flows, a sequence draws on in order, a living thing pulses. Decoration that wiggles for
   its own sake is the amateur tell.
3. **It respects the viewer.** Reduced-motion is honoured, and only compositor-friendly
   properties animate, so it hits 60fps and doesn't make anyone queasy (§4).
4. **It's correct.** Well-formed, every `url(#id)` / `<mpath>` / filter reference resolves,
   every `animation` names a real `@keyframes`. Broken references are why "nothing moves".

## Step 0 — Read for the intention, then choose a *motion* that performs it

Before a single element, do the most important step: **name what this is really about, then
pick a motion that enacts that idea.** The creativity is in the choice of motion, not the
colours. A logo that assembles itself says "we build"; a node that pulses says "alive"; a
dot travelling a pipe says "your data moves through here." Match the verb to the motion:

| The idea is really about… | Motion that performs it |
|---|---|
| construction / a sequence / "how it's made" | **draw-on** (stroke-dashoffset), staggered by element order |
| data / signal / traffic moving through | **flow along a path** (offset-path or animateMotion), dashes marching |
| something alive / active / healthy | **pulse / breathe** (scale+opacity ease-in-out loop) |
| transformation / one thing becoming another | **morph** (`d` animation), icon state change |
| a cycle / orbit / recurring process | **rotate / orbit** (continuous, linear) |
| uncovering / focus / reveal | **wipe / clip-path / mask** reveal |
| energy / liveliness / ambient richness | **turbulence, gradient drift, floating drift** behind the content |

Then decide the **trigger**: plays-on-load loop (most SVGs), one-shot on open, scroll-driven
(needs HTML host), or interaction (hover/click). Trigger + target (§1) together decide which
techniques are even available — so settle them now, before authoring.

## 1. Pick the delivery target — it decides which features you can use

This is a real fork, not a formality. **The same .svg behaves completely differently
depending on how it's embedded:**

> **The iron rule:** an SVG loaded via `<img src>` or CSS `background-image` is rasterized
> to a **static first frame** — *no* CSS animation, no SMIL, no script runs. To get motion
> you must deliver it as: a **directly-opened .svg**, an `<object>`/`<iframe>`, or **inline
> SVG** pasted into HTML. State this to the user when you hand off — it's the #1 "why isn't
> it animating" surprise.

| | **Standalone `.svg`** (plays on open) | **Inline SVG in HTML** (full arsenal) |
|---|---|---|
| Plays when | opened directly, `<object>`, or inlined | the page is loaded |
| You get | CSS `@keyframes`/transition, **SMIL**, filters, `@property`, motion path, `color-mix` | everything in the left column **plus** scroll-driven timelines, Web Animations API, GSAP/anime.js/Lottie, hover/click interaction, View Transitions |
| You do **not** get | scroll-driven, JS libs, real interaction, View Transitions | (no real limits) |
| Reach for it when | a portable, self-contained animated asset — a loader, an animated logo, a draw-on diagram you can drop anywhere | it must react to scroll/clicks, or you want a JS animation library, or it lives in a page you control |

Default to **standalone `.svg`** for a self-playing artifact (maximally portable), and
**inline-in-HTML** the moment scroll, interaction, or a JS library genuinely earns its place.
When unsure, build the standalone `.svg` and mention the HTML upgrade path.

## 2. The animation toolkit — three layers, picked by job

Author the file skeleton right or it won't render: a standalone file needs
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="…">`; put CSS in an internal `<style>`.
Then reach into three layers — read the reference for exact, current, copy-pasteable code:

- **CSS layer** (in `<style>`) — `@keyframes` + transitions on **`transform`/`opacity`** (the
  only GPU-cheap properties), the modern unlocks **`@property`** (smoothly animate gradients,
  angles, counters), **CSS Motion Path** (`offset-path`/`offset-distance`/`offset-rotate`),
  and **`color-mix()`/relative color** for animated palettes. The portable, accessible,
  context-proof layer. → [references/css-animation.md](references/css-animation.md)
- **SMIL layer** (declarative, in-file) — `<animate>`, `<animateTransform>`,
  `<animateMotion>`+`<mpath>`, chaining with `begin="other.end"`, and the **cross-browser
  path-morph** (`<animate attributeName="d">`) that CSS can't portably do. Plays standalone
  with zero CSS. → [references/smil-and-filters.md](references/smil-and-filters.md)
- **Filter layer** (the "wow") — `feTurbulence`+`feDisplacementMap` (water/fire/wobble),
  the **gooey** filter, **glow**, drop-shadow; animate a filter primitive's attribute for
  living texture. → [references/smil-and-filters.md](references/smil-and-filters.md)

For signature effects (self-drawing art, particles on a path, blob morph, glitch, animated
charts, neon/shimmer, icon state morphs) and **when a JS library (GSAP/Lottie) actually
earns its weight vs. plain CSS/SMIL**, read
[references/creative-techniques.md](references/creative-techniques.md).

## 3. The signature look — make it *obviously* crafted

A modern model will, unprompted, make a box fade in on a linear timing function. That's the
baseline, not the bar. What separates designed motion from amateur motion is **timing and
restraint**, and it's mostly five moves:

1. **One hero motion.** Pick the single most important thing and animate *that*; let the
   rest support it. A scene where everything moves at once reads as noise and explains
   nothing. Restraint is the signature.
2. **Always ease.** Real motion accelerates and settles — use `cubic-bezier`/spring easing,
   add a touch of **anticipation/overshoot** on entrances. Reserve `linear` for genuinely
   continuous motion (a spinner, a marquee, marching dashes); linear on a "move from A to B"
   looks robotic.
3. **Stagger by story order.** Reveal elements in the sequence the *idea* unfolds (a delay
   per element), so the animation narrates. This is what makes a draw-on feel intentional.
4. **Loop seamlessly.** If it loops, the last frame must equal the first — design the cycle
   so the restart is invisible (return to the start value, or use `alternate`).
5. **Encode role in motion.** Different kinds of things move differently — the hero flows,
   ambient texture drifts slowly behind, a status indicator pulses. Consistent motion-roles
   teach the viewer just like consistent colour does.

The craft principles (easing curves, stagger math, seamless-loop technique) are spelled out
in [references/creative-techniques.md](references/creative-techniques.md). The
**distinctiveness bar** at the end of this file is the explicit test.

## 4. Accessibility & performance — the non-negotiable floor

Motion can trigger vestibular illness, and careless motion janks. Both are cheap to get
right and embarrassing to get wrong:

- **Gate motion behind `prefers-reduced-motion`.** Prefer the *opt-in* pattern — base styles
  are calm, motion is added under `@media (prefers-reduced-motion: no-preference)`. When the
  motion conveys meaning, *replace* it with a quick crossfade rather than deleting it.
  (SMIL can't be gated by this media query — if accessibility matters, prefer CSS, or ship a
  reduced-motion variant.)
- **Animate only `transform` and `opacity`** for anything that moves continuously. These
  composite on the GPU and skip layout/paint. Animating `x`/`y`/`cx`/`cy`/`width`/`height`,
  `top`/`left`, or large blurred filters per-frame causes reflow and jank — use a CSS
  `transform` on the element instead of SVG geometry attributes.
- **`will-change: transform` sparingly** — only on the few elements about to move, and not
  permanently; too many promoted layers exhaust GPU memory.

## 5. Verify before you claim it's done — evidence, not assertion

The most damaging thing you can do is tell the user "done — it's animated" when they open a
frozen frame. **A validator proves structure; only a render proves motion.** So do both,
*this turn*, and read the real output before any success wording:

1. **Run the validator** — fix until clean:
   ```bash
   python scripts/validate_svg.py <file>.svg     # or the .html host
   ```
   Clean = `[OK]`, 0 errors: well-formed, `xmlns` present, no duplicate ids, every
   `url(#id)`/`<mpath>`/SMIL `begin` reference resolves, every CSS `animation` names a real
   `@keyframes`, and the reduced-motion note is addressed.
2. **Actually render it and prove it MOVES.** The validator cannot see motion. Open the file
   in a browser and capture **at least two distinct timeline points** — confirm elements are
   in different states (an arrow half-drawn vs. whole, a chip faded vs. solid). One frame
   proves it renders; two different frames prove it animates. A reliable method on this
   machine: serve the folder (`python -m http.server`), load it in a browser, screenshot at
   two times; for a standalone `.svg` whose infinite animation blocks the screenshot path,
   wrap it in a tiny HTML `<img>`/inline host and capture that.
3. **Confirm the delivery context.** Verify it plays the way you're handing it over (direct
   open / inline), and that you haven't promised motion through an `<img>`.

Only then call it done. Give the **file path as a clickable link**, say **how to view it so
it animates** (and explicitly that `<img>`/background-image will freeze it), name the motion
metaphor and what each movement means, and note the reduced-motion behaviour.

## The distinctiveness bar — the real test before you ship

Correctness is the floor; **distinctiveness is the bar.** Run it honestly: *if this is just
a shape that fades or slides in on a linear timing, you've produced the baseline, not
skill-made work — go back and lift it.* Clear most of these:

- [ ] **One clear hero motion** that dramatizes the core idea (Step 0 metaphor is legible).
- [ ] **Eased** timing (cubic-bezier/spring), not linear — except for continuous spins/flows.
- [ ] **Staggered** reveal in story order where multiple things appear (draw-on narrates).
- [ ] At least one **signature technique** beyond fade/slide — draw-on, flow-along-path,
      morph, gooey/turbulence, animated gradient, glow/shimmer, or an animated filter.
- [ ] If it loops, the loop is **seamless** (last frame = first).
- [ ] Motion **roles** are consistent (hero vs. ambient vs. indicator move differently).
- [ ] A **latest-CSS** touch where it helps (`@property` gradient/angle/counter, motion path,
      `color-mix`) — not retro-only technique.

## Correctness checklist (the floor — never skip)

- [ ] Standalone files: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="…">`; CSS in `<style>`.
- [ ] All ids unique; **every** `url(#id)`, `href="#id"`, `<mpath>`, and SMIL `begin="x.end"`
      reference resolves to a real element.
- [ ] Every CSS `animation`/`animation-name` maps to a defined `@keyframes`.
- [ ] At least one real animation mechanism is present (it's an *animated* SVG).
- [ ] `prefers-reduced-motion` honoured (CSS), or a reduced-motion variant noted (SMIL).
- [ ] Continuous motion uses `transform`/`opacity` only; no per-frame layout/geometry thrash.
- [ ] Delivery target chosen deliberately; not promised to animate inside `<img>`.
- [ ] **Verified, not assumed (§5):** ran `validate_svg.py` *this turn* (saw `[OK]`) **and**
      rendered it to confirm motion at two timeline points, before any completion claim.
- [ ] Delivered as a clickable path with how-to-view-it-animating + what the motion means.
