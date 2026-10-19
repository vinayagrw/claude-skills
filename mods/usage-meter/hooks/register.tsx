import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Reading } from '../types'

const NAME = 'usage-meter'
// The engine does not tell a hook the prompt cache's lifetime; these sessions use the one-hour cache.
const CACHE_MS = 60 * 60_000
const COLD_NOTICE_TOKENS = 50_000
const CONTEXT_MARKS = [60, 80]
const LIMIT_MARKS = [80, 95]

const reading = atom({ plugin: 'usage-meter', key: 'reading' } as const, null)
const lastTurn = atom({ plugin: 'usage-meter', key: 'lastTurn' } as const, null)
const lastResponseAt = atom({ plugin: 'usage-meter', key: 'lastResponseAt' } as const, null)
const warned = atom({ plugin: 'usage-meter', key: 'warned' } as const, [])
const isHidden = atom({ plugin: 'usage-meter', key: 'isHidden' } as const, false)

const tokens = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
    : n >= 1000
      ? `${Math.round(n / 1000)}k`
      : `${n}`

const timeOfDay = (ms: number) => {
  const at = new Date(ms)
  const hours = at.getHours()
  const minutes = `${at.getMinutes()}`.padStart(2, '0')

  return `${hours % 12 || 12}:${minutes}${hours < 12 ? 'am' : 'pm'}`
}

const span = (ms: number) => {
  const minutes = Math.round(ms / 60_000)

  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

const limitName = (kind: string) =>
  kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7d' : kind.replaceAll('_', ' ')

const resets = (limit: Limit) => {
  const at = limit.resetsAt === null ? Number.NaN : Date.parse(limit.resetsAt)

  return Number.isNaN(at) ? '' : `, resets ${timeOfDay(at)}`
}

const toReading = (usage: {
  context: { tokens?: number; window: number; percent?: number }
  rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]
  cost?: { usd: number }
}): Reading => ({
  tokens: usage.context.tokens ?? null,
  window: usage.context.window,
  percent: usage.context.percent ?? null,
  limits: usage.rateLimits.map(one => ({
    kind: one.kind,
    percentUsed: one.percentUsed,
    resetsAt: one.resetsAt ?? null,
  })),
  costUsd: usage.cost?.usd ?? null,
})

const line = (now: Reading, respondedAt: number | null) => {
  const parts: string[] = []

  if (now.tokens !== null) {
    const percent = now.percent === null ? '' : ` (${now.percent}%)`
    parts.push(`ctx ${tokens(now.tokens)} / ${tokens(now.window)}${percent}`)
  }

  for (const limit of now.limits) {
    const isNear = limit.percentUsed >= (LIMIT_MARKS[0] ?? 100)
    parts.push(
      `${limitName(limit.kind)} ${Math.round(limit.percentUsed)}%${isNear ? resets(limit) : ''}`,
    )
  }

  if (now.costUsd !== null) {
    parts.push(`$${now.costUsd.toFixed(2)}`)
  }

  if (respondedAt !== null) {
    parts.push(`cache warm until ${timeOfDay(respondedAt + CACHE_MS)}`)
  }

  return parts.join(' · ')
}

