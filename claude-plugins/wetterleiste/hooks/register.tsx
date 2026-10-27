import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ContextInfo } from '../types'

const context = atom({ plugin: 'wetterleiste', key: 'context' } as const, null)
const history = atom({ plugin: 'wetterleiste', key: 'history' } as const, [])
const isCompacting = atom({ plugin: 'wetterleiste', key: 'isCompacting' } as const, false)

const HISTORY_LENGTH = 12
const BARS = '▁▂▃▄▅▆▇█'
// Das "Wetter" ist die Kontext-Auslastung: je voller, desto stürmischer
function contextWeather(percent: number): { icon: string; label: string; color: string } {
  if (percent < 25) return { icon: '☀', label: 'Sonnig', color: '#e0a800' }
  if (percent < 45) return { icon: '⛅', label: 'Heiter', color: '#2a9fd6' }
  if (percent < 65) return { icon: '☁', label: 'Bewölkt', color: '#2a9fd6' }
  if (percent < 80) return { icon: '🌧', label: 'Regnerisch', color: '#e07b00' }
  return { icon: '⛈', label: 'Gewitter', color: '#d9534f' }
}

async function refreshStatus($: EngineInterface) {
  const c = await read($, context)
  if (c === null) return $.ui.status(undefined)
  const w = contextWeather(c.percent)
  $.ui.status(
    `${w.icon} ${w.label} · ${c.percent} % vom Kontext (${formatTokens(c.tokens)} / ${formatTokens(c.window)}) · Auto-Compact: ${c.isAutoCompact ? 'an' : 'aus'} · um ${clockTime(c.at)}`,
  )
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

async function compactNow($: EngineInterface) {
  if (await read($, isCompacting)) return
  await update($, isCompacting, () => true)
  try {
    const result = await $.session.compact()
    if (result.skip !== undefined) {
      $.ui.toast(`Kompaktieren übersprungen: ${result.skip}`)
    } else {
      $.ui.toast('Kontext kompaktiert')
      await update($, history, () => [])
      await update($, context, () => null)
    }
  } catch {
    $.ui.toast('Kompaktieren geht erst, wenn Claude mit der Antwort fertig ist')
  } finally {
    await update($, isCompacting, () => false)
  }
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

    const c = await read($, context)
    const hist = await read($, history)
    const busy = await read($, isCompacting)
    const { Box, Button, Text } = $.ui.resolve(e)

    if (c === null) {
      return (
        <Box flexDirection="row" gap={1}>
          <Text dimColor>☀ Kontext wird nach der nächsten Antwort gemessen</Text>
        </Box>
      )
    }

    const w = contextWeather(c.percent)
    const [prev, last] = hist.slice(-2)
    const delta = prev !== undefined && last !== undefined ? last - prev : null

    return (
      <Box flexDirection="row" gap={1}>
        <Text color={w.color} bold>
          {w.icon} {w.label}
        </Text>
        <Text bold>{c.percent} % vom Kontext</Text>
        <Text dimColor>
          {formatTokens(c.tokens)} / {formatTokens(c.window)}
        </Text>
        {hist.length > 0 && (
          <>
            <Text dimColor>letzte Runden</Text>
            <Text color={w.color}>{sparkline(hist)}</Text>
          </>
        )}
        {delta !== null && (
          <Text dimColor>
            {delta >= 0 ? '▲ +' : '▼ -'}
            {formatTokens(Math.abs(delta))}
          </Text>
        )}
        <Text inverse> Auto-Compact: {c.isAutoCompact ? 'an' : 'aus'} </Text>
        <Button
          key="compact"
          label={busy ? 'Kompaktiere …' : 'Jetzt kompaktieren'}
          variant={c.percent >= 65 ? 'primary' : 'secondary'}
          dimColor={e.props.isWorking || busy}
          onPress={() => compactNow($)}
        />
        <Text dimColor>um {clockTime(c.at)}</Text>
      </Box>
    )
  })
}
