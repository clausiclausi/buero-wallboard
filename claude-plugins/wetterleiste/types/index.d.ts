export type Weather = { label: string; temp: number }
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
      weather: Weather | null
      context: ContextInfo | null
      history: number[]
    }
  }
}
