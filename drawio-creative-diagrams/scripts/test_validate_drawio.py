#!/usr/bin/env python3
"""Regression tests for validate_drawio.py.

Run: python scripts/test_validate_drawio.py   (or: pytest scripts/test_validate_drawio.py)

These pin behaviour that was added test-first. The contrast test in particular
encodes the real bug a draw.io diagram shipped with once: light-purple text on a
light-purple fill (and the symmetric dark-on-dark case), both of which the
structural validator passed silently before the luminance check existed.
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import validate_drawio as v  # noqa: E402


def _run(body):
    xml = (
        '<mxfile host="app.diagrams.net"><diagram id="d1" name="P">'
        '<mxGraphModel><root>'
        '<mxCell id="0"/><mxCell id="1" parent="0"/>'
        f"{body}"
        "</root></mxGraphModel></diagram></mxfile>"
    )
    fd, path = tempfile.mkstemp(suffix=".drawio")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(xml)
        return v.validate(path)
    finally:
        os.unlink(path)


def _cell(cid, style):
    return (
        f'<mxCell id="{cid}" value="x" parent="1" vertex="1" style="{style}">'
        '<mxGeometry x="10" y="10" width="160" height="60" as="geometry"/></mxCell>'
    )


def test_contrast_flags_light_on_light():
    errors, warns = _run(_cell("bad", "fillColor=#e1d5e7;fontColor=#e8d9f5;"))
    assert not errors
    assert any("bad" in w and "invisible" in w for w in warns), warns


def test_contrast_flags_dark_default_font_on_dark_fill():
    # No fontColor -> draw.io default near-black -> invisible on a dark fill.
    errors, warns = _run(_cell("bad", "fillColor=#13294b;"))
    assert any("bad" in w and "invisible" in w for w in warns), warns


def test_contrast_passes_dark_on_light():
    errors, warns = _run(_cell("ok", "fillColor=#dae8fc;fontColor=#13294b;"))
    assert not any("invisible" in w for w in warns), warns


def test_contrast_passes_light_on_dark():
    errors, warns = _run(_cell("ok", "fillColor=#1a56c4;fontColor=#ffffff;"))
    assert not any("invisible" in w for w in warns), warns


def test_contrast_ignores_no_explicit_fill():
    # fillColor=none / unset -> nothing to judge against -> no warning.
    errors, warns = _run(_cell("x", "rounded=1;fontColor=#999999;"))
    assert not any("invisible" in w for w in warns), warns


def _box(cid, x, y, w, h, style=""):
    return (
        f'<mxCell id="{cid}" value="{cid}" parent="1" vertex="1" '
        f'style="rounded=0;html=1;{style}">'
        f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>'
    )


def test_partial_overlap_of_solid_boxes_still_errors():
    # Two normal (opaque) boxes that partially overlap = a real layout bug.
    body = _box("a", 0, 0, 200, 200) + _box("b", 100, 100, 200, 200)
    errors, warns = _run(body)
    assert any("overlap" in e for e in errors), errors


def test_translucent_backdrop_plane_overlap_is_exempt():
    # A low-opacity 'plane'/zone-tint backdrop is MEANT to sit behind other shapes
    # and cross AZ/subnet containers (the 2-axis cloud-grid case). Exempt it.
    plane = _box("data_plane", 100, 0, 120, 600, "fillColor=#fff2cc;opacity=25;")
    az = _box("az_a", 0, 100, 800, 120, "fillColor=#ffffff;")  # crosses the plane
    errors, warns = _run(plane + az)
    assert not any("overlap" in e for e in errors), errors


if __name__ == "__main__":
    fns = [g for n, g in sorted(globals().items()) if n.startswith("test_")]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"  PASS {fn.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL {fn.__name__}: {e}")
    print(f"\n{'[OK]' if not failed else '[FAIL]'} {len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)
