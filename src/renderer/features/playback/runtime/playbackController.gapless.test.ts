import { describe, expect, it, vi } from 'vitest'
import { createPlaybackController } from './playbackController'
import type { PlaybackDependencies } from './playbackDependencies'
import type {
  PlaybackAudioCallbacks,
  PlaybackAudioRuntime,
  PlaybackAudioSnapshot,
} from '../audio/playbackAudioRuntime'
import type { PlaybackTrack } from '../types'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => (resolve = finish))
  return { promise, resolve }
}

function setup() {
  const tracks: PlaybackTrack[] = [1, 2, 3, 4].map((id) => ({
    id,
    title: String(id),
    artist: 'Artist',
    albumArtist: 'Artist',
    album: id < 3 ? 'First album' : 'Second album',
    durationSeconds: 10,
    artworkCacheKey: null,
  }))
  let callbacks!: PlaybackAudioCallbacks
  let changed!: Parameters<PlaybackDependencies['onLibraryChanged']>[0]
  let snapshot: PlaybackAudioSnapshot = {
    kind: 'idle',
    trackId: null,
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    hasCurrentData: false,
  }
  const runtime = {
    start: vi.fn(async (trackId: number) => {
      snapshot = {
        kind: 'mpv',
        trackId,
        currentTime: 0,
        duration: 10,
        isPlaying: true,
        hasCurrentData: true,
      }
      callbacks.onPlayingChange(true)
    }),
    resume: vi.fn(async () => {
      snapshot.isPlaying = true
      callbacks.onPlayingChange(true)
    }),
    pause: vi.fn(() => {
      snapshot.isPlaying = false
      callbacks.onPlayingChange(false)
    }),
    seek: vi.fn<PlaybackAudioRuntime['seek']>(async () => undefined),
    setVolume: vi.fn(),
    scheduleNext: vi.fn<PlaybackAudioRuntime['scheduleNext']>(async () => true),
    cancelScheduledNext: vi.fn(),
    clear: vi.fn(),
    getSnapshot: () => snapshot,
    dispose: vi.fn(),
  }
  const deps: PlaybackDependencies = {
    getAudioUrl: vi.fn(async (trackId: number) => ({ url: `audio://${trackId}` })),
    getRandomTrack: vi.fn(async () => tracks[1]),
    getAlbumTracks: vi.fn(async () => ({
      albumArtist: 'Artist',
      album: 'First album',
      tracks: tracks.slice(0, 2),
    })),
    getRandomAlbumTracks: vi.fn(async () => ({
      albumArtist: 'Artist',
      album: 'Second album',
      tracks: tracks.slice(2),
    })),
    onLibraryChanged: (callback) => {
      changed = callback
      return () => undefined
    },
    recordEffectivePlay: vi.fn(async () => ({ ok: true })),
    storage: { getItem: () => null, setItem: vi.fn() },
    diagnostics: { warn: vi.fn(), error: vi.fn() },
    createAudioRuntime: (value) => {
      callbacks = value
      return runtime
    },
  }
  const controller = createPlaybackController(deps)
  return {
    ...controller,
    deps,
    runtime,
    tracks,
    boundary(trackId: number) {
      snapshot = { ...snapshot, trackId, currentTime: 0 }
      callbacks.onEnded(trackId)
    },
    changed(reason: string, trackIds: number[]) {
      changed({ reason, trackIds, filePaths: [] })
    },
    nextId() {
      return runtime.scheduleNext.mock.calls.at(-1)?.[0]
    },
  }
}

