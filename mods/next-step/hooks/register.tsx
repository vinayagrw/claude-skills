import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Mode, Suggestion } from '../types'

const NAME = 'next-step'
const REPLY_CHARS = 4_000
const TIMEOUT_MS = 8_000
const LABEL_CHARS = 28

const suggestions = atom({ plugin: 'next-step', key: 'suggestions' } as const, [])
const mode = atom({ plugin: 'next-step', key: 'mode' } as const, 'smart')
const isOff = atom({ plugin: 'next-step', key: 'isOff' } as const, false)
// Prompts of the ticked options; each one's text is in the prompt box.
const picked = atom({ plugin: 'next-step', key: 'picked' } as const, [])

// The follow-ups typed most often across the audited sessions.
const USUAL = {
  audit: { label: 'Audit gaps', prompt: 'Check the last result against my original ask. List only real gaps, most serious first, then fix them. Skip style nitpicks.' },
  truth: { label: 'Truthiness check', prompt: 'Use a fresh subagent to check every fact and number against its source. Mark each verified, unverified or wrong, with where it looked. Fix the wrong ones.' },
  challenge: { label: 'Challenge approach', prompt: 'Argue against this as a sceptical client, an engineer and a CFO. Give the 3 strongest objections and what you would change. No praise.' },
  visuals: { label: 'More visuals', prompt: 'Turn the densest section into a diagram or table. Cut the text by half and keep every number.' },
  where: { label: 'What changed where', prompt: 'Report as: Changed (file or slide, one line each), Not done, Blocked on me.' },
  simplify: { label: 'Simplify wording', prompt: 'Rewrite for a non-technical manager. Short sentences, no jargon, same meaning.' },
  brief: { label: 'Session brief', prompt: 'Context: <project, client, audience>. Goal: <one line>. Done when: <test>. Use subagents for research and checks. Ask me up to 3 questions first if the goal is unclear, otherwise start.' },
  resume: { label: 'Resume', prompt: 'Pick up where we stopped. In 3 lines: what is done, what is next, anything blocked on me. Then carry on without redoing finished work.' },
} satisfies Record<string, Suggestion>

export const freeSuggestions = (answer: string): Suggestion[] => {
  const text = answer.toLowerCase()
  const picks: Suggestion[] = []
  const has = (...words: string[]) => words.some(word => text.includes(word))

  if (has('slide', 'deck', 'pptx', '.html', 'artifact', 'page', 'diagram')) picks.push(USUAL.visuals, USUAL.where)
  if (has('design', 'architecture', 'approach', 'proposal', 'plan')) picks.push(USUAL.challenge)
  if (has('built', 'created', 'added', 'wrote', 'updated', 'installed', 'done')) picks.push(USUAL.audit, USUAL.truth)
  if (has('how can i help', 'what would you like', 'what are we working on')) picks.unshift(USUAL.brief)
  if (has('limit reached', 'interrupted', 'stopped', 'timed out')) picks.unshift(USUAL.resume)
  picks.push(USUAL.audit, USUAL.truth, USUAL.simplify)

  return [...new Map(picks.map(one => [one.label, one])).values()].slice(0, 3)
}

const ASK = `You suggest the user's next prompt to a coding and pre-sales assistant.
The user ticks one or more suggestions and sends them as they are, so each prompt must stand alone and say what "done" looks like.
Read the assistant's last reply and return ONLY a JSON array of exactly 3 objects {"label": string, "prompt": string}.
label: 2 to 4 words. prompt: one or two short sentences.
Avoid vague asks ("improve it", "make it better"), repeats of work the reply says is done, and praise.
Prefer these habits of this user when they fit: ${Object.values(USUAL).map(one => one.prompt).join(' | ')}
If the reply asks the user a question, make the first suggestion a sensible answer to it.
Example: [{"label":"Fix slide 4 gap","prompt":"Add the missing pricing row to slide 4 and say which source it came from."},{"label":"Truthiness check","prompt":"Use a fresh subagent to check every number on the new slides against its source and fix any that are wrong."},{"label":"What changed where","prompt":"Report as: Changed, Not done, Blocked on me."}]`

export const parseSuggestions = (text: string): Suggestion[] | null => {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')

  if (start < 0 || end <= start) return null

  try {
    const rows: unknown = JSON.parse(text.slice(start, end + 1))

    if (!Array.isArray(rows)) return null

    const picks = rows
      .filter((row): row is Suggestion =>
        typeof row?.label === 'string' && typeof row?.prompt === 'string' && row.prompt.trim() !== '')
      .map(row => ({ label: row.label.trim().slice(0, LABEL_CHARS), prompt: row.prompt.trim() }))
      .slice(0, 3)

    return picks.length > 0 ? picks : null
  } catch {
    return null
  }
}

// The band holds this many options at most; past it the oldest give way.
const MAX_SHOWN = 9

const merge = (kept: readonly Suggestion[], fresh: readonly Suggestion[]) => {
  const seen = new Set(fresh.map(one => one.prompt))

  return [...kept.filter(one => !seen.has(one.prompt)), ...fresh].slice(-MAX_SHOWN)
}

