import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuralisApi } from '@shared/ipc/api'
import type { PlaybackTrack } from '../types'

type MockGaplessOptions = {
  onCurrentEnded: (nextTrackId: number | null) => void
  onPlaybackStateChange: (isPlaying: boolean) => void
  onTimeUpdate: (snapshot: { currentTime: number; duration: number }) => void
}

vi.mock('../audio/gaplessAudioEngine', () => ({
  GaplessAudioEngine: class {
    private active = false
    private playing = false
    private readonly options: MockGaplessOptions

    constructor(options: MockGaplessOptions) {
      this.options = options
    }

    get isActive(): boolean {
      return this.active
    }

    getSnapshot(): { currentTime: number; duration: number; isPlaying: boolean } {
      return { currentTime: 0, duration: 180, isPlaying: this.playing }
    }

    setVolume(): void {}

    async start(): Promise<boolean> {
      this.active = true
      this.playing = true
      this.options.onPlaybackStateChange(true)
      return true
    }

    async scheduleNext(): Promise<boolean> {
      return false
    }

    async play(): Promise<void> {
      if (!this.active) return
      this.playing = true
      this.options.onPlaybackStateChange(true)
    }

    pause(): void {
      this.playing = false
      this.options.onPlaybackStateChange(false)
    }

    cancel(): void {
      this.active = false
      this.playing = false
    }

    cancelScheduledNext(): void {}

    async seek(): Promise<void> {}

    destroy(): void {
      this.active = false
      this.playing = false
    }
  },
}))

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => undefined
  let rejectPromise: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
  }
}

class TestAudio {
  static latest: TestAudio | null = null

  private readonly listeners = new Map<string, Set<() => void>>()
  private currentSrc = ''
  private playImplementation: () => Promise<void> = async () => {
    this.paused = false
    this.dispatch('play')
  }

  paused = true
  ended = false
  readyState = 0
  networkState = 0
  currentTime = 0
  duration = 0
  volume = 1
  muted = false
  error: MediaError | null = null
  playCalls = 0

  constructor() {
    TestAudio.latest = this
  }

  get src(): string {
    return this.currentSrc
  }

  set src(value: string) {
    this.currentSrc = value
    this.ended = false
    this.error = null
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener()
  }

  setPlayImplementation(implementation: () => Promise<void>): void {
    this.playImplementation = implementation
  }

  play(): Promise<void> {
    this.playCalls += 1
    return this.playImplementation()
  }

  pause(): void {
    this.paused = true
    this.dispatch('pause')
  }

  load(): void {
    this.currentTime = 0
    this.duration = 0
    this.readyState = 0
  }

  removeAttribute(name: string): void {
    if (name === 'src') this.currentSrc = ''
  }
}

type WindowHarness = {
  auralis: AuralisApi
  addEventListener: (type: string, listener: () => void, options?: { once?: boolean }) => void
  removeEventListener: (type: string, listener: () => void) => void
  dispatch: (type: string) => void
}

let windowHarness: WindowHarness
let api: AuralisApi
let gaplessEnabled = false
let libraryChangedListener:
  | ((event: { reason: string; trackIds: number[]; filePaths: string[] }) => void)
  | undefined

