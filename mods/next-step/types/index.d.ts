export type Suggestion = { label: string; prompt: string }

export type Mode = 'smart' | 'free'

declare module 'claude-code' {
  interface PluginState {
    'next-step': {
      suggestions: Suggestion[]
      mode: Mode
      isOff: boolean
      picked: string[]
    }
  }
}
