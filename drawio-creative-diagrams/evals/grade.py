#!/usr/bin/env python3
"""Grade the iteration-1 drawio eval outputs programmatically.

Writes timing.json + grading.json into each run dir, in the schema the skill-creator
eval viewer expects (expectations: [{text, passed, evidence}]).
"""
import json, os, re, subprocess, sys, glob
import xml.etree.ElementTree as ET

WS = r"C:\Users\viagr\.claude\skills\drawio-creative-diagrams-workspace\iteration-1"
VALIDATOR = r"C:\Users\viagr\.claude\skills\drawio-creative-diagrams\scripts\validate_drawio.py"

TIMING = {
    ("eval-0", "with_skill"):    (52356, 105890),
    ("eval-0", "without_skill"): (53212, 103502),
    ("eval-1", "with_skill"):    (48891, 79429),
    ("eval-1", "without_skill"): (33068, 46281),
    ("eval-2", "with_skill"):    (47632, 67453),
    ("eval-2", "without_skill"): (33557, 43308),
}


def load(path):
    with open(path, encoding="utf-8") as f:
        txt = f.read()
    try:
        root = ET.fromstring(txt)
    except ET.ParseError:
        return txt, None
    return txt, root


def cells(root):
    return root.findall(".//mxCell") if root is not None else []


def fills(root):
    out = set()
    for c in cells(root):
        m = re.search(r"fillColor=(#[0-9a-fA-F]{6})", c.get("style") or "")
        if m:
            out.add(m.group(1).lower())
    return out


def edge_styles(root):
    out = set()
    for c in cells(root):
        if c.get("edge") == "1":
            s = c.get("style") or ""
            stroke = re.search(r"strokeColor=(#[0-9a-fA-F]{6})", s)
            dashed = "dashed=1" in s
            width = re.search(r"strokeWidth=([0-9.]+)", s)
            out.add((stroke.group(1).lower() if stroke else "default",
                     dashed, width.group(1) if width else "1"))
    return out


def validate(path):
    r = subprocess.run([sys.executable, VALIDATOR, path],
                       capture_output=True, text=True)
    last = (r.stdout.strip().splitlines() or [""])[-1]
    return r.returncode == 0, last


def has_html_table(txt):
    return "&lt;table" in txt or "<table" in txt


def has_legend(txt):
    return "legend" in txt.lower()


def mentions(txt, words):
    t = txt.lower()
    return sum(1 for w in words if w.lower() in t)


def grade_eval0(path, txt, root):
    ok, line = validate(path)
    comps = ["gateway", "sqs", "lambda", "twilio", "sendgrid", "dynamo", "cognito", "dlq"]
    comps_alt = mentions(txt, comps) + (1 if "dead" in txt.lower() else 0)
    exp = []
    exp.append(("Valid, openable .drawio (validator passes)", ok, line))
    nfills = len(fills(root))
    exp.append((">=3 distinct semantic fill colours", nfills >= 3, f"{nfills} distinct fills"))
    nedges = len(edge_styles(root))
    exp.append((">=2 visually distinct edge styles (control vs data/auth)", nedges >= 2, f"{nedges} edge styles"))
    creative = has_html_table(txt) or "gradientColor" in txt or "swimlane" in txt
    why = []
    if has_html_table(txt): why.append("HTML-table label")
    if "gradientColor" in txt: why.append("gradient")
    if "swimlane" in txt: why.append("swimlane")
    exp.append(("Uses a creative lift (gradient/HTML-table/swimlane)", creative, ", ".join(why) or "none"))
    exp.append(("Legend present decoding the encoding", has_legend(txt), "found 'legend'" if has_legend(txt) else "no legend"))
    cov = comps_alt >= 6
    exp.append(("Covers >=6 of the 8 named components", cov, f"{comps_alt}/8 component mentions"))
    return exp


def grade_eval1(path, txt, root):
    ok, line = validate(path)
    exp = []
    exp.append(("Valid, openable .drawio (validator passes)", ok, line))
    has_dec = "rhombus" in txt or "decision" in txt.lower() or "24h" in txt.lower() or "7 day" in txt.lower() or "7-day" in txt.lower()
    exp.append(("Has decision branch(es) for the time gates", has_dec, "rhombus/decision found" if has_dec else "no decision shape"))
    steps = ["sign", "verif", "welcome", "remind", "soft", "dashboard"]
    ns = mentions(txt, steps)
    exp.append(("Covers >=5 of the 6 onboarding steps", ns >= 5, f"{ns}/6 step mentions"))
    nfills = len(fills(root))
    exp.append(("Start/end visually distinguished (>=2 fills)", nfills >= 2, f"{nfills} distinct fills"))
    return exp


def grade_eval2(path, txt, root):
    ok, line = validate(path)
    exp = []
    exp.append(("Valid, openable .drawio (validator passes)", ok, line))
    svcs = ["gateway", "auth", "orders", "inventory", "payments", "ledger", "users"]
    ns = mentions(txt, svcs)
    exp.append(("All 7 services present", ns >= 7, f"{ns}/7 service nodes"))
    nfills = len(fills(root))
    exp.append((">=4 distinct fills (one per team)", nfills >= 4, f"{nfills} distinct fills"))
    nedges = sum(1 for c in cells(root) if c.get("edge") == "1")
    exp.append((">=6 dependency edges", nedges >= 6, f"{nedges} edges"))
    exp.append(("Legend keying colour to team", has_legend(txt), "found 'legend'" if has_legend(txt) else "no legend"))
    return exp


GRADERS = {"eval-0": grade_eval0, "eval-1": grade_eval1, "eval-2": grade_eval2}


def main():
    for eval_id, grader in GRADERS.items():
        for cfg in ("with_skill", "without_skill"):
            run = os.path.join(WS, eval_id, cfg)
            outdir = os.path.join(run, "outputs")
            files = glob.glob(os.path.join(outdir, "*.drawio"))
            os.makedirs(run, exist_ok=True)
            tok, ms = TIMING[(eval_id, cfg)]
            with open(os.path.join(run, "timing.json"), "w", encoding="utf-8") as f:
                json.dump({"total_tokens": tok, "duration_ms": ms,
                           "total_duration_seconds": round(ms / 1000, 1)}, f, indent=2)
            if not files:
                exp = [("Produced a .drawio file", False, "no .drawio found")]
            else:
                txt, root = load(files[0])
                exp = grader(files[0], txt, root)
            expectations = [{"text": t, "passed": bool(p), "evidence": e} for t, p, e in exp]
            passed = sum(1 for e in expectations if e["passed"])
            with open(os.path.join(run, "grading.json"), "w", encoding="utf-8") as f:
                json.dump({"eval_id": eval_id, "config": cfg,
                           "passed": passed, "total": len(expectations),
                           "expectations": expectations}, f, indent=2)
            print(f"{eval_id}/{cfg}: {passed}/{len(expectations)}")
            for e in expectations:
                print(f"    [{'PASS' if e['passed'] else 'FAIL'}] {e['text']}  ({e['evidence']})")


if __name__ == "__main__":
    main()
