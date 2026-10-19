import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Heavy } from '../types'

const KEEP = 5
const BAR = 24
// Roughly four characters to a token; close enough to rank results by size.
const CHARS_PER_TOKEN = 4

const heavy = atom({ plugin: 'context-lens', key: 'heavy' } as const, [])

const tokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

const bar = (part: number, whole: number) => {
  const filled = whole <= 0 ? 0 : Math.round((part / whole) * BAR)

  return '█'.repeat(filled) + '░'.repeat(BAR - filled)
}

const cut = (text: string, max = 50) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

const describe = (input: unknown) => {
  const e = (input ?? {}) as Record<string, unknown>
  const pick = e.file_path ?? e.command ?? e.pattern ?? e.url ?? e.query ?? e.description ?? ''

  return cut(String(pick).replaceAll('\n', ' '))
}

const top = <T,>(rows: readonly T[], size: (row: T) => number) =>
  [...rows].sort((a, b) => size(b) - size(a)).slice(0, KEEP)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'lens', description: 'Show what fills the context window, biggest first' })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const isMain = (e as { agentId?: string }).agentId === undefined

    if (isMain && ran.deny === undefined) {
      const size = Math.round((ran.text ?? JSON.stringify(ran.result ?? '')).length / CHARS_PER_TOKEN)
      const row: Heavy = { tool: e.tool, what: describe(e), tokens: size }
      await update($, heavy, was => top([...was, row], one => one.tokens))
    }

    return ran
  })

  on('command.run', { command: 'lens' }, async $ => {
    const usage = await $.session.usage({ breakdown: 'summary' })
    const b = usage.context.breakdown
    const window = usage.context.window
    const out: string[] = []

    if (b === undefined) {
      return { text: 'No context figures yet.' }
    }

    out.push(`**Context: ${tokens(b.totalTokens)} of ${tokens(window)} (${Math.round(b.percentage)}%)**`, '```')

    for (const row of top(b.categories.filter(one => one.kind === 'used' && one.tokens > 0), one => one.tokens).concat()) {
      out.push(`${row.name.padEnd(18)} ${bar(row.tokens, window)} ${tokens(row.tokens).padStart(5)}`)
    }

    out.push('```')

    const section = (title: string, rows: { label: string; tokens: number }[]) => {
      const kept = top(rows.filter(one => one.tokens > 0), one => one.tokens)

      if (kept.length > 0) {
        out.push(`**${title}**`, ...kept.map(one => `- ${tokens(one.tokens)} · ${one.label}`))
      }
    }

    section('Biggest tool results this session', (await read($, heavy)).map(one => ({ label: `${one.tool} ${one.what}`, tokens: one.tokens })))
    section('Heaviest skills', (b.skills?.skillFrontmatter ?? []).map(one => ({ label: one.pluginName ? `${one.pluginName}:${one.name}` : one.name, tokens: one.tokens })))
    section('Memory files', b.memoryFiles.map(one => ({ label: one.path, tokens: one.tokens })))
    section('Loaded MCP tools', b.mcpTools.filter(one => one.isLoaded).map(one => ({ label: `${one.serverName} ${one.name}`, tokens: one.tokens })))

    if (b.percentage >= 60) {
      out.push('', '_Over 60% full: /compact now keeps later turns cheaper._')
    }

    return { text: out.join('\n') }
  }).catch(($, e, next) => next(e))
}
