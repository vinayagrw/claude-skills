#!/usr/bin/env python3
r"""Validate an animated .svg (or an .html that embeds inline SVG) before delivery.

The point of an *animated* SVG skill is that the file actually plays and actually
renders — so this checks the two things that silently break that promise:

  1. STRUCTURE — the file is well-formed XML/markup, the root <svg> can render
     standalone (xmlns present), ids are unique, and every internal reference
     (url(#id), href="#id", <mpath>, SMIL begin="other.end") resolves to a real
     element. A dangling filter/gradient/clip/mask/mpath ref = an invisible or
     un-animated element, the #1 "why is nothing moving" bug.

  2. MOTION + ACCESS — there is at least one animation mechanism present (SMIL,
     CSS @keyframes/transition, or <script>), every CSS `animation` names a
     @keyframes that exists, and — since motion can trigger vestibular illness —
     CSS animation is gated behind `@media (prefers-reduced-motion: reduce)`.

It also prints a rendering-context note, because SMIL and <script> do NOT run when
an SVG is loaded via <img> or CSS background-image (CSS @keyframes inside <style>
DO). That decides whether your file "just plays when opened" in the way you intend.

Usage:  python validate_svg.py <file.svg | file.html>
Exit:   0 = clean (warnings allowed), 1 = problems found, 2 = could not parse.
ASCII-only output so it's safe on a Windows cp1252 console.
"""
import sys, re, io
import xml.etree.ElementTree as ET

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# CSS words that can legally appear where an animation-name might, so we don't
# mistake them for a missing @keyframes.
CSS_ANIM_KEYWORDS = {
    "none", "initial", "inherit", "unset", "revert", "infinite", "normal",
    "reverse", "alternate", "alternate-reverse", "forwards", "backwards", "both",
    "running", "paused", "linear", "ease", "ease-in", "ease-out", "ease-in-out",
    "step-start", "step-end", "steps", "cubic-bezier", "var", "auto",
}

LOCAL = lambda tag: tag.rsplit("}", 1)[-1]  # strip {namespace}


