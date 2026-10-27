export type ContextInfo = {
  tokens: number
  window: number
  percent: number
  isAutoCompact: boolean
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    wetterleiste: {
      context: ContextInfo | null
      history: number[]
      isCompacting: boolean
    }
  }
}
