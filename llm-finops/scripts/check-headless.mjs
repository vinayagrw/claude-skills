#!/usr/bin/env node
/**
 * check-headless.mjs — the capability gate for CLI offload.
 *
 * WHY THIS EXISTS. Offloading bulk read-only work to a second assistant's CLI is a real
 * saving when it works. But whether a given CLI still has a headless one-shot mode is
 * genuinely unsettled: the consumer Gemini CLI path was retired mid-2026, and the claim
 * that its replacement lacks a headless flag rests on a single third-party write-up, not
 * a vendor statement. So the skill never emits an offload recipe on faith. It runs this,
 * and falls back to a cheap-tier subagent — which needs no second vendor, no second auth
 * path and no gate — when the answer is no.
 *
 * WHY IT MUST NEVER HANG. A CLI given an unrecognised flag frequently does not error; it
 * drops into an interactive REPL and waits forever. A capability check that hangs the
 * session is worse than no check. Three defences:
 *   1. Inspect `--help` text BEFORE attempting any probe, so we only probe flags the
 *      binary has told us it accepts.
 *   2. Every spawn runs under a hard timeout with an explicit kill signal.
 *   3. stdin is closed ('ignore'), so a binary that tries to prompt gets EOF immediately
 *      instead of blocking.
 *
 * WHY NOT POWERSHELL. On Windows PowerShell 5.1, redirecting a native executable's stderr
 * wraps each line in an ErrorRecord and can set the success variable false on a clean
 * exit — the exact pattern that would make this report failure for a working binary. This
 * script captures stdout and stderr as separate streams and reads the numeric exit code.
 *
 * Node builtins only.
 */

import { spawnSync } from 'node:child_process';

const HELP = `
check-headless.mjs — does this CLI support non-interactive one-shot invocation?

USAGE
  node scripts/check-headless.mjs [binary ...] [options]

  With no binaries named, checks the usual candidates: claude, agy, gemini, codex.

OPTIONS
  --bin <name>       Add a binary to check (repeatable).
  --timeout <ms>     Hard per-spawn timeout.        (default: 8000)
  --probe            Actually run a tiny one-shot prompt, not just read --help.
                     OFF by default: a probe consumes real quota or real money, and
                     reading --help answers the question in most cases for free.
  --json             Machine-readable output.
  --help             This text.

VERDICTS
  HEADLESS-OK       --help advertises a one-shot flag (and the probe succeeded, if run)
  HEADLESS-ABSENT   binary works, but --help advertises no one-shot flag
  HEADLESS-UNKNOWN  binary present, but --help was unreadable/timed out — assume ABSENT
  NOT-INSTALLED     not on PATH

EXIT CODES
  0 at least one binary is HEADLESS-OK
  3 none are — use the cheap-tier subagent path instead, which needs no CLI at all
  4 could not run (bad arguments)

USING THE RESULT
  This gate is a precondition, not a recommendation. Even on HEADLESS-OK: pass an explicit
  include/exclude set, because a whole-repo flag will happily ingest node_modules, .git and
  lockfiles — a cost recipe that is itself a cost bomb. Request structured output and parse
  it rather than scraping prose. Never apply an offloaded diff without review.
`;

const DEFAULT_BINS = ['claude', 'agy', 'gemini', 'codex'];

/**
 * Flags that indicate a one-shot, non-interactive mode. Matched against --help text.
 * Deliberately conservative: a false HEADLESS-OK sends the user down a recipe that will
 * hang or fail, which is worse than a false ABSENT that merely costs a cheaper fallback.
 */
const ONESHOT_PATTERNS = [
  /(^|\s)-p(\s|,|\b)/,
  /--print\b/,
  /--prompt\b/,
  /--non-?interactive\b/,
  /--headless\b/,
  /--one-?shot\b/,
  /\bexec\b.*\bnon-?interactive/i,
];

function parseArgs(argv) {
  const o = { bins: [], timeout: 8000, probe: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') return { help: true };
    else if (a === '--bin') o.bins.push(argv[++i]);
    else if (a === '--timeout') o.timeout = Number(argv[++i]);
    else if (a === '--probe') o.probe = true;
    else if (a === '--json') o.json = true;
    else if (a.startsWith('--')) return { error: `Unknown argument: ${a}` };
    else o.bins.push(a);
  }
  if (!Number.isFinite(o.timeout) || o.timeout < 500) return { error: '--timeout must be a number of milliseconds, at least 500' };
  if (o.bins.length === 0) o.bins = DEFAULT_BINS.slice();
  return o;
}

/**
 * One guarded spawn. Never throws, never hangs, never inherits stdin.
 *
 * `shell: true` on Windows is required because npm-installed CLIs are .cmd shims that
 * CreateProcess cannot execute directly. Arguments here are fixed literals, never user
 * input, so there is no injection surface.
 */
