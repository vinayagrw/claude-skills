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
