import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const HOUR = 60 * 60_000
const BAND = {
  plugin: 'usage-meter',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
} as const

const world = (on: On) => {
  const toasts: string[] = []
  const clock = mock.clock(on, { now: 1_000 * HOUR })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: {
    startedAt: 0,
    context: {
      window: 1_000_000,
      breakdown: { categories: [{ name: 'Messages', tokens: 120_000, isDeferred: false }] },
    },
    rateLimits: [],
  } }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine" />
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  return { toasts, clock }
}

const measure = (percent: number, fiveHour?: number) => ({
  context: { tokens: percent * 10_000, window: 1_000_000, percent },
  rateLimits:
    fiveHour === undefined
      ? []
      : [{ kind: 'five_hour', percentUsed: fiveHour, resetsAt: '2026-10-13T20:40:00Z' }],
  cost: { usd: 4.2 },
  changed: ['context' as const],
})

const turn = {
  answer: 'done',
  durationMs: 10,
  isAborted: false,
  turnId: 't1',
  reason: 'answer' as const,
  usage: {
    model: 'claude-opus-5-5',
    input_tokens: 1_000,
    output_tokens: 500,
    cache_read_input_tokens: 90_000,
    cache_creation_input_tokens: 9_000,
  },
}

const prompt = { text: 'next', wait: false, origin: { kind: 'composer' as const } }

test('the band shows context, limits and cost on each surface', async ($, on) => {
  world(on)
  await $.session.measure(measure(14, 62))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as never)
    const text = (await ui.find({ type: 'Text' }))?.text ?? ''
    expect(text).toContain('ctx 140k / 1M (14%)')
    expect(text).toContain('5h 62%')
    expect(text).toContain('$4.20')
    expect(text).not.toContain('resets')
    await ui.unmount()
  }
})

test('each threshold toasts once and arms again after falling back', async ($, on) => {
  const { toasts } = world(on)
  await $.session.measure(measure(61))
  await $.session.measure(measure(65))
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('Context is 61% full')

  await $.session.measure(measure(85))
  expect(toasts.length).toBe(2)

  await $.session.measure(measure(20))
  await $.session.measure(measure(90))
  expect(toasts.length).toBe(3)
  expect(toasts[2]).toContain('Context is 90% full')
})

test('a limit window warns as it fills and says when it has reset', async ($, on) => {
  const { toasts } = world(on)
  await $.session.measure(measure(10, 96))
  expect(toasts).toEqual([expect.stringContaining('5h limit is 96% used, resets')])

  await $.session.measure(measure(10, 3))
  expect(toasts[1]).toContain('5h limit has reset')
})

test('the cold-cache notice needs an expired cache and a large context', async ($, on) => {
  const { toasts, clock } = world(on)
  await $.session.measure(measure(14))
  await $.turn.complete(turn as never)

  await clock.advance(HOUR / 2)
  await $.prompt.submit(prompt as never)
  expect(toasts.length).toBe(0)

  await clock.advance(HOUR)
  await $.prompt.submit(prompt as never)
  expect(toasts).toEqual([expect.stringContaining('re-sends about 140k tokens uncached')])
})

test('a small context raises no cold-cache notice', async ($, on) => {
  const { toasts, clock } = world(on)
  await $.session.measure(measure(4))
  await $.turn.complete(turn as never)
  await clock.advance(3 * HOUR)
  await $.prompt.submit(prompt as never)
  expect(toasts.length).toBe(0)
})

test('the command hides and shows the band and prints the breakdown', async ($, on) => {
  world(on)
  await $.session.measure(measure(14))
  await $.turn.complete(turn as never)
  const run = (args: string) =>
    $.command.run({ command: 'usage-meter', args, origin: { kind: 'composer' } } as never)

  const report = (await run('')).text ?? ''
  expect(report).toContain('Messages: 120k')
  expect(report).toContain('90% of input served from the prompt cache')

  await run('hide')
  const hidden = await $.ui.mount({ ...BAND, surface: 'terminal' } as never).catch(() => undefined)
  expect(await hidden?.find({ type: 'Text' })).toBeUndefined()
  await hidden?.unmount()

  await run('show')
  const shown = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  expect(await shown.find({ type: 'Text' })).toBeDefined()
  await shown.unmount()
})

test('subagent turns are counted per agent and leave the main cache line alone', async ($, on) => {
  world(on)
  await $.session.measure(measure(14))
  await $.turn.complete(turn as never)
  await $.turn.complete({ ...turn, agentId: 'abc123xyz', usage: { ...turn.usage, cache_read_input_tokens: 0, cache_creation_input_tokens: 40_000 } } as never)
  await $.turn.complete({ ...turn, agentId: 'abc123xyz', usage: { ...turn.usage, cache_read_input_tokens: 0, cache_creation_input_tokens: 40_000 } } as never)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  expect((await ui.find({ type: 'Text' }))?.text ?? '').toContain('agents 1 · 83k')
  await ui.unmount()

  const report = (await $.command.run({ command: 'usage-meter', args: '', origin: { kind: 'composer' } } as never)).text ?? ''
  expect(report).toContain('90% of input served from the prompt cache')
  expect(report).toContain('Subagents and workflows: 83k tokens, 45% of this session')
  expect(report).toContain('agent abc123 · claude-opus-5-5: 83k in 2 turns, 0% cached, ctx 41k, ≈$0.67')
})

