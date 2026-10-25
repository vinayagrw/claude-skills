/**
 * STATUS: VERIFIED — executed against the local `claude` CLI on 2026-07-19 (Windows 11,
 * PowerShell-launched Node). A recorded result payload is checked in at
 * __fixtures__/claude-code-cli.result.json and replayed by usage-invariants.test.ts.
 * Verified: 2026-07-19   Last spec review: 2026-07-19
 *
 * ---------------------------------------------------------------------------------------
 * THE FAILSAFE TRANSPORT — reached on a FallbackReason, never on quality grounds.
 *
 * This spawns the locally installed Claude Code CLI, which authenticates against the user's
 * subscription. Marginal cost is approximately zero, so the ledger records:
 *
 *     costUsd: 0,  notionalCostUsd: <the CLI's own total_cost_usd>,  billable: false
 *
 * `billable: false` is NOT the same as `costUsd: 0`, and conflating them is how teams
 * discover their subscription ceiling from an outage rather than from a dashboard. The call
 * consumes a rate-limited usage window that is shared across every surface the user touches,
 * including their interactive sessions. Report both figures — "X metered plus Y notional
 * under subscription" — so the quota burn is visible while it is still cheap to react to.
 *
 * When metered usage credits replace plan access on a model (a dated, announced event; see
 * references/sota-snapshot.md), one flag flips and the reporting is already correct.
 *
 * ---------------------------------------------------------------------------------------
 * THE PATH HAZARD — read this before debugging a "the model never ran" report.
 *
 * The reference project hit this repeatedly and it always looked like something else. A
 * Node process does NOT necessarily inherit the PATH that the user's interactive shell has.
 * Global npm bins, per-user install dirs and version-manager shims are commonly added by a
 * shell profile that a spawned service, a test runner, an IDE-launched process or a Windows
 * service never executes. The `claude` binary is then simply not on PATH.
 *
 * What makes it vicious is the failure SHAPE: spawn fails with ENOENT, the adapter throws
 * `spawn-failed`, the fallback chain does exactly what it was designed to do and serves the
 * deterministic zero-cost response — successfully. Nothing errors. The app looks healthy,
 * every response is templated, the ledger shows a suspiciously round number of zero-cost
 * entries, and someone eventually notices the AI feature has not used AI for a week.
 *
 * Two defences ship here, and you want both:
 *   1. `resolveClaudeBin()` prepends the likely install directories to the spawn's PATH.
 *   2. `probe()` is a real liveness check (`claude --version`, hard timeout) that health
 *      endpoints and startup checks call, so absence is reported as a fact rather than
 *      inferred from a degraded rate.
 * The ledger is the third: a live call records `estimated: false` with real token counts;
 * the deterministic fallback records zero-cost entries at tier 'deterministic'. That
 * contrast is the definitive "was that really the model?" test. Streaming proves nothing —
 * a templated fallback word-streams just as convincingly.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  AdapterError,
  assertUsageInvariants,
  num,
  type AdapterRequest,
  type AdapterResponse,
  type LlmAdapter,
  type NormalizedUsage,
} from './types.ts';

const PROVIDER = 'claude-code' as const;

/**
 * Directories the CLI is commonly installed into but which a non-interactive process may
 * not have on PATH. Prepending is safe: a directory that does not exist is ignored, and an
 * already-present directory just resolves the same binary sooner.
 */
export function likelyBinDirs(): string[] {
  const home = os.homedir();
  const dirs: string[] = [];

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
    dirs.push(
      path.join(appData, 'npm'), // npm -g default on Windows
      path.join(localAppData, 'Programs', 'claude'),
      path.join(home, '.local', 'bin'),
      path.join(home, '.claude', 'bin'),
      path.join(home, 'AppData', 'Local', 'Yarn', 'bin'),
    );
  } else {
    dirs.push(
      path.join(home, '.local', 'bin'),
      path.join(home, '.claude', 'bin'),
      '/usr/local/bin',
      '/opt/homebrew/bin',
      path.join(home, '.npm-global', 'bin'),
    );
  }
  // Project-local install, for repos that pin the CLI as a devDependency.
  dirs.push(path.join(process.cwd(), 'node_modules', '.bin'));
  return dirs.filter((d) => existsSync(d));
}

function spawnEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const sep = process.platform === 'win32' ? ';' : ':';
  const prepend = likelyBinDirs().join(sep);
  const current = process.env.PATH ?? '';
  return {
    ...process.env,
    PATH: prepend ? `${prepend}${sep}${current}` : current,
    ...extra,
  };
}

/**
 * Resolve the binary name to spawn. On Windows a globally npm-installed CLI is a `.cmd`
 * shim, which `spawn` cannot execute without `shell: true` — and `shell: true` with
 * user-supplied prompt text is a command-injection hazard, so we resolve the shim path
 * explicitly instead and keep the argument array.
 */
