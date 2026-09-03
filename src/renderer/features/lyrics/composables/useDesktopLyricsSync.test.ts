import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, ref } from 'vue'

const mockPlaybackState = reactive({
  currentTrackId: null as number | null,
  currentTrack: null as { id: number; title: string | null; artist: string | null } | null,
  isPlaying: false,
})

const mockLyricsState = {
  status: ref<'no-track' | 'loading' | 'empty' | 'plain' | 'lrc'>('no-track'),
  rawLyrics: ref<string | null>(null),
  parsedLines: ref<{ id: string; text: string; timeSeconds?: number }[]>([]),
  activeIndex: ref<number>(-1),
  showPrelude: ref<boolean>(false),
  preludeLitDotCount: ref<number>(0),
}

const mockVisibilityListeners: ((visible: boolean) => void)[] = []
const mockPassthroughListeners: ((enabled: boolean) => void)[] = []
const mockDisplayMode = ref<'normal' | 'fullscreen' | 'mini'>('normal')

const mockDesktopLyricsApi = {
  toggle: vi.fn(),
  isVisible: vi.fn(),
  setSuppressed: vi.fn().mockResolvedValue({ ok: true }),
  toggleMousePassthrough: vi.fn(),
  isMousePassthroughEnabled: vi.fn(),
  update: vi.fn(),
  onVisibilityChanged: vi.fn((cb: (visible: boolean) => void) => {
    mockVisibilityListeners.push(cb)
    return () => {
      const idx = mockVisibilityListeners.indexOf(cb)
      if (idx >= 0) mockVisibilityListeners.splice(idx, 1)
    }
  }),
  onMousePassthroughChanged: vi.fn((cb: (enabled: boolean) => void) => {
    mockPassthroughListeners.push(cb)
    return () => {
      const idx = mockPassthroughListeners.indexOf(cb)
      if (idx >= 0) mockPassthroughListeners.splice(idx, 1)
    }
  }),
  ready: vi.fn(),
}

const mockEnsureDesktopLyricsFontReady = vi.fn(() => Promise.resolve())

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => `i18n:${key}`,
  }),
}))

vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: {
    desktopLyrics: mockDesktopLyricsApi,
  },
}))

vi.mock('@renderer/features/playback/composables/usePlayerDisplayMode', () => ({
  usePlayerDisplayMode: () => ({
    displayMode: mockDisplayMode,
  }),
}))

vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: () => ({
    state: mockPlaybackState,
  }),
}))

vi.mock('./useTrackLyrics', () => ({
  useTrackLyrics: () => mockLyricsState,
}))

vi.mock('../utils/formatDesktopLyricsText', () => ({
  ensureDesktopLyricsFontReady: () => mockEnsureDesktopLyricsFontReady(),
  formatDesktopLyricsText: (v: string) => v,
}))