test('no subagents, no agents part', async ($, on) => {
  world(on)
  await $.session.measure(measure(14))
  await $.turn.complete(turn as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  expect((await ui.find({ type: 'Text' }))?.text ?? '').not.toContain('agents')
  await ui.unmount()
})

test('tool results are tallied and a large one toasts', async ($, on) => {
  const { toasts } = world(on)
  on('tool.call', (_, e) => ({ result: (e as { tool: string }).tool === 'Read' ? 'x'.repeat(100_000) : 'ok' }) as never)
  await $.tool.call({ tool: 'Read', file_path: 'big.md' } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  expect(toasts).toEqual([expect.stringContaining('Read returned about 25k tokens')])
  const report = (await $.command.run({ command: 'usage-meter', args: '', origin: { kind: 'composer' } } as never)).text ?? ''
  expect(report).toContain('Top tools by result size (estimated):\n  Read: 25k in 1 call')
})

test('model split, failed turns, slow turns and workflow runs are reported', async ($, on) => {
  world(on)
  on('agent.spawn', () => ({ agentId: 'w1', model: 'claude-haiku-5-5' }) as never)
  await $.session.measure(measure(14))
  await $.agent.spawn({ tool_use_id: 't', prompt: 'p', description: 'verify', subagentType: 'Explore', background: true, workflow: { runId: 'wf_abc', agentIndex: 1 } } as never)
  await $.turn.complete({ ...turn, durationMs: 90_000 } as never)
  await $.turn.complete({ ...turn, agentId: 'w1', reason: 'error', durationMs: 5_000, usage: { ...turn.usage, model: 'claude-haiku-5-5' } } as never)
  const report = (await $.command.run({ command: 'usage-meter', args: '', origin: { kind: 'composer' } } as never)).text ?? ''
  expect(report).toContain('workflow wf_abc: 1 agent, 101k')
  expect(report).toContain('claude-opus-5-5: 101k in 1 turn')
  expect(report).toContain('claude-haiku-5-5: 101k in 1 turn')
  expect(report).toContain('Failed or aborted turns: 1, 101k tokens')
  expect(report).toContain('Slowest turns:\n  2m · Main chat · 101k\n  5s · verify · 101k')
})

test('agent rows show estimated cost and their latest context', async ($, on) => {
  world(on)
  await $.session.measure(measure(14))
  const small = { ...turn.usage, model: 'claude-haiku-5-5', input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 2_000_000, output_tokens: 0 }
  await $.turn.complete({ ...turn, agentId: 'h1', usage: { ...small, cache_creation_input_tokens: 1_000_000 } } as never)
  await $.turn.complete({ ...turn, agentId: 'h1', usage: small } as never)
  await $.turn.complete({ ...turn, agentId: 'x1', usage: { ...turn.usage, model: 'other-model' } } as never)
  const report = (await $.command.run({ command: 'usage-meter', args: '', origin: { kind: 'composer' } } as never)).text ?? ''
  expect(report).toContain('ctx 2M, ≈$3.00')
  expect(report).toContain('price unknown')
  expect(report).toContain('vs $4.20 session total (incl. agents)')
})

test('prices strip region and date suffixes, and long Haiku prompts cost more', async ($, on) => {
  world(on)
  const u = { input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  const run = async (id: string, model: string, usage = u) =>
    $.turn.complete({ ...turn, agentId: id, usage: { ...usage, model } } as never)
  await run('a', 'us.anthropic.claude-opus-5-5')
  await run('b', 'claude-haiku-4-5-20251001')
  await run('c', 'claude-haiku-5-5')
  await run('d', 'claude-haiku-5-5', { ...u, input_tokens: 50_000 })
  const report = (await $.command.run({ command: 'usage-meter', args: '', origin: { kind: 'composer' } } as never)).text ?? ''
  expect(report).toContain('agent a · us.anthropic.claude-opus-5-5: 1M in 1 turn, 0% cached, ctx 1M, ≈$4.00')
  expect(report).toContain('agent b · claude-haiku-4-5-20251001: 1M in 1 turn, 0% cached, ctx 1M, ≈$1.00')
  expect(report).toContain('agent c · claude-haiku-5-5: 1M in 1 turn, 0% cached, ctx 1M, ≈$0.50')
  expect(report).toContain('agent d · claude-haiku-5-5: 50k in 1 turn, 0% cached, ctx 50k, ≈$0.01')
})
