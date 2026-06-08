#!/usr/bin/env python3
"""Distinctiveness-aware grader. Scores each .drawio on the 'signature look' the skill
is supposed to enforce — the checks that actually discriminate skill from baseline.
Run per iteration dir; grades whatever eval/config runs exist there.

usage: python grade_distinct.py <iteration_dir>
"""
import json, os, re, subprocess, sys, glob
import xml.etree.ElementTree as ET

VALIDATOR = r"C:\Users\viagr\.claude\skills\drawio-creative-diagrams\scripts\validate_drawio.py"

TIMING = {
    ("iteration-1", "eval-0", "with_skill"):    (52356, 105890),
    ("iteration-1", "eval-0", "without_skill"): (53212, 103502),
    ("iteration-1", "eval-1", "with_skill"):    (48891, 79429),
    ("iteration-1", "eval-1", "without_skill"): (33068, 46281),
    ("iteration-1", "eval-2", "with_skill"):    (47632, 67453),
    ("iteration-1", "eval-2", "without_skill"): (33557, 43308),
    ("iteration-2", "eval-0", "with_skill"):    (59364, 123792),
    ("iteration-2", "eval-1", "with_skill"):    (54991, 103958),
    ("iteration-2", "eval-2", "with_skill"):    (50720, 107260),
}


def load(path):
    txt = open(path, encoding="utf-8").read()
    try:
        return txt, ET.fromstring(txt)
    except ET.ParseError:
        return txt, None


def cells(root):
    return root.findall(".//mxCell") if root is not None else []


def validate(path):
    r = subprocess.run([sys.executable, VALIDATOR, path], capture_output=True, text=True)
    return r.returncode == 0, (r.stdout.strip().splitlines() or [""])[-1]


def num(style, key, default=0.0):
    m = re.search(key + r"=([0-9.]+)", style or "")
    return float(m.group(1)) if m else default


def distinct_checks(txt, root):
    cs = cells(root)
    # banner: a large-font gradient title cell
    banner = any(num(c.get("style"), "fontSize") >= 18 and "gradientColor" in (c.get("style") or "")
                 for c in cs)
    # structured lanes: >=3 vertices that have a gradient AND a multi-part body (a <br>)
    # NB: ElementTree decodes entities, so a cell's value has real "<br>" not "&lt;br&gt;"
    lanes = sum(1 for c in cs if c.get("vertex") == "1"
                and "gradientColor" in (c.get("style") or "")
                and (c.get("value") or "").lower().count("<br") >= 1)
    # hero edge: at least one edge with strokeWidth >= 4
    edge_widths = {num(c.get("style"), "strokeWidth", 1) for c in cs if c.get("edge") == "1"}
    hero = any(w >= 4 for w in edge_widths)
    distinct_widths = len(edge_widths) >= 2
    # side rail: at least one dashed edge (cross-cutting concern)
    side = any("dashed=1" in (c.get("style") or "") for c in cs if c.get("edge") == "1")
    # html table node
    table = "&lt;table" in txt
    # stage rail: numbered pill glyphs
    stage = bool(re.search(r"[①-⑳]", txt))  # ①..⑳
    # legend
    legend = "legend" in txt.lower()
    return {
        "Banner header (large-font gradient title)": banner,
        "≥3 structured gradient lanes (not bare boxes)": lanes >= 3,
        "A hero path (edge with strokeWidth≥4)": hero,
        "≥2 distinct edge weights": distinct_widths,
        "Side rail / cross-cutting concern (dashed edge)": side,
        "Embedded HTML-table node": table,
        "Numbered stage rail (①②③)": stage,
        "Legend present": legend,
    }, {"lanes": lanes, "edge_widths": sorted(edge_widths)}


def main():
    it_dir = sys.argv[1]
    it_name = os.path.basename(it_dir.rstrip("\\/"))
    for eval_dir in sorted(glob.glob(os.path.join(it_dir, "eval-*"))):
        eid = os.path.basename(eval_dir)
        for cfg in ("with_skill", "without_skill"):
            run = os.path.join(eval_dir, cfg)
            files = glob.glob(os.path.join(run, "outputs", "*.drawio"))
            if not files:
                continue
            os.makedirs(run, exist_ok=True)
            tok, ms = TIMING.get((it_name, eid, cfg), (0, 0))
            json.dump({"total_tokens": tok, "duration_ms": ms,
                       "total_duration_seconds": round(ms / 1000, 1)},
                      open(os.path.join(run, "timing.json"), "w", encoding="utf-8"), indent=2)
            txt, root = load(files[0])
            ok, line = validate(files[0])
            checks, info = distinct_checks(txt, root)
            exp = [{"text": "Valid, openable .drawio", "passed": ok, "evidence": line}]
            for t, p in checks.items():
                exp.append({"text": t, "passed": bool(p),
                            "evidence": "yes" if p else "no"})
            passed = sum(1 for e in exp if e["passed"])
            json.dump({"eval_id": eid, "config": cfg, "passed": passed,
                       "total": len(exp), "expectations": exp, "info": info},
                      open(os.path.join(run, "grading.json"), "w", encoding="utf-8"), indent=2)
            print(f"{it_name}/{eid}/{cfg}: {passed}/{len(exp)}  lanes={info['lanes']} widths={info['edge_widths']}")


if __name__ == "__main__":
    main()
