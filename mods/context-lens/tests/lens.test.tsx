import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const world = (on: On) => {
  on('command.register', () => ({ value: {} }) as never)
  on('tool.call', (_, e) => ({ result: {}, text: 'x'.repeat(e.tool === 'Read' ? 40_000 : 400) }) as never)
  on('session.usage', () => ({ value: {
    startedAt: 0,
    context: {
      tokens: 300_000, window: 1_000_000, percent: 30,
      breakdown: {
        categories: [
          { name: 'Messages', tokens: 250_000, kind: 'used', isDeferred: false, color: '' },
          { name: 'System prompt', tokens: 20_000, kind: 'used', isDeferred: false, color: '' },
          { name: 'Free space', tokens: 700_000, kind: 'free', isDeferred: false, color: '' },
        ],
        totalTokens: 300_000, maxTokens: 1_000_000, percentage: 30,
        memoryFiles: [{ path: '~/.claude/CLAUDE.md', type: 'User', tokens: 900 }],
        mcpTools: [], agents: [],
        skills: { totalSkills: 2, includedSkills: 2, tokens: 3000, skillFrontmatter: [{ name: 'pptx', source: 'plugin', pluginName: 'anthropic-skills', tokens: 2500 }] },
      },
    },
    rateLimits: [],
  } }) as never)
}

test('/lens ranks categories and the biggest tool results', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/deck/big.pptx' } as never)
  const { text } = (await $.command.run({ command: 'lens', args: '' } as never)) as { text: string }
  expect(text).toContain('300k of 1.0M (30%)')
  expect(text.indexOf('Messages')).toBeLessThan(text.indexOf('System prompt'))
  expect(text).not.toContain('Free space')
  expect(text).toContain('- 10k · Read /deck/big.pptx')
  expect(text).toContain('anthropic-skills:pptx')
  expect(text).toContain('~/.claude/CLAUDE.md')
})