function createApi(): AuralisApi {
  return {
    database: {
      exportBackup: vi.fn(),
      restoreBackup: vi.fn(),
    },
    app: {
      getInfo: vi.fn(),
      exportDiagnostics: vi.fn(),
      rendererReady: vi.fn(),
    },
    library: {
      getStats: vi.fn(),
      selectRoot: vi.fn(),
      getRoots: vi.fn(),
      startScan: vi.fn(),
      cancelScan: vi.fn(),
      getScanStatus: vi.fn(),
      getTracks: vi.fn(),
      getTrackPage: vi.fn(),
      onScanProgress: vi.fn(),
      onChanged: vi.fn((listener) => {
        libraryChangedListener = listener
        return () => {
          if (libraryChangedListener === listener) libraryChangedListener = undefined
        }
      }),
    },
    smartPlaylists: {
      list: vi.fn(),
      listTrackCounts: vi.fn(),
      getDetail: vi.fn(),
      create: vi.fn(),
      createFromQuery: vi.fn(),
      rename: vi.fn(),
      updateViewMode: vi.fn(),
      delete: vi.fn(),
      reorder: vi.fn(),
    },
    playlists: {
      list: vi.fn(),
      listTrackCounts: vi.fn(),
      listSidebarItems: vi.fn(),
      getDetail: vi.fn(),
      create: vi.fn(),
      rename: vi.fn(),
      updateViewMode: vi.fn(),
      delete: vi.fn(),
      addTracks: vi.fn(),
      reorderSidebarItems: vi.fn(),
    },
    lyrics: {
      getByTrackId: vi.fn(),
    },
    playback: {
      getAudioUrl: vi.fn(async (trackId: number) => ({ url: `audio://${trackId}` })),
      getRandomTrack: vi.fn(),
      getRandomAlbumTracks: vi.fn(),
      getAlbumTracks: vi.fn(),
      recordEffectivePlay: vi.fn(async () => ({ ok: true, recorded: false })),
    },
    systemMedia: {
      updateThumbarState: vi.fn(),
      onCommand: vi.fn(),
    },
    desktopLyrics: {
      toggle: vi.fn(),
      isVisible: vi.fn(),
      setSuppressed: vi.fn(),
      toggleMousePassthrough: vi.fn(),
      isMousePassthroughEnabled: vi.fn(),
      update: vi.fn(),
      onUpdate: vi.fn(),
      onVisibilityChanged: vi.fn(),
      onMousePassthroughChanged: vi.fn(),
      ready: vi.fn(),
    },
    archive: {
      getListeningHeatmap: vi.fn(),
      getDailyListeningDetail: vi.fn(),
      getAnnualListeningInsights: vi.fn(),
      getListeningRanking: vi.fn(),
      getListeningGenreSpectrum: vi.fn(),
      resetPlayStats: vi.fn(),
    },
    metadata: {
      refreshTrack: vi.fn(),
      refreshTracks: vi.fn(),
      refreshMissing: vi.fn(),
      refreshLyricsMissing: vi.fn(),
      getRefreshStatus: vi.fn(),
      listRefreshFailures: vi.fn(),
      clearRefreshFailures: vi.fn(),
      getTrackMetadata: vi.fn(),
      updateTrackMetadata: vi.fn(),
      onRefreshProgress: vi.fn(),
    },
    window: {
      enterMiniPlayer: vi.fn(),
      restoreFromMiniPlayer: vi.fn(),
      getMiniPlayerState: vi.fn(),
      setMiniPlayerPopover: vi.fn(),
      onMiniPlayerStateChanged: vi.fn(),
    },
  }
}

function installBrowserHarness(): void {
  api = createApi()
  const listeners = new Map<string, Set<{ listener: () => void; once: boolean }>>()
  windowHarness = {
    auralis: api,
    addEventListener: (type, listener, options) => {
      const entries = listeners.get(type) ?? new Set()
      entries.add({ listener, once: options?.once === true })
      listeners.set(type, entries)
    },
    removeEventListener: (type, listener) => {
      const entries = listeners.get(type)
      if (!entries) return
      for (const entry of entries) {
        if (entry.listener === listener) entries.delete(entry)
      }
    },
    dispatch: (type) => {
      const entries = listeners.get(type)
      if (!entries) return
      for (const entry of [...entries]) {
        entry.listener()
        if (entry.once) entries.delete(entry)
      }
    },
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: windowHarness,
  })
  Object.defineProperty(globalThis, 'Audio', {
    configurable: true,
    value: TestAudio,
  })
  Object.defineProperty(globalThis, 'MediaError', {
    configurable: true,
    value: {
      MEDIA_ERR_ABORTED: 1,
      MEDIA_ERR_NETWORK: 2,
      MEDIA_ERR_DECODE: 3,
      MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
    },
  })
  Object.defineProperty(globalThis, 'HTMLMediaElement', {
    configurable: true,
    value: { HAVE_CURRENT_DATA: 2 },
  })
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) =>
        key === 'auralis-gapless-playback-enabled' ? String(gaplessEnabled) : null,
      ),
      setItem: vi.fn(),
    },
  })
}