def main():
    if len(sys.argv) < 2:
        print("usage: python validate_svg.py <file.svg|file.html>")
        sys.exit(2)
    path = sys.argv[1]
    try:
        raw = open(path, encoding="utf-8").read()
    except Exception as e:
        print(f"[FAIL] cannot read {path}: {e}")
        sys.exit(2)

    errors, warns, notes = [], [], []

    # ---------- locate the SVG markup ----------
    is_html = path.lower().endswith((".html", ".htm")) or "<svg" in raw and "<html" in raw.lower()
    svg_texts = re.findall(r"<svg\b.*?</svg>", raw, re.DOTALL | re.IGNORECASE)
    if not svg_texts:
        print("[FAIL] no <svg> element found")
        sys.exit(2)

    # ---------- well-formedness (parse each inline svg) ----------
    roots = []
    for i, st in enumerate(svg_texts):
        try:
            roots.append(ET.fromstring(st))
        except ET.ParseError as e:
            errors.append(f"svg block #{i+1} is not well-formed XML: {e} "
                          f"(unescaped & < > in a label or attribute is the usual cause)")
    if not roots and not is_html:
        # a standalone .svg must parse as a whole document
        try:
            ET.fromstring(raw)
        except ET.ParseError as e:
            errors.append(f"document is not well-formed XML: {e}")

    # ---------- per-svg structural checks ----------
    for root in roots:
        if LOCAL(root.tag) != "svg":
            continue
        # xmlns: ElementTree only yields a namespaced tag if xmlns was declared.
        if not root.tag.startswith("{http://www.w3.org/2000/svg}"):
            errors.append('root <svg> is missing xmlns="http://www.w3.org/2000/svg" '
                          "(it will not render as a standalone .svg file)")
        if root.get("viewBox") is None:
            warns.append("root <svg> has no viewBox — it will not scale cleanly; "
                         'add viewBox="minX minY width height"')
        else:
            parts = root.get("viewBox").replace(",", " ").split()
            if len(parts) != 4 or not all(_isnum(p) for p in parts):
                errors.append(f'viewBox="{root.get("viewBox")}" must be 4 numbers')

    # ---------- ids & references (whole file, regex — covers attrs + CSS) ----------
    ids = re.findall(r'\bid\s*=\s*"([^"]+)"', raw)
    dupes = {i for i in ids if ids.count(i) > 1}
    for d in sorted(dupes):
        errors.append(f'duplicate id "{d}" — references are by id; a reuse silently '
                      "binds to the wrong element")
    idset = set(ids)

    referenced = set()
    referenced |= set(re.findall(r'url\(\s*#([^)\s"\']+)\s*\)', raw))          # fill/stroke/filter/clip/mask
    referenced |= set(re.findall(r'(?:xlink:)?href\s*=\s*"#([^"]+)"', raw))    # use/mpath/textPath/href
    # SMIL begin/end syntax:  begin="thing.end"  begin="btn.click"
    for ev in re.findall(r'\b(?:begin|end)\s*=\s*"([^"]*)"', raw):
        for tok in re.split(r"[;,]", ev):
            m = re.match(r"\s*([A-Za-z_][\w\-:.]*?)\.(?:begin|end|click|mouseover|"
                         r"mouseout|mousedown|mouseup|focus|blur|repeat)", tok)
            if m:
                referenced.add(m.group(1))
    for r in sorted(referenced - idset):
        # ignore obvious non-id refs (none/self handled) and data URIs already excluded
        errors.append(f'reference to #{r} but no element has id="{r}" — that '
                      "filter/gradient/clip/mask/mpath/use will not resolve (element "
                      "renders unstyled or unanimated)")

    # ---------- animation presence ----------
    smil = bool(re.search(r"<(animate|animateTransform|animateMotion|animateColor|set)\b", raw))
    styles = "\n".join(re.findall(r"<style\b[^>]*>(.*?)</style>", raw, re.DOTALL | re.IGNORECASE))
    css_anim = bool(re.search(r"@keyframes\b", styles) or
                    re.search(r"\banimation\s*:", styles) or
                    re.search(r"\btransition\s*:", styles))
    has_script = bool(re.search(r"<script\b", raw, re.IGNORECASE))
    if not (smil or css_anim or has_script):
        warns.append("no animation found (no SMIL <animate*>, no CSS "
                     "@keyframes/animation/transition, no <script>) — this is an "
                     "animated-SVG skill; did the motion get dropped?")

    # ---------- CSS animation-name -> @keyframes resolution ----------
    if styles:
        defined = set(re.findall(r"@keyframes\s+([A-Za-z_-][\w-]*)", styles))
        used = set()
        for decl in re.findall(r"animation(?:-name)?\s*:\s*([^;{}]+)", styles):
            for tok in re.split(r"[\s,]+", decl.strip()):
                tok = tok.strip()
                if (tok and not _isnum(tok.rstrip("s%")) and "(" not in tok
                        and tok.lower() not in CSS_ANIM_KEYWORDS
                        and not re.match(r"^-?[\d.]", tok)):
                    used.add(tok)
        for u in sorted(used - defined):
            warns.append(f'CSS animation references "{u}" but no @keyframes {u} is '
                         "defined — that element will not animate")

    # ---------- accessibility: reduced-motion gate ----------
    if css_anim:
        if "prefers-reduced-motion" not in styles:
            warns.append("CSS animation is present but there is no "
                         "@media (prefers-reduced-motion: reduce) block — motion can "
                         "cause vestibular discomfort; gate or soften it for that audience")
    if smil and "prefers-reduced-motion" not in raw:
        notes.append("SMIL animation cannot be disabled by prefers-reduced-motion via "
                     "CSS; if accessibility matters, prefer CSS @keyframes or add a "
                     "reduced-motion variant.")

    # ---------- rendering-context note (the 'plays on open' promise) ----------
    if has_script:
        notes.append("<script> runs only when the SVG is opened directly or inlined in "
                     "HTML — it does NOT run via <img> or CSS background-image.")
    if smil:
        notes.append("SMIL plays when opened directly or inlined; it does NOT play via "
                     "CSS background-image (most browsers) — for a background, use CSS "
                     "@keyframes inside <style> instead.")
    if css_anim and not smil and not has_script:
        notes.append("CSS-in-<style> animation plays in every context including <img> "
                     "and background-image — the most portable 'plays on open' choice.")

    # ---------- report ----------
    print(f"file: {path}")
    print(f"svg blocks: {len(svg_texts)} | ids: {len(idset)} | "
          f"SMIL: {smil} | CSS-anim: {css_anim} | script: {has_script}")
    for n in notes:
        print(f"  [note] {n}")
    for w in warns:
        print(f"  [warn] {w}")
    for e in errors:
        print(f"  [FAIL] {e}")
    if errors:
        print(f"\n[FAIL] {len(errors)} error(s), {len(warns)} warning(s)")
        sys.exit(1)
    print(f"\n[OK] valid animated SVG ({len(warns)} warning(s))")
    sys.exit(0)


def _isnum(s):
    try:
        float(s)
        return True
    except (ValueError, TypeError):
        return False


if __name__ == "__main__":
    main()
