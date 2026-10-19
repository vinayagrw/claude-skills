import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const isCalm = atom({ plugin: 'firstmate-calm', key: 'isCalm' } as const, true)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'calm', description: 'Toggle the quiet transcript and sailboat spinner' })

    return next(e)
  })

  on('command.run', { command: 'calm' }, async $ => {
    const now = await update($, isCalm, was => !was)

    return { text: now ? 'Calm waters: tool rows hidden.' : 'Full view: tool rows shown.' }
  }).catch(($, e, next) => next(e))

  // Running, failed and interrupted calls still show, so nothing that needs you is hidden.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const p = e.props
    const isQuiet = !p.isRunning && !p.isErrored && !p.isInterrupted

    if (!isQuiet || !(await read($, isCalm))) {
      return next(e)
    }

    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.props.isActive || e.props.isExpanded || !(await read($, isCalm))) {
      return next(e)
    }

    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) =>
    (await read($, isCalm)) ? next({ ...e, props: { ...e.props, word: '⛵ Sailing' } }) : next(e),
  )
}
