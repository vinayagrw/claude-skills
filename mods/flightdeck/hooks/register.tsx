import type { EngineInterface, Register } from 'claude-code'

import type { Call, Sub } from '../types'

const PANE = 'flightdeck'
const RECENT = 8
const BAR = 20
// The engine does not tell a hook the prompt cache's lifetime; these sessions use the one-hour cache.
const CACHE_MS = 60 * 60_000
const CHARS_PER_TOKEN = 4

const tokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

export const bar = (percent: number) => {
  const filled = Math.max(0, Math.min(BAR, Math.round((percent / 100) * BAR)))

  return '█'.repeat(filled) + '░'.repeat(BAR - filled)
}

const timeOfDay = (ms: number) => {
  const at = new Date(ms)
  const hours = at.getHours()

  return `${hours % 12 || 12}:${`${at.getMinutes()}`.padStart(2, '0')}${hours < 12 ? 'am' : 'pm'}`
}

const span = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)}m`)

const describe = (input: unknown) => {
  const e = (input ?? {}) as Record<string, unknown>
  const pick = String(e.file_path ?? e.command ?? e.pattern ?? e.url ?? e.query ?? e.description ?? '').replaceAll('\n', ' ')

  return pick.length > 40 ? `${pick.slice(0, 39)}…` : pick
}

// What the pane shows, kept by the hooks below.
export const deck = {
  context: null as { tokens: number | null; window: number; percent: number | null } | null,
  limits: [] as { kind: string; percentUsed: number }[],
  usd: null as number | null,
  lastReplyAt: null as number | null,
  running: null as string | null,
  calls: [] as Call[],
  subs: [] as Sub[],
  turns: 0,
  total: 0,
  mix: new Map<string, number>(),
  biggest: null as Call | null,
  isOpen: false,
}

const redraw = ($: EngineInterface) => {
  if (deck.isOpen) $.ui.invalidate('ui.render')
}

const limitName = (kind: string) => (kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7d' : kind.replaceAll('_', ' '))

export const register: Register = on => {
  Object.assign(deck, { context: null, limits: [], usd: null, lastReplyAt: null, running: null, calls: [], subs: [], turns: 0, total: 0, mix: new Map(), biggest: null, isOpen: false })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: PANE, description: 'Toggle a live pane: context, limits, cost, cache, tool calls and subagents; "text" prints it', argumentHint: '[text]' })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    deck.context = { tokens: e.context.tokens ?? null, window: e.context.window, percent: e.context.percent ?? null }
    deck.limits = e.rateLimits.map(one => ({ kind: one.kind, percentUsed: one.percentUsed }))
    deck.usd = e.cost?.usd ?? deck.usd
    redraw($)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const isSub = (e as { agentId?: string }).agentId !== undefined
    deck.running = `${e.tool} ${describe(e)}`
    redraw($)
    const ran = await next(e)
    deck.running = null

    const size = ran.deny === undefined ? Math.round((ran.text ?? '').length / CHARS_PER_TOKEN) : 0
    const call: Call = { tool: e.tool, what: describe(e), tokens: size, at: await $.clock.now(), isSub }
    deck.calls = [call, ...deck.calls].slice(0, RECENT)
    deck.total += 1
    deck.mix.set(e.tool, (deck.mix.get(e.tool) ?? 0) + 1)
    if (deck.biggest === null || size > deck.biggest.tokens) deck.biggest = call
    redraw($)

    return ran
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const id = (started as { agentId?: string }).agentId

    if (id !== undefined) {
      deck.subs = [...deck.subs, { id, label: e.description || e.subagentType, startedAt: await $.clock.now(), doneAt: null }].slice(-RECENT)
      redraw($)
    }

    return started
  })

  on('turn.complete', async ($, e, next) => {
    const at = await $.clock.now()

    if (e.agentId === undefined) {
      deck.turns += 1
      deck.lastReplyAt = at
    } else {
      deck.subs = deck.subs.map(sub => (sub.id === e.agentId && sub.doneAt === null ? { ...sub, doneAt: at } : sub))
    }
    redraw($)

    return next(e)
  })

  on('command.run', { command: PANE }, async ($, e) => {
    if (e.args.trim().toLowerCase() === 'text') {
      const ctx = deck.context
      const subs = deck.subs.map(sub => `${sub.doneAt === null ? 'running' : 'done'} ${sub.label}`)

      return {
        text: [
          `ctx ${ctx === null ? 'n/a' : `${ctx.percent ?? 0}% (${tokens(ctx.tokens ?? 0)})`} · ${deck.limits.map(l => `${limitName(l.kind)} ${Math.round(l.percentUsed)}%`).join(' · ')} · cost ${deck.usd === null ? 'n/a' : `$${deck.usd.toFixed(2)}`}`,
          `${deck.turns} turns · ${deck.total} tool calls · mix ${[...deck.mix.entries()].map(([t, n]) => `${t} ${n}`).join(', ')}`,
          `recent: ${deck.calls.map(c => `${c.tool} ${c.what} ${tokens(c.tokens)}`).join(' | ')}`,
          `subagents: ${subs.length === 0 ? 'none' : subs.join(', ')}`,
        ].join('\n'),
      }
    }

    if (deck.isOpen) {
      await $.ui.close({ id: PANE })
      deck.isOpen = false

      return { text: 'Flightdeck closed.' }
    }

    const opened = await $.ui.open({ id: PANE, title: 'Flightdeck' })
    deck.isOpen = true

    return { text: opened.isPlaced ? 'Flightdeck open. /flightdeck again to close.' : 'Flightdeck will show when the window is wide enough.' }
  }).catch(($, e, next) => next(e))

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) deck.isOpen = false

    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const ctx = deck.context
    const warm = deck.lastReplyAt === null ? null : deck.lastReplyAt + CACHE_MS
    const mix = [...deck.mix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    const hot = (p: number) => (p >= 80 ? 'red' : p >= 60 ? 'yellow' : 'green')

    return (
      <Box flexDirection="column">
        <Text bold>GAUGES</Text>
        {ctx === null ? (
          <Text dimColor>waiting for the first measurement…</Text>
        ) : (
          <Text color={hot(ctx.percent ?? 0)}>{`ctx  ${bar(ctx.percent ?? 0)} ${tokens(ctx.tokens ?? 0)} / ${tokens(ctx.window)}`}</Text>
        )}
        {deck.limits.map(limit => (
          <Text key={`l-${limit.kind}`} color={hot(limit.percentUsed)}>{`${limitName(limit.kind).padEnd(4)} ${bar(limit.percentUsed)} ${Math.round(limit.percentUsed)}%`}</Text>
        ))}
        <Text>{`cost ${deck.usd === null ? 'n/a' : `$${deck.usd.toFixed(2)}`} · cache ${warm === null ? 'no reply yet' : warm > now ? `warm until ${timeOfDay(warm)}` : 'cold'}`}</Text>

        <Text bold>{'\nNOW'}</Text>
        <Text color="cyan">{deck.running === null ? 'idle' : `▶ ${deck.running}`}</Text>
        {deck.calls.map((call, i) => (
          <Text key={`c-${i}`} dimColor={i > 0}>{`${call.isSub ? '↳ ' : ''}${call.tool} ${call.what} · ${tokens(call.tokens)}`}</Text>
        ))}

        <Text bold>{'\nSUBAGENTS'}</Text>
        {deck.subs.length === 0 ? <Text dimColor>none this session</Text> : null}
        {deck.subs.map(sub => (
          <Text key={`s-${sub.id}`} color={sub.doneAt === null ? 'yellow' : 'green'}>
            {`${sub.doneAt === null ? '● running' : '✓ done'} ${sub.label} · ${span((sub.doneAt ?? now) - sub.startedAt)}`}
          </Text>
        ))}

        <Text bold>{'\nTHIS SESSION'}</Text>
        <Text>{`${deck.turns} turns · ${deck.total} tool calls`}</Text>
        {mix.length > 0 ? <Text dimColor>{`mix: ${mix.map(([tool, n]) => `${tool} ${n}`).join(' · ')}`}</Text> : null}
        {deck.biggest === null ? null : <Text dimColor>{`biggest: ${deck.biggest.tool} ${deck.biggest.what} · ${tokens(deck.biggest.tokens)}`}</Text>}
      </Box>
    )
  })
}
