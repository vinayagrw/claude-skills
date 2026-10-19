#!/usr/bin/env python3
"""Flag answers on the same topic that disagree on numbers or on yes and no."""
import json, re, sys
from collections import defaultdict
from pathlib import Path

NUM = re.compile(r"\d+(?:\.\d+)?\s*%?")
def polarity(a):
    s = a.strip().lower()
    if re.match(r"^(yes|we do|supported)\b", s): return "yes"
    if re.match(r"^(no|not|we do not|unsupported)\b", s): return "no"
    if "roadmap" in s or "planned" in s: return "roadmap"
    return None

def check(rows):
    by = defaultdict(list)
    for r in rows:
        if r.get("answer") and r.get("topic"):
            by[r["topic"].lower()].append(r)
    issues = []
    for topic, rs in by.items():
        pols = {polarity(r["answer"]) for r in rs} - {None}
        if len(pols) > 1:
            issues.append({"topic": topic, "kind": "yes/no", "ids": [r["id"] for r in rs], "values": sorted(pols)})
        nums = {n.replace(" ", "") for r in rs for n in NUM.findall(r["answer"]) if "%" in n}
        if len(nums) > 1:
            issues.append({"topic": topic, "kind": "percent", "ids": [r["id"] for r in rs], "values": sorted(nums)})
    return issues

def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    if not argv:
        print("usage: consistency_check.py drafts.jsonl", file=sys.stderr); return 2
    rows = [json.loads(l) for l in Path(argv[0]).read_text(encoding="utf-8").splitlines() if l.strip()]
    issues = check(rows)
    for i in issues:
        print(f"[CONFLICT] {i['topic']} ({i['kind']}): {', '.join(i['values'])} in {', '.join(i['ids'])}")
    print("[OK] 0 conflicts" if not issues else f"[FAIL] {len(issues)} conflicts")
    return 1 if issues else 0

if __name__ == "__main__":
    sys.exit(main())
