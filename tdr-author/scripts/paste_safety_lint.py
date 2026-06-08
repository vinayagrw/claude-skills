#!/usr/bin/env python3
"""Confluence paste-safety linter for TDR markdown.

Flags the three things that silently break a Markdown paste into Confluence Cloud:
  1. Tables nested inside blockquotes  (rows like `> | a | b |`)
  2. <details> / <summary> HTML wrappers
  3. ```mermaid code fences (paste as source text, not a rendered diagram)

Usage:
    python paste_safety_lint.py <file.md> [<file2.md> ...]

Exit code 0 = clean, 1 = problems found. Intended for the `-confluence.md`
paste copy; the Mermaid master (`-design.md`) is expected to contain mermaid
and is not the target of this check.
"""
import re
import sys

BQ_TABLE = re.compile(r"^\s*>\s*\|")          # table row inside a blockquote
DETAILS = re.compile(r"</?(details|summary)\b", re.IGNORECASE)
FENCE = re.compile(r"^\s*```(.*)$")


def lint(path: str) -> list[tuple[int, str, str]]:
    """Return a list of (line_no, code, message) findings for one file."""
    findings: list[tuple[int, str, str]] = []
    try:
        with open(path, encoding="utf-8") as fh:
            lines = fh.readlines()
    except OSError as exc:
        return [(0, "IO", f"could not read file: {exc}")]

    in_fence = False
    for i, raw in enumerate(lines, start=1):
        fence = FENCE.match(raw)
        if fence:
            info = fence.group(1).strip().lower()
            if not in_fence and info.startswith("mermaid"):
                findings.append(
                    (i, "MERMAID",
                     "```mermaid block — replace with an ASCII diagram in the paste copy")
                )
            in_fence = not in_fence
            continue
        if in_fence:
            continue  # don't inspect content inside code blocks
        if BQ_TABLE.match(raw):
            findings.append(
                (i, "BQ_TABLE",
                 "table row inside a blockquote — pull the table out to top level")
            )
        if DETAILS.search(raw):
            findings.append(
                (i, "DETAILS",
                 "<details>/<summary> — Confluence won't render it; use a bold label + inline content")
            )
    return findings


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    total = 0
    for path in argv[1:]:
        findings = lint(path)
        if not findings:
            print(f"OK   {path} — no paste-safety problems")
            continue
        total += len(findings)
        print(f"FAIL {path} — {len(findings)} problem(s):")
        for line_no, code, msg in findings:
            loc = f"{path}:{line_no}" if line_no else path
            print(f"  [{code}] {loc}: {msg}")
    if total:
        print(f"\n{total} problem(s) found across {len(argv) - 1} file(s).")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
