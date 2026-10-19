export type Seen = true

declare module 'claude-code' {
  interface PluginState {
    'firstmate-calm': {
      isCalm: boolean
    }
  }
}