function run(bin, args, timeout) {
  const r = spawnSync(bin, args, {
    timeout,
    killSignal: 'SIGKILL',
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    // ENOENT on POSIX; on Windows with shell:true a missing binary exits nonzero instead.
    missing: Boolean(r.error && r.error.code === 'ENOENT'),
    timedOut: Boolean(r.error && /ETIMEDOUT/i.test(String(r.error.code || r.error.message))) || r.signal === 'SIGKILL',
    code: r.status,
    // Read both streams. Many CLIs print help to stderr, and merging them would be the
    // exit-code-corrupting mistake this script exists to avoid — so we keep them apart
    // and concatenate only the text.
    text: `${r.stdout || ''}\n${r.stderr || ''}`,
    error: r.error ? String(r.error.message) : null,
  };
}

function checkOne(bin, opts) {
  const result = { binary: bin, verdict: 'NOT-INSTALLED', version: null, flags: [], detail: null };

  const ver = run(bin, ['--version'], opts.timeout);
  if (ver.missing || (ver.code === null && ver.timedOut)) {
    result.detail = ver.timedOut ? 'timed out running --version' : 'not found on PATH';
    if (ver.timedOut) result.verdict = 'HEADLESS-UNKNOWN';
    return result;
  }
  const looksMissing = ver.code !== 0 && /not recognized|command not found|no such file/i.test(ver.text);
  if (looksMissing) {
    result.detail = 'not found on PATH';
    return result;
  }
  result.version = (ver.text.trim().split(/\r?\n/)[0] || '').slice(0, 80) || null;

  const help = run(bin, ['--help'], opts.timeout);
  if (help.timedOut || (!help.text.trim() && help.code !== 0)) {
    result.verdict = 'HEADLESS-UNKNOWN';
    result.detail = help.timedOut
      ? '--help timed out; treat as ABSENT and use the cheap-tier subagent path'
      : '--help produced no readable output; treat as ABSENT';
    return result;
  }

  const matched = ONESHOT_PATTERNS.filter((p) => p.test(help.text));
  if (matched.length === 0) {
    result.verdict = 'HEADLESS-ABSENT';
    result.detail = '--help advertises no one-shot/non-interactive flag';
    return result;
  }
  result.flags = matched.map((p) => String(p));

  if (!opts.probe) {
    result.verdict = 'HEADLESS-OK';
    result.detail = '--help advertises a one-shot flag (not probed; pass --probe to execute one)';
    return result;
  }

  // Probe only a flag the help text actually advertised. Probing an unadvertised flag is
  // how you end up in a REPL waiting on stdin that will never come.
  const flag = /--print\b/.test(help.text) ? '--print' : /(^|\s)-p(\s|,|\b)/.test(help.text) ? '-p' : '--prompt';
  const probe = run(bin, [flag, 'Reply with the single word: ok'], Math.max(opts.timeout, 20000));
  if (probe.timedOut) {
    result.verdict = 'HEADLESS-ABSENT';
    result.detail = `probe with ${flag} timed out — the flag is advertised but does not return non-interactively`;
    return result;
  }
  if (probe.code !== 0) {
    result.verdict = 'HEADLESS-ABSENT';
    result.detail = `probe with ${flag} exited ${probe.code}: ${(probe.text.trim().split(/\r?\n/)[0] || '').slice(0, 100)}`;
    return result;
  }
  result.verdict = 'HEADLESS-OK';
  result.detail = `probe with ${flag} returned cleanly`;
  return result;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (o.error) {
    process.stderr.write(`${o.error}\n\nRun with --help for usage.\n`);
    return 4;
  }

  const results = o.bins.map((b) => checkOne(b, o));
  const anyOk = results.some((r) => r.verdict === 'HEADLESS-OK');

  if (o.json) {
    process.stdout.write(JSON.stringify({ probed: o.probe, results, offloadAvailable: anyOk }, null, 2) + '\n');
    return anyOk ? 0 : 3;
  }

  const out = [`Headless capability gate${o.probe ? ' (with live probe)' : ' (--help inspection only)'}`, ''];
  for (const r of results) {
    out.push(`  ${r.verdict.padEnd(17)} ${r.binary.padEnd(10)} ${r.version ? `[${r.version}] ` : ''}${r.detail || ''}`);
  }
  out.push('');
  if (anyOk) {
    out.push('Offload is AVAILABLE on at least one binary.');
    out.push('Before using it: pass an explicit include/exclude set (a whole-repo scan will ingest');
    out.push('node_modules and lockfiles and cost more than it saves), request structured output');
    out.push('rather than scraping prose, and never apply an offloaded diff without review.');
  } else {
    out.push('Offload is NOT available. Use the cheap-tier analyzer subagent instead:');
    out.push('  - one subagent pinned to the cheap model tier, with a strict digest-return contract');
    out.push('  - no second vendor, no second auth path, no capability gate, no context-file sync');
    out.push('This is the recommended default path regardless; offload is only ever an optimisation.');
  }
  process.stdout.write(out.join('\n') + '\n');
  return anyOk ? 0 : 3;
}

process.exit(main());
