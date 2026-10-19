import type { Register } from 'claude-code'

import type { Range } from '../types'

const NAME = 'insights'
const DAY_MS = 24 * 60 * 60_000
const TIMEOUT_MS = 5 * 60_000
const PAGE = '~/.claude/token-insights/dashboard.html'

const home = async ($: { process: { run: (argv: readonly string[]) => Promise<{ stdout: string }> } }) =>
  (await $.process.run(['sh', '-c', 'printf %s "$HOME"'])).stdout

const midnight = (ms: number) => {
  const at = new Date(ms)
  at.setHours(0, 0, 0, 0)

  return at.getTime()
}

const localDate = (text: string) => {
  const [year, month, day] = text.split('-').map(Number)

  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1).getTime()
}

// "today", "day" (yesterday), "week", "month", "Nd", or "YYYY-MM-DD..YYYY-MM-DD" (both days included).
export const parseRange = (arg: string, now: number): Range | null => {
  const text = arg.trim().toLowerCase() || 'today'
  const today = midnight(now)
  const days = /^(\d+)d$/.exec(text)
  const span = /^(\d{4}-\d{2}-\d{2})(?:\.\.(\d{4}-\d{2}-\d{2}))?$/.exec(text)

  if (text === 'today') return { from: today, to: now, label: 'today' }
  if (text === 'day' || text === 'yesterday') return { from: today - DAY_MS, to: today, label: 'yesterday' }
  if (text === 'week') return { from: today - 6 * DAY_MS, to: now, label: 'last 7 days' }
  if (text === 'month') return { from: today - 29 * DAY_MS, to: now, label: 'last 30 days' }
  if (days !== null) return { from: today - (Number(days[1]) - 1) * DAY_MS, to: now, label: `last ${days[1]} days` }

  if (span !== null) {
    const from = localDate(span[1] ?? '')
    const to = localDate(span[2] ?? span[1] ?? '') + DAY_MS

    return to > from ? { from, to: Math.min(to, now), label: span[2] ? `${span[1]} to ${span[2]}` : `${span[1]}` } : null
  }

  return null
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: NAME,
      description: 'Token use and insights: today, day, week, month, 14d, or 2026-10-01..2026-10-15',
      argumentHint: '[today|day|week|month|Nd|from..to]',
    })

    return next(e)
  })

  on('command.run', { command: NAME }, async ($, e) => {
    const words = e.args.trim().split(/\s+/)
    const isPage = words.at(-1)?.toLowerCase() === 'html'
    const range = parseRange((isPage ? words.slice(0, -1) : words).join(' '), await $.clock.now())

    if (range === null) {
      return { text: 'Use /insights today, day, week, month, 14d, or 2026-10-01..2026-10-15. Add "html" for the dashboard.' }
    }

    const script = [`${$.plugin.root}/scripts/insights.py`, `${$.plugin.root}/../scripts/insights.py`]
    const found = (await $.fs.exists(script[0] ?? '')) ? script[0] : script[1]
    const run = await $.process.run(
      ['python3', '-I', found ?? '', '~/.claude/projects', `${range.from}`, `${range.to}`, range.label,
        ...(isPage ? ['html', PAGE] : [])],
      { timeoutMs: TIMEOUT_MS },
    )

    if (isPage && run.exitCode === 0 && run.stdout.startsWith('Dashboard')) {
      await $.process.run(['open', PAGE.replace('~', await home($))])

      return { text: `Opened the ${range.label} dashboard in your browser.` }
    }

    return { text: run.exitCode === 0 ? run.stdout.trimEnd() : `Insights failed: ${run.stderr.trim().slice(-500)}` }
  }).catch(($, e, next) => next(e))
}