// Each mark toasts once on the way up and is armed again once the figure falls back under it.
const warn = async ($: EngineInterface, now: Reading) => {
  const before = await read($, warned)
  const after = new Set(before)
  const texts: string[] = []

  const check = (
    group: string,
    value: number | null,
    marks: number[],
    crossed: (mark: number) => string,
    cleared?: string,
  ) => {
    if (value === null) {
      return
    }

    const fresh = marks.filter(mark => value >= mark && !after.has(`${group}:${mark}`))
    const top = fresh.at(-1)
    fresh.forEach(mark => after.add(`${group}:${mark}`))

    if (top !== undefined) {
      texts.push(crossed(top))
    }

    const fallen = marks.filter(mark => value < mark && after.has(`${group}:${mark}`))
    fallen.forEach(mark => after.delete(`${group}:${mark}`))

    if (cleared !== undefined && fallen.includes(marks.at(-1) ?? -1)) {
      texts.push(cleared)
    }
  }

  check(
    'context',
    now.percent,
    CONTEXT_MARKS,
    () => `Context is ${now.percent}% full (${tokens(now.tokens ?? 0)}). /compact keeps later turns cheaper.`,
  )

  for (const limit of now.limits) {
    const name = limitName(limit.kind)
    check(
      limit.kind,
      limit.percentUsed,
      LIMIT_MARKS,
      () => `${name} limit is ${Math.round(limit.percentUsed)}% used${resets(limit)}.`,
      `${name} limit has reset: ${Math.round(limit.percentUsed)}% used.`,
    )
  }

  if (after.size !== before.length || before.some(key => !after.has(key))) {
    await update($, warned, () => [...after])
  }

  texts.forEach(text => $.ui.toast(text))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: NAME,
      description: 'Show what fills the context window; "hide" or "show" toggles the line above the prompt',
      argumentHint: '[hide|show]',
    })

    const usage = await $.session.usage()
    await update($, reading, () => toReading(usage))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const now = toReading(e)
    await update($, reading, () => now)
    await warn($, now)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.usage !== undefined) {
      const { usage } = e
      const at = await $.clock.now()
      await update($, lastResponseAt, () => at)
      await update($, lastTurn, () => ({
        read: usage.cache_read_input_tokens,
        written: usage.cache_creation_input_tokens,
        uncached: usage.input_tokens,
      }))
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const at = await read($, lastResponseAt)
    const now = await read($, reading)
    const idle = at === null ? 0 : (await $.clock.now()) - at
    const held = now?.tokens ?? 0

    if (e.turnId === undefined && idle > CACHE_MS && held >= COLD_NOTICE_TOKENS) {
      $.ui.toast(
        `Prompt cache has expired (idle ${span(idle)}): this prompt re-sends about ${tokens(held)} tokens uncached.`,
      )
    }

    return next(e)
  })

  on('command.run', { command: NAME }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'hide' || arg === 'show') {
      await update($, isHidden, () => arg === 'hide')

      return { text: arg === 'hide' ? 'Usage meter hidden.' : 'Usage meter shown.' }
    }

    const usage = await $.session.usage({ breakdown: 'summary' })
    const now = toReading(usage)
    const rows = (usage.context.breakdown?.categories ?? [])
      .filter(row => row.tokens > 0)
      .map(row => `  ${row.name}: ${tokens(row.tokens)}${row.isDeferred ? ' (loaded on demand, not counted)' : ''}`)
    const turn = await read($, lastTurn)
    const sent = turn === null ? 0 : turn.read + turn.written + turn.uncached
    const out = [line(now, await read($, lastResponseAt)) || 'No usage figures yet.']

    if (rows.length > 0) {
      out.push('Context by category (estimated):', ...rows)
    }

    if (turn !== null && sent > 0) {
      out.push(
        `Last turn: ${Math.round((turn.read / sent) * 100)}% of input served from the prompt cache (${tokens(turn.read)} read, ${tokens(turn.written)} written, ${tokens(turn.uncached)} uncached).`,
      )
    }

    return { text: out.join('\n') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const now = await read($, reading)
    const text = now === null ? '' : line(now, await read($, lastResponseAt))

    if (e.props.hasSurvey || text === '' || (await read($, isHidden))) {
      return below
    }

    const isNear =
      (now?.percent ?? 0) >= (CONTEXT_MARKS.at(-1) ?? 100) ||
      (now?.limits ?? []).some(limit => limit.percentUsed >= (LIMIT_MARKS[0] ?? 100))
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {below}
        <Text dimColor={!isNear}>
          {text}
        </Text>
      </Box>
    )
  })
}
