import type { EngineInterface, Register } from 'claude-code'

import type { Snap } from '../types'

const NAME = 'rewind'
const PANE = 'time-machine'
const KEEP = 200
const DIFF_LINES = 12

const timeOfDay = (ms: number) => {
  const at = new Date(ms)
  const hours = at.getHours()

  return `${hours % 12 || 12}:${`${at.getMinutes()}`.padStart(2, '0')}${hours < 12 ? 'am' : 'pm'}`
}

const short = (path: string) => path.split('/').slice(-2).join('/')

const pathOf = (e: Record<string, unknown>) => {
  const path = e.file_path ?? e.notebook_path

  return typeof path === 'string' ? path : null
}

// Lines only in `before` (-) and only in `now` (+); enough to see what a restore would change.
export const diff = (before: string, now: string) => {
  const a = before.split('\n')
  const b = now.split('\n')
  const inA = new Set(a)
  const inB = new Set(b)

  return [...a.filter(line => !inB.has(line)).map(line => `- ${line}`), ...b.filter(line => !inA.has(line)).map(line => `+ ${line}`)]
}

export const byTurn = (snaps: readonly Snap[]) => {
  const turns = new Map<number, Snap[]>()
  for (const snap of snaps) turns.set(snap.turn, [...(turns.get(snap.turn) ?? []), snap])

  return [...turns.entries()].sort((x, y) => y[0] - x[0])
}

// The earliest snapshot of each file in a turn is how the turn found it.
const firstPerFile = (snaps: readonly Snap[]) => {
  const seen = new Map<string, Snap>()
  for (const snap of [...snaps].sort((x, y) => x.n - y.n)) if (!seen.has(snap.path)) seen.set(snap.path, snap)

  return [...seen.values()]
}

// Per-session memory, shared by the hooks below.
const mem: { snaps: Snap[] | null; turn: number; shown: { path: string; lines: string[] } | null; store: string | null } = {
  snaps: null,
  turn: 1,
  shown: null,
  store: null,
}

const storePath = async ($: EngineInterface) => {
  mem.store ??= `${(await $.process.run(['sh', '-c', 'printf %s "$HOME"'])).stdout}/.claude/time-machine/${await $.session.id()}.json`

  return mem.store
}

const load = async ($: EngineInterface) => {
  if (mem.snaps !== null) return mem.snaps
  try {
    mem.snaps = JSON.parse(await $.fs.read(await storePath($))) as Snap[]
  } catch {
    mem.snaps = []
  }
  mem.turn = Math.max(mem.turn, ...mem.snaps.map(snap => snap.turn + 1))

  return mem.snaps
}

const save = async ($: EngineInterface) => {
  await $.fs.write(await storePath($), JSON.stringify((mem.snaps ?? []).slice(-KEEP)))
}

const current = async ($: EngineInterface, path: string) => {
  try {
    return await $.fs.read(path)
  } catch {
    return null
  }
}

const restore = async ($: EngineInterface, snap: Snap) => {
  if (snap.before === null) await $.process.run(['rm', '-f', snap.path])
  else await $.fs.write(snap.path, snap.before)
}

const confirm = async ($: EngineInterface, question: string) => {
  try {
    return (await $.ui.ask(question, { options: ['Restore', 'Cancel'], header: 'Rewind' })) === 'Restore'
  } catch {
    return false
  }
}

