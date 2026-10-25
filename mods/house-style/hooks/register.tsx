import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const NAME = 'house-style'
const DASH = '—'

// The corrections repeated most across the audited sessions.
const DEFAULT_RULES = [
  'Prefer visuals over text: diagrams, tables and icons first, short labels, details in a drawer. The user scans, so pictures land faster.',
  'Use plain, simple wording a non-specialist can follow, because clients and managers read the output.',
  'Never use em-dashes or semicolons in document or Confluence text; use commas or full stops. It reads as AI-written.',
  'Diagram icons at least 80x80 (glyphs 64px+), using the iso-tile icon set, so they read on a projector.',
  'Avoid filler words and habits: "delve", "robust", "seamless", "it is worth noting", emoji bullets, and closing summaries that repeat the body.',
  'Finish a task with: Changed, Not done, Blocked on me. Mark any fact you could not verify and say where you looked.',
  'Use subagents for research and checks to keep the main context small.',
]

const isOff = atom({ plugin: 'house-style', key: 'isOff' } as const, false)

const rulesPath = async ($: EngineInterface) =>
  `${(await $.process.run(['sh', '-c', 'printf %s "$HOME"'])).stdout}/.claude/house-style/rules.md`

const loadRules = async ($: EngineInterface) => {
  try {
    const rows = (await $.fs.read(await rulesPath($)))
      .split('\n')
      .map(row => row.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean)

    return rows.length > 0 ? rows : DEFAULT_RULES
  } catch {
    return DEFAULT_RULES
  }
}

export const undash = (text: string) => text.replace(/\s*—\s*/g, ', ')

// Filler words that read as AI-written, with a plain swap ('' cuts the phrase).
const SLOP: Record<string, string> = {
  'delve into': 'dig into', delve: 'dig into', robust: 'solid', seamless: 'smooth', seamlessly: 'smoothly',
  leverage: 'use', utilize: 'use', 'cutting-edge': 'latest', 'game-changer': 'big step', unlock: 'open up',
  empower: 'help', "it's worth noting that": '', "in today's fast-paced world,": '',
}
const SLOP_RE = new RegExp(`\\b(${Object.keys(SLOP).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?!\\w)`, 'gi')

const keepCase = (from: string, to: string) => (to !== '' && /^[A-Z]/.test(from) ? to[0]!.toUpperCase() + to.slice(1) : to)

export const slopIn = (text: string) => [...new Set([...text.matchAll(SLOP_RE)].map(m => m[1]!.toLowerCase().trim()))]

export const unslop = (text: string) =>
  text
    .replace(SLOP_RE, word => keepCase(word, SLOP[word.toLowerCase()] ?? word) || '\u0000')
    .replace(/(\S) {2,}(?=\S)/g, '$1 ')
    // A cut phrase that opened a sentence leaves the next word to be capitalised.
    .replace(/(^|[.!?]\s+)\u0000\s*([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/ ?\u0000 ?/g, ' ')
    .replace(/(\S) {2,}(?=\S)/g, '$1 ')
    .replace(/(^|\n) /g, '$1')

const isDoc = (path: unknown) => typeof path === 'string' && /\.(md|mdx|html?|txt)$/i.test(path)
const isConfluence = (tool: string) => /^mcp__.*(confluence|atlassian)/i.test(tool)

// The text fields a style check reads, per tool; empty when the tool is not checked.
const fieldsOf = (e: Record<string, unknown>, tool: string): string[] => {
  if (tool === 'Write' && isDoc(e.file_path)) return ['content']
  if (tool === 'Edit' && isDoc(e.file_path)) return ['new_string']
  if (isConfluence(tool)) return Object.keys(e).filter(key => /body|content|text|title/i.test(key))

  return []
}

// The filler-word check, run after the em-dash check in the same tool.call hook.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slopCheck = async ($: EngineInterface, e: any, next: (e: any) => any) => {
    const input = e as unknown as Record<string, unknown>
    const fields = fieldsOf(input, e.tool).filter(key => typeof input[key] === 'string' && slopIn(input[key] as string).length > 0)

    if (fields.length === 0 || (await read($, isOff))) return next(e)

    const words = [...new Set(fields.flatMap(key => slopIn(input[key] as string)))]
    let answer = 'Swap to plain words'

    try {
      answer = await $.ui.ask(`This ${e.tool} uses ${words.length} filler word${words.length === 1 ? '' : 's'}: ${words.join(', ')}.`, {
        options: ['Swap to plain words', 'Keep'],
        header: 'Filler',
      })
    } catch {
      // No one to ask: apply the house style.
    }

    if (answer === 'Keep') return next(e)

    const fixed = { ...input }
    for (const key of fields) fixed[key] = unslop(input[key] as string)

    return next(fixed as typeof e)
}

export const register: Register = on => {
  let rules: string[] | null = null

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: NAME,
      description: 'Your standing style rules: show them, "add <rule>", "reset", "off" or "on"',
      argumentHint: '[add <rule>|reset|off|on]',
    })

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const done = await next(e)

    if (await read($, isOff)) return done

    rules ??= await loadRules($)
    const text = `# House style (the user's standing rules)\n${rules.map(rule => `- ${rule}`).join('\n')}`

    return { sections: [...done.sections, { id: 'house-style:rules', text, scope: 'session' as const }] }
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const fields = fieldsOf(input, e.tool).filter(key => typeof input[key] === 'string' && (input[key] as string).includes(DASH))

    if (fields.length === 0 || (await read($, isOff))) return slopCheck($, e, next)

    const count = fields.reduce((n, key) => n + (input[key] as string).split(DASH).length - 1, 0)
    let answer = 'Replace with commas'

    try {
      answer = await $.ui.ask(`This ${e.tool} writes ${count} em-dash${count === 1 ? '' : 'es'}. Your house style avoids them.`, {
        options: ['Replace with commas', 'Keep'],
        header: 'Em-dash',
      })
    } catch {
      // No one to ask: apply the house style.
    }

    if (answer === 'Keep') return slopCheck($, e, next)

    const fixed = { ...input }
    for (const key of fields) fixed[key] = undash(input[key] as string)

    return slopCheck($, fixed as typeof e, next)
  }).catch(($, e, next) => next(e))


  on('command.run', { command: NAME }, async ($, e) => {
    const arg = e.args.trim()
    const verb = arg.split(/\s+/)[0]?.toLowerCase() ?? ''

    if (verb === 'off' || verb === 'on') {
      await update($, isOff, () => verb === 'off')

      return { text: `House style ${verb === 'off' ? 'off' : 'on'}.` }
    }

    if (verb === 'add' || verb === 'reset') {
      const next = verb === 'reset' ? DEFAULT_RULES : [...(await loadRules($)), arg.slice(3).trim().replace(/^"|"$/g, '')]
      await $.fs.write(await rulesPath($), next.map(rule => `- ${rule}`).join('\n') + '\n')
      rules = next

      return { text: `House style now has ${next.length} rules. They apply from the next request.` }
    }

    const now = await loadRules($)

    return {
      text: [`House style is ${(await read($, isOff)) ? 'off' : 'on'}:`, ...now.map((rule, i) => `  ${i + 1}. ${rule}`), 'Edit ~/.claude/house-style/rules.md, or /house-style add <rule>.'].join('\n'),
    }
  }).catch(($, e, next) => next(e))
}
