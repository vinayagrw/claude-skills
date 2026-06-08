#!/usr/bin/env python3
"""
validate_excalidraw.py - structural validator for .excalidraw (Excalidraw scene) files.

Catches the failure modes that make an Excalidraw scene refuse to import, render
wrong, or silently drop bindings:
  - not well-formed JSON
  - wrong top-level shape (type != "excalidraw", elements not a list, no appState)
  - elements missing id / unknown type / non-numeric geometry
  - duplicate element ids
  - linear elements (arrow/line) without a valid points array (>= 2 points)
  - bindings that reference a non-existent element
      (startBinding.elementId / endBinding.elementId / containerId / boundElements[].id)
  - BROKEN BIDIRECTIONAL BINDINGS - the most common Excalidraw breakage:
      a text says containerId=C but C doesn't list it in boundElements (label floats free),
      or an arrow binds to a shape but the shape doesn't list the arrow back
      (the arrow won't follow the shape when moved)
  - QUALITY PASS: shapes that partially overlap (collision), and arrows whose route
    crosses an unrelated shape they don't bind to.

Note on defaults: Excalidraw's import (`restore`) fills many optional fields with
defaults, so a scene can open even if some are missing. This validator still flags
the ones that matter for *correctness and editability* (ids, types, geometry,
bindings) as errors, and softer issues (enum typos, missing seed) as warnings.

Usage:
    python validate_excalidraw.py path/to/scene.excalidraw
Exit code 0 = valid (warnings allowed), 1 = errors found, 2 = bad usage.
"""
import json
import sys

# Windows consoles default to cp1252 and choke on box-drawing/check glyphs.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

KNOWN_TYPES = {
    "rectangle", "ellipse", "diamond", "arrow", "line", "text",
    "freedraw", "image", "frame", "magicframe", "embeddable", "iframe", "selection",
}
LINEAR_TYPES = {"arrow", "line"}
SHAPE_TYPES = {"rectangle", "ellipse", "diamond"}  # for overlap checks
FILL_STYLES = {"hachure", "cross-hatch", "solid", "zigzag"}
STROKE_STYLES = {"solid", "dashed", "dotted"}
TEXT_ALIGN = {"left", "center", "right"}
VERT_ALIGN = {"top", "middle", "bottom"}
# 1 = hand-drawn (Virgil/Excalifont), 2 = normal (Helvetica/Nunito), 3 = code (Cascadia).
# Newer builds also emit 5/6/7/8; accept them all so we don't false-positive.
FONT_FAMILIES = {1, 2, 3, 4, 5, 6, 7, 8}


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _rect(el):
    """Axis-aligned bbox of an element (ignores rotation - good enough for collisions)."""
    x, y, w, h = el.get("x"), el.get("y"), el.get("width"), el.get("height")
    if not all(_num(v) for v in (x, y, w, h)):
        return None
    # normalise negative width/height (linear elements can have either sign)
    if w < 0:
        x, w = x + w, -w
    if h < 0:
        y, h = y + h, -h
    return (x, y, w, h)


def _contains(a, b, pad=2):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return (ax - pad <= bx and ay - pad <= by
            and ax + aw + pad >= bx + bw and ay + ah + pad >= by + bh)


def _partial_overlap(a, b, min_px=8):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ox = min(ax + aw, bx + bw) - max(ax, bx)
    oy = min(ay + ah, by + bh) - max(ay, by)
    if ox <= min_px or oy <= min_px:
        return False
    return not (_contains(a, b) or _contains(b, a))


def _seg_hits_rect(x0, y0, x1, y1, rect, pad=6):
    """Liang-Barsky: does segment (x0,y0)->(x1,y1) cross rect (shrunk by pad)?"""
    rx, ry, rw, rh = rect
    xmin, ymin, xmax, ymax = rx + pad, ry + pad, rx + rw - pad, ry + rh - pad
    if xmin >= xmax or ymin >= ymax:
        return False
    dx, dy = x1 - x0, y1 - y0
    p = [-dx, dx, -dy, dy]
    q = [x0 - xmin, xmax - x0, y0 - ymin, ymax - y0]
    u1, u2 = 0.0, 1.0
    for pi, qi in zip(p, q):
        if pi == 0:
            if qi < 0:
                return False
        else:
            t = qi / pi
            if pi < 0:
                u1 = max(u1, t)
            else:
                u2 = min(u2, t)
    return u1 <= u2


