import { describe, expect, it, vi } from 'vitest'
import type { AuralisApi } from '@shared/ipc/api'
import type { NativePlaybackEvent } from '@shared/ipc/contracts'
import { createNativePlaybackRuntime } from './nativePlaybackRuntime'
import type { PlaybackAudioCallbacks, PlaybackAudioRuntime } from './playbackAudioRuntime'

function setup(available = true) {
  const callbacks: PlaybackAudioCallbacks = {
    onEnded: vi.fn(),
    onError: vi.fn(),
    onTimeUpdate: vi.fn(),
    onPlayingChange: vi.fn(),
    onDurationChange: vi.fn(),
  }
  const fallback: PlaybackAudioRuntime = {
    start: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    scheduleNext: vi.fn(async () => true),
    cancelScheduledNext: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
    getSnapshot: () => ({
      kind: 'idle',
      trackId: null,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      hasCurrentData: false,
    }),
  }
  let receive!: (event: NativePlaybackEvent) => void
  const unsubscribe = vi.fn()
  const api = {
    nativeAvailability: vi.fn(async () => ({ available })),
    nativeCommand: vi.fn(async () => ({ accepted: true })),
    onNativeEvent: vi.fn((handler: typeof receive) => {
      receive = handler
      return unsubscribe
    }),
  } as unknown as AuralisApi['playback']
  const runtime = createNativePlaybackRuntime(callbacks, api, vi.fn(), () => fallback)
  function lastSession() {
    return vi.mocked(api.nativeCommand).mock.calls.at(-1)![0].session
  }
  function emit(session: number, kind: NativePlaybackEvent['kind'] = 'state') {
    receive({
      session,
      kind,
      trackId: 2,
      duration: 120,
      currentTime: 5,
      isPlaying: true,
      buffering: false,
    })
  }
  return { runtime, callbacks, fallback, api, emit, lastSession, unsubscribe }
}

describe('native playback renderer adapter', () => {
  it('accepts native progress and boundary once, ignoring replaced sessions', async () => {
    const test = setup()
    await test.runtime.start(1, 'audio://1', { preferGapless: true })
    const old = test.lastSession()
    test.emit(old)
    expect(test.runtime.getSnapshot().kind).toBe('mpv')
    test.emit(old, 'boundary')
    expect(test.callbacks.onEnded).toHaveBeenCalledWith(2)
    await test.runtime.start(3, 'audio://3', { preferGapless: true })
    test.emit(old, 'boundary')
    expect(test.callbacks.onEnded).toHaveBeenCalledTimes(1)
    test.runtime.dispose()
    expect(test.unsubscribe).toHaveBeenCalledOnce()
  })
  it('falls back only when mpv is unavailable, without old threshold-based silence trimming', async () => {
    const test = setup(false)
    await test.runtime.start(1, 'audio://1', { preferGapless: true })
    expect(test.fallback.start).toHaveBeenCalledOnce()
    await test.runtime.scheduleNext(2, 'audio://2', { trimBoundarySilence: true })
    expect(test.fallback.scheduleNext).toHaveBeenCalledWith(2, 'audio://2', {
      trimBoundarySilence: false,
    })
    test.runtime.dispose()
  })
  it('marks a finished native stream idle so play restarts instead of resuming an empty mpv playlist', async () => {
    const test = setup()
    await test.runtime.start(1, 'audio://1', { preferGapless: true })
    test.emit(test.lastSession(), 'ended')
    expect(test.runtime.getSnapshot().kind).toBe('idle')
    expect(test.callbacks.onEnded).toHaveBeenCalledWith(null)
    test.runtime.dispose()
  })
  it('cancels startup when paused during availability resolution', async () => {
    const test = setup()
    let resolve!: (result: { available: boolean }) => void
    vi.mocked(test.api.nativeAvailability).mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const start = test.runtime.start(1, 'audio://1', { preferGapless: true })
    test.runtime.pause()
    resolve({ available: true })
    await start
    expect(
      vi.mocked(test.api.nativeCommand).mock.calls.some(([request]) => request.action === 'start'),
    ).toBe(false)
    test.runtime.dispose()
  })
  it('does not silently restart a failed native decoder through another backend', async () => {
    const test = setup()
    vi.mocked(test.api.nativeCommand).mockImplementation(async (request) => {
      if (request.action === 'start') throw new Error('Decode failed')
      return { accepted: true }
    })
    await expect(test.runtime.start(1, 'audio://1', { preferGapless: true })).rejects.toThrow(
      'Decode failed',
    )
    expect(test.fallback.start).not.toHaveBeenCalled()
    test.runtime.dispose()
  })
})
