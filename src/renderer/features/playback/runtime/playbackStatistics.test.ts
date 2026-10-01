import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlaybackController } from './playbackController'
import type { PlaybackDependencies } from './playbackDependencies'
import type { PlaybackAudioCallbacks, PlaybackAudioSnapshot } from '../audio/playbackAudioRuntime'
import type { PlaybackTrack } from '../types'
import type { EffectivePlayPayload } from '../core/effectivePlayTracker'

const controllers: ReturnType<typeof createPlaybackController>[] = []

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose())
  vi.useRealTimers()
})

function setup(kind: 'html-audio' | 'gapless' | 'mpv' = 'html-audio') {
  const tracks: PlaybackTrack[] = [10, 100].map((durationSeconds, index) => ({
    id: index + 1,
    title: `Track ${index + 1}`,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    artworkCacheKey: null,
    durationSeconds,
  }))
  let callbacks!: PlaybackAudioCallbacks
  let libraryChanged: Parameters<PlaybackDependencies['onLibraryChanged']>[0] | undefined
  let snapshot: PlaybackAudioSnapshot = {
    kind: 'idle',
    trackId: null,
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    hasCurrentData: false,
  }
  const record = vi.fn<(payload: EffectivePlayPayload) => Promise<{ ok: boolean }>>(async () => ({
    ok: true,
  }))
  const setPlaying = (playing: boolean) => {
    snapshot.isPlaying = playing
    callbacks.onPlayingChange(playing)
  }
  const selectBackendTrack = (id: number) => {
    snapshot = {
      kind,
      trackId: id,
      currentTime: 0,
      duration: tracks.find((track) => track.id === id)!.durationSeconds!,
      isPlaying: true,
      hasCurrentData: true,
    }
  }
  const runtime = {
    start: vi.fn(async (id: number) => {
      selectBackendTrack(id)
      callbacks.onDurationChange(snapshot.duration)
      setPlaying(true)
    }),
    resume: vi.fn(async () => setPlaying(true)),
    pause: vi.fn(() => setPlaying(false)),
    seek: vi.fn(async (time: number) => {
      callbacks.onSeeking?.()
      snapshot.currentTime = time
      callbacks.onSeeked?.()
    }),
    setVolume: vi.fn(),
    scheduleNext: vi.fn(async () => kind !== 'html-audio'),
    cancelScheduledNext: vi.fn(),
    clear: vi.fn(() => {
      snapshot = { ...snapshot, kind: 'idle', trackId: null, isPlaying: false, duration: 0 }
    }),
    getSnapshot: () => snapshot,
    dispose: vi.fn(),
  }
  const deps: PlaybackDependencies = {
    getAudioUrl: async (id) => ({ url: `audio://${id}` }),
    getRandomTrack: async () => null,
    getAlbumTracks: async () => null,
    getRandomAlbumTracks: async () => null,
    onLibraryChanged: (listener) => {
      libraryChanged = listener
      return () => {
        libraryChanged = undefined
      }
    },
    recordEffectivePlay: record,
    storage: { getItem: () => null, setItem: () => undefined },
    diagnostics: { warn: vi.fn(), error: vi.fn() },
    createAudioRuntime: (audioCallbacks) => {
      callbacks = audioCallbacks
      return runtime
    },
  }
  const controller = createPlaybackController(deps)
  controllers.push(controller)
  return {
    ...controller,
    tracks,
    record,
    runtime,
    resetStats: () => libraryChanged?.({ reason: 'play-stats-reset', trackIds: [], filePaths: [] }),
    ended: () => {
      snapshot.currentTime = snapshot.duration
      setPlaying(false)
      callbacks.onEnded(null)
    },
    boundary: (id: number) => {
      // Native/gapless backends expose the new track before notifying the controller.
      selectBackendTrack(id)
      callbacks.onEnded(id)
      callbacks.onDurationChange(snapshot.duration)
      setPlaying(true)
    },
    reportState: () => {
      callbacks.onTimeUpdate(snapshot)
      callbacks.onPlayingChange(snapshot.isPlaying)
      callbacks.onBufferingChange?.(false)
    },
  }
}

