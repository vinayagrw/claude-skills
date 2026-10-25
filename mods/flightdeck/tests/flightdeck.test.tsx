import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { bar } from '../hooks/register'

const world = (on: On) => {
  on('command.register', () => ({ value: {} }) as never)
  on('ui.invalidate', () => ({ value: undefined }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('session.measure', (_, e) => ({ changed: (e as { changed: unknown }).changed }) as never)
  on('tool.call', () => ({ result: 'x', text: 'x'.repeat(4000) }) as never)
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }) as never)
  on('turn.complete', (_, e) => ({ text: (e as { answer: string }).answer }) as never)
  mock.clock(on)
}

const text = async ($: { command: { run: (a: never) => Promise<{ text?: string }> } }) =>
  (await $.command.run({ command: 'flightdeck', args: 'text' } as never)).text ?? ''

test('a measurement fills the gauges', async ($, on) => {
  world(on)
  await $.session.measure({ changed: ['context'], context: { tokens: 400_000, window: 1_000_000, percent: 40 }, rateLimits: [{ kind: 'five_hour', percentUsed: 70 }], cost: { usd: 3.5 } } as never)
  const out = await text($ as never)
  expect(out).toContain('ctx 40% (400k) · 5h 70% · cost $3.50')
  expect(bar(50)).toBe('██████████░░░░░░░░░░')
})

test('tool calls are newest first, capped at 8, with sizes and mix', async ($, on) => {
  world(on)
  for (let i = 0; i < 10; i++) await $.tool.call({ tool: i % 2 ? 'Read' : 'Bash', file_path: `f${i}` } as never)
  const out = await text($ as never)
  expect(out).toContain('10 tool calls · mix Bash 5, Read 5')
  expect(out).toContain('recent: Read f9 1k | Bash f8 1k')
  expect(out.split('|').length).toBe(8)
})

test('a subagent shows running, then done', async ($, on) => {
  world(on)
  await $.agent.spawn({ tool_use_id: 't', prompt: 'p', description: 'Search docs', subagentType: 'Explore' } as never)
  expect(await text($ as never)).toContain('subagents: running Search docs')
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', agentId: 'a1' } as never)
  expect(await text($ as never)).toContain('subagents: done Search docs')
})

test('/flightdeck opens, then closes the pane', async ($, on) => {
  world(on)
  expect((await $.command.run({ command: 'flightdeck', args: '' } as never)).text).toContain('open')
  expect((await $.command.run({ command: 'flightdeck', args: '' } as never)).text).toBe('Flightdeck closed.')
})
