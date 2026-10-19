import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const NAME = 'cache-tax'
// The engine does not tell a hook the prompt cache's lifetime; these sessions use the one-hour cache.
const CACHE_MS = 60 * 60_000
const MIN_TOKENS = 50_000
// One-hour cache writes are billed at twice the base input price; $5 per million is the Opus base.
const WRITE_USD_PER_M = 10
// A held prompt sent again within this window goes through.
const CONFIRM_MS = 5 * 60_000

const lastResponseAt = atom({ plugin: 'cache-tax', key: 'lastResponseAt' } as const, null)
const heldAt = atom({ plugin: 'cache-tax', key: 'heldAt' } as const, null)
const isOff = atom({ plugin: 'cache-tax', key: 'isOff' } as const, false)

const tokens = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

const span = (ms: number) => {
  const minutes = Math.round(ms / 60_000)

  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: NAME,
      description: 'Hold the first prompt after the prompt cache goes cold; "off" or "on"',
      argumentHint: '[off|on]',
    })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const at = await $.clock.now()
      await update($, lastResponseAt, () => at)
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const isUser = e.origin?.kind !== 'plugin'

    if (!isUser || e.turnId !== undefined || (await read($, isOff))) {
      return next(e)
    }

    const at = await read($, lastResponseAt)
    const now = await $.clock.now()
    const idle = at === null ? 0 : now - at

    if (idle <= CACHE_MS) {
      return next(e)
    }

    const held = await read($, heldAt)

    if (held !== null && now - held <= CONFIRM_MS) {
      await update($, heldAt, () => null)

      return next(e)
    }

    const usage = await $.session.usage()
    const size = usage.context.tokens ?? 0

    if (size < MIN_TOKENS) {
      return next(e)
    }

    await update($, heldAt, () => now)
    const usd = ((size / 1_000_000) * WRITE_USD_PER_M).toFixed(2)
    // The engine keeps a dropped prompt's text in the box, so Enter again sends it.
    await $.prompt.fill({ text: e.text, mode: 'replace' })

    return {
      drop: `Cache is cold (idle ${span(idle)}). This prompt re-sends ~${tokens(size)} tokens uncached, about $${usd}. Press Enter again to send, or run /compact first.`,
    }
  }).catch(($, e, next) => next(e))

  on('command.run', { command: NAME }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'off' || arg === 'on') {
      await update($, isOff, () => arg === 'off')

      return { text: arg === 'off' ? 'Cache tax is off.' : 'Cache tax is on.' }
    }

    const at = await read($, lastResponseAt)
    const left = at === null ? null : at + CACHE_MS - (await $.clock.now())

    return {
      text:
        left === null
          ? 'No reply yet this session.'
          : left > 0
            ? `Cache warm for about ${span(left)} more.`
            : `Cache went cold ${span(-left)} ago; the next prompt will be held once.`,
    }
  }).catch(($, e, next) => next(e))
}
