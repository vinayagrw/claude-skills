#!/usr/bin/env python3
"""
validate_drawio.py — structural validator for .drawio (mxGraph) files.

Catches the failure modes that make a draw.io file refuse to open or render wrong:
  - not well-formed XML
  - missing/mis-ordered root cells (id 0 and 1)
  - duplicate cell ids
  - vertices without an <mxGeometry as="geometry"> child
  - edges whose source/target reference a non-existent cell
  - cells with no valid parent
  - labels that look mis-escaped (raw <, &) in html labels
  - off-grid coordinates (warning only)

Note on label escaping: this script parses with ElementTree, which only succeeds if
the file is well-formed XML. A raw, unescaped '<' inside a label attribute is itself a
parse error, so "well-formed XML" already guarantees labels are correctly escaped — no
separate label check is needed (and one would false-positive, because the parser
un-escapes entities back into real '<'/'>' characters).

Usage:
    python validate_drawio.py path/to/diagram.drawio
Exit code 0 = valid (warnings allowed), 1 = errors found, 2 = bad usage.
"""
import re
import sys
import xml.etree.ElementTree as ET

# Windows consoles default to cp1252 and choke on box-drawing/check glyphs.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def _rect(geom):
    try:
        return (float(geom.get("x", 0)), float(geom.get("y", 0)),
                float(geom.get("width")), float(geom.get("height")))
    except (TypeError, ValueError):
        return None


def _contains(a, b, pad=2):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return (ax - pad <= bx and ay - pad <= by
            and ax + aw + pad >= bx + bw and ay + ah + pad >= by + bh)


def _partial_overlap(a, b, min_px=6):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ox = min(ax + aw, bx + bw) - max(ax, bx)
    oy = min(ay + ah, by + bh) - max(ay, by)
    if ox <= min_px or oy <= min_px:
        return False
    return not (_contains(a, b) or _contains(b, a))


def _seg_hits_rect(x0, y0, x1, y1, rect, pad=8):
    """Liang–Barsky: does segment (x0,y0)->(x1,y1) cross rect (shrunk by pad)?"""
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


def _center(r):
    return (r[0] + r[2] / 2, r[1] + r[3] / 2)


