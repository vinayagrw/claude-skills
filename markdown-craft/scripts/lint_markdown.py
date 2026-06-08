#!/usr/bin/env python3
"""
lint_markdown.py - verify a Markdown file before claiming it's done.

Catches the failures that actually embarrass a published doc:
  - more than one H1, or skipped heading levels (H2 -> H4)
  - broken relative links and missing local images
  - unresolved in-page anchors  ](#some-heading)  (ToC links that go nowhere)
  - malformed GitHub alert callouts  > [!NOTES]  (typo'd / unknown type)
  - unbalanced ```code fences``` and <details>/<summary>
  - dangling reference-style links  [text][ref]  with no  [ref]: url  definition
  - inconsistent table column counts

Heading/anchor slugs follow GitHub's algorithm (lowercase, drop punctuation except
hyphens, spaces -> hyphens, emoji/other chars dropped) so ToC checks match reality.

Usage:   python lint_markdown.py FILE.md [FILE2.md ...]
Exit:    0 = clean (warnings allowed)   1 = errors found   2 = bad usage / unreadable
ASCII-only output so it's safe on any Windows code page.
"""
import sys
import os
import re
import io

try:  # make stdout robust on legacy Windows code pages
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ALERT_TYPES = {"NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"}


def scrub_inline_code(line):
    """Blank out `inline code` spans so syntax shown as examples (e.g. `<details>`
    or `![](url)`) isn't mistaken for real tags/links. Length-preserving."""
    def repl(m):
        return " " * len(m.group(0))
    return re.sub(r"(`+)(.+?)\1", repl, line)


def slugify(heading_text):
    """GitHub heading -> anchor slug, mirroring github-slugger.

    Key fidelity point: github-slugger does NOT trim or collapse, so an emoji at
    the start of a heading is dropped and leaves a LEADING HYPHEN
    (`## :rocket: Quick start` -> `#-quick-start`). Trimming/collapsing here would
    desync the linter from real GitHub anchors and flag valid ToC links as broken.
    """
    s = heading_text
    # reduce inline markdown to its visible text (slugger runs on rendered text)
    s = re.sub(r"`([^`]*)`", r"\1", s)              # `code` -> code
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)  # [text](url) -> text
    s = re.sub(r"(\*\*|\*|__|_|~~)", "", s)         # emphasis markers
    s = s.lower()
    # drop everything that isn't a word char, space, or hyphen (drops emoji/punct)
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = s.replace(" ", "-")                          # no trim, no collapse
    return s


def strip_fences(lines):
    """Return list of (lineno, text, in_code) marking fenced code regions.

    CommonMark: a fence opened with N backticks/tildes is closed only by a fence
    of the SAME char and >= N length with no info string. This makes nested
    ```` ```` blocks (a ```` wrapping an inner ```) match correctly.
    """
    out = []
    fence_char = None
    fence_len = 0
    for i, raw in enumerate(lines, 1):
        stripped = raw.lstrip()
        m = re.match(r"^(`{3,}|~{3,})", stripped)
        if m:
            run = m.group(1)
            ch, ln = run[0], len(run)
            if fence_char is None:
                fence_char, fence_len = ch, ln
                out.append((i, raw, True))   # opening fence
                continue
            elif ch == fence_char and ln >= fence_len and not stripped[ln:].strip():
                fence_char, fence_len = None, 0
                out.append((i, raw, True))   # closing fence
                continue
        out.append((i, raw, fence_char is not None))
    return out, (fence_char is not None)


