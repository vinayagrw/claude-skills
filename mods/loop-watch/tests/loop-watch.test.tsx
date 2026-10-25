import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const world = (on: On) => {
  const disk = new Map<string, string>()
  const toasts: string[] = []
  on('command.register', () => ({ value: {} }) as never)
  on('session.start', (_, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('process.run', () => ({ value: { stdout: '/h', stderr: '', exitCode: 0 } }) as never)
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
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text?: string }).text ?? e))

    return { value: undefined } as never
  })

  return { disk, toasts, clock: mock.clock(on) }
}

const start = (cwd: string, isInteractive: boolean) => ({ cwd, isInteractive, surface: null }) as never

test('a burst of unattended starts warns the next interactive session', async ($, on) => {
  const { toasts, clock } = world(on)
  for (let i = 0; i < 12; i++) {
    await $.session.start(start('/work/sparky-bff', false))
    await clock.advance(60_000)
  }
  await $.session.start(start('/work/notes', true))
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('sparky-bff started 12 sessions')
})

test('a normal pace and an ignored project stay quiet', async ($, on) => {
  const { toasts, clock } = world(on)
  for (let i = 0; i < 5; i++) {
    await $.session.start(start('/work/app', true))
    await clock.advance(10 * 60_000)
  }
  expect(toasts).toEqual([])

  await $.command.run({ command: 'loop-watch', args: 'ignore bot' } as never)
  for (let i = 0; i < 12; i++) await $.session.start(start('/work/bot', false))
  await $.session.start(start('/work/app', true))
  expect(toasts).toEqual([])
})

test('/loop-watch lists the busiest projects', async ($, on) => {
  world(on)
  for (let i = 0; i < 11; i++) await $.session.start(start('/work/bot', false))
  const out = await $.command.run({ command: 'loop-watch', args: '' } as never)
  expect(out.text).toContain('bot: 11 starts in 24h, 11 unattended')
  expect(out.text).toContain('looping now')
})
