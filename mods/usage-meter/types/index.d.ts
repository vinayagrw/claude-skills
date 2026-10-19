export type Limit = { kind: string; percentUsed: number; resetsAt: string | null }

export type Reading = {
  tokens: number | null
  window: number
  percent: number | null
  limits: Limit[]
  costUsd: number | null
}

export type TurnCache = { read: number; written: number; uncached: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': {
      reading: Reading | null
      lastTurn: TurnCache | null
      lastResponseAt: number | null
      warned: string[]
      isHidden: boolean
    }
  }
}
