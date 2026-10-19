export type Heavy = { tool: string; what: string; tokens: number }

declare module 'claude-code' {
  interface PluginState {
    'context-lens': {
      heavy: Heavy[]
    }
  }
}