describe('playback statistics across controller and tracker', () => {
  it('counts only the audible intervals when paused and resumed between timer ticks', async () => {
    const { api, tracks, record } = setup()
    await api.playTrackFromQueue([tracks[0]], 1)
    for (let cycle = 0; cycle < 6; cycle += 1) {
      api.pause()
      await vi.advanceTimersByTimeAsync(900)
      await api.play()
      await vi.advanceTimersByTimeAsync(100)
    }
    expect(record).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(4_900)
    api.pause()
    expect(record).toHaveBeenCalledTimes(1)
  })

  it('preserves partial progress across a long pause without adding paused time', async () => {
    const { api, tracks, record } = setup()
    await api.playTrackFromQueue([tracks[0]], 1)
    await vi.advanceTimersByTimeAsync(4_500)
    api.pause()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(record).not.toHaveBeenCalled()
    await api.play()
    await vi.advanceTimersByTimeAsync(1_000)
    api.pause()
    expect(record).toHaveBeenCalledTimes(1)
  })

  it('settles a qualifying final fraction before a manual track switch', async () => {
    const { api, tracks, record } = setup()
    await api.playTrackFromQueue(tracks, 1)
    await vi.advanceTimersByTimeAsync(5_600)
    expect(record).not.toHaveBeenCalled()
    await api.playTrackFromQueue(tracks, 2)
    expect(record).toHaveBeenCalledTimes(1)
    expect(record.mock.calls[0][0]).toMatchObject({ trackId: 1 })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(record).toHaveBeenCalledTimes(1)
  })

  it.each(['gapless', 'mpv'] as const)(
    'settles the outgoing track with its own duration at a %s boundary',
    async (kind) => {
      const { api, tracks, record, runtime, boundary } = setup(kind)
      await api.playTrackFromQueue(tracks, 1)
      await vi.advanceTimersByTimeAsync(0)
      expect(runtime.scheduleNext).toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(5_600)
      boundary(2)
      expect(api.state.currentTrackId).toBe(2)
      expect(record).toHaveBeenCalledTimes(1)
      expect(record.mock.calls[0][0]).toMatchObject({ trackId: 1 })
      await vi.advanceTimersByTimeAsync(1_000)
      expect(record).toHaveBeenCalledTimes(1)
      expect(runtime.start).toHaveBeenCalledTimes(1)
    },
  )

  it('starts a new session when replaying HTMLAudio after the queue ends', async () => {
    const { api, tracks, record, runtime, ended } = setup()
    await api.playTrackFromQueue([tracks[0]], 1)
    await vi.advanceTimersByTimeAsync(10_000)
    ended()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.state.isPlaying).toBe(false)
    expect(record).toHaveBeenCalledTimes(1)
    await api.play()
    expect(runtime.start).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(6_000)
    expect(record).toHaveBeenCalledTimes(2)
    expect(record.mock.calls[0][0].sessionId).not.toBe(record.mock.calls[1][0].sessionId)
  })

  it('counts each HTMLAudio repeat-one round once', async () => {
    const { api, tracks, record, ended } = setup()
    await api.playTrackFromQueue([tracks[0]], 1, { playbackMode: 'repeat-one' })
    for (let round = 1; round <= 2; round += 1) {
      await vi.advanceTimersByTimeAsync(10_000)
      expect(record).toHaveBeenCalledTimes(round)
      ended()
      await vi.advanceTimersByTimeAsync(0)
    }
    await vi.advanceTimersByTimeAsync(6_000)
    expect(record).toHaveBeenCalledTimes(3)
    expect(new Set(record.mock.calls.map(([payload]) => payload.sessionId)).size).toBe(3)
  })

  it('keeps accumulated playback through seeks without counting position jumps', async () => {
    const { api, tracks, record } = setup()
    await api.playTrackFromQueue([tracks[0]], 1)
    await vi.advanceTimersByTimeAsync(2_800)
    api.seekTo(9)
    await vi.advanceTimersByTimeAsync(0)
    expect(record).not.toHaveBeenCalled()
    api.seekTo(0)
    await vi.advanceTimersByTimeAsync(2_700)
    api.pause()
    expect(record).toHaveBeenCalledTimes(1)
  })

  it('retries a qualified outgoing session after a transient failure and track switch', async () => {
    const { api, tracks, record } = setup()
    record.mockRejectedValueOnce(new Error('database busy'))
    await api.playTrackFromQueue(tracks, 1)
    await vi.advanceTimersByTimeAsync(6_000)
    expect(record).toHaveBeenCalledTimes(1)
    const payload = record.mock.calls[0][0]
    await api.playTrackFromQueue(tracks, 2)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(record).toHaveBeenCalledTimes(2)
    expect(record.mock.calls[1][0]).toEqual(payload)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(record).toHaveBeenCalledTimes(2)
  })

  it('ignores repeated unchanged native state notifications for interval accounting', async () => {
    const { api, tracks, record, reportState } = setup('mpv')
    await api.playTrackFromQueue([tracks[0]], 1)
    for (let tick = 0; tick < 60; tick += 1) {
      await vi.advanceTimersByTimeAsync(100)
      reportState()
    }
    expect(record).toHaveBeenCalledTimes(1)
  })

  it.each(['pending-retry', 'in-flight'] as const)(
    'discards old %s records when statistics are reset',
    async (phase) => {
      const { api, tracks, record, resetStats } = setup()
      let rejectRecord!: (error: Error) => void
      if (phase === 'in-flight') {
        record.mockReturnValueOnce(
          new Promise((_resolve, reject) => {
            rejectRecord = reject
          }),
        )
      } else {
        record.mockRejectedValueOnce(new Error('database busy'))
      }
      await api.playTrackFromQueue([tracks[0]], 1)
      await vi.advanceTimersByTimeAsync(6_000)
      expect(record).toHaveBeenCalledTimes(1)
      resetStats()
      if (phase === 'in-flight') rejectRecord(new Error('late failure'))
      await vi.advanceTimersByTimeAsync(30_000)
      expect(record).toHaveBeenCalledTimes(1)
    },
  )
})
