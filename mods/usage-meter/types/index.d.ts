export type Limit = { kind: string; percentUsed: number; resetsAt: string | null }

export type Reading = {
  tokens: number | null
  window: number
  percent: number | null
  limits: Limit[]
  costUsd: number | null
}

export type TurnCache = { read: number; written: number; uncached: number }

// Tokens one agent loop has used this session; 'main' is the main chat.
export type AgentRow = {
  label: string
  isWorkflow: boolean
  turns: number
  read: number
  written: number
  uncached: number
  output: number
  runId?: string
  isBackground?: boolean
  model?: string
  lastInput?: number
  costUsd?: number
  unpriced?: true
}

export type Tally = { calls: number; tokens: number }

export type SlowTurn = { label: string; ms: number; tokens: number }

export type Misfires = { turns: number; tokens: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': {
      reading: Reading | null
      lastTurn: TurnCache | null
      lastResponseAt: number | null
      warned: string[]
      isHidden: boolean
      agents: Record<string, AgentRow>
      tools: Record<string, Tally>
      models: Record<string, Tally>
      slowest: SlowTurn[]
      failed: Misfires
    }
  }
}
