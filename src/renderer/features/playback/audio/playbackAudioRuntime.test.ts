import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlaybackAudioRuntime, type PlaybackAudioCallbacks } from './playbackAudioRuntime'

type MockGaplessOptions = {
  onCurrentEnded: (nextTrackId: number | null) => void
  onPlaybackStateChange: (isPlaying: boolean) => void
  onTimeUpdate: (snapshot: { currentTime: number; duration: number }) => void
}

let latestGaplessInstance: { simulateEnded: (id: number | null) => void } | null = null

vi.mock('./gaplessAudioEngine', () => ({
  GaplessAudioEngine: class {
    private active = false
    private playing = false
    private readonly options: MockGaplessOptions
    startShouldFail = false

    constructor(options: MockGaplessOptions) {
      this.options = options
      latestGaplessInstance = this as unknown as { simulateEnded: (id: number | null) => void }
    }

    get isActive(): boolean {
      return this.active
    }

    getSnapshot(): { currentTime: number; duration: number; isPlaying: boolean } {
      return { currentTime: 10, duration: 180, isPlaying: this.playing }
    }

    setVolume(): void {}

    async start(): Promise<boolean> {
      if (this.startShouldFail) return false
      this.active = true
      this.playing = true
      this.options.onPlaybackStateChange(true)
      return true
    }

    async scheduleNext(): Promise<boolean> {
      return true
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

    simulateEnded(nextTrackId: number | null): void {
      this.options.onCurrentEnded(nextTrackId)
    }

    destroy(): void {
      this.active = false
      this.playing = false
    }
  },
}))

class TestAudio {
  private readonly listeners = new Map<string, Set<() => void>>()
  private currentSrc = ''

  paused = true
  ended = false
  readyState = 4
  networkState = 1
  currentTime = 0
  duration = 120
  volume = 1
  muted = false
  error: MediaError | null = null

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

  async play(): Promise<void> {
    this.paused = false
    this.dispatch('play')
  }

  pause(): void {
    this.paused = true
    this.dispatch('pause')
  }

  load(): void {
    this.currentTime = 0
  }

  removeAttribute(name: string): void {
    if (name === 'src') this.currentSrc = ''
  }
}

describe('PlaybackAudioRuntime', () => {
  let callbacks: PlaybackAudioCallbacks
  let testAudio: TestAudio

  beforeEach(() => {
    Object.defineProperty(globalThis, 'HTMLMediaElement', {
      configurable: true,
      value: { HAVE_CURRENT_DATA: 2 },
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

    testAudio = new TestAudio()
    callbacks = {
      onTimeUpdate: vi.fn(),
      onDurationChange: vi.fn(),
      onPlayingChange: vi.fn(),
      onEnded: vi.fn(),
      onError: vi.fn(),
      onSeeking: vi.fn(),
      onSeeked: vi.fn(),
      onBufferingChange: vi.fn(),
    }
  })

  it('starts with gapless backend when preferGapless is true', async () => {
    const runtime = createPlaybackAudioRuntime(callbacks, {
      audio: testAudio as unknown as HTMLAudioElement,
    })
    await runtime.start(1, 'audio://1', { preferGapless: true })

    const snapshot = runtime.getSnapshot()
    expect(snapshot.kind).toBe('gapless')
    expect(snapshot.trackId).toBe(1)
    expect(callbacks.onPlayingChange).toHaveBeenCalledWith(true)
  })

  it('updates currentTrackId when gapless advances across boundary to nextTrackId', async () => {
    const runtime = createPlaybackAudioRuntime(callbacks, {
      audio: testAudio as unknown as HTMLAudioElement,
    })
    await runtime.start(1, 'audio://1', { preferGapless: true })
    expect(runtime.getSnapshot().trackId).toBe(1)

    // Simulate boundary crossing to Track 2
    latestGaplessInstance!.simulateEnded(2)

    // Snapshot trackId MUST now be 2
    expect(runtime.getSnapshot().trackId).toBe(2)
    expect(callbacks.onEnded).toHaveBeenCalledWith(2)
  })

  it('starts with HTMLAudio directly when preferGapless is false', async () => {
    const runtime = createPlaybackAudioRuntime(callbacks, {
      audio: testAudio as unknown as HTMLAudioElement,
    })
    await runtime.start(2, 'audio://2', { preferGapless: false })

    const snapshot = runtime.getSnapshot()
    expect(snapshot.kind).toBe('html-audio')
    expect(snapshot.trackId).toBe(2)
    expect(testAudio.src).toBe('audio://2')
    expect(testAudio.paused).toBe(false)
  })

  it('falls back to HTMLAudio when preferGapless is true but gaplessEngine.start returns false', async () => {
    const runtime = createPlaybackAudioRuntime(callbacks, {
      audio: testAudio as unknown as HTMLAudioElement,
    })

    const { GaplessAudioEngine } = await import('./gaplessAudioEngine')
    vi.spyOn(GaplessAudioEngine.prototype, 'start').mockResolvedValueOnce(false)

    await runtime.start(3, 'audio://3', { preferGapless: true })

    const snapshot = runtime.getSnapshot()
    expect(snapshot.kind).toBe('html-audio')
    expect(snapshot.trackId).toBe(3)
    expect(testAudio.src).toBe('audio://3')
    expect(testAudio.paused).toBe(false)
  })

  it('routes pause, resume, seek, and setVolume', async () => {
    const runtime = createPlaybackAudioRuntime(callbacks, {
      audio: testAudio as unknown as HTMLAudioElement,
    })
    await runtime.start(2, 'audio://2', { preferGapless: false })

    runtime.pause()
    expect(testAudio.paused).toBe(true)

    await runtime.resume()
    expect(testAudio.paused).toBe(false)

    await runtime.seek(30)
    expect(testAudio.currentTime).toBe(30)

    runtime.setVolume(0.5, true)
    expect(testAudio.volume).toBe(0.5)
    expect(testAudio.muted).toBe(true)
  })

  it('dispatches HTMLAudio events when html-audio backend is active', async () => {
    const runtime = createPlaybackAudioRuntime(callbacks, {
      audio: testAudio as unknown as HTMLAudioElement,
    })

    // Before start -> events must not be dispatched
    testAudio.dispatch('waiting')
    expect(callbacks.onBufferingChange).not.toHaveBeenCalled()

    // Start with HTMLAudio
    await runtime.start(10, 'audio://10', { preferGapless: false })

    testAudio.duration = 240
    testAudio.dispatch('durationchange')
    expect(callbacks.onDurationChange).toHaveBeenCalledWith(240)

    testAudio.currentTime = 45
    testAudio.dispatch('timeupdate')
    expect(callbacks.onTimeUpdate).toHaveBeenCalledWith({ currentTime: 45, duration: 240 })

    testAudio.dispatch('waiting')
    expect(callbacks.onBufferingChange).toHaveBeenCalledWith(true)

    testAudio.dispatch('playing')
    expect(callbacks.onBufferingChange).toHaveBeenCalledWith(false)

    testAudio.dispatch('ended')
    expect(callbacks.onEnded).toHaveBeenCalledWith(null)
  })

  it('dispatches gapless engine events when gapless backend is active', async () => {
    const runtime = createPlaybackAudioRuntime(callbacks, {
      audio: testAudio as unknown as HTMLAudioElement,
    })

    await runtime.start(20, 'audio://20', { preferGapless: true })
    expect(runtime.getSnapshot().kind).toBe('gapless')

    // Simulate gapless time update
    const mockEngine = latestGaplessInstance as unknown as {
      options: {
        onTimeUpdate: (s: { currentTime: number; duration: number }) => void
        onPlaybackStateChange: (playing: boolean) => void
      }
    }
    mockEngine.options.onTimeUpdate({ currentTime: 60, duration: 300 })
    expect(callbacks.onTimeUpdate).toHaveBeenCalledWith({ currentTime: 60, duration: 300 })

    mockEngine.options.onPlaybackStateChange(false)
    expect(callbacks.onPlayingChange).toHaveBeenCalledWith(false)
  })

  it('aborts HTMLAudio fallback if clear() or a newer start() occurs while gapless is starting', async () => {
    let resolveGaplessA!: (value: boolean) => void
    const gaplessPromiseA = new Promise<boolean>((resolve) => {
      resolveGaplessA = resolve
    })

    const runtime = createPlaybackAudioRuntime(callbacks, {
      audio: testAudio as unknown as HTMLAudioElement,
    })

    const { GaplessAudioEngine } = await import('./gaplessAudioEngine')
    vi.spyOn(GaplessAudioEngine.prototype, 'start')
      .mockImplementationOnce(() => gaplessPromiseA)
      .mockResolvedValueOnce(true)

    // 1. Track A starts decoding
    const startA = runtime.start(1, 'audio://1', { preferGapless: true })

    // 2. User immediately switches to Track B while A is still decoding
    const startB = runtime.start(2, 'audio://2', { preferGapless: true })

    // 3. Track A's gapless start gets cancelled / returns false
    resolveGaplessA(false)

    await Promise.all([startA, startB])

    // Track A MUST NOT have fallen back to HTMLAudio
    expect(testAudio.src).toBe('')
    expect(testAudio.paused).toBe(true)

    // Track B should be active on gapless
    const snapshot = runtime.getSnapshot()
    expect(snapshot.kind).toBe('gapless')
    expect(snapshot.trackId).toBe(2)
  })
})
