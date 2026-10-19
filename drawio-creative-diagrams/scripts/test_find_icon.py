#!/usr/bin/env python3
"""Tests for find_icon.py — the Icon Selection Protocol matcher.

Run: python scripts/test_find_icon.py   (or: pytest scripts/test_find_icon.py)

These pin the behaviour the protocol needs: a real service resolves to a genuine
stencil id (directly or via an alias), while a product with NO official stencil
(Temporal, Firecracker, or anything unknown) resolves to the fallback ladder with
NO guessed resIcon — the whole point is that we never emit a name that renders blank.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import find_icon as fi  # noqa: E402


def test_exact_aws4_match():
    r = fi.lookup("kinesis")
    assert any(m["lib"] == "aws4" and "kinesis" in m["id"] for m in r["matches"]), r
    assert r["fallback"] is None, r
    assert "mxgraph.aws4.kinesis" in fi.format_result(r), r


def test_alias_resolves_s3():
    r = fi.lookup("s3")
    assert any(m["id"] == "simple_storage_service" for m in r["matches"]), r
    assert r["fallback"] is None, r


def test_temporal_falls_back_to_brand_chip():
    r = fi.lookup("temporal")
    assert not r["matches"], r
    assert r["fallback"] and r["fallback"].get("hex") == "#7C4DFF", r
    txt = fi.format_result(r).lower()
    assert "#7c4dff" in txt and "brand chip" in txt, txt


def test_fallback_steers_to_official_logo_before_brand_chip():
    """New tier: when no stencil exists, the protocol must first tell the author to
    fetch the official logo online and embed it as an image node; the flat brand chip
    is only the last resort. The guidance text must surface that, and name the helper."""
    for name in ("temporal", "firecracker", "asdfqwer"):
        txt = fi.format_result(fi.lookup(name)).lower()
        assert "official logo" in txt, (name, txt)
        assert "fetch_logo.py" in txt, (name, txt)
        # the logo tier must be presented ahead of the flat brand-chip fallback
        assert txt.index("official logo") < txt.index("brand chip"), (name, txt)


def test_firecracker_falls_back():
    r = fi.lookup("firecracker")
    assert not r["matches"], r
    assert r["fallback"], r
    assert "mxgraph.aws4" not in fi.format_result(r), r


def test_nonsense_falls_back_with_no_stencil_emitted():
    r = fi.lookup("asdfqwer")
    assert not r["matches"] and not r["fuzzy"], r
    assert r["fallback"], r
    assert "mxgraph.aws4" not in fi.format_result(r), r


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
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