async function loadPlayback() {
  vi.resetModules()
  return (await import('./usePlayback')).usePlayback()
}

function track(id: number): PlaybackTrack {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    durationSeconds: 180,
    artworkCacheKey: null,
  }
}

afterEach(() => {
  windowHarness?.dispatch('beforeunload')
  gaplessEnabled = false
  vi.restoreAllMocks()
})

describe('usePlayback foreground request state', () => {
  beforeEach(() => {
    installBrowserHarness()
  })

  it('returns the same singleton public API for repeated calls', async () => {
    vi.resetModules()
    const { usePlayback } = await import('./usePlayback')

    const first = usePlayback()
    const second = usePlayback()

    expect(second).toBe(first)
  })

  it('does not invoke playback while there is no current track', async () => {
    const playback = await loadPlayback()

    await playback.togglePlayPause()

    expect(api.playback.getAudioUrl).not.toHaveBeenCalled()
    expect(playback.isPlaybackPending.value).toBe(false)
  })

  it('keeps pending for the newer track when an older URL request resolves late', async () => {
    const firstUrl = deferred<{ url: string }>()
    const secondUrl = deferred<{ url: string }>()
    vi.mocked(api.playback.getAudioUrl)
      .mockImplementationOnce(() => firstUrl.promise)
      .mockImplementationOnce(() => secondUrl.promise)
    const playback = await loadPlayback()
    const firstRequest = playback.playTrackFromQueue([track(1)], 1)
    expect(playback.isPlaybackPending.value).toBe(true)

    const secondRequest = playback.playTrackFromQueue([track(2)], 2)
    expect(playback.isPlaybackPending.value).toBe(true)

    firstUrl.resolve({ url: 'audio://1' })
    await flushPromises()
    expect(playback.isPlaybackPending.value).toBe(true)

    secondUrl.resolve({ url: 'audio://2' })
    await Promise.all([firstRequest, secondRequest])

    expect(playback.state.currentTrackId).toBe(2)
    expect(TestAudio.latest?.src).toBe('audio://2')
    expect(playback.isPlaybackPending.value).toBe(false)
  })

  it('does not mark a background gapless next-track prefetch as pending', async () => {
    gaplessEnabled = true
    const nextUrl = deferred<{ url: string }>()
    vi.mocked(api.playback.getAudioUrl)
      .mockResolvedValueOnce({ url: 'audio://1' })
      .mockReturnValueOnce(nextUrl.promise)
    const playback = await loadPlayback()

    await playback.playTrackFromQueue([track(1), track(2)], 1)
    await flushPromises()

    expect(api.playback.getAudioUrl).toHaveBeenLastCalledWith(2)
    expect(playback.isPlaybackPending.value).toBe(false)

    nextUrl.resolve({ url: 'audio://2' })
    await flushPromises()
  })

  it('clears pending after a successful HTMLAudio start and after a rejection', async () => {
    const playback = await loadPlayback()
    const audio = TestAudio.latest!

    const success = playback.playTrackFromQueue([track(1)], 1)
    expect(playback.isPlaybackPending.value).toBe(true)
    await success
    expect(playback.isPlaybackPending.value).toBe(false)
    expect(playback.state.isPlaying).toBe(true)

    await playback.togglePlayPause()
    audio.setPlayImplementation(async () => {
      throw new Error('playback rejected')
    })
    const retry = playback.togglePlayPause()
    expect(playback.isPlaybackPending.value).toBe(true)
    await retry

    expect(playback.isPlaybackPending.value).toBe(false)
    expect(playback.state.isPlaying).toBe(false)
    expect(playback.state.error).toBe('playback rejected')
  })

  it('reloads the current track after URL resolution fails instead of playing a stale source', async () => {
    const playback = await loadPlayback()
    const audio = TestAudio.latest!

    await playback.playTrackFromQueue([track(1)], 1)
    expect(audio.src).toBe('audio://1')

    vi.mocked(api.playback.getAudioUrl).mockRejectedValueOnce(new Error('missing audio'))
    await playback.playTrackFromQueue([track(2)], 2)

    expect(audio.src).toBe('')
    expect(playback.state.currentTrackId).toBe(2)
    expect(playback.state.error).toBe('missing audio')
    expect(playback.isPlaybackPending.value).toBe(false)

    vi.mocked(api.playback.getAudioUrl).mockResolvedValueOnce({ url: 'audio://2-retry' })
    await playback.togglePlayPause()

    expect(audio.src).toBe('audio://2-retry')
    expect(audio.playCalls).toBe(2)
    expect(playback.state.isPlaying).toBe(true)
  })

  it('invalidates pending when the current track is removed', async () => {
    const url = deferred<{ url: string }>()
    vi.mocked(api.playback.getAudioUrl).mockReturnValueOnce(url.promise)
    const playback = await loadPlayback()
    const request = playback.playTrackFromQueue([track(1)], 1)

    libraryChangedListener?.({ reason: 'track-missing', trackIds: [1], filePaths: [] })
    expect(playback.state.currentTrack).toBeNull()
    expect(playback.isPlaybackPending.value).toBe(false)

    url.resolve({ url: 'audio://1' })
    await request
    expect(playback.isPlaybackPending.value).toBe(false)
  })

  it('clears pending when the playback instance is disposed', async () => {
    const url = deferred<{ url: string }>()
    vi.mocked(api.playback.getAudioUrl).mockReturnValueOnce(url.promise)
    const playback = await loadPlayback()
    const request = playback.playTrackFromQueue([track(1)], 1)

    windowHarness.dispatch('beforeunload')
    expect(playback.isPlaybackPending.value).toBe(false)

    url.resolve({ url: 'audio://1' })
    await request
    expect(playback.isPlaybackPending.value).toBe(false)
  })
})

