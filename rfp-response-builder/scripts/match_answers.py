#!/usr/bin/env python3
"""Match questions to an answer library and set green, amber or red confidence."""
import argparse, json, re, sys
from datetime import date, datetime
from pathlib import Path

STOP = set("a an the and or of to in for on with do does you your is are we our can how what which please describe provide any all be by it this that".split())

def toks(s):
    return {w for w in re.findall(r"[a-z0-9]+", s.lower()) if w not in STOP and len(w) > 1}

def sim(a, b):
    A, B = toks(a), toks(b)
    return len(A & B) / len(A | B) if A and B else 0.0

def stale(d, today):
    try:
        return (today - datetime.strptime(d, "%Y-%m-%d").date()).days > 365
    except (TypeError, ValueError):
        return True

def load(p):
    return [json.loads(l) for l in Path(p).read_text(encoding="utf-8").splitlines() if l.strip()]

def match(questions, library, today=None, green=0.5, amber=0.25):
    today = today or date.today(); out = []
    for q in questions:
        best, score = None, 0.0
        for e in library:
            s = sim(q["question"], e.get("question", "") + " " + e.get("topic", ""))
            if s > score:
                best, score = e, s
        r = dict(q, score=round(score, 2))
        if best and best.get("source") and score >= amber:
            conf = "green" if score >= green and not stale(best.get("last_verified"), today) else "amber"
            r.update(confidence=conf, answer=best["answer"], source=best["source"], owner=best.get("owner", ""), topic=best.get("topic", ""), library_id=best.get("id"))
        else:
            r.update(confidence="red", answer="", source="", owner=(best or {}).get("owner", "SME"), topic=(best or {}).get("topic", ""))
        out.append(r)
    return out

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("questions"); ap.add_argument("library"); ap.add_argument("-o", "--out", default="-")
    a = ap.parse_args(argv)
    rows = match(load(a.questions), load(a.library))
    text = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
    (sys.stdout.write(text) if a.out == "-" else Path(a.out).write_text(text, encoding="utf-8"))
    c = {k: sum(r["confidence"] == k for r in rows) for k in ("green", "amber", "red")}
    print(f"[OK] green {c['green']}  amber {c['amber']}  red {c['red']}", file=sys.stderr)
    return 0

if __name__ == "__main__":
    sys.exit(main())
