import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { parseRange } from '../hooks/register'

const NOW = new Date(2026, 9, 18, 12, 0).getTime()

test('parses today, week, Nd and a date range in local days', () => {
  expect(parseRange('', NOW)?.label).toBe('today')
  expect(parseRange('week', NOW)?.from).toBe(new Date(2026, 9, 12).getTime())
  expect(parseRange('14d', NOW)?.from).toBe(new Date(2026, 9, 5).getTime())
  expect(parseRange('2026-10-01..2026-10-02', NOW)?.to).toBe(new Date(2026, 9, 3).getTime())
  expect(parseRange('nonsense', NOW)).toBe(null)
})

test('/insights runs the bundled script with the range', async ($, on: On) => {
  const seen: string[][] = []
  on('command.register', () => ({ value: {} }) as never)
  on('clock.now', () => ({ value: NOW }) as never)
  on('fs.exists', () => ({ value: true }) as never)
  on('process.run', (_, e) => {
    seen.push([...(e as { argv: string[] }).argv])
    return { value: { exitCode: 0, stdout: 'Token insights, last 7 days\n', stderr: '' } } as never
  })
  const { text } = (await $.command.run({ command: 'insights', args: 'week' } as never)) as { text: string }
  expect(text).toBe('Token insights, last 7 days')
  expect(seen[0]?.at(-1)).toBe('last 7 days')
  expect(seen[0]?.[2]).toContain('scripts/insights.py')
})

test('/insights week html writes the dashboard and opens it', async ($, on: On) => {
  const seen: string[][] = []
  on('command.register', () => ({ value: {} }) as never)
  on('clock.now', () => ({ value: NOW }) as never)
  on('fs.exists', () => ({ value: true }) as never)
  on('process.run', (_, e) => {
    const argv = [...(e as { argv: string[] }).argv]
    seen.push(argv)
    return { value: { exitCode: 0, stdout: argv[0] === 'sh' ? '/Users/me' : 'Dashboard written', stderr: '' } } as never
  })
  const { text } = (await $.command.run({ command: 'insights', args: 'week html' } as never)) as { text: string }
  expect(text).toBe('Opened the last 7 days dashboard in your browser.')
  expect(seen[0]?.slice(-2)).toEqual(['html', '~/.claude/token-insights/dashboard.html'])
  expect(seen.at(-1)).toEqual(['open', '/Users/me/.claude/token-insights/dashboard.html'])
})

test('/insights explains a bad range', async ($, on: On) => {
  on('command.register', () => ({ value: {} }) as never)
  on('clock.now', () => ({ value: NOW }) as never)
  const { text } = (await $.command.run({ command: 'insights', args: 'soon' } as never)) as { text: string }
  expect(text).toContain('Use /insights')
})
