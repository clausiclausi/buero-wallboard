import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'wetterleiste',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10 },
} as const

test('Leiste zeigt Kontext-Wetter und Taste, Taste kompaktiert', async ($, on) => {
  let compacted = 0
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      rateLimits: [],
      context: {
        tokens: 465_600,
        window: 1_000_000,
        percent: 47,
        breakdown: { isAutoCompactEnabled: true },
      },
    },
  }))
  on('clock.now', () => ({ value: 1793108393753 }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.compact', () => {
    compacted += 1
    return { skip: 'Test' }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /Bewölkt/ }))?.text).toContain('Bewölkt')
    expect((await ui.find({ type: 'Text', text: /vom Kontext/ }))?.text).toBe('47 % vom Kontext')
    expect((await ui.find({ type: 'Text', text: /465/ }))?.text).toBe('465.6k / 1M')
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'compact' })
  expect(compacted).toBe(1)
  await ui.unmount()
})
