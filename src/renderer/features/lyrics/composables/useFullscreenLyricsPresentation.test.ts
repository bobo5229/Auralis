import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, ref, shallowRef } from 'vue'
import type { LyricsStatus } from './useTrackLyrics'
import { useDisplayedTrackLyrics } from './useDisplayedTrackLyrics'
import { useFullscreenLyricsTypography } from './useFullscreenLyricsTypography'
import { useFullscreenLyricsViewport } from './useFullscreenLyricsViewport'
import { useFullscreenLyricsPresentation } from './useFullscreenLyricsPresentation'
import type { LyricLine } from '../types'

vi.mock('./useDisplayedTrackLyrics', () => ({ useDisplayedTrackLyrics: vi.fn() }))
vi.mock('./useFullscreenLyricsTypography', () => ({ useFullscreenLyricsTypography: vi.fn() }))
vi.mock('./useFullscreenLyricsViewport', () => ({
  FULLSCREEN_LYRICS_FADE_TOP_RATIO: 0.07,
  FULLSCREEN_LYRICS_FADE_BOTTOM_RATIO: 0.1,
  FULLSCREEN_LYRICS_ACTIVE_SCALE: 1.23,
  useFullscreenLyricsViewport: vi.fn(),
}))
const seekTo = vi.hoisted(() => vi.fn())
vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: () => ({ seekTo }),
}))
vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))
const cleanups: (() => void)[] = []
beforeEach(() => seekTo.mockClear())
function fixture() {
  const source = {
    status: ref<LyricsStatus>('lrc'),
    rawLyrics: ref<string | null>(null),
    parsedLines: shallowRef<LyricLine[]>([{ id: 'one', timeSeconds: 4, text: '歌词' }]),
    activeIndex: ref(0),
    isPrelude: ref(false),
    showPrelude: ref(false),
    preludeLitDotCount: ref(0),
    preludeElapsed: ref(0),
    loadFailed: ref(false),
  }
  vi.mocked(useDisplayedTrackLyrics).mockReturnValue({
    ...source,
    rawLyrics: computed(() => source.rawLyrics.value),
    parsedLines: computed(() => source.parsedLines.value),
    activeIndex: computed(() => source.activeIndex.value),
    isPrelude: computed(() => source.isPrelude.value),
    showPrelude: computed(() => source.showPrelude.value),
    preludeLitDotCount: computed(() => source.preludeLitDotCount.value),
    preludeElapsed: computed(() => source.preludeElapsed.value),
  })
  const preference = ref({ fontSizePercent: 100, fontWeight: 700, lineGapPercent: 100 })
  vi.mocked(useFullscreenLyricsTypography).mockReturnValue({
    preference,
    style: ref({}),
  } as unknown as ReturnType<typeof useFullscreenLyricsTypography>)
  const refresh = vi.fn(),
    onWheel = vi.fn(),
    onKeydown = vi.fn(),
    pauseAutoFollow = vi.fn()
  vi.mocked(useFullscreenLyricsViewport).mockImplementation((options) => ({
    containerHeight: ref(400),
    renderedLines: computed(() =>
      (options.lines?.value ?? []).map((line, index) => ({ line, index })),
    ),
    topPadding: computed(() => 120),
    bottomPadding: computed(() => 240),
    isUserScrolling: ref(false),
    pauseAutoFollow,
    onWheel,
    onKeydown,
    resetPosition: vi.fn(),
    refresh,
    dispose: vi.fn(),
  }))
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(++id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key))
  const isOpen = ref(true),
    scope = effectScope(),
    currentTrackId = ref<number | null>(1)
  const session = scope.run(() =>
    useFullscreenLyricsPresentation({
      isOpen,
      currentTrackId,
      reducedMotion: ref(false),
      artworkRef: shallowRef(null),
    }),
  )!
  cleanups.push(() => {
    session.dispose()
    scope.stop()
  })
  const flushFrame = () => {
    const callbacks = [...frames.values()]
    frames.clear()
    for (const cb of callbacks) cb(0)
  }
  return { session, source, preference, refresh, frames, isOpen, currentTrackId, flushFrame }
}
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.unstubAllGlobals()
})

describe('useFullscreenLyricsPresentation', () => {
  it('preserves timed lines and blank-line filtering without trimming displayed plain text', async () => {
    const f = fixture()
    expect(f.session.fullscreenLyricLines.value).toBe(f.source.parsedLines.value)
    expect(f.session.wholeLineLyrics.value).toBe(true)
    f.source.status.value = 'plain'
    f.source.rawLyrics.value = '  第一行  \r\n\n  \nSecond line'
    expect(f.session.fullscreenLyricLines.value).toEqual([
      { id: 'plain-0', timeSeconds: 0, text: '  第一行  ' },
      { id: 'plain-1', timeSeconds: 1, text: 'Second line' },
    ])
    expect(f.session.wholeLineLyrics.value).toBe(false)
    f.source.status.value = 'loading'
    expect(f.session.fullscreenLyricLines.value).toEqual([])
    await nextTick()
  })
  it('seeks only timed lines and refreshes after the Vue update', async () => {
    const f = fixture()
    f.session.seekToLyricLine(0)
    expect(seekTo).toHaveBeenCalledWith(4)
    expect(f.refresh).not.toHaveBeenCalled()
    await nextTick()
    expect(f.refresh).toHaveBeenCalledWith('smooth')
    f.source.status.value = 'plain'
    f.source.rawLyrics.value = 'plain'
    f.session.seekToLyricLine(0)
    expect(seekTo).toHaveBeenCalledOnce()
  })
  it('coalesces typography and content layout requests into one frame and cancels on close', async () => {
    const f = fixture()
    f.preference.value.fontSizePercent = 120
    await nextTick()
    expect(f.frames.size).toBe(1)
    f.preference.value.lineGapPercent = 150
    f.source.parsedLines.value = [{ id: 'two', timeSeconds: 8, text: '新歌词' }]
    await nextTick()
    expect(f.frames.size).toBe(1)
    f.flushFrame()
    expect(f.refresh).toHaveBeenCalledOnce()
    expect(f.refresh).toHaveBeenCalledWith('auto', true)
    f.preference.value.fontWeight = 800
    await nextTick()
    f.isOpen.value = false
    expect(f.frames.size).toBe(0)
    f.preference.value.fontSizePercent = 130
    await nextTick()
    expect(f.frames.size).toBe(0)
    f.isOpen.value = true
    f.preference.value.fontSizePercent = 140
    await nextTick()
    expect(f.frames.size).toBe(1)
    f.session.dispose()
    expect(f.frames.size).toBe(0)
  })
})
