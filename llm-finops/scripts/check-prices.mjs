#!/usr/bin/env node
/**
 * check-prices.mjs — the anti-drift enforcer.
 *
 * Two jobs, both of which convert a rule that people agree with into a rule that fails
 * loudly when broken:
 *
 *   1. FRESHNESS. Print FRESH / AGING / STALE / KNOWN-WRONG / PENDING per price row,
 *      measured from that row's own `verified` date. Re-emit the known-unknowns list so
 *      open questions resurface on every run rather than decaying into forgotten text.
 *
 *   2. THE ONE-FILE GUARD. Grep the whole skill tree for literal dollar figures outside
 *      references/sota-snapshot.md and FAIL. This is the mechanism behind the "prices
 *      live in exactly one file" decision. Without it that rule is a convention, and
 *      conventions decay: the design's own draft violated it in five places, including a
 *      project-context snippet that would have carried a stale price off-machine into a
 *      client repo, stamped with a verification date that was no longer true.
 *
 * Exit codes are deliberately distinct so CI can treat them differently:
 *   0  clean
 *   1  a dollar figure leaked outside the snapshot  (build defect — always fix)
 *   2  stale or known-wrong price rows              (data defect — run the refresh)
 *   3  both
 *   4  the script could not run (snapshot unreadable, bad arguments)
 *
 * Node builtins only.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { SKILL_ROOT, freshness, loadSnapshot, toIso } from './lib/snapshot.mjs';

const HELP = `
check-prices.mjs — freshness report + the tree-wide dollar-literal guard

USAGE
  node scripts/check-prices.mjs [options]

OPTIONS
  --root <dir>      Skill tree to scan          (default: the installed skill root)
  --today <date>    Evaluate ages as of an ISO date. Use this to prove the checker
                    actually fires — age a row past 60 days and watch it go STALE.
  --quiet           Only print problems and the summary.
  --no-guard        Skip the dollar-literal guard (freshness only).
  --no-freshness    Skip the freshness report (guard only).
  --json            Machine-readable output for CI.
  --help            This text.

EXIT CODES
  0 clean | 1 dollar leak | 2 stale rows | 3 both | 4 could not run

WHY THE GUARD MATTERS
  A price copied into a second file is a price that will not be updated at the next
  refresh. Sixty days later the snapshot is correct and the copy is confidently wrong —
  and the copy is the one that ends up in a client-facing deck.
`;

/** Files that legitimately hold dollar figures. Exactly one, and that is the point. */
const DOLLAR_ALLOWLIST = new Set([join('references', 'sota-snapshot.md')]);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
const SCAN_EXTS = new Set(['.md', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.txt']);

/**
 * Built from escapes so this file does not trip its own guard — a checker that cannot
 * be checked into the tree it checks is not much of a checker.
 */
const DOLLAR_LITERAL = new RegExp('\\u0024\\s?\\d', 'g');

function parseArgs(argv) {
  const opts = { root: SKILL_ROOT, today: toIso(), quiet: false, guard: true, fresh: true, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') return { help: true };
    else if (a === '--root') opts.root = argv[++i];
    else if (a === '--today') opts.today = argv[++i];
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--no-guard') opts.guard = false;
    else if (a === '--no-freshness') opts.fresh = false;
    else if (a === '--json') opts.json = true;
    else return { error: `Unknown argument: ${a}` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.today)) return { error: `--today must be YYYY-MM-DD, got: ${opts.today}` };
  return opts;
}

function walk(dir, root, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, root, out);
    } else if (e.isFile()) {
      if (!SCAN_EXTS.has(extname(e.name))) continue;
      try {
        if (statSync(full).size > 2_000_000) continue;
      } catch {
        continue;
      }
      out.push(relative(root, full));
    }
  }
  return out;
}