def lint(path):
    errors, warnings = [], []
    try:
        with io.open(path, "r", encoding="utf-8") as f:
            text = f.read()
    except Exception as e:
        return [("read", "could not read file: %s" % e)], []

    base = os.path.dirname(os.path.abspath(path))
    lines = text.splitlines()

    # YAML frontmatter (--- ... ---) is metadata, not rendered Markdown - skip it
    # without renumbering, so reported line numbers still match the file.
    fm_end = 0
    if lines and lines[0].strip() == "---":
        for j in range(1, len(lines)):
            if lines[j].strip() == "---":
                fm_end = j + 1  # 1-based line number of the closing ---
                break

    scanned, fence_open = strip_fences(lines)
    if fm_end:
        scanned = [(ln, raw, True if ln <= fm_end else ic) for (ln, raw, ic) in scanned]
    if fence_open:
        errors.append(("fence", "unbalanced code fence (``` or ~~~) - a block is never closed"))

    headings = []          # (lineno, level, text, slug)
    slugs = {}             # slug -> count (for -1/-2 dedupe like GitHub)
    h1_count = 0
    prev_level = 0
    details_depth = 0
    table_depth = 0
    details_without_summary = []
    ref_defs = set()       # [ref]: url
    ref_uses = []          # (lineno, ref)
    anchor_links = []      # (lineno, anchor)
    rel_targets = []       # (lineno, target, is_image)
    table_block = []       # accumulating consecutive table rows

    def flush_table(tbl):
        if len(tbl) < 2:
            return
        # column count = pipe-delimited cells; compare body rows to header
        def ncols(row):
            r = row.strip()
            r = r[1:] if r.startswith("|") else r
            r = r[:-1] if r.endswith("|") else r
            # don't split on escaped \|
            return len(re.split(r"(?<!\\)\|", r))
        header_cols = ncols(tbl[0][1])
        for ln, row in tbl[2:]:
            if ncols(row) != header_cols:
                warnings.append(("table", "line %d: row has %d columns, header has %d"
                                 % (ln, ncols(row), header_cols)))

    for lineno, raw, in_code in scanned:
        if in_code:
            if table_block:
                flush_table(table_block); table_block = []
            continue
        line = raw.rstrip("\n")
        scrub = scrub_inline_code(line)  # for tag/link/alert/table detection

        # headings (ATX) - use raw text; slugify() handles backticks
        hm = re.match(r"^(#{1,6})\s+(.*?)\s*#*\s*$", line)
        if hm:
            if table_block:
                flush_table(table_block); table_block = []
            level = len(hm.group(1))
            htext = hm.group(2)
            slug = slugify(htext)
            n = slugs.get(slug, 0)
            slugs[slug] = n + 1
            actual = slug if n == 0 else "%s-%d" % (slug, n)
            headings.append((lineno, level, htext, actual))
            if level == 1:
                h1_count += 1
            if prev_level and level > prev_level + 1:
                warnings.append(("heading", "line %d: jumps from H%d to H%d (skipped a level)"
                                 % (lineno, prev_level, level)))
            prev_level = level
            continue

        # GitHub alert callouts
        am = re.match(r"^\s*>\s*\[!([A-Za-z]+)\]\s*(\S.*)?$", scrub)
        if am:
            t = am.group(1)
            if t.upper() not in ALERT_TYPES:
                errors.append(("alert", "line %d: unknown alert type [!%s] (use one of %s)"
                               % (lineno, t, "/".join(sorted(ALERT_TYPES)))))
            elif t != t.upper():
                warnings.append(("alert", "line %d: alert type [!%s] should be uppercase [!%s]"
                                 % (lineno, t, t.upper())))
            if am.group(2):
                warnings.append(("alert", "line %d: '> [!%s]' should stand alone; move text to the next line"
                                 % (lineno, t)))

        # <details> / <summary>
        for tag in re.findall(r"<\s*details\b[^>]*>", scrub, flags=re.I):
            details_depth += 1
            details_without_summary.append(lineno)
        if re.search(r"<\s*summary\b", scrub, flags=re.I) and details_without_summary:
            details_without_summary.pop()
        for _ in re.findall(r"<\s*/\s*details\s*>", scrub, flags=re.I):
            if details_depth > 0:
                details_depth -= 1

        # <table> / </table> balance (raw HTML tables)
        table_depth += len(re.findall(r"<\s*table\b[^>]*>", scrub, flags=re.I))
        for _ in re.findall(r"<\s*/\s*table\s*>", scrub, flags=re.I):
            if table_depth > 0:
                table_depth -= 1

        # reference-style link defs and uses
        rd = re.match(r"^\s{0,3}\[([^\]]+)\]:\s+\S+", scrub)
        if rd:
            ref_defs.add(rd.group(1).lower())
        for m in re.finditer(r"(?<!\!)\[[^\]]+\]\[([^\]]*)\]", scrub):
            ref = m.group(1).strip().lower()
            if ref:
                ref_uses.append((lineno, ref))

        # inline links/images: capture targets
        for m in re.finditer(r"(!?)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)", scrub):
            is_img = m.group(1) == "!"
            target = m.group(2)
            if target.startswith("#"):
                anchor_links.append((lineno, target[1:]))
            elif re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target) or target.startswith("//"):
                pass  # absolute URL / mailto / data: - skip
            else:
                rel_targets.append((lineno, target.split("#")[0], is_img))

        # tables: collect consecutive lines containing an unescaped pipe
        if re.search(r"(?<!\\)\|", scrub) and scrub.strip():
            table_block.append((lineno, scrub))
        else:
            if table_block:
                flush_table(table_block); table_block = []
    if table_block:
        flush_table(table_block)

    # --- aggregate checks ---
    if h1_count == 0:
        warnings.append(("heading", "no H1 (#) found - a document should have one title"))
    elif h1_count > 1:
        warnings.append(("heading", "%d H1 (#) headings - keep exactly one top-level title" % h1_count))

    if details_depth != 0:
        errors.append(("html", "unbalanced <details> - %d not closed" % details_depth))
    if table_depth != 0:
        errors.append(("html", "unbalanced <table> - %d not closed" % table_depth))
    for ln in details_without_summary:
        warnings.append(("html", "line %d: <details> has no <summary> (toggle label will be generic)" % ln))

    valid_slugs = set(s for (_, _, _, s) in headings)
    for ln, anchor in anchor_links:
        if anchor.lower() not in {s.lower() for s in valid_slugs}:
            errors.append(("anchor", "line %d: link to #%s but no heading produces that anchor" % (ln, anchor)))

    for ln, ref in ref_uses:
        if ref not in ref_defs:
            warnings.append(("ref-link", "line %d: reference [%s] has no matching [%s]: definition" % (ln, ref, ref)))

    for ln, target, is_img in rel_targets:
        # resolve relative to the file; ignore template placeholders
        if any(c in target for c in "<>") or "{{" in target:
            continue
        full = os.path.normpath(os.path.join(base, target))
        if not os.path.exists(full):
            kind = "image" if is_img else "link"
            errors.append((kind, "line %d: %s target not found: %s" % (ln, kind, target)))

    return errors, warnings


def main(argv):
    if len(argv) < 2:
        print("usage: python lint_markdown.py FILE.md [FILE2.md ...]")
        return 2
    any_error = False
    for path in argv[1:]:
        errors, warnings = lint(path)
        print("\n=== %s ===" % path)
        for cat, msg in errors:
            print("  [FAIL] (%s) %s" % (cat, msg))
        for cat, msg in warnings:
            print("  [warn] (%s) %s" % (cat, msg))
        if errors:
            any_error = True
            print("  -> %d error(s), %d warning(s)" % (len(errors), len(warnings)))
        else:
            print("  [OK] no errors, %d warning(s)" % len(warnings))
    return 1 if any_error else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