describe('usePlayback mode navigation & characterization frozen semantics', () => {
  beforeEach(() => {
    installBrowserHarness()
  })

  it('sequential mode: manual next stops at end without error, ended stops and resets time', async () => {
    const playback = await loadPlayback()
    const audio = TestAudio.latest!
    await playback.playTrackFromQueue([track(1), track(2)], 2)
    expect(playback.state.currentTrackId).toBe(2)

    // Manual next at end of queue
    await playback.playNext()
    expect(playback.state.currentTrackId).toBe(2)
    expect(playback.state.isPlaying).toBe(true)

    // Natural ended at end of queue
    audio.currentTime = 180
    audio.dispatch('ended')
    await flushPromises()

    expect(playback.state.isPlaying).toBe(false)
    expect(playback.state.currentTime).toBe(0)
  })

  it('repeat-all mode: manual next and natural ended wrap to first track', async () => {
    const playback = await loadPlayback()
    const audio = TestAudio.latest!
    playback.setPlaybackMode('repeat-all')
    await playback.playTrackFromQueue([track(1), track(2)], 2)

    await playback.playNext()
    expect(playback.state.currentTrackId).toBe(1)

    audio.dispatch('ended')
    await flushPromises()
    expect(playback.state.currentTrackId).toBe(2)
  })

  it('repeat-one mode: manual next advances sequentially, ended repeats current track', async () => {
    const playback = await loadPlayback()
    const audio = TestAudio.latest!
    playback.setPlaybackMode('repeat-one')
    await playback.playTrackFromQueue([track(1), track(2)], 1)

    // Manual next advances to track 2
    await playback.playNext()
    expect(playback.state.currentTrackId).toBe(2)

    // Natural ended replays track 2
    audio.currentTime = 180
    audio.dispatch('ended')
    await flushPromises()
    expect(playback.state.currentTrackId).toBe(2)
    expect(playback.state.currentTime).toBe(0)
    expect(playback.state.isPlaying).toBe(true)
  })

  it('queuedNextTrackId: consumed on manual next across modes, but skipped on repeat-one ended', async () => {
    const playback = await loadPlayback()
    const audio = TestAudio.latest!
    playback.setPlaybackMode('repeat-one')
    await playback.playTrackFromQueue([track(1), track(2)], 1)

    // Insert track 3 after current
    playback.insertTrackAfterCurrent(track(3))
    expect(playback.state.queue.map((t) => t.id)).toEqual([1, 3, 2])

    // Natural ended in repeat-one replays track 1 and DOES NOT consume queued track
    audio.dispatch('ended')
    await flushPromises()
    expect(playback.state.currentTrackId).toBe(1)

    // Manual next consumes queued track 3
    await playback.playNext()
    expect(playback.state.currentTrackId).toBe(3)
  })

  it('shuffle mode: playNext picks from shuffle pool or API, playPrevious restores history', async () => {
    const playback = await loadPlayback()
    playback.setPlaybackMode('shuffle')
    await playback.playTrackFromQueue([track(1)], 1, {
      shufflePool: [track(1), track(2), track(3)],
    })

    await playback.playNext()
    const secondTrackId = playback.state.currentTrackId
    expect([2, 3]).toContain(secondTrackId)

    await playback.playPrevious()
    expect(playback.state.currentTrackId).toBe(1)
  })

  it('album-shuffle mode: advances within album, then transitions to random album', async () => {
    const album1Track1: PlaybackTrack = { ...track(10), album: 'Album A', artist: 'Artist A' }
    const album1Track2: PlaybackTrack = { ...track(11), album: 'Album A', artist: 'Artist A' }
    const album2Track1: PlaybackTrack = { ...track(20), album: 'Album B', artist: 'Artist B' }

    vi.mocked(api.playback.getAlbumTracks).mockResolvedValue({
      albumArtist: 'Artist A',
      album: 'Album A',
      tracks: [album1Track1, album1Track2],
    })
    vi.mocked(api.playback.getRandomAlbumTracks).mockResolvedValue({
      albumArtist: 'Artist B',
      album: 'Album B',
      tracks: [album2Track1],
    })

    const playback = await loadPlayback()
    playback.setPlaybackMode('album-shuffle')
    await playback.playTrackFromQueue([album1Track1, album1Track2], 10)

    // Advance within album
    await playback.playNext()
    expect(playback.state.currentTrackId).toBe(11)

    // End of album transitions to next album
    await playback.playNext()
    expect(playback.state.currentTrackId).toBe(20)

    // History restores previous album track
    await playback.playPrevious()
    expect(playback.state.currentTrackId).toBe(11)
  })

  it('previous track at start of queue: wraps in repeat-all, seeks to start in sequential', async () => {
    const playback = await loadPlayback()
    const audio = TestAudio.latest!
    await playback.playTrackFromQueue([track(1), track(2)], 1)
    audio.currentTime = 50
    playback.state.currentTime = 50

    await playback.playPrevious()
    expect(playback.state.currentTrackId).toBe(1)
    expect(audio.currentTime).toBe(0)
    expect(playback.state.currentTime).toBe(0)

    playback.setPlaybackMode('repeat-all')
    await playback.playPrevious()
    expect(playback.state.currentTrackId).toBe(2)
  })

  it('missing tracks cleanup: removes non-current tracks, halts and reports error when current track is missing', async () => {
    const playback = await loadPlayback()
    await playback.playTrackFromQueue([track(1), track(2), track(3)], 2)
    playback.insertTrackAfterCurrent(track(4))

    // Remove non-current track 3 & queued track 4
    libraryChangedListener?.({ reason: 'track-missing', trackIds: [3, 4], filePaths: [] })
    expect(playback.state.queue.map((t) => t.id)).toEqual([1, 2])
    expect(playback.state.currentTrackId).toBe(2)

    // Remove current track 2
    libraryChangedListener?.({ reason: 'track-missing', trackIds: [2], filePaths: [] })
    expect(playback.state.currentTrackId).toBeNull()
    expect(playback.state.currentTrack).toBeNull()
    expect(playback.state.isPlaying).toBe(false)
    expect(playback.state.error).toContain('unavailable')
  })
})
