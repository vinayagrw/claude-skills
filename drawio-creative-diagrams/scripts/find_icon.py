#!/usr/bin/env python3
"""find_icon.py — the Icon Selection Protocol matcher.

Given a service/product name, tell the author whether a REAL draw.io stencil exists
for it — so they stop guessing a resIcon that renders as a blank box. Conservative:
anything not in scripts/stencil_index.json resolves to the fallback ladder (brand chip
or semantic labelled lane), never a fabricated stencil name.

Usage:
    python find_icon.py "<service or product name>"
    python find_icon.py kinesis        # -> mxgraph.aws4.kinesis (Analytics #C925D1)
    python find_icon.py s3             # -> mxgraph.aws4.simple_storage_service (alias)
    python find_icon.py temporal       # -> FALLBACK: brand chip #7C4DFF (no stencil)

Exit code is always 0 (advisory tool). Output lines are machine-parseable.
See references/icon-selection.md for the full protocol this supports.
"""
import difflib
import json
import os
import re
import sys

_INDEX_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "stencil_index.json")
_FUZZY_CUTOFF = 0.72
_RANK = {"exact": 0, "alias": 1, "token": 2}


def _load():
    with open(_INDEX_PATH, encoding="utf-8") as f:
        return json.load(f)


def normalize(s):
    s = (s or "").lower().strip()
    s = re.sub(r"[_\-./]+", " ", s)
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _full(lib, sid):
    """The value the author actually pastes into a style."""
    if lib == "aws4":
        return f"mxgraph.aws4.{sid}"
    return f"img/lib/{lib}/{sid}.svg"


def lookup(term, index=None):
    """Return {term, matches:[...], fuzzy:[...], fallback:None|{...}}.

    matches   = confident hits (exact id, alias, or all-token-subset) — real stencils.
    fuzzy     = near-miss stencil names to eyeball (only when there is no confident hit).
    fallback  = set only when there is no confident match: {'brand','hex'} if the name is
                a known brand, else {'generic':True}. Never invents a stencil id.
    """
    index = index or _load()
    norm = normalize(term)
    toks = set(norm.split())
    matches, pool = [], []

    for lib in ("aws4", "azure2", "gcp2"):
        for sid, meta in index.get(lib, {}).items():
            idnorm = normalize(sid)
            akas = [normalize(a) for a in meta.get("aka", [])]
            pool.append((idnorm, lib, sid))
            for a in akas:
                pool.append((a, lib, sid))

            how = None
            if norm and norm == idnorm:
                how = "exact"
            elif norm and norm in akas:
                how = "alias"
            else:
                idtoks = set(idnorm.split()) | {t for a in akas for t in a.split()}
                if toks and toks <= idtoks:
                    how = "token"
            if how:
                matches.append({
                    "lib": lib, "id": sid, "full": _full(lib, sid), "how": how,
                    "cat": meta.get("cat", ""), "fill": meta.get("fill", ""),
                })

    matches.sort(key=lambda m: (_RANK[m["how"]], m["id"]))

    fuzzy = []
    if not matches and norm:
        seen = set()
        for cand, lib, sid in pool:
            if sid in seen:
                continue
            if difflib.SequenceMatcher(None, norm, cand).ratio() >= _FUZZY_CUTOFF:
                fuzzy.append({"lib": lib, "id": sid, "full": _full(lib, sid)})
                seen.add(sid)

    fallback = None
    if not matches:
        brand = index.get("brand", {})
        hit = norm if norm in brand else next((t for t in toks if t in brand), None)
        fallback = {"brand": hit, "hex": brand[hit]} if hit else {"generic": True}

    return {"term": term, "matches": matches, "fuzzy": fuzzy, "fallback": fallback}


def format_result(res):
    out = [f'icon lookup: "{res["term"]}"']
    if res["matches"]:
        out.append("  real stencil(s) — pick the one whose category fits the intention:")
        for m in res["matches"]:
            tag = f"({m['cat']} {m['fill']})".strip() if m["cat"] else ""
            out.append(f"    {m['full']}  {tag}  [{m['how']}]".rstrip())
    else:
        if res["fuzzy"]:
            out.append("  no confident match. closest real stencils — confirm relevance:")
            for m in res["fuzzy"]:
                out.append(f"    {m['full']}")
        fb = res["fallback"] or {}
        out.append("  no official stencil for this. Fallback ladder — in order:")
        out.append(f"  -> 1) OFFICIAL LOGO online (preferred): fetch the vendor's own "
                   f"mark and embed it as a self-contained image node:")
        out.append(f"        python scripts/fetch_logo.py \"{res['term']}\"")
        out.append("        (vendor site / brand kit / project repo, or Simple Icons; "
                   "confirm it's official.)")
        if fb.get("hex"):
            out.append(f"  -> 2) brand chip  {fb['hex']}  '{res['term']}'  "
                       f"(only if no logo can be obtained/embedded)")
        else:
            out.append("  -> 2) brand chip (brand hex) or a semantic labelled lane "
                       "(only if no logo can be obtained/embedded)")
        out.append("  -> never guess a resIcon; always keep a text label so a "
                   "missing/substituted glyph still reads.")
    return "\n".join(out)


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 0
    term = " ".join(argv[1:])
    print(format_result(lookup(term)))
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    sys.exit(main(sys.argv))
