import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))
vi.mock('./useTrackLyrics', async () => {
  const { ref } = await import('vue')
  const state = {
    status: ref('lrc'),
    rawLyrics: ref<string | null>('頭髮\n看著你'),
    parsedLines: ref([
      { id: 'line-1', timeSeconds: 12.5, text: '頭髮' },
      { id: 'line-2', timeSeconds: 18, text: '看著你' },
    ]),
    activeIndex: ref(0),
  }
  return { useTrackLyrics: () => state }
})
import { useTrackLyrics } from './useTrackLyrics'
import { useDisplayedTrackLyrics } from './useDisplayedTrackLyrics'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'

afterEach(() => {
  const state = useChineseTextDisplay()
  state.setSongInfoScript('simplified')
  state.setLyricsScript('simplified')
  vi.unstubAllGlobals()
})

describe('opt-in lyric display', () => {
  it('changes only text while retaining original lyrics, IDs, timing and activity', () => {
    vi.stubGlobal('localStorage', { setItem: vi.fn() })
    const source = useTrackLyrics()
    const original = structuredClone(source.parsedLines.value.map((line) => ({ ...line })))
    const display = useDisplayedTrackLyrics()
    const preference = useChineseTextDisplay()
    expect(display.rawLyrics.value).toBe('头发\n看着你')
    expect(display.parsedLines.value[0]).toEqual({ id: 'line-1', timeSeconds: 12.5, text: '头发' })
    preference.setSongInfoScript('traditional')
    expect(display.rawLyrics.value).toBe('头发\n看着你')
    preference.setLyricsScript('traditional')
    expect(display.rawLyrics.value).toBe('頭髮\n看著你')
    expect(source.rawLyrics.value).toBe('頭髮\n看著你')
    expect(source.parsedLines.value).toEqual(original)
    expect(display.activeIndex).toBe(source.activeIndex)
    expect(display.parsedLines.value.map(({ id, timeSeconds }) => ({ id, timeSeconds }))).toEqual(
      original.map(({ id, timeSeconds }) => ({ id, timeSeconds })),
    )
  })
})
