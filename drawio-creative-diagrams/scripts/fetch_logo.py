#!/usr/bin/env python3
"""fetch_logo.py — the online-official-logo fallback of the Icon Selection Protocol.

When find_icon.py reports NO real stencil for a product (e.g. Temporal, Firecracker,
Qdrant, Deepgram), the next rung of the ladder is NOT a flat colour chip — it is the
vendor's OFFICIAL logo, embedded as a self-contained draw.io image node. This helper
downloads that logo and prints a ready-to-paste `shape=image` cell with the artwork
inlined as a `data:` URI (so the .drawio stays self-contained — no network at render
time) and a text label below the glyph (so a broken image still reads).

Usage:
    python fetch_logo.py temporal                     # uses the verified known source
    python fetch_logo.py firecracker --label "Firecracker microVM"
    python fetch_logo.py https://cdn.simpleicons.org/qdrant/DC244C --label Qdrant

Provenance rule: only embed a mark from an OFFICIAL source — the vendor's own site /
brand kit / project repo, or Simple Icons (which curates official brand SVGs). Confirm
the source before adding it to KNOWN_SOURCES; a wrong logo is as misleading as a wrong
stencil. Exit code 0 on success, 1 on a fetch/resolve failure.
"""
import base64
import os
import re
import sys
import urllib.request

# Verified OFFICIAL logo sources for the no-stencil products the protocol keeps hitting.
# SVG preferred (crisp, tiny). Simple Icons serves official brand marks and accepts a
# hex suffix to tint to the brand colour; project repos serve their own icon artwork.
KNOWN_SOURCES = {
    "temporal": "https://cdn.simpleicons.org/temporal/7C4DFF",
    "firecracker": "https://raw.githubusercontent.com/firecracker-microvm/firecracker/main/docs/images/fc_logo_icon.svg",
    "qdrant": "https://cdn.simpleicons.org/qdrant/DC244C",
    "pinecone": "https://cdn.simpleicons.org/pinecone/1C17FF",
    "deepgram": "https://cdn.simpleicons.org/deepgram/13EF93",
    "langchain": "https://cdn.simpleicons.org/langchain/1C3C3C",
    "openai": "https://cdn.simpleicons.org/openai/412991",
    "anthropic": "https://cdn.simpleicons.org/anthropic/D97757",
}

_MIME_BY_EXT = {"svg": "image/svg+xml", "png": "image/png",
                "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif"}


