export type Range = { from: number; to: number; label: string }

declare module 'claude-code' {
  interface PluginState {
    'token-insights': Record<string, never>
  }
}