describe('gapless navigation across asynchronous backend boundaries', () => {
  it('consumes inserted priority once when boundary arrives before its ACK and restores history', async () => {
    const test = setup()
    const acknowledgement = deferred<boolean>()
    try {
      await test.api.playTrackFromQueue(test.tracks, 1, { playbackMode: 'shuffle' })
      await vi.waitFor(() => expect(test.nextId()).toBe(2))
      test.runtime.scheduleNext.mockImplementationOnce(() => acknowledgement.promise)
      test.api.insertTracksAfterCurrent(test.tracks.slice(2))
      await vi.waitFor(() => expect(test.nextId()).toBe(3))
      test.boundary(3)
      await vi.waitFor(() => expect(test.nextId()).toBe(4))
      const cancels = test.runtime.cancelScheduledNext.mock.calls.length
      acknowledgement.resolve(true)
      await acknowledgement.promise
      await Promise.resolve()
      expect(test.runtime.cancelScheduledNext).toHaveBeenCalledTimes(cancels)
      expect(test.runtime.start).toHaveBeenCalledTimes(1)
      await test.api.playPrevious()
      expect(test.api.state.currentTrackId).toBe(1)
      expect(test.api.state.queue.map((track) => track.id)).toEqual([1, 3, 4, 2])
    } finally {
      acknowledgement.resolve(true)
      test.dispose()
    }
  })

  it('keeps a scoped shuffle round and Previous history when a pending ACK crosses the boundary', async () => {
    const test = setup()
    const acknowledgement = deferred<boolean>()
    test.runtime.scheduleNext.mockImplementationOnce(() => acknowledgement.promise)
    try {
      await test.api.playTrackFromQueue(test.tracks.slice(0, 3), 1, {
        playbackMode: 'shuffle',
        shufflePool: test.tracks.slice(0, 3),
        shuffleCycle: true,
      })
      await vi.waitFor(() => expect(test.runtime.scheduleNext).toHaveBeenCalledTimes(1))
      const second = test.nextId()!
      test.boundary(second)
      await vi.waitFor(() => expect(test.runtime.scheduleNext).toHaveBeenCalledTimes(2))
      expect(new Set([1, second, test.nextId()]).size).toBe(3)
      acknowledgement.resolve(true)
      await test.api.playPrevious()
      expect(test.api.state.currentTrackId).toBe(1)
      expect(test.runtime.start).toHaveBeenCalledTimes(2)
      expect(test.deps.getRandomTrack).not.toHaveBeenCalled()
    } finally {
      acknowledgement.resolve(true)
      test.dispose()
    }
  })

  it('commits an entered album context before ACK and restores the earlier album on Previous', async () => {
    const test = setup()
    const acknowledgement = deferred<boolean>()
    test.runtime.scheduleNext.mockImplementationOnce(() => acknowledgement.promise)
    try {
      await test.api.playTrackFromQueue(test.tracks.slice(0, 2), 2, {
        playbackMode: 'album-shuffle',
      })
      await vi.waitFor(() => expect(test.nextId()).toBe(3))
      test.boundary(3)
      await vi.waitFor(() => expect(test.nextId()).toBe(4))
      expect(test.api.state.queue.map((track) => track.id)).toEqual([3, 4])
      acknowledgement.resolve(true)
      await test.api.playPrevious()
      expect(test.api.state.currentTrackId).toBe(2)
      expect(test.api.state.queue.map((track) => track.id)).toEqual([1, 2])
      expect(test.runtime.start).toHaveBeenCalledTimes(2)
    } finally {
      acknowledgement.resolve(true)
      test.dispose()
    }
  })

  it('adopts a boundary without replacing a newer mode or inserted priority queue', async () => {
    const test = setup()
    try {
      await test.api.playTrackFromQueue(test.tracks.slice(0, 3), 1)
      await vi.waitFor(() => expect(test.nextId()).toBe(2))
      test.api.setPlaybackMode('repeat-one')
      test.api.insertTrackAfterCurrent(test.tracks[3])
      test.boundary(2)
      await vi.waitFor(() => expect(test.api.state.currentTrackId).toBe(2))
      expect(test.api.state.playbackMode).toBe('repeat-one')
      expect(test.api.state.queue.map((track) => track.id)).toEqual([1, 2, 4, 3])
      expect(test.runtime.start).toHaveBeenCalledTimes(1)
      await vi.waitFor(() => expect(test.nextId()).toBe(2))
      await test.api.playNext()
      expect(test.api.state.currentTrackId).toBe(4)
    } finally {
      test.dispose()
    }
  })

  it('preserves a scoped round and newly inserted priority after an older boundary wins', async () => {
    const test = setup()
    try {
      await test.api.playTrackFromQueue(test.tracks.slice(0, 3), 1, {
        playbackMode: 'shuffle',
        shufflePool: test.tracks.slice(0, 3),
        shuffleCycle: true,
      })
      await vi.waitFor(() => expect(test.runtime.scheduleNext).toHaveBeenCalledTimes(1))
      const second = test.nextId()!
      test.api.insertTrackAfterCurrent(test.tracks[3])
      test.boundary(second)
      await vi.waitFor(() => expect(test.nextId()).toBe(4))
      expect(test.runtime.start).toHaveBeenCalledTimes(1)
      test.boundary(4)
      await vi.waitFor(() => expect(test.nextId()).not.toBe(4))
      expect(new Set([1, second, test.nextId()]).size).toBe(3)
    } finally {
      test.dispose()
    }
  })

  it('preserves the chosen shuffle track while rebuilding its relocated file preparation', async () => {
    const test = setup()
    try {
      await test.api.playTrackFromQueue([test.tracks[0]], 1, { playbackMode: 'shuffle' })
      await vi.waitFor(() => expect(test.nextId()).toBe(2))
      vi.mocked(test.deps.getAudioUrl).mockResolvedValueOnce({ url: 'audio://moved/2' })
      test.changed('track-relocated', [2])
      await vi.waitFor(() =>
        expect(test.runtime.scheduleNext).toHaveBeenLastCalledWith(
          2,
          'audio://moved/2',
          expect.any(Object),
        ),
      )
      expect(test.deps.getRandomTrack).toHaveBeenCalledTimes(1)
      expect(test.runtime.start).toHaveBeenCalledTimes(1)
    } finally {
      test.dispose()
    }
  })

  it.each(['track-restored', 'track-added'])(
    'allows an available track to be prepared again after %s',
    async (reason) => {
      const test = setup()
      try {
        await test.api.playTrackFromQueue(test.tracks.slice(0, 3), 1)
        await vi.waitFor(() => expect(test.nextId()).toBe(2))
        test.changed('track-missing', [2])
        await vi.waitFor(() => expect(test.nextId()).toBe(3))
        test.changed(reason, [2])
        await test.api.playTrackFromQueue(test.tracks.slice(0, 3), 1)
        await vi.waitFor(() => expect(test.nextId()).toBe(2))
      } finally {
        test.dispose()
      }
    },
  )

  it('stops a missing track already entered by the backend without restoring it to the queue', async () => {
    const test = setup()
    try {
      await test.api.playTrackFromQueue(test.tracks.slice(0, 3), 1)
      await vi.waitFor(() => expect(test.nextId()).toBe(2))
      test.changed('track-missing', [2])
      const clears = test.runtime.clear.mock.calls.length
      test.boundary(2)
      expect(test.runtime.clear).toHaveBeenCalledTimes(clears + 1)
      expect(test.api.state.currentTrackId).toBeNull()
      expect(test.api.state.currentTrack).toBeNull()
      expect(test.api.state.isPlaying).toBe(false)
      expect(test.api.state.queue.map((track) => track.id)).toEqual([1, 3])
      expect(test.api.state.currentTime).toBe(0)
      expect(test.api.state.duration).toBe(0)
      expect(test.api.state.error).toBe(
        'Audio file is unavailable. Please rescan the music library.',
      )
      expect(test.runtime.start).toHaveBeenCalledTimes(1)
    } finally {
      test.dispose()
    }
  })

  it('updates Previous seek position while already paused without preparing new audio', async () => {
    const test = setup()
    try {
      await test.api.playTrackFromQueue(test.tracks.slice(0, 2), 1, { playbackMode: 'sequential' })
      await vi.waitFor(() => expect(test.nextId()).toBe(2))
      test.api.pause()
      test.api.state.currentTime = 5
      const scheduled = test.runtime.scheduleNext.mock.calls.length
      await test.api.playPrevious()
      expect(test.api.state.currentTime).toBe(0)
      expect(test.runtime.scheduleNext).toHaveBeenCalledTimes(scheduled)
      expect(test.api.state.isPlaying).toBe(false)
    } finally {
      test.dispose()
    }
  })

  it.each(['pause', 'manual', 'dispose'] as const)(
    'ignores an old Previous seek completion after %s',
    async (action) => {
      const test = setup()
      const seek = deferred<void>()
      try {
        await test.api.playTrackFromQueue(test.tracks.slice(0, 2), 1, {
          playbackMode: 'sequential',
        })
        await vi.waitFor(() => expect(test.nextId()).toBe(2))
        test.runtime.seek.mockImplementationOnce(() => seek.promise)
        const previous = test.api.playPrevious()
        if (action === 'pause') test.api.pause()
        if (action === 'manual') {
          await test.api.playTrackFromQueue(test.tracks.slice(2), 3)
          await vi.waitFor(() => expect(test.nextId()).toBe(4))
          test.api.state.currentTime = 2
        }
        if (action === 'dispose') test.dispose()
        const scheduled = test.runtime.scheduleNext.mock.calls.length
        seek.resolve()
        await previous
        expect(test.runtime.scheduleNext).toHaveBeenCalledTimes(scheduled)
        expect(test.api.state.currentTime).toBe(action === 'manual' ? 2 : 0)
        expect(test.api.state.currentTrackId).toBe(action === 'manual' ? 3 : 1)
      } finally {
        seek.resolve()
        test.dispose()
      }
    },
  )
})
