#!/usr/bin/env python3
"""Win-loss analysis on a closed-deal CSV. Reports links, not causes."""
import argparse, csv, sys
from collections import Counter, defaultdict
from pathlib import Path

SKIP = {"deal_id", "outcome", "loss_reason", "amount", "cycle_days", "se_hours", "name", "account"}

def band(v, cuts, labels):
    try: x = float(v)
    except (TypeError, ValueError): return "unknown"
    for c, l in zip(cuts, labels):
        if x < c: return l
    return labels[-1]

def analyse(rows, min_n=5):
    rows = [r for r in rows if r.get("outcome", "").strip().lower() in ("won", "lost", "no_decision")]
    for r in rows:
        r["outcome"] = r["outcome"].strip().lower()
        if "amount" in r: r["deal_size"] = band(r["amount"], [25000, 100000, float("inf")], ["<25k", "25k-100k", "100k+"])
        if "cycle_days" in r: r["cycle"] = band(r["cycle_days"], [45, 90, float("inf")], ["<45d", "45-90d", "90d+"])
    n = len(rows); won = sum(r["outcome"] == "won" for r in rows)
    base = won / n if n else 0
    factors = [k for k in (rows[0].keys() if rows else []) if k not in SKIP]
    table = []
    for f in factors:
        g = defaultdict(list)
        for r in rows: g[(r.get(f) or "unknown").strip()].append(r["outcome"] == "won")
        for v, xs in g.items():
            rate = sum(xs) / len(xs)
            table.append({"factor": f, "value": v, "n": len(xs), "win_rate": rate, "lift": rate - base, "low_sample": len(xs) < min_n})
    losses = Counter((r.get("loss_reason") or "unstated").strip() for r in rows if r["outcome"] != "won")
    signals = sorted([t for t in table if not t["low_sample"]], key=lambda t: -abs(t["lift"]))[:5]
    se = [float(r["se_hours"]) for r in rows if r.get("se_hours", "").replace(".", "", 1).isdigit()]
    return {"n": n, "won": won, "base": base, "table": table, "losses": losses.most_common(5), "signals": signals,
            "se_hours_per_win": (sum(se) / won) if se and won else None}

def render(res):
    p = lambda x: f"{x*100:.0f}%"
    out = [f"# Win-loss report", "", f"**{res['n']} closed deals, win rate {p(res['base'])}.**", ""]
    if res["se_hours_per_win"]: out += [f"SE hours per win: {res['se_hours_per_win']:.1f}", ""]
    out += ["## Leading signals", "", "Linked with win rate, not proof of cause.", ""]
    for s in res["signals"]:
        d = "higher" if s["lift"] > 0 else "lower"
        out.append(f"- **{s['factor']} = {s['value']}**: {p(s['win_rate'])} win rate, {abs(s['lift'])*100:.0f} points {d} than baseline (n={s['n']})")
    out += ["", "## Win rate by factor", "", "| Factor | Value | Deals | Win rate | vs baseline |", "|---|---|---:|---:|---:|"]
    for t in sorted(res["table"], key=lambda t: (t["factor"], -t["n"])):
        flag = " (low sample)" if t["low_sample"] else ""
        out.append(f"| {t['factor']} | {t['value']}{flag} | {t['n']} | {p(t['win_rate'])} | {t['lift']*100:+.0f} |")
    out += ["", "## Top loss reasons", ""] + [f"- {r}: {c}" for r, c in res["losses"]]
    return "\n".join(out) + "\n"

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("csv"); ap.add_argument("-o", "--out", default="-"); ap.add_argument("--min-n", type=int, default=5)
    a = ap.parse_args(argv)
    with open(a.csv, newline="", encoding="utf-8-sig") as f:
        res = analyse(list(csv.DictReader(f)), a.min_n)
    if not res["n"]:
        print("[FAIL] no rows with outcome won, lost or no_decision", file=sys.stderr); return 1
    md = render(res)
    (sys.stdout.write(md) if a.out == "-" else Path(a.out).write_text(md, encoding="utf-8"))
    print(f"[OK] {res['n']} deals analysed", file=sys.stderr); return 0

if __name__ == "__main__":
    sys.exit(main())
