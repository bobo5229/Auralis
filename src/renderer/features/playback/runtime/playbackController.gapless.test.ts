import { describe, expect, it, vi } from 'vitest'
import { createPlaybackController } from './playbackController'
import type { PlaybackDependencies } from './playbackDependencies'
import type {
  PlaybackAudioCallbacks,
  PlaybackAudioRuntime,
  PlaybackAudioSnapshot,
} from '../audio/playbackAudioRuntime'
import type { PlaybackTrack } from '../types'
import type { TrackListItem } from '@shared/types/libraryScan'
import { SharedLibraryCatalogLoad } from '../../library/utils/sharedLibraryCatalogLoad'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => (resolve = finish))
  return { promise, resolve }
}

function setup(sourceTracks?: PlaybackTrack[]) {
  const tracks: PlaybackTrack[] =
    sourceTracks ??
    [1, 2, 3, 4].map((id) => ({
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
    getTrackMetadata: vi.fn(async (id) => ({
      trackId: id,
      title: `Edited ${id}`,
      artistDisplay: 'New artist',
      albumTitle: 'New album',
      albumArtistDisplay: 'New album artist',
      genreDisplay: null,
      year: null,
      releaseDate: null,
    })),
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
    timeUpdate(currentTime: number) {
      snapshot = { ...snapshot, currentTime }
      callbacks.onTimeUpdate({ currentTime, duration: snapshot.duration })
    },
    stateEvent(trackId: number, isPlaying: boolean, buffering: boolean) {
      snapshot = {
        ...snapshot,
        kind: 'mpv',
        trackId,
        isPlaying,
        hasCurrentData: !buffering,
      }
      callbacks.onDurationChange(snapshot.duration)
      callbacks.onTimeUpdate({ currentTime: snapshot.currentTime, duration: snapshot.duration })
      callbacks.onPlayingChange(isPlaying)
      callbacks.onBufferingChange?.(buffering)
    },
    bufferedBoundary(trackId: number) {
      snapshot = {
        ...snapshot,
        kind: 'mpv',
        trackId,
        currentTime: 0,
        isPlaying: false,
        hasCurrentData: false,
      }
      callbacks.onEnded(trackId)
      callbacks.onDurationChange(snapshot.duration)
      callbacks.onTimeUpdate({ currentTime: snapshot.currentTime, duration: snapshot.duration })
      callbacks.onPlayingChange(false)
      callbacks.onBufferingChange?.(true)
    },
    naturalEnded() {
      snapshot = {
        kind: 'idle',
        trackId: null,
        currentTime: snapshot.currentTime,
        duration: snapshot.duration,
        isPlaying: false,
        hasCurrentData: false,
      }
      callbacks.onDurationChange(snapshot.duration)
      callbacks.onTimeUpdate({ currentTime: snapshot.currentTime, duration: snapshot.duration })
      callbacks.onPlayingChange(false)
      callbacks.onBufferingChange?.(false)
      callbacks.onEnded(null)
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
  it.each(
    (['mutable', 'frozen'] as const).flatMap((source) =>
      (['play', 'replace', 'insert', 'insert-many', 'shuffle-pool'] as const).map((command) => ({
        source,
        command,
      })),
    ),
  )(
    'accepts a readonly $source queue through $command and keeps metadata writable internally',
    async ({ source, command }) => {
      const test = setup()
      const tracks =
        source === 'frozen' ? test.tracks.map((track) => Object.freeze({ ...track })) : test.tracks
      try {
        await test.api.playTrackFromQueue(tracks, 1, { playbackMode: 'sequential' })
        const queue = test.api.state.queue
        if (command === 'play') await test.api.playTrackFromQueue(queue, 2)
        if (command === 'replace') {
          expect(
            test.api.replaceCurrentPlaybackQueue({
              expectedSessionId: test.api.queueSession.value!.id,
              expectedTrackId: 1,
              expectedQueueTrackIds: queue.map(({ id }) => id),
              queue,
              playbackMode: 'sequential',
            }),
          ).toBe(true)
        }
        if (command === 'insert') test.api.insertTrackAfterCurrent(queue[2])
        if (command === 'insert-many') test.api.insertTracksAfterCurrent(queue.slice(1))
        if (command === 'shuffle-pool') {
          await test.api.playTrackFromQueue([queue[0]], 1, {
            playbackMode: 'shuffle',
            shufflePool: queue,
          })
        }
        if (command === 'play' || command === 'replace') expect(test.api.state.queue).toBe(queue)
        const currentId = test.api.state.currentTrackId!
        await vi.waitFor(() => expect(test.runtime.scheduleNext).toHaveBeenCalled())
        const starts = test.runtime.start.mock.calls.length
        const scheduled = test.runtime.scheduleNext.mock.calls.length
        test.changed('metadata-refresh', [1, 2, 3, 4])
        await vi.waitFor(() =>
          expect(test.api.state.currentTrack?.title).toBe(`Edited ${currentId}`),
        )
        expect(test.api.state.queue.every((track) => track.title === `Edited ${track.id}`)).toBe(
          true,
        )
        expect(test.runtime.start).toHaveBeenCalledTimes(starts)
        expect(test.runtime.scheduleNext).toHaveBeenCalledTimes(scheduled)
        if (command === 'play') {
          await test.api.playPrevious()
          expect(test.api.state.queue).toBe(queue)
          expect(test.api.state.currentTrack?.title).toBe('Edited 1')
        }
        if (command === 'shuffle-pool') {
          await test.api.playNext()
          expect(test.api.state.currentTrack?.title).toBe(`Edited ${test.api.state.currentTrackId}`)
        }
        if (source === 'frozen')
          expect(tracks.map((track) => track.title)).toEqual(['1', '2', '3', '4'])
      } finally {
        test.dispose()
      }
    },
  )

  it.each([
    { mode: 'shuffle' as const, shuffleCycle: false },
    { mode: 'shuffle' as const, shuffleCycle: true },
    { mode: 'album-shuffle' as const, shuffleCycle: false },
  ])('retains playlist scope after all its tracks become missing: %j', async (options) => {
    const test = setup()
    try {
      test.api.setGaplessPlaybackEnabled(false)
      const pool = test.tracks.slice(0, 2)
      await test.api.playTrackFromQueue(pool, 1, {
        playbackMode: options.mode,
        shufflePool: pool,
        shuffleCycle: options.shuffleCycle,
      })
      test.api.insertTrackAfterCurrent(test.tracks[2])
      await test.api.playNext()
      expect(test.api.state.currentTrackId).toBe(3)

      test.changed('track-missing', [1, 2])
      await test.api.playNext()
      expect(test.api.state.currentTrackId).toBe(3)
      expect(test.api.state.queue.map(({ id }) => id)).toEqual([3])

      test.naturalEnded()
      await vi.waitFor(() => expect(test.api.isPlaybackPending.value).toBe(false))
      expect(test.api.state.currentTrackId).toBe(3)
      expect(test.api.state.isPlaying).toBe(false)
      expect(test.deps.getRandomTrack).not.toHaveBeenCalled()
      expect(test.deps.getAlbumTracks).not.toHaveBeenCalled()
      expect(test.deps.getRandomAlbumTracks).not.toHaveBeenCalled()
    } finally {
      test.dispose()
    }
  })

  it('refreshes a frozen track retained only in the scoped shuffle pool', async () => {
    const test = setup()
    const tracks = test.tracks.map((track) => Object.freeze({ ...track }))
    test.api.setGaplessPlaybackEnabled(false)
    await test.api.playTrackFromQueue([tracks[0]], 1, {
      playbackMode: 'shuffle',
      shufflePool: tracks.slice(0, 2),
    })
    test.changed('metadata-refresh', [2])
    await vi.waitFor(() => expect(test.deps.getTrackMetadata).toHaveBeenCalledWith(2))
    await test.api.playNext()
    await vi.waitFor(() => expect(test.api.state.currentTrack?.title).toBe('Edited 2'))
    expect(tracks[1].title).toBe('2')
    test.dispose()
  })

  it('refreshes a frozen track retained only in playback history', async () => {
    const test = setup()
    test.api.setGaplessPlaybackEnabled(false)
    await test.api.playTrackFromQueue([Object.freeze({ ...test.tracks[0] })], 1, {
      playbackMode: 'shuffle',
    })
    await test.api.playNext()
    expect(test.api.state.currentTrackId).toBe(2)
    test.changed('metadata-refresh', [1])
    await vi.waitFor(() => expect(test.deps.getTrackMetadata).toHaveBeenCalledWith(1))
    await test.api.playPrevious()
    await vi.waitFor(() => expect(test.api.state.currentTrack?.title).toBe('Edited 1'))
    test.dispose()
  })

  it('refreshes frozen catalog tracks without changing the snapshot or preloaded audio', async () => {
    const fixture = setup()
    const source = fixture.tracks
    fixture.dispose()
    const catalog = await new SharedLibraryCatalogLoad(async () => ({
      snapshotId: 'frozen',
      totalTracks: source.length,
      tracks: source as TrackListItem[],
      nextCursor: null,
      diagnostics: { snapshotBuildMs: null, pageSliceMs: 0 },
    })).load(() => true)
    const test = setup([...catalog.tracks])
    await test.api.playTrackFromQueue(test.tracks, 1)
    await vi.waitFor(() => expect(test.runtime.scheduleNext).toHaveBeenCalled())
    const scheduled = test.runtime.scheduleNext.mock.calls.length
    const cancelled = test.runtime.cancelScheduledNext.mock.calls.length
    const queue = test.api.state.queue
    test.changed('metadata-refresh', [1, 2, 2, 99])
    await vi.waitFor(() => expect(test.api.state.currentTrack?.title).toBe('Edited 1'))
    expect(test.api.state.queue[1].title).toBe('Edited 2')
    expect(test.api.state.queue).toBe(queue)
    expect(test.deps.getTrackMetadata).toHaveBeenCalledTimes(2)
    expect(catalog.tracks.map((track) => track.title)).toEqual(['1', '2', '3', '4'])
    expect(Object.isFrozen(catalog.tracks[0])).toBe(true)
    expect(test.runtime.scheduleNext).toHaveBeenCalledTimes(scheduled)
    expect(test.runtime.cancelScheduledNext).toHaveBeenCalledTimes(cancelled)
    test.boundary(2)
    await vi.waitFor(() => expect(test.api.state.currentTrackId).toBe(2))
    expect(test.api.state.currentTrack?.title).toBe('Edited 2')
    expect(test.deps.diagnostics.warn).not.toHaveBeenCalled()
    test.dispose()
  })

  it('keeps edited metadata when reusing a catalog queue for selections, history and preloading', async () => {
    const fixture = setup()
    const tracks = fixture.tracks.map((track) => Object.freeze({ ...track }))
    fixture.dispose()
    const test = setup(tracks)
    try {
      await test.api.playTrackFromQueue(tracks, 1)
      await vi.waitFor(() => expect(test.nextId()).toBe(2))
      const queue = test.api.state.queue
      test.changed('metadata-refresh', [1, 2])
      await vi.waitFor(() => expect(queue[1].title).toBe('Edited 2'))
      await test.api.playTrackFromQueue(tracks, 2)
      expect(test.api.state.queue).toBe(queue)
      expect(test.api.state.currentTrack?.title).toBe('Edited 2')
      test.api.setPlaybackMode('shuffle')
      await test.api.playPrevious()
      expect(test.api.state.queue).toBe(queue)
      expect(test.api.state.currentTrack?.title).toBe('Edited 1')
      test.runtime.scheduleNext.mockClear()
      test.api.setPlaybackMode('sequential')
      await vi.waitFor(() => expect(test.nextId()).toBe(2))
      test.boundary(2)
      await vi.waitFor(() => expect(test.api.state.currentTrackId).toBe(2))
      expect(test.api.state.queue).toEqual(queue)
      expect(test.api.state.queue[1]).toBe(queue[1])
      expect(test.api.state.currentTrack?.title).toBe('Edited 2')
      expect(tracks.map((track) => track.title)).toEqual(['1', '2', '3', '4'])
      expect(test.deps.diagnostics.warn).not.toHaveBeenCalled()
    } finally {
      test.dispose()
    }
  })

  it('applies a pending metadata batch to the current queue after replacement', async () => {
    const test = setup()
    await test.api.playTrackFromQueue(test.tracks, 1)
    const pending =
      deferred<Awaited<ReturnType<NonNullable<PlaybackDependencies['getTrackMetadata']>>>>()
    vi.mocked(test.deps.getTrackMetadata!).mockReturnValueOnce(pending.promise)
    test.changed('metadata-refresh', [1])
    const replacement = test.tracks.map((track) => Object.freeze({ ...track }))
    await test.api.playTrackFromQueue(replacement, 1)
    pending.resolve({
      trackId: 1,
      title: 'After replacement',
      artistDisplay: null,
      albumTitle: null,
      albumArtistDisplay: null,
      genreDisplay: null,
      year: null,
      releaseDate: null,
    })
    await vi.waitFor(() => expect(test.api.state.currentTrack?.title).toBe('After replacement'))
    expect(test.api.state.queue[0].title).toBe('After replacement')
    expect(replacement[0].title).toBe('1')
    test.dispose()
  })

  it('keeps the newer revision when an older batch waits for another track', async () => {
    const test = setup()
    await test.api.playTrackFromQueue(test.tracks, 1)
    const slow =
      deferred<Awaited<ReturnType<NonNullable<PlaybackDependencies['getTrackMetadata']>>>>()
    vi.mocked(test.deps.getTrackMetadata!).mockImplementation(async (id) =>
      id === 2
        ? slow.promise
        : {
            trackId: id,
            title: 'Old',
            artistDisplay: null,
            albumTitle: null,
            albumArtistDisplay: null,
            genreDisplay: null,
            year: null,
            releaseDate: null,
          },
    )
    test.changed('metadata-refresh', [1, 2])
    await Promise.resolve()
    vi.mocked(test.deps.getTrackMetadata!).mockResolvedValueOnce({
      trackId: 1,
      title: 'Newest',
      artistDisplay: null,
      albumTitle: null,
      albumArtistDisplay: null,
      genreDisplay: null,
      year: null,
      releaseDate: null,
    })
    test.changed('metadata-refresh', [1])
    await vi.waitFor(() => expect(test.api.state.currentTrack?.title).toBe('Newest'))
    slow.resolve(null)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(test.api.state.currentTrack?.title).toBe('Newest')
    test.dispose()
  })

  it('refreshes current and preloaded metadata without rescheduling audio and adopts it at the boundary', async () => {
    const test = setup()
    await test.api.playTrackFromQueue(test.tracks, 1)
    await vi.waitFor(() => expect(test.runtime.scheduleNext).toHaveBeenCalled())
    const scheduled = test.runtime.scheduleNext.mock.calls.length
    const cancelled = test.runtime.cancelScheduledNext.mock.calls.length
    const starts = test.runtime.start.mock.calls.length
    test.changed('metadata-refresh', [1, 2])
    await vi.waitFor(() => expect(test.api.state.currentTrack?.title).toBe('Edited 1'))
    expect(test.api.state.queue[1].title).toBe('Edited 2')
    expect(test.runtime.start).toHaveBeenCalledTimes(starts)
    expect(test.runtime.scheduleNext).toHaveBeenCalledTimes(scheduled)
    expect(test.runtime.cancelScheduledNext).toHaveBeenCalledTimes(cancelled)
    test.boundary(2)
    await vi.waitFor(() => expect(test.api.state.currentTrackId).toBe(2))
    expect(test.api.state.currentTrack?.title).toBe('Edited 2')
    expect(test.api.state.currentTrack?.artist).toBe('New artist')
    test.dispose()
  })

  it('ignores an older asynchronous metadata response', async () => {
    const test = setup()
    await test.api.playTrackFromQueue(test.tracks, 1)
    const old =
      deferred<Awaited<ReturnType<NonNullable<PlaybackDependencies['getTrackMetadata']>>>>()
    vi.mocked(test.deps.getTrackMetadata!).mockImplementationOnce(() => old.promise)
    test.changed('metadata-refresh', [1])
    test.changed('metadata-refresh', [1])
    await vi.waitFor(() => expect(test.api.state.currentTrack?.title).toBe('Edited 1'))
    old.resolve({
      trackId: 1,
      title: 'Stale',
      artistDisplay: null,
      albumTitle: null,
      albumArtistDisplay: null,
      genreDisplay: null,
      year: null,
      releaseDate: null,
    })
    await Promise.resolve()
    expect(test.api.state.currentTrack?.title).toBe('Edited 1')
    test.dispose()
  })
  it('prepares once when startup buffering recovers before start resolves', async () => {
    const test = setup()
    const startCompletion = deferred<void>()
    test.runtime.start.mockImplementationOnce(async (trackId) => {
      test.stateEvent(trackId, false, true)
      await startCompletion.promise
    })
    const playback = test.api.playTrackFromQueue(test.tracks, 1, { playbackMode: 'shuffle' })
    try {
      await vi.waitFor(() => expect(test.runtime.start).toHaveBeenCalledOnce())
      expect(test.runtime.scheduleNext).not.toHaveBeenCalled()

      // Match nativePlaybackRuntime.receive: update snapshot, then duration/time,
      // playing, and finally buffering state.
      test.stateEvent(1, true, false)
      await vi.waitFor(() => expect(test.runtime.scheduleNext).toHaveBeenCalledOnce())
      test.stateEvent(1, true, false)
      await Promise.resolve()
      expect(test.deps.getRandomTrack).toHaveBeenCalledOnce()
      expect(test.runtime.scheduleNext).toHaveBeenCalledOnce()

      startCompletion.resolve()
      await playback
      await Promise.resolve()
      expect(test.runtime.scheduleNext).toHaveBeenCalledOnce()
      expect(test.deps.getRandomTrack).toHaveBeenCalledOnce()
    } finally {
      startCompletion.resolve()
      test.dispose()
    }
  })

  it('prepares the following track once after a buffered boundary resumes', async () => {
    const test = setup()
    try {
      await test.api.playTrackFromQueue(test.tracks.slice(0, 3), 1)
      await vi.waitFor(() => expect(test.runtime.scheduleNext).toHaveBeenCalledOnce())

      test.bufferedBoundary(2)
      await vi.waitFor(() => expect(test.api.state.currentTrackId).toBe(2))
      expect(test.runtime.scheduleNext).toHaveBeenCalledOnce()

      test.stateEvent(2, true, false)
      await vi.waitFor(() => expect(test.runtime.scheduleNext).toHaveBeenCalledTimes(2))
      expect(test.nextId()).toBe(3)
      test.stateEvent(2, true, false)
      await Promise.resolve()
      expect(test.runtime.scheduleNext).toHaveBeenCalledTimes(2)
    } finally {
      test.dispose()
    }
  })

  it('does not restart a short track that ends immediately after its boundary', async () => {
    const test = setup()
    try {
      await test.api.playTrackFromQueue(test.tracks.slice(0, 2), 1, {
        playbackMode: 'sequential',
      })
      await vi.waitFor(() => expect(test.nextId()).toBe(2))

      test.bufferedBoundary(2)
      test.naturalEnded()
      await vi.waitFor(() => expect(test.runtime.pause).toHaveBeenCalled())

      expect(test.api.state.currentTrackId).toBe(2)
      expect(test.runtime.start).toHaveBeenCalledOnce()
    } finally {
      test.dispose()
    }
  })

  it('reprepares repeat-one after a buffered boundary with the same track ID', async () => {
    const test = setup()
    try {
      await test.api.playTrackFromQueue([test.tracks[0]], 1, { playbackMode: 'repeat-one' })
      await vi.waitFor(() => expect(test.runtime.scheduleNext).toHaveBeenCalledOnce())
      expect(test.nextId()).toBe(1)

      test.bufferedBoundary(1)
      expect(test.runtime.scheduleNext).toHaveBeenCalledOnce()
      test.stateEvent(1, true, false)
      await vi.waitFor(() => expect(test.runtime.scheduleNext).toHaveBeenCalledTimes(2))
      expect(test.nextId()).toBe(1)
    } finally {
      test.dispose()
    }
  })

  it.each(['pause', 'gapless-off', 'dispose'] as const)(
    'does not prefetch after a stale buffered recovery following %s',
    async (action) => {
      const test = setup()
      try {
        test.runtime.start.mockImplementationOnce(async (trackId) => {
          test.stateEvent(trackId, false, true)
        })
        await test.api.playTrackFromQueue(test.tracks.slice(0, 3), 1)
        expect(test.runtime.scheduleNext).not.toHaveBeenCalled()

        if (action === 'pause') test.api.pause()
        if (action === 'gapless-off') test.api.setGaplessPlaybackEnabled(false)
        if (action === 'dispose') test.dispose()
        const scheduled = test.runtime.scheduleNext.mock.calls.length
        test.stateEvent(1, true, false)
        await Promise.resolve()
        expect(test.runtime.scheduleNext).toHaveBeenCalledTimes(scheduled)
      } finally {
        test.dispose()
      }
    },
  )

  it('does not apply an old buffering recovery to a manually selected track', async () => {
    const test = setup()
    try {
      test.runtime.start.mockImplementationOnce(async (trackId) => {
        test.stateEvent(trackId, false, true)
      })
      await test.api.playTrackFromQueue(test.tracks.slice(0, 2), 1)
      expect(test.runtime.scheduleNext).not.toHaveBeenCalled()

      await test.api.playTrackFromQueue(test.tracks.slice(2), 3)
      await vi.waitFor(() => expect(test.runtime.scheduleNext).toHaveBeenCalledOnce())
      expect(test.nextId()).toBe(4)
      test.stateEvent(3, true, false)
      await Promise.resolve()
      expect(test.runtime.scheduleNext).toHaveBeenCalledOnce()
      expect(test.nextId()).toBe(4)
    } finally {
      test.dispose()
    }
  })

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
      test.timeUpdate(5)
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
          test.timeUpdate(2)
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
