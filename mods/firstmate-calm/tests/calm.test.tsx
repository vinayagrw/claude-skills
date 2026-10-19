import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const world = (on: On) => {
  on('command.register', () => ({ value: {} }) as never)
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const word = (e.props as { word?: string }).word

    return word === undefined ? <Box key="engine" /> : <Text key="engine">{word}</Text>
  })
}

const row = (extra: object) => ({
  plugin: 'firstmate-calm',
  surface: 'terminal',
  component: 'ToolUse',
  props: { tool_use_id: 'x', tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false, output: {}, ...extra },
})

const isEngine = async ($: never, input: object) => {
  const ui = await ($ as { ui: { mount: (i: never) => Promise<{ find: (q: object) => Promise<unknown>; unmount: () => Promise<void> }> } }).ui.mount(input as never)
  const found = (await ui.find({ key: 'engine' })) !== undefined
  await ui.unmount()

  return found
}

test('finished tool rows hide, errors and running calls stay, /calm toggles', async ($, on) => {
  world(on)
  expect(await isEngine($ as never, row({}))).toBe(false)
  expect(await isEngine($ as never, row({ isErrored: true }))).toBe(true)
  expect(await isEngine($ as never, row({ isRunning: true }))).toBe(true)
  await $.command.run({ command: 'calm', args: '' } as never)
  expect(await isEngine($ as never, row({}))).toBe(true)
})

test('the spinner sails', async ($, on) => {
  world(on)
  const ui = await $.ui.mount({ plugin: 'firstmate-calm', surface: 'terminal', component: 'Spinner', props: { word: 'Sauteing', message: null, suffix: '…' } } as never)
  expect((await ui.find({ type: 'Text' }))?.text).toBe('⛵ Sailing')
})
