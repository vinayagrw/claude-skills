import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  plugin: 'next-step',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
} as const

const HAIKU = JSON.stringify([
  { label: 'Audit gaps', prompt: 'What have we missed?' },
  { label: 'Ship it', prompt: 'Install it for all sessions.' },
  { label: 'Add tests', prompt: 'Add more tests.' },
])

const world = (on: On, reply: { isAnswered: boolean; text?: string } = { isAnswered: true, text: HAIKU }, draft = '', answers: string[] = []) => {
  const sent: string[] = []
  const box = { text: draft }
  const filled: string[] = []
  let calls = 0
  on('command.register', () => ({ value: {} }) as never)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine" />
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => {
    sent.push(e.text)

    return { text: e.text }
  })
  on('prompt.read', () => ({ value: { text: box.text, cursor: box.text.length } }) as never)
  on('tool.call', (_, e) => {
    const { questions } = e as unknown as { questions: { question: string }[] }
    const answer = answers.shift() ?? 'Keep'

    return { result: { questions, answers: Object.fromEntries(questions.map(one => [one.question, answer])) } } as never
  })
  on('prompt.fill', (_, e) => {
    const mode = (e as { mode?: string }).mode
    filled.push(`${mode}:${e.text}`)
    box.text = mode === 'append' ? box.text + e.text : e.text

    return { isFilled: true } as never
  })
  on('model.complete', () => {
    calls += 1

    return { value: reply.isAnswered
      ? { isAnswered: true, text: reply.text, usage: {} }
      : { isAnswered: false, reason: 'api-error', status: 500, error: 'x', usage: {} } } as never
  })

  return { sent, filled, box, calls: () => calls }
}

const turn = (answer: string, agentId?: string) =>
  ({ answer, agentId, durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' }) as never

const labels = async ($: { ui: { mount: (input: never) => Promise<{ findAll: (q: { type: string }) => Promise<unknown[]>; unmount: () => Promise<void> }> } }) => {
  const ui = await $.ui.mount(BAND as never)
  const found = (await ui.findAll({ type: 'Button' })).map(one => (one as { props?: { label?: string } }).props?.label ?? '')
  await ui.unmount()

  return found
}

test('a Haiku answer becomes the suggestion buttons', async ($, on) => {
  world(on)
  await $.turn.complete(turn('I built the deck.'))
  expect(await labels($)).toEqual(['☐ 1 Audit gaps', '☐ 2 Ship it', '☐ 3 Add tests', '✎ Edit', '✕ Skip'])
})

test('a failed model call falls back to the keyword rules', async ($, on) => {
  world(on, { isAnswered: false })
  await $.turn.complete(turn('I added three slides to the deck.'))
  expect(await labels($)).toEqual(['☐ 1 More visuals', '☐ 2 What changed where', '☐ 3 Audit gaps', '✎ Edit', '✕ Skip'])
})

test('a subagent turn raises no suggestions', async ($, on) => {
  const { calls } = world(on)
  await $.turn.complete(turn('sub done', 'agent-1'))
  expect(await labels($)).toEqual([])
  expect(calls()).toBe(0)
})

test('pressing a suggestion appends it to the empty box and sends nothing', async ($, on) => {
  const { sent, filled } = world(on)
  await $.turn.complete(turn('done'))
  const ui = await $.ui.mount(BAND as never)
  await ui.press({ key: 'pick-1' })
  await ui.unmount()
  expect(sent).toEqual([])
  expect(filled).toEqual(['append:Install it for all sessions.'])
  expect(await labels($)).toEqual(['☐ 1 Audit gaps', '☑ 2 Ship it', '☐ 3 Add tests', '✎ Edit', '✕ Skip'])
})

test('pressing a suggestion with a draft adds it on a new line', async ($, on) => {
  const { filled } = world(on, undefined, 'my draft')
  await $.turn.complete(turn('done'))
  const ui = await $.ui.mount(BAND as never)
  await ui.press({ key: 'pick-0' })
  await ui.unmount()
  expect(filled).toEqual(['append:\nWhat have we missed?'])
})

test('only Skip clears the band; a typed prompt and working keep it', async ($, on) => {
  world(on)
  await $.turn.complete(turn('done'))
  await $.prompt.submit({ text: 'my own', wait: false, origin: { kind: 'composer' } } as never)
  expect((await labels($)).length).toBe(5)

  const working = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: true } } as never)
  expect((await working.findAll({ type: 'Button' })).length).toBe(5)
  await working.unmount()

  const ui = await $.ui.mount(BAND as never)
  await ui.press({ key: 'skip' })
  await ui.unmount()
  expect(await labels($)).toEqual([])
})

