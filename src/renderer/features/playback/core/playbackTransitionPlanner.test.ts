import { describe, expect, it, vi } from 'vitest'
import type { PlaybackMode, PlaybackTrack } from '../types'
import type { AlbumShuffleContext } from './playbackQueueState'
import {
  buildAlbumShuffleContexts,
  resolvePlaybackAdvance,
  resolvePlaybackTransition,
  type PlaybackTransitionSource,
  type PlaybackTransitionState,
} from './playbackTransitionPlanner'

function track(id: number, album = 'Album', albumArtist = 'Artist'): PlaybackTrack {
  return {
    id,
    title: `Track ${id}`,
    artist: albumArtist,
    album,
    albumArtist,
    durationSeconds: 180,
    artworkCacheKey: null,
  }
}

function state(
  playbackMode: PlaybackMode,
  overrides: Partial<PlaybackTransitionState> = {},
): PlaybackTransitionState {
  const queue = [track(1), track(2), track(3)]
  return {
    currentTrackId: 1,
    currentTrack: queue[0],
    queue,
    currentIndex: 0,
    playbackMode,
    queuedNextTrackId: null,
    albumShuffleContext: null,
    shuffleTrackPool: null,
    ...overrides,
  }
}

function source(overrides: Partial<PlaybackTransitionSource> = {}): PlaybackTransitionSource {
  return {
    getRandomTrack: vi.fn(async () => null),
    getAlbumTracks: vi.fn(async () => null),
    getRandomAlbumTracks: vi.fn(async () => null),
    ...overrides,
  }
}

describe('resolvePlaybackTransition & resolvePlaybackAdvance', () => {
  it('consumes an explicitly queued next track before the active mode', async () => {
    const result = await resolvePlaybackTransition(
      state('shuffle', { queuedNextTrackId: 2 }),
      source(),
    )

    expect(result).toMatchObject({ track: { id: 2 }, consumeQueued: true })
  })

  it('repeats the current track without recording history for natural-ended/prefetch in repeat-one', async () => {
    const result = await resolvePlaybackTransition(state('repeat-one'), source())
    expect(result).toMatchObject({ track: { id: 1 }, recordHistory: false })

    const advanceEnded = await resolvePlaybackAdvance(
      state('repeat-one'),
      source(),
      'natural-ended',
    )
    expect(advanceEnded).toEqual({
      kind: 'play',
      plan: {
        queue: [track(1), track(2), track(3)],
        track: track(1),
        recordHistory: false,
        consumeQueued: false,
      },
    })
  })

  it('advances sequentially on manual-next in repeat-one mode', async () => {
    const advanceManual = await resolvePlaybackAdvance(state('repeat-one'), source(), 'manual-next')
    expect(advanceManual).toMatchObject({
      kind: 'play',
      plan: {
        track: { id: 2 },
        recordHistory: true,
        consumeQueued: false,
      },
    })
  })

  it('distinguishes sequential end: noop on manual-next, stop on natural-ended', async () => {
    const atEnd = { currentTrackId: 3, currentTrack: track(3), currentIndex: 2 }
    const manual = await resolvePlaybackAdvance(state('sequential', atEnd), source(), 'manual-next')
    expect(manual).toEqual({ kind: 'noop' })

    const ended = await resolvePlaybackAdvance(
      state('sequential', atEnd),
      source(),
      'natural-ended',
    )
    expect(ended).toEqual({ kind: 'stop', resetTime: true })
  })

  it('wraps repeat-all at the end for all triggers', async () => {
    const atEnd = { currentTrackId: 3, currentTrack: track(3), currentIndex: 2 }
    await expect(
      resolvePlaybackTransition(state('repeat-all', atEnd), source()),
    ).resolves.toMatchObject({ track: { id: 1 } })

    const manual = await resolvePlaybackAdvance(state('repeat-all', atEnd), source(), 'manual-next')
    expect(manual).toMatchObject({ kind: 'play', plan: { track: { id: 1 } } })
  })

  it('uses the scoped shuffle pool without IPC', async () => {
    const api = source()
    const result = await resolvePlaybackAdvance(
      state('shuffle', { shuffleTrackPool: [track(1), track(9), track(10)] }),
      api,
      'manual-next',
      () => 0,
    )

    expect(result).toMatchObject({ kind: 'play', plan: { track: { id: 9 } } })
    expect(api.getRandomTrack).not.toHaveBeenCalled()
  })

  it('continues within the current album before selecting another album', async () => {
    const context: NonNullable<AlbumShuffleContext> = {
      albumArtist: 'Artist',
      album: 'Album',
      tracks: [track(1), track(2)],
    }
    const api = source()
    const result = await resolvePlaybackAdvance(
      state('album-shuffle', { albumShuffleContext: context }),
      api,
      'natural-ended',
    )

    expect(result).toMatchObject({
      kind: 'play',
      plan: { track: { id: 2 }, nextAlbumShuffleContext: context },
    })
    expect(api.getRandomAlbumTracks).not.toHaveBeenCalled()
  })

  it('selects the first track of a different scoped album at a boundary', async () => {
    const pool = [track(1, 'A'), track(2, 'A'), track(3, 'B'), track(4, 'B')]
    const result = await resolvePlaybackAdvance(
      state('album-shuffle', {
        currentTrackId: 2,
        currentTrack: pool[1],
        queue: pool.slice(0, 2),
        currentIndex: 1,
        albumShuffleContext: { albumArtist: 'Artist', album: 'A', tracks: pool.slice(0, 2) },
        shuffleTrackPool: pool,
      }),
      source(),
      'manual-next',
      () => 0,
    )

    expect(result).toMatchObject({ kind: 'play', plan: { track: { id: 3 } } })
  })
})

describe('buildAlbumShuffleContexts', () => {
  it('groups tracks by normalized album artist and album while preserving order', () => {
    const contexts = buildAlbumShuffleContexts([
      track(1, ' Album ', 'ARTIST'),
      track(2, 'album', 'artist'),
      track(3, 'Other', 'Artist'),
    ])

    expect(contexts.map((context) => context.tracks.map(({ id }) => id))).toEqual([[1, 2], [3]])
  })
})
