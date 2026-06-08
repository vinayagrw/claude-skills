#!/usr/bin/env python3
"""
validate_mermaid.py — render-validate every ```mermaid block in a Markdown file.

Usage:
    python validate_mermaid.py <path-to-markdown.md> [--keep]

It extracts each ```mermaid fenced block, renders it with mermaid-cli (mmdc),
and reports which blocks fail (with the mmdc error). Exit code 0 = all good,
1 = at least one failure or tooling missing.

Why: a broken diagram in a client-facing design doc is worse than no diagram.
This catches syntax errors before the doc ships. Automated render success does
NOT guarantee the diagram is *readable* — still eyeball the complex ones.

Tooling it needs:
  - Node + mermaid-cli:  npm install -g @mermaid-js/mermaid-cli   (provides `mmdc`)
  - A headless Chrome. If mmdc errors with "Could not find Chrome":
        npx -y puppeteer browsers install chrome-headless-shell
    then re-run; this script auto-discovers that browser and writes a temp
    puppeteer config pointing at it.
"""
import sys
import os
import re
import json
import glob
import shutil
import tempfile
import subprocess

FENCE_RE = re.compile(r"^[ \t]*```+[ \t]*mermaid[ \t]*$(.*?)^[ \t]*```+[ \t]*$",
                      re.DOTALL | re.MULTILINE | re.IGNORECASE)


def find_mmdc():
    """Return the mmdc command (list form) or None."""
    exe = shutil.which("mmdc") or shutil.which("mmdc.cmd")
    if exe:
        return [exe]
    # Try via npx as a fallback (slower, but works without global install).
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if npx:
        return [npx, "-y", "@mermaid-js/mermaid-cli"]
    return None


def find_chrome_headless():
    """Locate a puppeteer-installed chrome-headless-shell, if any."""
    home = os.path.expanduser("~")
    patterns = [
        os.path.join(home, ".cache", "puppeteer", "**", "chrome-headless-shell*"),
        os.path.join(home, ".cache", "puppeteer", "**", "chrome*"),
        os.path.join(home, "AppData", "Local", "ms-playwright", "**", "chrome*"),
    ]
    for pat in patterns:
        for hit in glob.glob(pat, recursive=True):
            if os.path.isfile(hit) and os.access(hit, os.X_OK):
                return hit
            # On Windows the glob may land on the .exe directly.
            if hit.lower().endswith(".exe") and os.path.isfile(hit):
                return hit
    return None


def write_puppeteer_config(chrome_path):
    fd, path = tempfile.mkstemp(suffix=".json", prefix="puppeteer-")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump({"executablePath": chrome_path, "args": ["--no-sandbox"]}, f)
    return path


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    keep = "--keep" in sys.argv
    if not args:
        print("usage: python validate_mermaid.py <markdown.md> [--keep]")
        return 1
    md_path = args[0]
    if not os.path.isfile(md_path):
        print(f"ERROR: file not found: {md_path}")
        return 1

    with open(md_path, encoding="utf-8") as f:
        text = f.read()

    blocks = [m.group(1).strip("\n") for m in FENCE_RE.finditer(text)]
    if not blocks:
        print("No ```mermaid blocks found.")
        return 0

    mmdc = find_mmdc()
    if not mmdc:
        print("ERROR: mermaid-cli (mmdc) not found.")
        print("  Install with:  npm install -g @mermaid-js/mermaid-cli")
        return 1

    env = os.environ.copy()
    puppeteer_cfg = None
    chrome = find_chrome_headless()
    if chrome:
        puppeteer_cfg = write_puppeteer_config(chrome)

    workdir = tempfile.mkdtemp(prefix="mermaid-validate-")
    failures = []
    print(f"Validating {len(blocks)} mermaid block(s) in {md_path}\n")

    for i, block in enumerate(blocks, 1):
        in_path = os.path.join(workdir, f"block_{i}.mmd")
        out_path = os.path.join(workdir, f"block_{i}.svg")
        with open(in_path, "w", encoding="utf-8") as f:
            f.write(block + "\n")
        cmd = list(mmdc) + ["-i", in_path, "-o", out_path]
        if puppeteer_cfg:
            cmd += ["-p", puppeteer_cfg]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=120)
        except subprocess.TimeoutExpired:
            failures.append((i, "render timed out (>120s)"))
            print(f"  block {i}: TIMEOUT")
            continue
        if res.returncode == 0 and os.path.isfile(out_path):
            print(f"  block {i}: OK")
        else:
            err = (res.stderr or res.stdout or "unknown error").strip()
            if "Could not find Chrome" in err and not chrome:
                err += ("\n  -> Install a headless browser:\n"
                        "     npx -y puppeteer browsers install chrome-headless-shell\n"
                        "     then re-run this script.")
            failures.append((i, err))
            print(f"  block {i}: FAIL")

    print()
    if failures:
        print(f"{len(failures)} block(s) failed:\n")
        for i, err in failures:
            snippet = blocks[i - 1].splitlines()
            head = "\n      ".join(snippet[:6])
            print(f"--- block {i} ---")
            print(f"  error: {err}")
            print(f"  first lines:\n      {head}\n")
    else:
        print(f"All {len(blocks)} mermaid block(s) rendered successfully.")

    if not keep:
        shutil.rmtree(workdir, ignore_errors=True)
        if puppeteer_cfg:
            try:
                os.remove(puppeteer_cfg)
            except OSError:
                pass
    else:
        print(f"\n(SVGs kept in {workdir})")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