export function resolveClaudeBin(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.CLAUDE_CLI_PATH) return process.env.CLAUDE_CLI_PATH;

  if (process.platform === 'win32') {
    for (const dir of likelyBinDirs()) {
      for (const name of ['claude.cmd', 'claude.exe', 'claude.bat']) {
        const p = path.join(dir, name);
        if (existsSync(p)) return p;
      }
    }
    return 'claude.cmd';
  }
  for (const dir of likelyBinDirs()) {
    const p = path.join(dir, 'claude');
    if (existsSync(p)) return p;
  }
  return 'claude';
}

/** The CLI's terminal JSON payload. Only the fields this adapter depends on. */
interface ClaudeCodeResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  session_id?: string;
  num_turns?: number;
  duration_ms?: number;
  total_cost_usd?: number;
  modelUsage?: Record<string, unknown>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

/**
 * Map the CLI's `result.usage` onto NormalizedUsage.
 *
 * NEVER SUBTRACT TWICE: like the Messages API it wraps, the CLI's `input_tokens` ALREADY
 * EXCLUDES cache reads and cache creations. Subtracting `cache_read_input_tokens` here — as
 * you must on Gemini and OpenAI — would understate input by the entire cached prefix.
 *
 * Reasoning is nested inside `output_tokens` on this transport, and the CLI does not break
 * it out, so `reasoningTokens` is null: unknown, not zero.
 */
export function normalizeClaudeCodeUsage(
  u: ClaudeCodeResult['usage'] | undefined,
): NormalizedUsage | null {
  if (!u || typeof u.input_tokens !== 'number') return null;

  const usage: NormalizedUsage = {
    inputTokens: num(u.input_tokens),
    outputTokens: num(u.output_tokens),
    cacheReadTokens: num(u.cache_read_input_tokens),
    cacheWriteTokens: num(u.cache_creation_input_tokens),
    cacheWrite1hTokens: 0,
    reasoningTokens: null,
    reasoningInOutput: 'nested',
    totalTokensReported: null,
    estimated: false,
  };
  assertUsageInvariants(PROVIDER, usage);
  return usage;
}

export interface ClaudeCodeAdapterOptions {
  /** Overrides discovery. Also settable via the CLAUDE_CLI_PATH environment variable. */
  binPath?: string;
  /** Bare mode skips hooks, skills, plugins, MCP and project context: deterministic, and a
   *  materially cheaper startup context. Default true — a failsafe wants neither surprises
   *  nor a large cached prefix it did not ask for. */
  bare?: boolean;
  maxTurns?: number;
  cwd?: string;
  /** Hard ceiling on the spawn. A failsafe that hangs is worse than one that fails. */
  defaultTimeoutMs?: number;
}