def normalize(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def known_source(name):
    """The verified official logo URL for a product, or None."""
    return KNOWN_SOURCES.get(normalize(name))


def mime_for(url):
    """MIME type from a URL/filename extension; None if the extension is unknown."""
    m = re.search(r"\.([a-zA-Z0-9]+)(?:[?#].*)?$", url or "")
    return _MIME_BY_EXT.get(m.group(1).lower()) if m else None


def sniff_mime(raw):
    """MIME type from magic bytes, for sources with no file extension (e.g. a CDN)."""
    head = raw[:64].lstrip()
    if head[:4] == b"\x89PNG":
        return "image/png"
    if head[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if head[:4] == b"<svg" or head[:5] == b"<?xml" or b"<svg" in raw[:256]:
        return "image/svg+xml"
    return "application/octet-stream"


def drawio_unsafe_svg_reasons(raw):
    """Reasons this SVG will make draw.io LOG ERRORS / mis-render if embedded as-is.

    draw.io's built-in renderer is a sanitizer, not a browser: it can't size a
    width/height-less SVG (only a viewBox), and it mishandles gradient xlink:href
    inheritance, clipPath, and Inkscape/sodipodi editor cruft — all of which the
    official Temporal (Simple Icons) and Firecracker (Inkscape) marks use. Any
    non-empty result means: rasterize to PNG before embedding. Returns [] for a
    clean, explicitly-sized SVG, and [] for non-SVG bytes (nothing to rasterize)."""
    if not raw:
        return []
    head = raw[:400].lstrip()
    if not (head[:4] == b"<svg" or head[:5] == b"<?xml" or b"<svg" in raw[:512]):
        return []  # not an SVG
    text = raw.decode("utf-8", errors="replace")
    m = re.search(r"<svg\b[^>]*>", text, re.IGNORECASE | re.DOTALL)
    open_tag = m.group(0) if m else ""
    reasons = []
    if not (re.search(r'\bwidth\s*=', open_tag) and re.search(r'\bheight\s*=', open_tag)):
        reasons.append("no width/height on <svg> (draw.io cannot size it)")
    if re.search(r'xlink:href\s*=\s*["\']#', text) or re.search(r'\bhref\s*=\s*["\']#', text):
        reasons.append("xlink:href reference (gradient/use inheritance draw.io drops)")
    if "clipPath" in text or "clip-path" in text:
        reasons.append("clipPath (draw.io's renderer mishandles it)")
    if re.search(r'xmlns:(?:inkscape|sodipodi)\b|\b(?:inkscape|sodipodi):', text):
        reasons.append("Inkscape/sodipodi editor cruft")
    return reasons


def should_rasterize_for_drawio(raw, mime):
    """True when a logo should be rasterized to PNG before embedding in draw.io.
    Only unsafe SVGs qualify; a clean SVG or an already-raster image is left alone."""
    if not (mime == "image/svg+xml" or (mime or "").endswith("svg+xml")):
        return False
    return bool(drawio_unsafe_svg_reasons(raw))


def encode_data_uri(raw, mime):
    """Inline bytes as a self-contained base64 data URI."""
    return f"data:{mime};base64," + base64.b64encode(raw).decode("ascii")


def drawio_data_uri(data_uri):
    """Rewrite a standard `data:<mime>;base64,<b64>` URI into draw.io's native form
    `data:<mime>,<b64>`. draw.io splits a cell style on ';' and each token on the
    first '=', so a ';base64' marker truncates `image=` to the bare MIME type and the
    logo renders as a broken-image placeholder. draw.io treats the comma form's payload
    as base64, so dropping the marker is what makes an embedded logo actually render
    (verified against draw.io's own viewer). A URI without ';base64' is returned as-is."""
    return data_uri.replace(";base64,", ",", 1)


def image_style(data_uri, label_below=True):
    """A draw.io image-node style: the logo fills the box, aspect preserved, and the
    text label renders BELOW the glyph (so a missing/blocked image still reads) — the
    same label idiom the AWS resource icons use. The data URI is emitted in draw.io's
    native comma form so it survives the style tokenizer (see drawio_data_uri)."""
    parts = ["shape=image", "html=1", "imageAspect=1", "aspect=fixed",
             "image=" + drawio_data_uri(data_uri)]
    if label_below:
        parts[1:1] = ["verticalLabelPosition=bottom", "verticalAlign=top",
                      "labelBackgroundColor=none", "align=center"]
    return ";".join(parts) + ";"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "drawio-icon-protocol"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def _cell(style, label, w, h):
    esc = (label or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return (f'<mxCell id="LOGO" parent="1" vertex="1" value="{esc}" style="{style}">\n'
            f'  <mxGeometry x="0" y="0" width="{w}" height="{h}" as="geometry" /></mxCell>')


def main(argv):
    args = [a for a in argv[1:] if a not in ("-h", "--help")]
    if len(argv) < 2 or len(args) < 1:
        print(__doc__)
        return 0
    label = None
    if "--label" in args:
        i = args.index("--label")
        label = args[i + 1] if i + 1 < len(args) else None
        args = args[:i] + args[i + 2:]
    term = args[0]

    if re.match(r"^https?://", term):
        url, label = term, label or ""
    else:
        url = known_source(term)
        label = label or term
        if not url:
            print(f'no verified official-logo source for "{term}".')
            print("  -> find one on the vendor site / brand kit / project repo or "
                  "Simple Icons, confirm it is official, add it to KNOWN_SOURCES,")
            print("  -> or pass the URL directly:  python fetch_logo.py <logo-url> "
                  "--label \"<name>\"")
            return 1

    try:
        raw = fetch(url)
    except Exception as e:
        print(f"fetch failed for {url}: {e}")
        return 1
    mime = mime_for(url) or sniff_mime(raw)
    reasons = should_rasterize_for_drawio(raw, mime) and drawio_unsafe_svg_reasons(raw)
    if reasons:
        print("# WARNING: draw.io's built-in renderer will LOG ERRORS / mis-render this SVG:")
        for r in reasons:
            print(f"#   - {r}")
        print("# RASTERIZE it to PNG first (draw.io renders PNG data URIs with zero errors),")
        print("# then embed the PNG. Rasterize + VERIFY it actually shows in draw.io, e.g.:")
        print('#   chrome --headless --disable-gpu --force-device-scale-factor=2 \\')
        print('#     --default-background-color=00000000 --window-size=128,128 \\')
        print('#     --screenshot=logo.png logo.html   # logo.html sizes the <img> to the box')
        print("# (see references/icon-selection.md — 'Embedding logos in draw.io').")
    style = image_style(encode_data_uri(raw, mime))
    print(f"# official logo for '{label or term}'  <-  {url}  ({mime}, {len(raw)} bytes)")
    print(f"# style (paste into a node), then keep the label below the glyph:")
    print(style)
    print("# ready-to-paste cell:")
    print(_cell(style, label, 48, 48))
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    sys.exit(main(sys.argv))
