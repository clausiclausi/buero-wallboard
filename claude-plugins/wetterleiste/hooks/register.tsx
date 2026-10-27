import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ContextInfo, Weather } from '../types'

const weather = atom({ plugin: 'wetterleiste', key: 'weather' } as const, null)
const context = atom({ plugin: 'wetterleiste', key: 'context' } as const, null)
const history = atom({ plugin: 'wetterleiste', key: 'history' } as const, [])

// Hannover, Hans-Böckler-Allee
const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=52.37&longitude=9.76&current=temperature_2m,weather_code&timezone=Europe%2FBerlin'
const WEATHER_EVERY_MS = 30 * 60 * 1000
const HISTORY_LENGTH = 12
const BARS = '▁▂▃▄▅▆▇█'

function weatherLabel(code: number): string {
  if (code === 0) return 'Sonnig'
  if (code <= 2) return 'Heiter'
  if (code === 3) return 'Bewölkt'
  if (code <= 48) return 'Nebel'
  if (code <= 57) return 'Niesel'
  if (code <= 67) return 'Regen'
  if (code <= 77) return 'Schnee'
  if (code <= 82) return 'Schauer'
  if (code <= 86) return 'Schneeschauer'
  return 'Gewitter'
}

async function refreshWeather($: EngineInterface) {
  try {
    const res = await $.http.fetch(WEATHER_URL)
    if (!res.ok) return
    const data = JSON.parse(res.text)
    const next: Weather = {
      label: weatherLabel(Number(data.current.weather_code)),
      temp: Math.round(Number(data.current.temperature_2m)),
    }
    await update($, weather, () => next)
    await refreshStatus($)
  } catch {
    // Wetterdienst nicht erreichbar: Leiste zeigt dann einfach kein Wetter
  }
}

// Statuszeile unter der Eingabe: Ersatz für Oberflächen ohne Band (Web, Handy)
async function refreshStatus($: EngineInterface) {
  const w = await read($, weather)
  const c = await read($, context)
  const parts: string[] = []
  if (w !== null) parts.push(`☁ ${w.label} ${w.temp}°`)
  if (c !== null) {
    parts.push(`${c.percent} % vom Kontext (${formatTokens(c.tokens)} / ${formatTokens(c.window)})`)
    parts.push(`Auto-Compact: ${c.isAutoCompact ? 'an' : 'aus'}`)
    parts.push(`um ${clockTime(c.at)}`)
  }
  $.ui.status(parts.length > 0 ? parts.join(' · ') : undefined)
}

async function refreshContext($: EngineInterface, isNewTurn: boolean) {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const ctx = usage.context
  if (ctx.tokens === undefined) return
  const next: ContextInfo = {
    tokens: ctx.tokens,
    window: ctx.window,
    percent: ctx.percent ?? Math.round((ctx.tokens / ctx.window) * 100),
    isAutoCompact: ctx.breakdown?.isAutoCompactEnabled ?? true,
    at: await $.clock.now(),
  }
  await update($, context, () => next)
  if (isNewTurn) {
    await update($, history, h => [...h, next.tokens].slice(-HISTORY_LENGTH))
  }
  await refreshStatus($)
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function sparkline(values: readonly number[]): string {
  if (values.length === 0) return ''
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  return values
    .map(v => BARS[Math.round(((v - min) / span) * (BARS.length - 1))])
    .join('')
}

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await refreshWeather($)
    $.clock.every(WEATHER_EVERY_MS, () => refreshWeather($))
    await refreshContext($, false)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refreshContext($, true)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const w = await read($, weather)
    const c = await read($, context)
    const h = await read($, history)
    if (w === null && c === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const [prev, last] = h.slice(-2)
    const delta = prev !== undefined && last !== undefined ? last - prev : null

    return (
      <Box flexDirection="row" gap={1}>
        {w !== null && (
          <Text color="#2a9fd6" bold>
            ☁ {w.label} {w.temp}°
          </Text>
        )}
        {c !== null && (
          <>
            <Text bold>{c.percent} % vom Kontext</Text>
            <Text dimColor>
              {formatTokens(c.tokens)} / {formatTokens(c.window)}
            </Text>
          </>
        )}
        {h.length > 0 && (
          <>
            <Text dimColor>letzte Runden</Text>
            <Text color="#2a9fd6">{sparkline(h)}</Text>
          </>
        )}
        {delta !== null && (
          <Text dimColor>
            {delta >= 0 ? '▲' : '▼'} {delta >= 0 ? '+' : '-'}
            {formatTokens(Math.abs(delta))}
          </Text>
        )}
        {c !== null && (
          <Text inverse> Auto-Compact: {c.isAutoCompact ? 'an' : 'aus'} </Text>
        )}
        {c !== null && <Text dimColor>um {clockTime(c.at)}</Text>}
      </Box>
    )
  })
}