export function createClaudeCodeCliAdapter(
  opts: ClaudeCodeAdapterOptions = {},
): LlmAdapter {
  const bin = resolveClaudeBin(opts.binPath);
  const defaultTimeoutMs = opts.defaultTimeoutMs ?? 120_000;

  return {
    provider: PROVIDER,
    /** Subscription-authenticated: no per-token charge, but a consumed quota. */
    billable: false,
    supportsBatch: false,
    supportsExplicitCache: false,

    /**
     * Liveness probe. Cheap, bounded, and does not consume a usage window — it runs
     * `--version`, not a model call. Call it at startup and from your health endpoint, and
     * surface the result: a failsafe whose absence is only discovered at the moment you
     * need it is not a failsafe.
     *
     * `spawnSync` with an explicit timeout is deliberate. A probe with no timeout can hang
     * the process forever if the binary drops into an interactive mode on an unrecognised
     * flag, and stderr is captured rather than redirected because redirecting a native
     * executable's stderr on Windows PowerShell 5.1 can report failure for a clean exit.
     */
    async probe() {
      const r = spawnSync(bin, ['--version'], {
        env: spawnEnv(),
        timeout: 5_000,
        encoding: 'utf8',
        windowsHide: true,
      });
      if (r.error) {
        const enoent = (r.error as NodeJS.ErrnoException).code === 'ENOENT';
        return {
          ok: false,
          detail: enoent
            ? `claude CLI not found as "${bin}". Searched: ${likelyBinDirs().join(', ')}. ` +
              'Set CLAUDE_CLI_PATH to the absolute path. Until this resolves, every call ' +
              'to this tier fails to spawn and the app serves deterministic fallbacks ' +
              'while looking perfectly healthy.'
            : String(r.error),
        };
      }
      if (r.status !== 0) {
        return { ok: false, detail: `exit ${r.status}: ${(r.stderr ?? '').slice(0, 300)}` };
      }
      return { ok: true, detail: (r.stdout ?? '').trim() };
    },

    async complete(req: AdapterRequest): Promise<AdapterResponse> {
      if (req.batch) {
        throw new AdapterError(
          PROVIDER,
          'unsupported-capability',
          'The CLI transport has no batch mode. Offline bulk work belongs on the metered ' +
            'Batch API at half price, not on a subscription quota.',
        );
      }
      if (req.cache?.mode === 'explicit') {
        throw new AdapterError(
          PROVIDER,
          'unsupported-capability',
          'The CLI manages its own prompt cache; explicit cache control is not exposed. ' +
            "Use mode:'auto'. The adapter still reports cache_read / cache_creation " +
            'tokens, so cache effectiveness remains measurable on this tier.',
        );
      }

      const args = ['-p', '--output-format', 'json'];
      if (opts.bare !== false) args.push('--bare');
      if (req.model) args.push('--model', req.model);
      const maxTurns = opts.maxTurns ?? 1;
      args.push('--max-turns', String(maxTurns));
      if (req.system) args.push('--append-system-prompt', req.system);

      // The prompt goes over stdin, not argv. Windows command lines have a length limit
      // that a long context will exceed, and argv-passed prompts leak into process lists.
      const prompt = req.messages
        .map((m) => (m.role === 'assistant' ? `Assistant: ${m.content}` : m.content))
        .join('\n\n');

      const timeoutMs = req.timeoutMs ?? defaultTimeoutMs;
      const raw = await runCli(bin, args, prompt, {
        cwd: opts.cwd,
        timeoutMs,
        signal: req.signal,
      });

      let parsed: ClaudeCodeResult;
      try {
        parsed = JSON.parse(raw) as ClaudeCodeResult;
      } catch (cause) {
        // Never scrape prose out of a CLI. If the JSON contract broke, say so and let the
        // chain degrade — a regex over human-readable output is a silent-corruption engine.
        throw new AdapterError(
          PROVIDER,
          'malformed-output',
          `expected JSON from --output-format json, got: ${raw.slice(0, 300)}`,
          { cause },
        );
      }

      if (parsed.is_error || parsed.subtype === 'error_during_execution') {
        throw new AdapterError(
          PROVIDER,
          'api-error',
          `CLI reported failure: ${String(parsed.result ?? parsed.subtype).slice(0, 300)}`,
        );
      }
      const text = parsed.result ?? '';
      if (!text.trim()) {
        throw new AdapterError(PROVIDER, 'empty-output', 'CLI returned an empty result');
      }

      return {
        text,
        requestedModel: req.model,
        servedModel: readServedModel(parsed) ?? req.model,
        usage: normalizeClaudeCodeUsage(parsed.usage),
        finishReason: parsed.subtype ?? null,
        billable: false,
        // The CLI's own figure. Under a subscription this is what the same work WOULD have
        // cost metered — the quota burn expressed in dollars. It is the honest number to
        // show next to metered spend, and it is the number that tells you when the
        // subscription stops being free money.
        notionalCostUsd:
          typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : null,
        providerMeta: {
          sessionId: parsed.session_id,
          numTurns: parsed.num_turns,
          durationMs: parsed.duration_ms,
        },
      };
    },
  };
}

function readServedModel(r: ClaudeCodeResult): string | null {
  // The CLI reports per-model usage keyed by the model id that actually ran, which is the
  // pricing key. It may differ from what was requested when an alias resolves to a dated
  // snapshot or the session falls back under load.
  const keys = r.modelUsage ? Object.keys(r.modelUsage) : [];
  return keys.length > 0 ? keys[0]! : null;
}

function runCli(
  bin: string,
  args: string[],
  stdin: string,
  o: { cwd?: string; timeoutMs: number; signal?: AbortSignal },
): Promise<string> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, {
        cwd: o.cwd,
        env: spawnEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (cause) {
      reject(new AdapterError(PROVIDER, 'spawn-failed', String(cause), { cause }));
      return;
    }

    let out = '';
    let err = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(
        new AdapterError(
          PROVIDER,
          'timeout',
          `CLI exceeded ${o.timeoutMs}ms and was killed`,
        ),
      );
    }, o.timeoutMs);

    o.signal?.addEventListener('abort', () => child.kill(), { once: true });
    child.stdout?.on('data', (d) => (out += String(d)));
    child.stderr?.on('data', (d) => (err += String(d)));

    child.on('error', (cause: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // THE PATH HAZARD, surfaced as a diagnosis rather than an errno. Do not soften this
      // message: it is the one the future debugger will search for.
      const detail =
        cause.code === 'ENOENT'
          ? `"${bin}" not found on PATH. This process's PATH may not include the CLI's ` +
            `install dir even though your shell's does. Searched: ${likelyBinDirs().join(', ')}. ` +
            'Set CLAUDE_CLI_PATH, or call probe() at startup so this is reported instead ' +
            'of degrading silently to the deterministic fallback.'
          : String(cause);
      reject(new AdapterError(PROVIDER, 'spawn-failed', detail, { cause }));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve(out);
        return;
      }
      const reason = /not logged in|authenticate|unauthorized/i.test(err)
        ? 'not-authenticated'
        : /usage limit|rate limit|quota/i.test(err)
          ? 'quota-exhausted'
          : 'api-error';
      reject(
        new AdapterError(PROVIDER, reason, `exit ${code}: ${err.slice(0, 400)}`),
      );
    });

    child.stdin?.end(stdin);
  });
}
