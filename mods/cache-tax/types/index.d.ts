export type Seen = true

declare module 'claude-code' {
  interface PluginState {
    'cache-tax': {
      lastResponseAt: number | null
      heldAt: number | null
      isOff: boolean
    }
  }
}