/** Scan for dollar literals, returning one finding per offending line. */
function runGuard(root) {
  const findings = [];
  for (const rel of walk(root, root)) {
    const norm = rel.split(sep).join(sep);
    if (DOLLAR_ALLOWLIST.has(norm)) continue;

    let text;
    try {
      text = readFileSync(join(root, rel), 'utf8');
    } catch {
      continue;
    }
    if (!DOLLAR_LITERAL.test(text)) {
      DOLLAR_LITERAL.lastIndex = 0;
      continue;
    }
    DOLLAR_LITERAL.lastIndex = 0;

    text.split(/\r?\n/).forEach((line, i) => {
      // A template literal interpolation (`${x}`) is code, not a price. Currency
      // formatting at runtime is fine; a hardcoded number is what we are hunting.
      const stripped = line.replace(/\$\{/g, '');
      const m = new RegExp('\\u0024\\s?\\d[\\d.,]*', 'g').exec(stripped);
      if (m) findings.push({ file: norm, line: i + 1, match: m[0], text: line.trim().slice(0, 120) });
    });
  }
  return findings;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (opts.error) {
    process.stderr.write(`${opts.error}\n\nRun with --help for usage.\n`);
    return 4;
  }

  const now = new Date(`${opts.today}T00:00:00Z`);
  const report = { today: opts.today, rows: [], guard: [], counts: {}, knownUnknowns: [] };
  let snapshot = null;

  if (opts.fresh) {
    try {
      snapshot = loadSnapshot();
    } catch (err) {
      process.stderr.write(`${err.message}\n`);
      return 4;
    }
    report.snapshotDate = snapshot.snapshotDate;
    report.knownUnknowns = snapshot.knownUnknowns;
    for (const row of snapshot.prices) {
      const f = freshness(row, now);
      report.rows.push({ model: row.label, provider: row.provider, verified: row.verified, confidence: row.confidence, ...f });
    }
    for (const r of report.rows) report.counts[r.state] = (report.counts[r.state] || 0) + 1;
  }

  if (opts.guard) report.guard = runGuard(opts.root);

  const badRows = report.rows.filter((r) => r.state === 'STALE' || r.state === 'KNOWN-WRONG');
  let code = 0;
  if (report.guard.length) code |= 1;
  if (badRows.length) code |= 2;

  if (opts.json) {
    process.stdout.write(JSON.stringify({ ...report, exitCode: code }, null, 2) + '\n');
    return code;
  }

  const out = [];
  out.push(`llm-finops price check — evaluating as of ${opts.today}`);

  if (opts.fresh) {
    out.push(`\nPRICE ROWS  (snapshot dated ${report.snapshotDate || 'unknown'}, ${report.rows.length} machine-readable rows)`);
    for (const r of report.rows) {
      if (opts.quiet && (r.state === 'FRESH' || r.state === 'PENDING')) continue;
      const age = r.age === null ? 'no date' : `${r.age}d`;
      const why = r.reason ? ` — ${r.reason}` : '';
      out.push(`  ${r.state.padEnd(12)} ${age.padStart(7)}  ${r.model} [${r.provider}, confidence ${r.confidence}]${why}`);
    }
    const c = report.counts;
    out.push(
      `\n  summary: ${c.FRESH || 0} fresh, ${c.AGING || 0} aging, ${c.STALE || 0} stale, ` +
        `${c['KNOWN-WRONG'] || 0} known-wrong, ${c.PENDING || 0} pending`
    );
    if (c.AGING) out.push(`  AGING rows are quotable but must be suffixed "verify before client-facing use".`);
    if (badRows.length) {
      out.push(`\n  ${badRows.length} row(s) must not be quoted. Run the §6 refresh protocol in the snapshot.`);
      out.push(`  Remember the provenance guard: only advance a verified date if you fetched that`);
      out.push(`  row's primary source in this session. Otherwise set confidence: low and leave the date.`);
    }
    if (report.knownUnknowns.length) {
      out.push(`\nKNOWN UNKNOWNS (resurfaced every run so they do not decay into forgotten text)`);
      report.knownUnknowns.forEach((q, i) => out.push(`  ${i + 1}. ${q.slice(0, 150)}`));
    }
  }

  if (opts.guard) {
    out.push(`\nDOLLAR-LITERAL GUARD  (scanned ${opts.root})`);
    if (!report.guard.length) {
      out.push(`  PASS — no literal dollar figures outside references/sota-snapshot.md.`);
    } else {
      out.push(`  FAIL — ${report.guard.length} literal dollar figure(s) leaked out of the price sheet:`);
      for (const g of report.guard) out.push(`    ${g.file}:${g.line}  ${g.match}   ${g.text}`);
      out.push(`\n  Fix by replacing the figure with a model name and a relative statement`);
      out.push(`  ("roughly 6x the input cost of the flash-lite class") plus a pointer to`);
      out.push(`  references/sota-snapshot.md. A number in a second file will not be updated`);
      out.push(`  at the next refresh, and a stale number stated confidently is this skill's`);
      out.push(`  single worst failure mode.`);
    }
  }

  out.push(code === 0 ? `\nOK` : `\nFAILED (exit ${code})`);
  process.stdout.write(out.join('\n') + '\n');
  return code;
}

process.exit(main());
