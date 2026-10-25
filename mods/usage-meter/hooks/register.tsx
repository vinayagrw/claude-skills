import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow, Limit, Reading, Tally } from '../types'

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
const agents = atom({ plugin: 'usage-meter', key: 'agents' } as const, {})
const tools = atom({ plugin: 'usage-meter', key: 'tools' } as const, {})
const models = atom({ plugin: 'usage-meter', key: 'models' } as const, {})
const slowest = atom({ plugin: 'usage-meter', key: 'slowest' } as const, [])
const failed = atom({ plugin: 'usage-meter', key: 'failed' } as const, { turns: 0, tokens: 0 })

const BIG_RESULT_TOKENS = 20_000
// List $ per million tokens, input and output (claude-api skill, cached 2026-10-06).
// Cache reads cost 0.1x input except where a third figure is listed, and writes cost 2x input
// (the one-hour cache these sessions use; 1.25x on the five-minute cache).
const PRICES: Record<string, [number, number, number?]> = {
  'claude-fable-5-1': [10, 50, 0.25],
  'claude-mythos-5-1': [10, 50, 0.25],
  'claude-fable-5': [10, 50],
  'claude-opus-5-5': [4, 20, 0.2],
  'claude-opus-5': [5, 25],
  'claude-opus-4-8': [5, 25],
  'claude-opus-4-7': [5, 25],
  'claude-opus-4-6': [5, 25],
  'claude-sonnet-5-5': [2, 10, 0.2],
  'claude-sonnet-5': [2, 10],
  'claude-sonnet-4-6': [3, 15],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-haiku-4-5': [1, 5],
}
// Claude Haiku 5.5 costs more once a prompt passes 100k tokens.
const HAIKU_LONG: [number, number] = [0.5, 2.5]
const baseModel = (model: string) => model.replace(/\[.*\]$/, '').replace(/^((us|eu|apac|global)\.)?(anthropic\.)?/, '').replace(/-\d{8}$/, '')

// One turn's cost in dollars, or null for a model with no listed price.
export const turnCost = (model: string, u: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }) => {
  const id = baseModel(model)
  const listed = PRICES[id]

  if (listed === undefined) return null

  const prompt = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
  const [input, output] = id === 'claude-haiku-5-5' && prompt > 100_000 ? HAIKU_LONG : [listed[0], listed[1]]
  const read = listed[2] ?? input * 0.1

  return (u.input_tokens * input + u.cache_creation_input_tokens * input * 2 + u.cache_read_input_tokens * read + u.output_tokens * output) / 1_000_000
}

const costOf = (row: AgentRow) => (row.unpriced ? null : (row.costUsd ?? 0))
// The engine gives no token count for a tool result; about 4 characters make a token.
const estimate = (text: string) => Math.round(text.length / 4)
const add = (all: Record<string, Tally>, key: string, n: number) => ({
  ...all,
  [key]: { calls: (all[key]?.calls ?? 0) + 1, tokens: (all[key]?.tokens ?? 0) + n },
})
const top = (all: Record<string, Tally>, count: number) =>
  Object.entries(all).sort(([, a], [, b]) => b.tokens - a.tokens).slice(0, count)

const MAIN = 'main'
const sizeOf = (row: AgentRow) => row.read + row.written + row.uncached + row.output
const emptyRow = (label: string, isWorkflow = false): AgentRow => ({ label, isWorkflow, turns: 0, read: 0, written: 0, uncached: 0, output: 0 })

// Subagent and workflow rows, largest first, without the main chat.
const helpers = (all: Record<string, AgentRow>) =>
  Object.entries(all).filter(([id]) => id !== MAIN).map(([, row]) => row).sort((a, b) => sizeOf(b) - sizeOf(a))

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

