import { describe, expect, it, vi } from 'vitest'
import type { AuralisApi } from '@shared/ipc/api'
import type { NativePlaybackEvent } from '@shared/ipc/contracts'
import { createNativePlaybackRuntime } from './nativePlaybackRuntime'
import type { PlaybackAudioCallbacks, PlaybackAudioRuntime } from './playbackAudioRuntime'
import { EffectivePlayTracker } from '../core/effectivePlayTracker'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function setup(available = true) {
  const callbacks: PlaybackAudioCallbacks = {
    onEnded: vi.fn(),
    onError: vi.fn(),
    onTimeUpdate: vi.fn(),
    onPlayingChange: vi.fn(),
    onDurationChange: vi.fn(),
    onSeeking: vi.fn(),
    onSeeked: vi.fn(),
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
  it.each(['resolve', 'reject'] as const)(
    'ignores an older seek %s while the latest seek remains pending',
    async (completion) => {
      const t = setup()
      const first = deferred<{ accepted: boolean }>()
      const second = deferred<{ accepted: boolean }>()
      await t.runtime.start(1, 'audio://1', { preferGapless: true })
      vi.mocked(t.api.nativeCommand)
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
      const older = t.runtime.seek(10).catch(() => undefined)
      const latest = t.runtime.seek(20)
      if (completion === 'resolve') first.resolve({ accepted: true })
      else first.reject(new Error('Old seek failed'))
      await older
      expect(t.callbacks.onSeeked).not.toHaveBeenCalled()
      second.resolve({ accepted: true })
      await latest
      expect(t.callbacks.onSeeked).toHaveBeenCalledOnce()
      t.runtime.dispose()
    },
  )

  it.each(['clear', 'replace', 'boundary', 'dispose'] as const)(
    'does not publish a seek completion after %s',
    async (action) => {
      const t = setup()
      const pending = deferred<{ accepted: boolean }>()
      await t.runtime.start(1, 'audio://1', { preferGapless: true })
      vi.mocked(t.api.nativeCommand).mockReturnValueOnce(pending.promise)
      const seek = t.runtime.seek(10)
      if (action === 'clear') t.runtime.clear()
      if (action === 'replace') await t.runtime.start(3, 'audio://3', { preferGapless: true })
      if (action === 'boundary') t.emit(t.lastSession(), 'boundary')
      if (action === 'dispose') t.runtime.dispose()
      pending.resolve({ accepted: false })
      await seek
      expect(t.callbacks.onSeeked).not.toHaveBeenCalled()
      t.runtime.dispose()
    },
  )

  it('reports a rejected current seek and settles its seeking callback', async () => {
    const t = setup()
    await t.runtime.start(1, 'audio://1', { preferGapless: true })
    vi.mocked(t.api.nativeCommand).mockResolvedValueOnce({ accepted: false })
    await expect(t.runtime.seek(10)).rejects.toThrow('seek was rejected')
    expect(t.callbacks.onSeeked).toHaveBeenCalledOnce()
    t.runtime.dispose()
  })

  it('keeps play counting suppressed until the latest native seek settles', async () => {
    const t = setup()
    const first = deferred<{ accepted: boolean }>(),
      second = deferred<{ accepted: boolean }>()
    let now = 0
    const record = vi.fn(async () => ({ ok: true }))
    const tracker = new EffectivePlayTracker({
      isPlaybackCountable: () => true,
      getDurationSeconds: () => 5.4,
      recordEffectivePlay: record,
      monotonicNow: () => now,
    })
    t.callbacks.onSeeking = () => tracker.beginSeekingWithFallback()
    t.callbacks.onSeeked = () => tracker.endSeeking()
    try {
      await t.runtime.start(1, 'audio://1', { preferGapless: true })
      tracker.start(1)
      now = 1000
      tracker.sample()
      now = 2000
      tracker.sample()
      vi.mocked(t.api.nativeCommand)
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
      now = 2900
      const older = t.runtime.seek(1)
      now = 2910
      const latest = t.runtime.seek(2)
      now = 2920
      first.resolve({ accepted: true })
      await older
      now = 3000
      tracker.sample()
      expect(record).not.toHaveBeenCalled()
      second.resolve({ accepted: true })
      await latest
      now = 3200
      tracker.sample()
      expect(record).toHaveBeenCalledOnce()
    } finally {
      tracker.dispose()
      t.runtime.dispose()
    }
  })

  it('passes the explicit soft transition opt-in through the typed native command', async () => {
    const test = setup()
    await test.runtime.start(1, 'audio://1', { preferGapless: true })
    await test.runtime.scheduleNext(2, 'audio://2', {
      trimBoundarySilence: false,
      softTransition: true,
      softTransitionDurationSeconds: 5.5,
    })
    expect(test.api.nativeCommand).toHaveBeenLastCalledWith({
      action: 'next',
      session: test.lastSession(),
      trackId: 2,
      trimDigitalSilence: false,
      softTransition: true,
      softTransitionDurationSeconds: 5.5,
    })
    test.runtime.dispose()
  })
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
  it('discards the remaining boundary state when its callback clears playback', async () => {
    const test = setup()
    await test.runtime.start(1, 'audio://1', { preferGapless: true })
    vi.mocked(test.callbacks.onEnded).mockImplementationOnce(() => test.runtime.clear())
    test.emit(test.lastSession(), 'boundary')
    expect(test.callbacks.onEnded).toHaveBeenCalledWith(2)
    expect(test.callbacks.onDurationChange).not.toHaveBeenCalled()
    expect(test.callbacks.onTimeUpdate).not.toHaveBeenCalled()
    expect(test.callbacks.onPlayingChange).not.toHaveBeenCalled()
    expect(test.runtime.getSnapshot().kind).toBe('idle')
    test.runtime.dispose()
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
