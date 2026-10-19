#!/usr/bin/env python3
"""Split a questionnaire (xlsx, csv, md, txt) into questions.jsonl."""
import argparse, csv, json, re, sys
from pathlib import Path

Q_HEADERS = ("question", "requirement", "control", "query", "description")

def looks_like_question(t):
    t = t.strip()
    return len(t) > 12 and (t.endswith("?") or re.match(r"(?i)^(do|does|is|are|can|describe|explain|provide|list|how|what|which|please)\b", t))

def rows_from_table(rows):
    rows = [[(c or "").strip() if isinstance(c, str) else ("" if c is None else str(c)) for c in r] for r in rows]
    rows = [r for r in rows if any(r)]
    if not rows:
        return []
    head = [h.lower() for h in rows[0]]
    qcol = next((i for i, h in enumerate(head) if any(k in h for k in Q_HEADERS)), None)
    idcol = next((i for i, h in enumerate(head) if h in ("id", "#", "ref", "no", "number")), None)
    scol = next((i for i, h in enumerate(head) if "section" in h or "category" in h or "domain" in h), None)
    body = rows[1:] if qcol is not None else rows
    if qcol is None:
        qcol = max(range(len(rows[0])), key=lambda i: sum(len(r[i]) if i < len(r) else 0 for r in rows))
    out = []
    for n, r in enumerate(body, start=2 if body is not rows else 1):
        q = r[qcol] if qcol < len(r) else ""
        if len(q) < 8:
            continue
        out.append({"row": n, "id": (r[idcol] if idcol is not None and idcol < len(r) else "") or f"Q{len(out)+1}",
                    "section": r[scol] if scol is not None and scol < len(r) else "", "question": q})
    return out

def rows_from_text(text):
    out, section = [], ""
    for n, line in enumerate(text.splitlines(), 1):
        s = re.sub(r"^\s*(?:[-*]|\d+[.)]|[A-Z]{1,4}[-.]?\d+[.)]?)\s*", "", line).strip()
        if line.startswith("#"):
            section = line.lstrip("# ").strip(); continue
        if looks_like_question(s):
            out.append({"row": n, "id": f"Q{len(out)+1}", "section": section, "question": s})
    return out

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("file"); ap.add_argument("-o", "--out", default="-")
    a = ap.parse_args(argv)
    p = Path(a.file); ext = p.suffix.lower()
    if ext == ".csv":
        with p.open(newline="", encoding="utf-8-sig") as f:
            qs = rows_from_table(list(csv.reader(f)))
    elif ext in (".xlsx", ".xlsm"):
        try:
            import openpyxl
        except ImportError:
            sys.exit("openpyxl is needed for xlsx: pip install openpyxl")
        wb = openpyxl.load_workbook(p, read_only=True, data_only=True); qs = []
        for ws in wb.worksheets:
            for q in rows_from_table(list(ws.iter_rows(values_only=True))):
                q["sheet"] = ws.title; qs.append(q)
    else:
        qs = rows_from_text(p.read_text(encoding="utf-8"))
    lines = "".join(json.dumps(q, ensure_ascii=False) + "\n" for q in qs)
    (sys.stdout.write(lines) if a.out == "-" else Path(a.out).write_text(lines, encoding="utf-8"))
    print(f"[OK] {len(qs)} questions", file=sys.stderr)
    return 0

if __name__ == "__main__":
    sys.exit(main())