const line = (now: Reading, respondedAt: number | null, all: Record<string, AgentRow> = {}) => {
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

  const ran = helpers(all)

  if (ran.length > 0) {
    parts.push(`agents ${ran.length} · ${tokens(ran.reduce((n, row) => n + sizeOf(row), 0))}`)
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
    await update($, agents, () => ({}))
    await update($, tools, () => ({}))
    await update($, models, () => ({}))
    await update($, slowest, () => [])
    await update($, failed, () => ({ turns: 0, tokens: 0 }))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const now = toReading(e)
    await update($, reading, () => now)
    await warn($, now)

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const done = await next(e)
    const id = done.agentId

    if (id !== undefined) {
      const name = e.description.trim() || e.subagentType
      await update($, agents, all => ({
        ...all,
        [id]: {
          ...(all[id] ?? emptyRow(name, e.workflow !== undefined)),
          label: name,
          isWorkflow: e.workflow !== undefined,
          runId: e.workflow?.runId || undefined,
          isBackground: e.background,
          model: done.model,
        },
      }))
    }

    return done
  })

  on('turn.complete', async ($, e, next) => {
    if (e.usage !== undefined) {
      const { usage } = e
      const id = e.agentId ?? MAIN
      await update($, agents, all => {
        const row = all[id] ?? emptyRow(id === MAIN ? 'Main chat' : `agent ${id.slice(0, 6)}`)

        return {
          ...all,
          [id]: {
            ...row,
            turns: row.turns + 1,
            read: row.read + usage.cache_read_input_tokens,
            written: row.written + usage.cache_creation_input_tokens,
            uncached: row.uncached + usage.input_tokens,
            output: row.output + usage.output_tokens,
            model: row.model ?? usage.model,
            lastInput: usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens,
            costUsd: (row.costUsd ?? 0) + (turnCost(usage.model, usage) ?? 0),
            unpriced: row.unpriced || turnCost(usage.model, usage) === null || undefined,
          },
        }
      })
    }

    if (e.usage !== undefined) {
      const { usage } = e
      const spent = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens + usage.output_tokens
      const all = await read($, agents)
      const label = all[e.agentId ?? MAIN]?.label ?? 'Main chat'
      await update($, models, all => add(all, usage.model, spent))
      await update($, slowest, rows => [...rows, { label, ms: e.durationMs, tokens: spent }].sort((a, b) => b.ms - a.ms).slice(0, 3))

      if (e.reason === 'aborted' || e.reason === 'error') {
        await update($, failed, was => ({ turns: was.turns + 1, tokens: was.tokens + spent }))
      }
    }

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

  on('tool.call', async ($, e, next) => {
    const done = await next(e)

    if (done.deny === undefined) {
      const text = typeof done.text === 'string' ? done.text : JSON.stringify(done.result ?? '')
      const size = estimate(text ?? '')
      await update($, tools, all => add(all, e.tool, size))

      if (size > BIG_RESULT_TOKENS) {
        $.ui.toast(`${e.tool} returned about ${tokens(size)} tokens. Large results fill context fast.`)
      }
    }

    return done
  }).catch(($, e, next) => next(e))

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
    const all = await read($, agents)
    const out = [line(now, await read($, lastResponseAt), all) || 'No usage figures yet.']

    if (rows.length > 0) {
      out.push('Context by category (estimated):', ...rows)
    }

    if (turn !== null && sent > 0) {
      out.push(
        `Last turn: ${Math.round((turn.read / sent) * 100)}% of input served from the prompt cache (${tokens(turn.read)} read, ${tokens(turn.written)} written, ${tokens(turn.uncached)} uncached).`,
      )
    }

    const ran = helpers(all)

    if (ran.length > 0) {
      const spent = ran.reduce((n, row) => n + sizeOf(row), 0)
      const total = spent + (all[MAIN] === undefined ? 0 : sizeOf(all[MAIN]))
      const hit = (row: AgentRow) => {
        const sent = row.read + row.written + row.uncached

        return sent === 0 ? 0 : Math.round((row.read / sent) * 100)
      }
      out.push(
        `Subagents and workflows: ${tokens(spent)} tokens, ${Math.round((spent / total) * 100)}% of this session:`,
        ...ran
          .filter(row => row.runId === undefined)
          .map(row => `  ${row.label}${row.isBackground ? ' (background)' : ''}${row.model ? ` · ${row.model}` : ''}: ${tokens(sizeOf(row))} in ${row.turns} turn${row.turns === 1 ? '' : 's'}, ${hit(row)}% cached, ctx ${tokens(row.lastInput ?? 0)}, ${costOf(row) === null ? 'price unknown' : `≈$${costOf(row)!.toFixed(2)}`}`),
      )
      const runs = new Map<string, AgentRow[]>()
      ran.filter(row => row.runId !== undefined).forEach(row => runs.set(row.runId!, [...(runs.get(row.runId!) ?? []), row]))

      for (const [runId, rows] of runs) {
        out.push(`  workflow ${runId}: ${rows.length} agent${rows.length === 1 ? '' : 's'}, ${tokens(rows.reduce((n, row) => n + sizeOf(row), 0))}, ≈$${rows.reduce((n, row) => n + (costOf(row) ?? 0), 0).toFixed(2)}`)
      }

      const priced = Object.values(all).reduce((n, row) => n + (costOf(row) ?? 0), 0)
      const session = now.costUsd ?? (await read($, reading))?.costUsd ?? null
      out.push(`Estimated cost of all rows: ≈$${priced.toFixed(2)}${session === null ? '' : ` vs $${session.toFixed(2)} session total (incl. agents)`}.`)
    }

    const byTool = top(await read($, tools), 5)

    if (byTool.length > 0) {
      out.push('Top tools by result size (estimated):', ...byTool.map(([name, one]) => `  ${name}: ${tokens(one.tokens)} in ${one.calls} call${one.calls === 1 ? '' : 's'}`))
    }

    const byModel = top(await read($, models), 10)

    if (byModel.length > 0) {
      out.push('Tokens by model:', ...byModel.map(([name, one]) => `  ${name}: ${tokens(one.tokens)} in ${one.calls} turn${one.calls === 1 ? '' : 's'}`))
    }

    const misfires = await read($, failed)

    if (misfires.turns > 0) {
      out.push(`Failed or aborted turns: ${misfires.turns}, ${tokens(misfires.tokens)} tokens spent on them.`)
    }

    const slow = await read($, slowest)

    if (slow.length > 0) {
      out.push('Slowest turns:', ...slow.map(one => `  ${one.ms < 60_000 ? `${Math.round(one.ms / 1000)}s` : span(one.ms)} · ${one.label} · ${tokens(one.tokens)}`))
    }

    return { text: out.join('\n') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const now = await read($, reading)
    const text = now === null ? '' : line(now, await read($, lastResponseAt), await read($, agents))

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