test('a new reply appends its options after the ones not skipped', async ($, on) => {
  world(on, { isAnswered: false })
  await $.turn.complete(turn('I added three slides to the deck.'))
  await $.turn.complete(turn('I built the design and the architecture.'))
  const shown = await labels($)
  expect(shown.slice(0, 2)).toEqual(['☐ 1 More visuals', '☐ 2 What changed where'])
  expect(shown.length).toBeGreaterThan(5)
  expect(new Set(shown).size).toBe(shown.length)
})

test('off hides the band and free mode makes no model call', async ($, on) => {
  const { calls } = world(on)
  const run = (args: string) =>
    $.command.run({ command: 'next-step', args, origin: { kind: 'composer' } } as never)

  await run('off')
  await $.turn.complete(turn('done'))
  expect(await labels($)).toEqual([])

  await run('on')
  await run('free')
  await $.turn.complete(turn('done'))
  expect(calls()).toBe(0)
  expect((await labels($)).length).toBe(5)
})

test('ticking two options adds both; unticking one takes only its line out', async ($, on) => {
  const { box, sent } = world(on, undefined, 'my draft')
  await $.turn.complete(turn('done'))
  const ui = await $.ui.mount(BAND as never)
  await ui.press({ key: 'pick-0' })
  await ui.unmount()
  const again = await $.ui.mount(BAND as never)
  await again.press({ key: 'pick-2' })
  await again.unmount()
  expect(box.text).toBe('my draft\nWhat have we missed?\nAdd more tests.')
  const third = await $.ui.mount(BAND as never)
  await third.press({ key: 'pick-0' })
  await third.unmount()
  expect(box.text).toBe('my draft\nAdd more tests.')
  expect(sent).toEqual([])
})

test('unticking an option whose line you changed leaves the box alone', async ($, on) => {
  const { box } = world(on)
  await $.turn.complete(turn('done'))
  const ui = await $.ui.mount(BAND as never)
  await ui.press({ key: 'pick-0' })
  await ui.unmount()
  box.text = 'What have we missed in the deck?'
  const again = await $.ui.mount(BAND as never)
  await again.press({ key: 'pick-0' })
  await again.unmount()
  expect(box.text).toBe('What have we missed in the deck?')
  expect((await labels($))[0]).toBe('☐ 1 Audit gaps')
})

test('Edit rewrites a ticked option in the band and in the box; Keep changes nothing', async ($, on) => {
  const { box } = world(on, undefined, '', ['Check the deck numbers too', 'Keep'])
  await $.turn.complete(turn('done'))
  const ui = await $.ui.mount(BAND as never)
  await ui.press({ key: 'pick-1' })
  await ui.unmount()
  const again = await $.ui.mount(BAND as never)
  await again.press({ key: 'edit' })
  await again.unmount()
  expect(box.text).toBe('Check the deck numbers too')
  expect((await labels($))[1]).toBe('☑ 2 Check the deck numbers')

  const third = await $.ui.mount(BAND as never)
  await third.press({ key: 'edit' })
  await third.unmount()
  expect(box.text).toBe('Check the deck numbers too')
})