def validate(path):
    errors, warnings = [], []
    try:
        tree = ET.parse(path)
    except ET.ParseError as e:
        return [f"XML is not well-formed: {e}"], []
    except FileNotFoundError:
        return [f"File not found: {path}"], []

    root = tree.getroot()
    diagrams = root.findall(".//diagram")
    if not diagrams:
        errors.append("No <diagram> element found — is this an mxfile?")

    for di, diagram in enumerate(diagrams):
        page = diagram.get("name", f"page-{di+1}")
        model = diagram.find(".//mxGraphModel")
        if model is None:
            # diagram content can be compressed; we only validate plain XML
            warnings.append(f"[{page}] no inline <mxGraphModel> (compressed?) — skipped")
            continue
        cells = model.findall(".//mxCell")
        if not cells:
            errors.append(f"[{page}] <root> has no <mxCell> children")
            continue

        # A cell wrapped in <object>/<UserObject> (the tooltip/link pattern) carries its
        # id on the wrapper, not on the inner mxCell. Resolve the effective id.
        xml_parent = {child: parent for parent in model.iter() for child in parent}

        def eff_id(cell):
            p = xml_parent.get(cell)
            if p is not None and p.tag.split("}")[-1] in ("object", "UserObject"):
                return p.get("id")
            return cell.get("id")

        ids, id_list = set(), []
        for c in cells:
            cid = eff_id(c)
            id_list.append(cid)
            if cid is None:
                errors.append(f"[{page}] an mxCell has no id (and no wrapping object id)")
            elif cid in ids:
                errors.append(f"[{page}] duplicate cell id: {cid}")
            else:
                ids.add(cid)

        # root cells 0 and 1 must exist and come first
        if id_list[:2] != ["0", "1"]:
            errors.append(
                f"[{page}] first two cells must be id='0' then id='1' "
                f"(found {id_list[:2]})"
            )

        vboxes = {}        # eff_id -> rect, for quality overlap checks
        edge_list = []     # (eff_id, source, target)
        for c in cells:
            cid = eff_id(c)
            if cid in ("0", "1"):
                continue
            parent = c.get("parent")
            if parent is None:
                errors.append(f"[{page}] cell {cid} has no parent")
            elif parent not in ids:
                errors.append(f"[{page}] cell {cid} parent '{parent}' does not exist")

            is_vertex = c.get("vertex") == "1"
            is_edge = c.get("edge") == "1"
            geom = c.find("mxGeometry")

            if is_vertex:
                if geom is None:
                    errors.append(f"[{page}] vertex {cid} has no <mxGeometry>")
                else:
                    r = _rect(geom)
                    if r:
                        vboxes[cid] = r
                    for dim in ("width", "height"):
                        v = geom.get(dim)
                        if v is None:
                            errors.append(f"[{page}] vertex {cid} geometry missing {dim}")
                    # Grid alignment is a soft hint and only meaningful for position
                    # (x/y). Sizes (width/height) are legitimately off-grid after
                    # auto-sizing, so checking them just produces noise.
                    for k in ("x", "y"):
                        v = geom.get(k)
                        if v is not None:
                            try:
                                if float(v) % 10 != 0:
                                    warnings.append(
                                        f"[{page}] vertex {cid} {k}={v} is off the 10px grid"
                                    )
                            except ValueError:
                                errors.append(f"[{page}] vertex {cid} {k}='{v}' not a number")

            if is_edge:
                src, tgt = c.get("source"), c.get("target")
                has_points = geom is not None and geom.find("mxPoint") is not None
                if src is None and tgt is None and not has_points:
                    errors.append(
                        f"[{page}] edge {cid} has neither source/target nor fixed points"
                    )
                if src is not None and src not in ids:
                    errors.append(f"[{page}] edge {cid} source '{src}' does not exist")
                if tgt is not None and tgt not in ids:
                    errors.append(f"[{page}] edge {cid} target '{tgt}' does not exist")
                if src and tgt:
                    edge_list.append((cid, src, tgt, c.get("style") or "", geom))

        # ---- QUALITY PASS: anti-overlap checks --------------------------------
        # (1) Two boxes that partially overlap (not full containment) almost always
        #     means colliding shapes — a real layout bug. Reported as an error.
        items = list(vboxes.items())
        for i in range(len(items)):
            ida, ra = items[i]
            for j in range(i + 1, len(items)):
                idb, rb = items[j]
                if _partial_overlap(ra, rb):
                    errors.append(
                        f"[{page}] QUALITY: boxes '{ida}' and '{idb}' overlap "
                        f"(neither contains the other) — separate them or nest fully"
                    )
        # (2) An edge whose route passes through a third box it doesn't connect to
        #     will visually cross that box. Route-aware: honours exit/entry faces and
        #     waypoints, so a properly-routed edge is NOT flagged. Skips boxes that
        #     contain an endpoint OR are nested inside an endpoint (intentional).
        def _num(style, key):
            m = re.search(key + r"=([0-9.]+)", style)
            return float(m.group(1)) if m else None

        def _conn(rect, ex, ey):
            return (rect[0] + ex * rect[2], rect[1] + ey * rect[3])

        for eid, s, t, style, eg in edge_list:
            if s not in vboxes or t not in vboxes:
                continue
            ex, ey = _num(style, "exitX"), _num(style, "exitY")
            nx, ny = _num(style, "entryX"), _num(style, "entryY")
            start = _conn(vboxes[s], ex, ey) if ex is not None and ey is not None else _center(vboxes[s])
            end = _conn(vboxes[t], nx, ny) if nx is not None and ny is not None else _center(vboxes[t])
            pts = [start]
            arr = eg.find("Array") if eg is not None else None
            if arr is not None:
                for mp in arr.findall("mxPoint"):
                    try:
                        pts.append((float(mp.get("x")), float(mp.get("y"))))
                    except (TypeError, ValueError):
                        pass
            pts.append(end)
            flagged = set()
            for (px0, py0), (px1, py1) in zip(pts, pts[1:]):
                for vid, r in vboxes.items():
                    if vid in (s, t) or vid in flagged:
                        continue
                    if _contains(r, vboxes[s]) or _contains(r, vboxes[t]):
                        continue  # box is a container of an endpoint
                    if _contains(vboxes[s], r) or _contains(vboxes[t], r):
                        continue  # box is nested inside an endpoint (e.g. a label/table)
                    if _seg_hits_rect(px0, py0, px1, py1, r, pad=10):
                        flagged.add(vid)
                        warnings.append(
                            f"[{page}] QUALITY: edge '{eid}' ({s}->{t}) likely crosses box "
                            f"'{vid}' — add waypoints, route via a gutter, or pick exit/entry faces"
                        )

    return errors, warnings


def main():
    if len(sys.argv) != 2:
        print("usage: python validate_drawio.py <file.drawio>")
        sys.exit(2)
    errors, warnings = validate(sys.argv[1])
    for w in warnings:
        print(f"  WARN  {w}")
    for e in errors:
        print(f"  ERROR {e}")
    if errors:
        print(f"\n[FAIL] {len(errors)} error(s), {len(warnings)} warning(s) - fix errors before delivering.")
        sys.exit(1)
    print(f"\n[OK] valid .drawio ({len(warnings)} warning(s)).")
    sys.exit(0)


if __name__ == "__main__":
    main()