def validate(path):
    errors, warnings = [], []
    try:
        with open(path, encoding="utf-8") as f:
            scene = json.load(f)
    except FileNotFoundError:
        return [f"File not found: {path}"], []
    except json.JSONDecodeError as e:
        return [f"JSON is not well-formed: {e}"], []

    if not isinstance(scene, dict):
        return ["top level must be a JSON object"], []
    if scene.get("type") != "excalidraw":
        errors.append(f'top-level "type" must be "excalidraw" (found {scene.get("type")!r})')
    if "version" not in scene:
        warnings.append('top-level "version" missing (Excalidraw expects e.g. 2)')
    if "source" not in scene:
        warnings.append('top-level "source" missing (e.g. "https://excalidraw.com")')
    if not isinstance(scene.get("appState"), dict):
        warnings.append('"appState" missing or not an object (e.g. {"viewBackgroundColor":"#ffffff","gridSize":null})')
    if "files" not in scene:
        warnings.append('"files" missing (use {} when there are no images)')

    files = scene.get("files") if isinstance(scene.get("files"), dict) else {}
    elements = scene.get("elements")
    if not isinstance(elements, list):
        errors.append('"elements" must be a list')
        return errors, warnings
    if not elements:
        warnings.append('"elements" is empty - nothing to render')

    # ---- pass 1: ids, types, geometry --------------------------------------
    ids = {}
    by_id = {}
    for i, el in enumerate(elements):
        if not isinstance(el, dict):
            errors.append(f"element[{i}] is not an object")
            continue
        eid = el.get("id")
        etype = el.get("type")
        where = f"element[{i}] (id={eid!r}, type={etype!r})"
        if not isinstance(eid, str) or not eid:
            errors.append(f"{where}: missing/invalid string 'id' (bindings need a stable id)")
        elif eid in ids:
            errors.append(f"element id duplicated: {eid!r}")
        else:
            ids[eid] = el
            by_id[eid] = el
        if etype not in KNOWN_TYPES:
            errors.append(f"{where}: unknown element type {etype!r}")
        for k in ("x", "y", "width", "height"):
            if not _num(el.get(k)):
                errors.append(f"{where}: '{k}' must be a number (found {el.get(k)!r})")

        # soft enum checks (Excalidraw would silently reset these)
        if "fillStyle" in el and el["fillStyle"] not in FILL_STYLES:
            warnings.append(f"{where}: fillStyle {el['fillStyle']!r} not one of {sorted(FILL_STYLES)}")
        if "strokeStyle" in el and el["strokeStyle"] not in STROKE_STYLES:
            warnings.append(f"{where}: strokeStyle {el['strokeStyle']!r} not one of {sorted(STROKE_STYLES)}")
        if "roughness" in el and el["roughness"] not in (0, 1, 2):
            warnings.append(f"{where}: roughness {el['roughness']!r} should be 0 (clean), 1 (sketch) or 2 (loose)")
        if "opacity" in el and not (_num(el["opacity"]) and 0 <= el["opacity"] <= 100):
            warnings.append(f"{where}: opacity should be 0-100")
        if el.get("type") == "text":
            ff = el.get("fontFamily")
            if ff is not None and ff not in FONT_FAMILIES:
                warnings.append(f"{where}: fontFamily {ff!r} unusual (1=hand-drawn, 2=normal, 3=code)")
            if "text" not in el:
                errors.append(f"{where}: text element has no 'text'")
            if el.get("textAlign") not in (None,) and el["textAlign"] not in TEXT_ALIGN:
                warnings.append(f"{where}: textAlign {el['textAlign']!r} not one of {sorted(TEXT_ALIGN)}")
            if el.get("verticalAlign") not in (None,) and el["verticalAlign"] not in VERT_ALIGN:
                warnings.append(f"{where}: verticalAlign {el['verticalAlign']!r} not one of {sorted(VERT_ALIGN)}")

        # image must point at a file in the top-level files map
        if etype == "image":
            fid = el.get("fileId")
            if not fid:
                errors.append(f"{where}: image has no 'fileId' (link it to a files entry)")
            elif files and fid not in files:
                warnings.append(f"{where}: image fileId {fid!r} is not in the top-level 'files' map")

        # embeds need a URL or they render empty
        if etype in ("embeddable", "iframe") and not el.get("link"):
            warnings.append(f"{where}: {etype} has no 'link' URL — it will render as an empty pane")

        # linear elements need a usable points array
        if etype in LINEAR_TYPES:
            pts = el.get("points")
            if not isinstance(pts, list) or len(pts) < 2:
                errors.append(f"{where}: {etype} needs a 'points' array with >= 2 points (relative to x,y)")
            else:
                for p in pts:
                    if not (isinstance(p, list) and len(p) == 2 and _num(p[0]) and _num(p[1])):
                        errors.append(f"{where}: each point must be [x, y] numbers (found {p!r})")
                        break

    # ---- pass 2: binding referential + bidirectional integrity --------------
    def ref_ok(ref_id):
        return isinstance(ref_id, str) and ref_id in ids

    for el in elements:
        if not isinstance(el, dict):
            continue
        eid = el.get("id")
        etype = el.get("type")
        where = f"element id={eid!r} ({etype})"

        # arrow/line bindings
        for side in ("startBinding", "endBinding"):
            b = el.get(side)
            if isinstance(b, dict) and b.get("elementId") is not None:
                tgt = b.get("elementId")
                if not ref_ok(tgt):
                    errors.append(f"{where}: {side}.elementId {tgt!r} does not exist")
                else:
                    back = by_id[tgt].get("boundElements") or []
                    if not any(isinstance(be, dict) and be.get("id") == eid for be in back):
                        warnings.append(
                            f"{where}: {side} -> {tgt!r} but that shape's boundElements doesn't list this "
                            f"arrow back - the arrow won't follow the shape when it moves")

        # text -> container
        cid = el.get("containerId")
        if cid is not None:
            if not ref_ok(cid):
                errors.append(f"{where}: containerId {cid!r} does not exist")
            else:
                back = by_id[cid].get("boundElements") or []
                if not any(isinstance(be, dict) and be.get("id") == eid for be in back):
                    warnings.append(
                        f"{where}: containerId -> {cid!r} but that container's boundElements doesn't list this "
                        f"text - the label will float free instead of sticking to the box")

        # boundElements forward references
        for be in (el.get("boundElements") or []):
            if not (isinstance(be, dict) and ref_ok(be.get("id"))):
                bad = be.get("id") if isinstance(be, dict) else be
                errors.append(f"{where}: boundElements references missing element {bad!r}")
                continue
            child = by_id[be["id"]]
            if be.get("type") == "text" and child.get("containerId") != eid:
                warnings.append(
                    f"{where}: lists text {be['id']!r} as bound, but that text's containerId "
                    f"is {child.get('containerId')!r}, not this element")

        # frame children
        fid = el.get("frameId")
        if fid is not None and not ref_ok(fid):
            warnings.append(f"{where}: frameId {fid!r} does not exist")

    # ---- QUALITY PASS: collisions + arrow-through-shape ---------------------
    # (1) two free shapes that partially overlap (neither contains the other and they
    #     aren't grouped) usually means a layout collision. Warning, not error -
    #     deliberate overlaps happen on whiteboards, but most are accidental.
    shapes = []
    for el in elements:
        if not isinstance(el, dict) or el.get("isDeleted"):
            continue
        if el.get("type") in SHAPE_TYPES and el.get("frameId") in (None,):
            r = _rect(el)
            if r:
                shapes.append((el.get("id"), set(el.get("groupIds") or []), r))
    for i in range(len(shapes)):
        ida, ga, ra = shapes[i]
        for j in range(i + 1, len(shapes)):
            idb, gb, rb = shapes[j]
            if ga & gb:
                continue  # same group - intentional cluster
            if _partial_overlap(ra, rb):
                warnings.append(
                    f"QUALITY: shapes {ida!r} and {idb!r} partially overlap "
                    f"(neither contains the other) - separate them or group them intentionally")

    # (2) arrow/line route crossing a shape it doesn't bind to. Honours bindings:
    #     skips the bound start/end shapes and any shape containing an endpoint.
    box_by_id = {sid: r for sid, _, r in shapes}
    for el in elements:
        if not isinstance(el, dict) or el.get("type") not in LINEAR_TYPES:
            continue
        pts = el.get("points")
        if not (isinstance(pts, list) and len(pts) >= 2):
            continue
        ox, oy = el.get("x"), el.get("y")
        if not (_num(ox) and _num(oy)):
            continue
        bound = set()
        for side in ("startBinding", "endBinding"):
            b = el.get(side)
            if isinstance(b, dict) and b.get("elementId"):
                bound.add(b["elementId"])
        abspts = [(ox + p[0], oy + p[1]) for p in pts
                  if isinstance(p, list) and len(p) == 2 and _num(p[0]) and _num(p[1])]
        flagged = set()
        for (x0, y0), (x1, y1) in zip(abspts, abspts[1:]):
            for sid, r in box_by_id.items():
                if sid in bound or sid in flagged or sid == el.get("id"):
                    continue
                if _seg_hits_rect(x0, y0, x1, y1, r, pad=6):
                    flagged.add(sid)
                    warnings.append(
                        f"QUALITY: {el.get('type')} {el.get('id')!r} likely crosses shape {sid!r} "
                        f"it doesn't bind to - add a bend point or route around it")

    return errors, warnings


def main():
    if len(sys.argv) != 2:
        print("usage: python validate_excalidraw.py <file.excalidraw>")
        sys.exit(2)
    errors, warnings = validate(sys.argv[1])
    for w in warnings:
        print(f"  WARN  {w}")
    for e in errors:
        print(f"  ERROR {e}")
    if errors:
        print(f"\n[FAIL] {len(errors)} error(s), {len(warnings)} warning(s) - fix errors before delivering.")
        sys.exit(1)
    print(f"\n[OK] valid .excalidraw ({len(warnings)} warning(s)).")
    sys.exit(0)


if __name__ == "__main__":
    main()
