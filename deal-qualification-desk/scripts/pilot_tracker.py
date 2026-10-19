#!/usr/bin/env python3
"""Compute two-lane pilot metrics from pilot.csv and render the HTML tracker."""
import argparse, csv, json, statistics, sys
from datetime import datetime
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "pilot-tracker.html"

def d(s):
    try: return datetime.strptime((s or "").strip(), "%Y-%m-%d").date()
    except ValueError: return None

def metrics(rows):
    res = {}
    for lane in ("1", "2"):
        rs = [r for r in rows if str(r.get("lane", "")).strip() == lane]
        q = [r for r in rs if (r.get("qualified") or "").strip().lower() in ("y", "yes", "1", "true")]
        hrs = sum(float(r.get("se_hours") or 0) for r in rs)
        demos = [r for r in rs if d(r.get("demo_date"))]
        moved = [r for r in demos if d(r.get("next_stage_date"))]
        ttd = [(d(r["tech_decision_date"]) - d(r["start_date"])).days for r in rs if d(r.get("tech_decision_date")) and d(r.get("start_date"))]
        res[lane] = {"deals": len(rs), "qualified": len(q), "se_hours": hrs,
                     "se_hours_per_qualified": round(hrs / len(q), 1) if q else None,
                     "demo_conversion": round(len(moved) / len(demos), 2) if demos else None,
                     "days_to_tech_decision": statistics.median(ttd) if ttd else None}
    return res

def advice(m):
    a, b = m["1"], m["2"]; out = []
    if a["demo_conversion"] is not None and b["demo_conversion"] is not None and b["demo_conversion"] <= a["demo_conversion"]:
        out.append("Lane 2 converts no better than lane 1. Raise the lane-2 threshold or tighten its entry rule.")
    if b["se_hours_per_qualified"] and b["se_hours_per_qualified"] > 25:
        out.append("Lane 2 uses over 25 SE hours per qualified deal. Reuse more demo assets and agree success criteria earlier.")
    if a["deals"] and a["qualified"] / a["deals"] > 0.4:
        out.append("Over 40% of lane 1 deals qualify. Promote them faster, the threshold may be too high.")
    return out or ["The lanes behave as designed. Keep the thresholds and review again in 30 days."]

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("csv"); ap.add_argument("-o", "--out", default="pilot-tracker.html")
    a = ap.parse_args(argv)
    with open(a.csv, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    m = metrics(rows)
    data = {"metrics": m, "advice": advice(m), "rows": rows}
    html = TEMPLATE.read_text(encoding="utf-8").replace("/*__DATA__*/null", json.dumps(data))
    Path(a.out).write_text(html, encoding="utf-8")
    print(f"[OK] {len(rows)} deals, tracker written to {a.out}", file=sys.stderr); return 0

if __name__ == "__main__":
    sys.exit(main())