export const register: Register = on => {
  Object.assign(mem, { snaps: null, turn: 1, shown: null, store: null })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: NAME,
      description: 'Timeline of the files Claude edited, by turn, with diff and restore; "list" or "clear"',
      argumentHint: '[list|clear]',
    })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const path = pathOf(e as unknown as Record<string, unknown>)

    if ((e.tool === 'Write' || e.tool === 'Edit' || e.tool === 'NotebookEdit') && path !== null) {
      try {
        const all = await load($)
        all.push({ n: (all.at(-1)?.n ?? 0) + 1, turn: mem.turn, tool: e.tool, path, before: await current($, path), at: await $.clock.now() })
        await save($)
        $.ui.invalidate('ui.render')
      } catch (err) {
        $.ui.log(`time-machine: ${String(err)}`)
        // A snapshot that fails never blocks the edit.
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) mem.turn += 1

    return next(e)
  })

  on('command.run', { command: NAME }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const all = await load($)

    if (arg === 'clear') {
      mem.snaps = []
      await save($)

      return { text: 'Time Machine snapshots for this session cleared.' }
    }

    if (arg === 'list' || all.length === 0) {
      if (all.length === 0) return { text: 'No edits recorded yet this session.' }

      return {
        text: byTurn(all)
          .map(([t, rows]) => `Turn ${t} · ${firstPerFile(rows).length} files · ${timeOfDay(rows[0]!.at)}\n${firstPerFile(rows).map(row => `  ${row.before === null ? '+ new ' : ''}${row.path}`).join('\n')}`)
          .join('\n'),
      }
    }

    const opened = await $.ui.open({ id: PANE, title: 'Time Machine', closeOnEscape: true })

    return { text: opened.isPlaced ? 'Time Machine opened.' : 'The pane cannot draw here; use /rewind list.' }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const all = await load($)
    const turns = byTurn(all).slice(0, 8)

    const showDiff = async (snap: Snap) => {
      const now = (await current($, snap.path)) ?? ''
      const lines = snap.before === null ? ['(file was created in this turn)'] : diff(snap.before, now)
      mem.shown = { path: snap.path, lines: lines.length > 0 ? lines : ['(no difference)'] }
      $.ui.invalidate('ui.render')
    }

    const undoFile = async (snap: Snap) => {
      if (!(await confirm($, `Restore ${short(snap.path)} to how it was before turn ${snap.turn}?`))) return
      await restore($, snap)
      $.ui.toast(`Restored ${short(snap.path)}.`)
      $.ui.invalidate('ui.render')
    }

    const undoTurn = async (t: number, rows: Snap[]) => {
      const files = firstPerFile(rows)
      if (!(await confirm($, `Restore ${files.length} files to how they were before turn ${t}?`))) return
      for (const snap of files.reverse()) await restore($, snap)
      $.ui.toast(`Turn ${t} rewound: ${files.length} files restored.`)
      $.ui.invalidate('ui.render')
    }

    return (
      <Box flexDirection="column">
        {turns.length === 0 ? <Text dimColor>No edits yet. Each file Claude edits is saved here first.</Text> : null}
        {turns.map(([t, rows]) => (
          <Box key={`turn-${t}`} flexDirection="column" marginBottom={1}>
            <Box>
              <Text bold>{`Turn ${t} · ${firstPerFile(rows).length} files · ${timeOfDay(rows[0]!.at)} `}</Text>
              <Button key={`undo-${t}`} label="Restore turn" onPress={() => undoTurn(t, rows)} />
            </Box>
            {firstPerFile(rows).map(snap => (
              <Box key={`snap-${snap.n}`}>
                <Text>{`  ${snap.before === null ? '+ ' : ''}${short(snap.path)} `}</Text>
                <Button key={`diff-${snap.n}`} label="Diff" onPress={() => showDiff(snap)} />
                <Button key={`file-${snap.n}`} label="Restore" onPress={() => undoFile(snap)} />
              </Box>
            ))}
          </Box>
        ))}
        {mem.shown === null ? null : (
          <Box flexDirection="column">
            <Text bold>{`Diff: ${short(mem.shown.path)} (- before, + now)`}</Text>
            {mem.shown.lines.slice(0, DIFF_LINES).map((line, i) => (
              <Text key={`d-${i}`} color={line.startsWith('-') ? 'red' : line.startsWith('+') ? 'green' : undefined}>
                {line.slice(0, 100)}
              </Text>
            ))}
            {mem.shown.lines.length > DIFF_LINES ? <Text dimColor>{`…${mem.shown.lines.length - DIFF_LINES} more lines`}</Text> : null}
          </Box>
        )}
      </Box>
    )
  })
}
