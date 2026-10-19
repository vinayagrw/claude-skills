#!/usr/bin/env python3
"""Tests for fetch_logo.py — the online-official-logo fallback of the Icon Selection
Protocol.

These pin the *offline* contract (encoding + draw.io style building); they do NOT hit
the network. The point of the tier: when no stencil exists, embed the vendor's OFFICIAL
logo as a self-contained image node (data URI) instead of shipping a flat colour chip.
So the produced style must be a real `shape=image` node, self-contained (data: URI),
and still carry a text label below the glyph so a broken image still reads.
"""
import base64
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_logo as fl  # noqa: E402


def test_mime_for_by_extension():
    assert fl.mime_for("https://x.io/logo.svg") == "image/svg+xml"
    assert fl.mime_for("https://x.io/logo.png") == "image/png"
    assert fl.mime_for("logo.SVG") == "image/svg+xml"  # case-insensitive


def test_encode_data_uri_is_self_contained_and_roundtrips():
    raw = b"<svg xmlns='http://www.w3.org/2000/svg'><rect/></svg>"
    uri = fl.encode_data_uri(raw, "image/svg+xml")
    assert uri.startswith("data:image/svg+xml;base64,"), uri
    b64 = uri.split(",", 1)[1]
    assert base64.b64decode(b64) == raw


def test_image_style_is_a_labelled_image_node():
    uri = fl.encode_data_uri(b"x", "image/png")
    style = fl.image_style(uri)
    assert "shape=image" in style, style
    # the image is embedded in draw.io's native comma form (not the raw ';base64'
    # URI, which the style tokenizer would truncate — see the tokenizer test below)
    assert fl.drawio_data_uri(uri) in style, style
    # label must sit BELOW the glyph (so a missing image still reads) — same idiom
    # the AWS resource icons use.
    assert "verticalLabelPosition=bottom" in style, style
    assert "verticalAlign=top" in style, style
    # self-contained: no external http(s) reference smuggled in
    assert "http://" not in style and "https://" not in style, style


def test_known_brands_have_verified_sources():
    """Temporal and Firecracker are the motivating no-stencil cases — the helper must
    know an official source for each so the diagram can embed a real mark."""
    for name in ("temporal", "firecracker"):
        src = fl.known_source(name)
        assert src and src.startswith("https://"), (name, src)


# --- draw.io's built-in SVG renderer is NOT a browser -------------------------
# Real regression: the official Temporal (Simple Icons) and Firecracker (Inkscape)
# SVGs render fine in Chrome but make draw.io LOG ERRORS and mis-render, because
# draw.io's sanitizer/renderer can't size a width/height-less SVG and mishandles
# gradient xlink:href inheritance, clipPath, and Inkscape/sodipodi cruft. The fix
# is to rasterize such logos to PNG before embedding. These pin the DETECTOR that
# tells the protocol when an SVG must be rasterized.

_TEMPORAL_LIKE = b'<svg fill="#7C4DFF" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'
_FIRECRACKER_LIKE = (b'<svg xmlns="http://www.w3.org/2000/svg" '
                     b'xmlns:xlink="http://www.w3.org/1999/xlink" '
                     b'xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" '
                     b'viewBox="0 0 420 571" width="1590" height="2160">'
                     b'<linearGradient id="g2" xlink:href="#g1"/>'
                     b'<clipPath id="c"><path d="M0 0"/></clipPath></svg>')
_CLEAN = b'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M0 0"/></svg>'


def test_detects_missing_width_height_svg():
    reasons = fl.drawio_unsafe_svg_reasons(_TEMPORAL_LIKE)
    assert reasons, "a width/height-less SVG must be flagged (draw.io can't size it)"
    assert any("width" in r or "height" in r for r in reasons), reasons


def test_detects_gradient_href_and_clippath_and_inkscape():
    reasons = fl.drawio_unsafe_svg_reasons(_FIRECRACKER_LIKE)
    joined = " ".join(reasons).lower()
    assert "xlink" in joined or "href" in joined, reasons
    assert "clippath" in joined, reasons
    assert "inkscape" in joined, reasons


def test_clean_sized_svg_is_not_flagged():
    assert fl.drawio_unsafe_svg_reasons(_CLEAN) == [], "a sized, plain SVG is safe to embed"


def test_should_rasterize_only_targets_unsafe_svg():
    # unsafe SVG -> rasterize; clean SVG or an already-raster PNG -> leave alone
    assert fl.should_rasterize_for_drawio(_TEMPORAL_LIKE, "image/svg+xml") is True
    assert fl.should_rasterize_for_drawio(_CLEAN, "image/svg+xml") is False
    assert fl.should_rasterize_for_drawio(b"\x89PNG\r\n", "image/png") is False


# --- the image style must survive draw.io's style tokenizer --------------------
# Real regression (verified against draw.io's own viewer.min.js): draw.io splits a
# cell's style on ';' and each token on the FIRST '='. A standard
# `data:image/png;base64,<b64>` URI therefore truncates to `image=data:image/png`
# (the ';base64' becomes an orphan token) and renders as the broken-image
# placeholder. draw.io's native form embeds the base64 after a COMMA with no
# ';base64' marker: `image=data:image/png,<b64>`. The style fetch_logo emits MUST
# use that form or every logo it produces is born broken.

def _mxgraph_style_image(style):
    """Mimic mxStylesheet.getCellStyle: split on ';', each token on first '='."""
    img = None
    for tok in style.split(";"):
        pos = tok.find("=")
        if pos >= 0 and tok[:pos] == "image":
            img = tok[pos + 1:]
    return img


def test_image_style_survives_drawio_style_tokenizer():
    style = fl.image_style(fl.encode_data_uri(b"\x89PNG\r\n\x1a\n", "image/png"))
    # the ';base64' semicolon is exactly what draw.io's tokenizer trips on
    assert ";base64," not in style, style
    img = _mxgraph_style_image(style)
    assert img is not None, "no image= token survived tokenization"
    # native comma form, and the base64 payload is still attached (not truncated
    # to the bare 'data:image/png' that yields a broken-image placeholder)
    assert img.startswith("data:image/png,"), img
    assert len(img) > len("data:image/png,"), img
    assert base64.b64decode(img.split(",", 1)[1]) == b"\x89PNG\r\n\x1a\n"


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
        except Exception as e:  # import/attr errors during RED
            failed += 1
            print(f"  FAIL {fn.__name__}: {type(e).__name__}: {e}")
    print(f"\n{'[OK]' if not failed else '[FAIL]'} {len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)
