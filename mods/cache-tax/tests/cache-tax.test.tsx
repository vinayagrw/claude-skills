import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const HOUR = 60 * 60_000

const world = (on: On, size = 200_000) => {
  const sent: string[] = []
  on('command.register', () => ({ value: {} }) as never)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.fill', () => ({ isFilled: true }) as never)
  on('prompt.submit', (_, e) => {
    sent.push(e.text)

    return { text: e.text }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: size, window: 1_000_000 }, rateLimits: [] } }) as never)

  return { sent, clock: mock.clock(on) }
}

const turn = { answer: 'done', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' } as never

test('a cold prompt is held once, then sent on the second Enter', async ($, on) => {
  const { sent, clock } = world(on)
  await $.turn.complete(turn)
  await clock.advance(HOUR + 60_000)

  const first = await $.prompt.submit({ text: 'hello' })
  expect(first.drop).toContain('~200k tokens')
  expect(sent).toEqual([])

  await $.prompt.submit({ text: 'hello' })
  expect(sent).toEqual(['hello'])
})

test('a warm cache or a small context passes straight through', async ($, on) => {
  const { sent, clock } = world(on, 20_000)
  await $.turn.complete(turn)
  await clock.advance(10 * 60_000)
  await $.prompt.submit({ text: 'warm' })
  await clock.advance(2 * HOUR)
  await $.prompt.submit({ text: 'small' })
  expect(sent).toEqual(['warm', 'small'])
})

test('off lets every prompt through', async ($, on) => {
  const { sent, clock } = world(on)
  await $.command.run({ command: 'cache-tax', args: 'off' } as never)
  await $.turn.complete(turn)
  await clock.advance(2 * HOUR)
  await $.prompt.submit({ text: 'go' })
  expect(sent).toEqual(['go'])
})
