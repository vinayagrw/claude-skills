import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { byTurn, diff } from '../hooks/register'

const world = (on: On) => {
  const disk = new Map<string, string>([['/p/a.md', 'old a'], ['/p/b.md', 'old b']])
  on('command.register', () => ({ value: {} }) as never)
  on('session.start', () => ({ cwd: '/p' }) as never)
  on('session.id', () => ({ value: 's1' }) as never)
  on('process.run', (_, e) => {
    const argv = (e as { argv: string[] }).argv
    if (argv[0] === 'rm') disk.delete(argv[2]!)

    return { value: { stdout: '/h', stderr: '', exitCode: 0 } } as never
  })
  on('fs.read', (_, e) => {
    const text = disk.get((e as { path: string }).path)
    if (text === undefined) throw new Error('missing')

    return { value: text } as never
  })
  on('fs.write', (_, e) => {
    const { path, text } = e as { path: string; text: string }
    disk.set(path, text)

    return { value: undefined } as never
  })
  on('tool.call', (_, e) => {
    const call = e as { tool: string; file_path?: string; content?: string; questions?: { question: string }[] }
    if (call.tool === 'AskUserQuestion') return { result: { questions: [], answers: { [call.questions![0]!.question]: 'Restore' } } } as never
    if (call.file_path !== undefined) disk.set(call.file_path, call.content ?? 'edited')

    return { result: 'ok' } as never
  })
  on('ui.invalidate', () => ({ value: undefined }) as never)
  on('ui.log', () => ({ value: undefined }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  mock.clock(on)
  on('turn.complete', (_, e) => ({ text: (e as { answer: string }).answer }) as never)

  return { disk }
}

const turn = { answer: 'done', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as never

test('an edit is snapshotted before it runs, grouped by turn', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.md', old_string: 'old', new_string: 'new' } as never)
  await $.turn.complete(turn)
  await $.tool.call({ tool: 'Write', file_path: '/p/c.md', content: 'fresh' } as never)
  const out = await $.command.run({ command: 'rewind', args: 'list' } as never)
  expect(out.text).toContain('Turn 2 · 1 files')
  expect(out.text).toContain('+ new /p/c.md')
  expect(out.text).toContain('Turn 1 · 1 files')
})

test('the snapshot holds the text from before the edit', async ($, on) => {
  const { disk } = world(on)
  await $.tool.call({ tool: 'Write', file_path: '/p/a.md', content: 'new a' } as never)
  const saved = JSON.parse(disk.get('/h/.claude/time-machine/s1.json')!)
  expect(saved[0].before).toBe('old a')
  expect(disk.get('/p/a.md')).toBe('new a')
})

test('helpers: diff and turn grouping', () => {
  expect(diff('a\nb', 'a\nc')).toEqual(['- b', '+ c'])
  const rows = [1, 1, 2].map((t, n) => ({ n, turn: t, tool: 'Edit', path: `f${n}`, before: '', at: 0 }))
  expect(byTurn(rows).map(([t, r]) => [t, r.length])).toEqual([[2, 1], [1, 2]])
})

test('clear empties the timeline', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'Write', file_path: '/p/a.md', content: 'x' } as never)
  await $.command.run({ command: 'rewind', args: 'clear' } as never)
  const out = await $.command.run({ command: 'rewind', args: 'list' } as never)
  expect(out.text).toContain('No edits')
})
