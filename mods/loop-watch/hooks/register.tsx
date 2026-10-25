import type { EngineInterface, Register } from 'claude-code'

import type { Start } from '../types'

const NAME = 'loop-watch'
const HOUR = 60 * 60_000
const DAY = 24 * HOUR
// More starts than this in an hour, from one project, looks like a job rather than a person.
const BURST = 10
const SHOWN = 5

const home = async ($: EngineInterface) =>
  (await $.process.run(['sh', '-c', 'printf %s "$HOME"'])).stdout

const files = async ($: EngineInterface) => {
  const dir = `${await home($)}/.claude/loop-watch`

  return { log: `${dir}/starts.jsonl`, ignore: `${dir}/ignore.json` }
}

const load = async <T,>($: EngineInterface, path: string, empty: T): Promise<T> => {
  try {
    return JSON.parse(await $.fs.read(path)) as T
  } catch {
    return empty
  }
}

const starts = async ($: EngineInterface, path: string): Promise<Start[]> => {
  try {
    return (await $.fs.read(path))
      .split('\n')
      .filter(row => row.trim() !== '')
      .map(row => JSON.parse(row) as Start)
  } catch {
    return []
  }
}

const projectOf = (cwd: string) => cwd.split('/').filter(Boolean).at(-1) ?? cwd

// Counts starts per project since `from`, busiest first.
export const busiest = (rows: readonly Start[], from: number, ignored: readonly string[] = []) => {
  const counts = new Map<string, { all: number; unattended: number }>()

  for (const row of rows) {
    if (row.at < from || ignored.includes(row.project)) continue
    const now = counts.get(row.project) ?? { all: 0, unattended: 0 }
    now.all += 1
    if (!row.isInteractive) now.unattended += 1
    counts.set(row.project, now)
  }

  return [...counts.entries()].sort((a, b) => b[1].all - a[1].all)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const done = await next(e)

    try {
      if (e.isInteractive) {
        await $.command.register({
          name: NAME,
          description: 'Projects that keep starting sessions on their own; "ignore <project>" or "unignore <project>"',
          argumentHint: '[ignore|unignore <project>]',
        })
      }

      const at = await $.clock.now()
      const { log, ignore } = await files($)
      const kept = (await starts($, log)).filter(row => row.at >= at - DAY)
      kept.push({ at, project: projectOf(e.cwd), isInteractive: e.isInteractive })
      await $.fs.write(log, kept.map(row => JSON.stringify(row)).join('\n') + '\n')

      if (e.isInteractive) {
        const ignored = await load<string[]>($, ignore, [])
        const loud = busiest(kept, at - HOUR, ignored).filter(([, n]) => n.all > BURST)

        for (const [project, n] of loud) {
          $.ui.toast(
            `⚠ ${project} started ${n.all} sessions in the last hour (${n.unattended} with no one at the prompt). Each one re-sends its context uncached: likely a scheduled job or keep-alive. /loop-watch for details.`,
          )
        }
      }
    } catch {
      // Watching must never stop a session from starting.
    }

    return done
  })

  on('command.run', { command: NAME }, async ($, e) => {
    const [verb, ...rest] = e.args.trim().split(/\s+/)
    const project = rest.join(' ')
    const { log, ignore } = await files($)
    const ignored = await load<string[]>($, ignore, [])

    if ((verb === 'ignore' || verb === 'unignore') && project !== '') {
      const next = verb === 'ignore' ? [...new Set([...ignored, project])] : ignored.filter(one => one !== project)
      await $.fs.write(ignore, JSON.stringify(next))

      return { text: verb === 'ignore' ? `Loop Watch will stay quiet about ${project}.` : `Loop Watch is watching ${project} again.` }
    }

    const now = await $.clock.now()
    const rows = await starts($, log)
    const day = busiest(rows, now - DAY, ignored).slice(0, SHOWN)
    const hour = new Map(busiest(rows, now - HOUR, ignored))

    if (day.length === 0) return { text: 'No session starts recorded in the last 24 hours.' }

    const lines = day.map(([name, n]) => {
      const flag = (hour.get(name)?.all ?? 0) > BURST ? '  ⚠ looping now' : ''

      return `  ${name}: ${n.all} starts in 24h, ${n.unattended} unattended, ${hour.get(name)?.all ?? 0} in the last hour${flag}`
    })

    return {
      text: [
        'Session starts by project (busiest first):',
        ...lines,
        ignored.length > 0 ? `Ignored: ${ignored.join(', ')}` : '',
        'Unattended starts come from claude -p, the SDK or a scheduler. Find the job with: crontab -l, launchctl list, or your CI.',
      ].filter(Boolean).join('\n'),
    }
  }).catch(($, e, next) => next(e))
}