describe('useDesktopLyricsSync', () => {
  let useDesktopLyricsSyncModule: typeof import('./useDesktopLyricsSync')

  beforeEach(async () => {
    vi.resetModules()
    mockVisibilityListeners.length = 0
    mockPassthroughListeners.length = 0
    vi.clearAllMocks()

    mockEnsureDesktopLyricsFontReady.mockReturnValue(Promise.resolve())

    mockPlaybackState.currentTrackId = null
    mockPlaybackState.currentTrack = null
    mockPlaybackState.isPlaying = false

    mockLyricsState.status.value = 'no-track'
    mockLyricsState.rawLyrics.value = null
    mockLyricsState.parsedLines.value = []
    mockLyricsState.activeIndex.value = -1
    mockLyricsState.showPrelude.value = false
    mockLyricsState.preludeLitDotCount.value = 0

    mockDesktopLyricsApi.isVisible.mockResolvedValue({ visible: false })
    mockDesktopLyricsApi.isMousePassthroughEnabled.mockResolvedValue({ enabled: true })
    mockDesktopLyricsApi.toggle.mockResolvedValue({ visible: true })
    mockDesktopLyricsApi.toggleMousePassthrough.mockResolvedValue({ enabled: false })
    mockDesktopLyricsApi.update.mockResolvedValue({ ok: true })
    mockDesktopLyricsApi.setSuppressed.mockResolvedValue({ ok: true })
    mockDisplayMode.value = 'normal'

    useDesktopLyricsSyncModule = await import('./useDesktopLyricsSync')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not update IPC when not visible and not forced', async () => {
    const { isVisible, syncDesktopLyrics } = useDesktopLyricsSyncModule.useDesktopLyricsSync()
    isVisible.value = false

    syncDesktopLyrics(false)
    expect(mockDesktopLyricsApi.update).not.toHaveBeenCalled()
  })

  it('updates IPC when visible and skips duplicate payload keys', async () => {
    const { isVisible, syncDesktopLyrics } = useDesktopLyricsSyncModule.useDesktopLyricsSync()
    isVisible.value = true

    mockPlaybackState.currentTrackId = 1
    mockPlaybackState.currentTrack = { id: 1, title: 'Song 1', artist: 'Artist 1' }
    mockLyricsState.status.value = 'plain'
    mockLyricsState.rawLyrics.value = 'Line A\nLine B'

    syncDesktopLyrics()
    expect(mockDesktopLyricsApi.update).toHaveBeenCalledTimes(1)
    expect(mockDesktopLyricsApi.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        trackId: 1,
        title: 'Song 1',
        artist: 'Artist 1',
        currentLine: 'Line A',
        nextLine: 'Line B',
        status: 'plain',
        isPlaying: false,
      }),
    )

    // Calling sync again with same state should skip update
    syncDesktopLyrics()
    expect(mockDesktopLyricsApi.update).toHaveBeenCalledTimes(1)

    // Changing lyrics line triggers update
    mockLyricsState.rawLyrics.value = 'Line C\nLine D'
    syncDesktopLyrics()
    expect(mockDesktopLyricsApi.update).toHaveBeenCalledTimes(2)
    expect(mockDesktopLyricsApi.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        currentLine: 'Line C',
        nextLine: 'Line D',
      }),
    )
  })

  it('forces update even when invisible or key is unchanged if force is true', async () => {
    const { isVisible, syncDesktopLyrics } = useDesktopLyricsSyncModule.useDesktopLyricsSync()
    isVisible.value = false

    mockPlaybackState.currentTrackId = 1
    mockPlaybackState.currentTrack = { id: 1, title: 'Song 1', artist: 'Artist 1' }
    mockLyricsState.status.value = 'plain'
    mockLyricsState.rawLyrics.value = 'Line A\nLine B'

    syncDesktopLyrics(true)
    expect(mockDesktopLyricsApi.update).toHaveBeenCalledTimes(1)

    // Force again with same state
    syncDesktopLyrics(true)
    expect(mockDesktopLyricsApi.update).toHaveBeenCalledTimes(2)
  })

  it('subscribes to visibility and passthrough once and does not duplicate on second useDesktopLyricsSync call', async () => {
    const firstCall = useDesktopLyricsSyncModule.useDesktopLyricsSync()
    expect(mockDesktopLyricsApi.onVisibilityChanged).toHaveBeenCalledTimes(1)
    expect(mockDesktopLyricsApi.onMousePassthroughChanged).toHaveBeenCalledTimes(1)

    const secondCall = useDesktopLyricsSyncModule.useDesktopLyricsSync()
    expect(mockDesktopLyricsApi.onVisibilityChanged).toHaveBeenCalledTimes(1)
    expect(mockDesktopLyricsApi.onMousePassthroughChanged).toHaveBeenCalledTimes(1)

    expect(firstCall.isVisible).toBe(secondCall.isVisible)
    expect(firstCall.isMousePassthroughEnabled).toBe(secondCall.isMousePassthroughEnabled)
  })

  it('updates visibility and triggers sync on visibility change event', async () => {
    const { isVisible } = useDesktopLyricsSyncModule.useDesktopLyricsSync()
    await nextTick()

    expect(mockVisibilityListeners.length).toBe(1)

    mockPlaybackState.currentTrackId = 10
    mockPlaybackState.currentTrack = { id: 10, title: 'Track 10', artist: 'Artist 10' }
    mockLyricsState.status.value = 'loading'

    // Trigger onVisibilityChanged listener with visible = true
    mockVisibilityListeners[0](true)
    expect(isVisible.value).toBe(true)
    expect(mockDesktopLyricsApi.update).toHaveBeenCalledWith(
      expect.objectContaining({
        trackId: 10,
        currentLine: 'i18n:player.lyricsLoading',
        status: 'loading',
      }),
    )
  })

  it('updates mouse passthrough on passthrough change event', async () => {
    const { isMousePassthroughEnabled } = useDesktopLyricsSyncModule.useDesktopLyricsSync()
    await nextTick()

    expect(mockPassthroughListeners.length).toBe(1)
    mockPassthroughListeners[0](false)
    expect(isMousePassthroughEnabled.value).toBe(false)
  })

  it('toggle calls desktopLyrics.toggle and syncs when became visible', async () => {
    const { toggle } = useDesktopLyricsSyncModule.useDesktopLyricsSync()
    mockDesktopLyricsApi.toggle.mockResolvedValueOnce({ visible: true })

    const res = await toggle()
    expect(res.visible).toBe(true)
    expect(mockDesktopLyricsApi.update).toHaveBeenCalled()
  })

  it('toggleMousePassthrough calls desktopLyrics.toggleMousePassthrough', async () => {
    const { toggleMousePassthrough, isMousePassthroughEnabled } =
      useDesktopLyricsSyncModule.useDesktopLyricsSync()
    mockDesktopLyricsApi.toggleMousePassthrough.mockResolvedValueOnce({ enabled: false })

    const res = await toggleMousePassthrough()
    expect(res.enabled).toBe(false)
    expect(isMousePassthroughEnabled.value).toBe(false)
  })

  it('suppresses desktop lyrics in fullscreen mode and restores when leaving fullscreen', async () => {
    useDesktopLyricsSyncModule.useDesktopLyricsSync()
    expect(mockDesktopLyricsApi.setSuppressed).toHaveBeenCalledWith(false)

    mockDisplayMode.value = 'fullscreen'
    await nextTick()
    expect(mockDesktopLyricsApi.setSuppressed).toHaveBeenCalledWith(true)

    mockDisplayMode.value = 'normal'
    await nextTick()
    expect(mockDesktopLyricsApi.setSuppressed).toHaveBeenCalledWith(false)
  })
})