export const register: Register = on => {
  // Counts turns so a slow model answer never overwrites a newer turn's suggestions.
  let generation = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: NAME,
      description: 'Suggested next steps after each reply: "off", "on", "smart" (Haiku) or "free" (no model call)',
      argumentHint: '[off|on|smart|free]',
    })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId !== undefined || e.isAborted || (await read($, isOff))) {
      return done
    }

    const answer = e.answer ?? ''
    const mine = ++generation
    // Options not yet skipped stay; this reply's suggestions are added after them.
    const kept = await read($, suggestions)
    await update($, suggestions, () => merge(kept, freeSuggestions(answer)))
    const shown = new Set((await read($, suggestions)).map(one => one.prompt))
    await update($, picked, now => now.filter(one => shown.has(one)))

    if ((await read($, mode)) === 'smart' && answer.trim() !== '') {
      const reply = await $.model.complete({
        model: 'haiku',
        system: ASK,
        prompt: answer.slice(-REPLY_CHARS),
        maxTokens: 300,
        timeoutMs: TIMEOUT_MS,
      })
      const picks = reply.isAnswered ? parseSuggestions(reply.text) : null

      if (picks !== null && mine === generation) {
        await update($, suggestions, () => merge(kept, picks))
      }
    }

    return done
  })

  on('prompt.submit', async ($, e, next) => {
    // A newer prompt makes any Haiku answer still in flight stale; the band itself stays until Skip.
    generation += 1

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: NAME }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'off' || arg === 'on') {
      await update($, isOff, () => arg === 'off')
      if (arg === 'off') {
        await update($, suggestions, () => [])
        await update($, picked, () => [])
      }

      return { text: `Next-step suggestions ${arg === 'off' ? 'off' : 'on'}.` }
    }

    if (arg === 'smart' || arg === 'free') {
      await update($, mode, () => arg as Mode)

      return {
        text: arg === 'smart'
          ? 'Suggestions now come from one small Haiku call per reply.'
          : 'Suggestions now come from keyword rules, with no model call.',
      }
    }

    const now = await read($, mode)

    return { text: `Next-step is ${(await read($, isOff)) ? 'off' : 'on'}, in ${now} mode. Use /next-step off|on|smart|free.` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const picks = await read($, suggestions)

    if (e.props.hasSurvey || picks.length === 0 || (await read($, isOff))) {
      return below
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const ticked = await read($, picked)

    const append = async (prompt: string) => {
      const { text } = await $.prompt.read()
      await $.prompt.fill({ text: text.trim() === '' ? prompt : `\n${prompt}`, mode: 'append' })
    }

    // Takes the option's own line back out of the box; a line you changed is left alone.
    const remove = async (prompt: string, put = '') => {
      const { text } = await $.prompt.read()
      const lines = text.split('\n')
      const at = lines.indexOf(prompt)

      if (at < 0) return false

      const kept = put === '' ? lines.filter((_, index) => index !== at) : lines.map((line, index) => (index === at ? put : line))
      await $.prompt.fill({ text: kept.join('\n'), mode: 'replace' })

      return true
    }

    const toggle = async (pick: Suggestion) => {
      if (ticked.includes(pick.prompt)) {
        await remove(pick.prompt)
        await update($, picked, now => now.filter(one => one !== pick.prompt))
      } else {
        await append(pick.prompt)
        await update($, picked, now => [...now, pick.prompt])
      }
    }

    const edit = async () => {
      const targets = ticked.length > 0 ? picks.filter(one => ticked.includes(one.prompt)) : picks.slice(0, 1)

      for (const pick of targets) {
        let answer: string

        try {
          answer = (await $.ui.ask(`Edit this next step? Current: "${pick.prompt}"`, { options: ['Keep', 'Remove'], header: 'Edit' })).trim()
        } catch {
          return
        }

        if (answer === 'Keep' || answer === '') continue

        const isTicked = ticked.includes(pick.prompt)

        if (answer === 'Remove') {
          if (isTicked) await remove(pick.prompt)
          await update($, suggestions, now => now.filter(one => one.prompt !== pick.prompt))
          await update($, picked, now => now.filter(one => one !== pick.prompt))
          continue
        }

        const label = answer.split(/\s+/).slice(0, 4).join(' ').slice(0, LABEL_CHARS)
        await update($, suggestions, now => now.map(one => (one.prompt === pick.prompt ? { label, prompt: answer } : one)))

        if (isTicked) {
          await remove(pick.prompt, answer)
          await update($, picked, now => now.map(one => (one === pick.prompt ? answer : one)))
        }
      }
    }

    return (
      <Box flexDirection="column">
        {below}
        <Box flexWrap="wrap">
          <Text dimColor>Next: </Text>
          {picks.map((pick, index) => (
            <Button
              key={`pick-${index}`}
              label={`${ticked.includes(pick.prompt) ? '☑' : '☐'} ${index + 1} ${pick.label}`}
              onPress={() => toggle(pick)}
            />
          ))}
          <Button key="edit" label="✎ Edit" onPress={edit} />
          <Button
            key="skip"
            label="✕ Skip"
            onPress={async () => {
              await update($, suggestions, () => [])
              await update($, picked, () => [])
            }}
          />
        </Box>
      </Box>
    )
  })
}
