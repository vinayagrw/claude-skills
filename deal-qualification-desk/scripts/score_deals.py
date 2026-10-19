#!/usr/bin/env python3
"""Score deals 0-100 from MEDDPICC-style fields plus fit, and route to lane 1 or 2."""
import argparse, csv, json, sys
from pathlib import Path

DEFAULT = Path(__file__).resolve().parent.parent / "references" / "scoring.json"

def val(v, table):
    s = str(v if v is not None else "").strip().lower()
    if s in table: return table[s]
    try: return max(0.0, min(1.0, float(s)))
    except ValueError: return 0.0

def score(row, cfg):
    w = cfg["fields"]; total = sum(w.values())
    parts = {f: val(row.get(f), cfg["values"]) for f in w}
    sc = round(100 * sum(parts[f] * w[f] for f in w) / total)
    ok = all(parts.get(f, 0) >= 0.5 for f in cfg.get("lane2_requires", []))
    lane = 2 if sc >= cfg["lane2_threshold"] and ok else 1
    gaps = [f for f in sorted(w, key=lambda f: -w[f]) if parts[f] < 0.5][:3]
    return sc, lane, gaps

def run(rows, cfg):
    out = []
    for r in rows:
        sc, lane, gaps = score(r, cfg)
        try: amt = float(r.get("amount") or 0)
        except ValueError: amt = 0
        out.append(dict(r, score=sc, lane=lane, gaps=";".join(gaps), priority=round(sc * amt / 100)))
    return sorted(out, key=lambda r: (-r["priority"], -r["score"]))

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("csv"); ap.add_argument("-c", "--config", default=str(DEFAULT)); ap.add_argument("-o", "--out", default="-")
    a = ap.parse_args(argv)
    cfg = json.loads(Path(a.config).read_text())
    with open(a.csv, newline="", encoding="utf-8-sig") as f:
        rows = run(list(csv.DictReader(f)), cfg)
    if not rows:
        print("[FAIL] no deals", file=sys.stderr); return 1
    fh = sys.stdout if a.out == "-" else open(a.out, "w", newline="", encoding="utf-8")
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    if fh is not sys.stdout: fh.close()
    l2 = sum(r["lane"] == 2 for r in rows)
    print(f"[OK] {len(rows)} deals scored, lane 2: {l2}, lane 1: {len(rows)-l2}", file=sys.stderr); return 0

if __name__ == "__main__":
    sys.exit(main())
