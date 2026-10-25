import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const world = (on: On, answer = 'Replace with commas') => {
  const ran: Record<string, unknown>[] = []
  on('command.register', () => ({ value: {} }) as never)
  on('process.run', () => ({ value: { stdout: '/h', stderr: '', exitCode: 0 } }) as never)
  on('fs.read', () => {
    throw new Error('missing')
  })
  on('fs.write', () => ({ value: undefined }) as never)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'base', scope: 'shared' }] }) as never)
  on('tool.call', (_, e) => {
    if ((e as { tool: string }).tool === 'AskUserQuestion') {
      const q = (e as { questions: { question: string }[] }).questions[0]!.question

      return { result: { questions: [], answers: { [q]: answer } } } as never
    }
    ran.push(e as never)

    return { result: 'ok' } as never
  })

  return { ran }
}

test('the rules are added to the system prompt once', async ($, on) => {
  world(on)
  const out = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never)
  const ids = out.sections.map(one => one.id)
  expect(ids).toEqual(['intro', 'house-style:rules'])
  expect(out.sections[1]!.text).toContain('em-dashes')
})

test('an em-dash in a markdown write is replaced', async ($, on) => {
  const { ran } = world(on)
  await $.tool.call({ tool: 'Write', file_path: 'a.md', content: 'Fast — and cheap' } as never)
  expect(ran[0]!.content).toBe('Fast, and cheap')
})

test('Keep leaves it, and code files pass through', async ($, on) => {
  const { ran } = world(on, 'Keep')
  await $.tool.call({ tool: 'Write', file_path: 'a.md', content: 'A — B' } as never)
  await $.tool.call({ tool: 'Write', file_path: 'a.ts', content: 'A — B' } as never)
  expect(ran.map(one => one.content)).toEqual(['A — B', 'A — B'])
})

test('off disables both', async ($, on) => {
  const { ran } = world(on)
  await $.command.run({ command: 'house-style', args: 'off' } as never)
  const out = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as never)
  expect(out.sections.length).toBe(1)
  await $.tool.call({ tool: 'Write', file_path: 'a.md', content: 'A — B' } as never)
  expect(ran[0]!.content).toBe('A — B')
})

test('filler words in a markdown write are swapped, case kept', async ($, on) => {
  const { ran } = world(on)
  await $.tool.call({ tool: 'Write', file_path: 'a.md', content: "Robust plan. We delve into it. It's worth noting that it is seamless." } as never)
  expect(ran[0]!.content).toBe('Solid plan. We dig into it. It is smooth.')
})

test('Keep leaves filler, code files and robustness pass through', async ($, on) => {
  const { ran } = world(on, 'Keep')
  await $.tool.call({ tool: 'Write', file_path: 'a.md', content: 'robust' } as never)
  const out: Record<string, unknown>[] = []
  await $.tool.call({ tool: 'Write', file_path: 'a.ts', content: 'robust' } as never)
  expect(ran.map(one => one.content)).toEqual(['robust', 'robust'])
  expect(out.length).toBe(0)
})

test('robustness is not touched', async ($, on) => {
  const { ran } = world(on)
  await $.tool.call({ tool: 'Write', file_path: 'a.md', content: 'Test robustness.' } as never)
  expect(ran[0]!.content).toBe('Test robustness.')
})

test('only a cut at a sentence start capitalises, so "...vs" stays lower case', async ($, on) => {
  const { ran } = world(on)
  await $.tool.call({ tool: 'Write', file_path: 'a.md', content: 'A robust total ... vs $4 session total.' } as never)
  expect(ran[0]!.content).toBe('A solid total ... vs $4 session total.')
})
