import { describe, expect, it, vi } from 'vitest'
import type { AlbumShuffleContext, PlaybackMode, PlaybackTrack } from '../types'
import {
  buildAlbumShuffleContexts,
  getAlbumIdentity,
  getAlbumKey,
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
  it.each([
    { artist: null, albumArtist: null, expected: 'Unknown Artist' },
    { artist: '', albumArtist: '', expected: 'Unknown Artist' },
    { artist: 'Artist', albumArtist: null, expected: 'Artist' },
    { artist: null, albumArtist: 'Band', expected: 'Band' },
  ])(
    'uses the displayed album identity when artists are cleared: %j',
    async ({ artist, albumArtist, expected }) => {
      const tracks = [track(1), track(2)].map((item) => ({ ...item, artist, albumArtist }))
      const key = { albumArtist: expected, album: 'Album' }
      const api = source({ getAlbumTracks: vi.fn(async () => ({ ...key, tracks })) })
      const current = state('album-shuffle', { queue: [tracks[0]], currentTrack: tracks[0] })
      expect(getAlbumKey(tracks[0])).toEqual(key)
      expect(getAlbumIdentity(tracks[0])).toBe(getAlbumIdentity(track(3, 'Album', expected)))
      expect(buildAlbumShuffleContexts(tracks)).toEqual([{ ...key, tracks }])
      expect(await resolvePlaybackAdvance(current, api, 'manual-next')).toMatchObject({
        kind: 'play',
        plan: { track: { id: 2 } },
      })
      expect(api.getAlbumTracks).toHaveBeenCalledWith(key)
      await resolvePlaybackAdvance(
        { ...current, currentTrackId: 2, currentTrack: tracks[1] },
        api,
        'manual-next',
      )
      expect(api.getRandomAlbumTracks).toHaveBeenCalledWith(key)
    },
  )

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

  it('consumes surviving shuffle tracks without drawing again or mutating the round', async () => {
    const pool = [track(1), track(2), track(3)]
    const cycle = { seed: 42, remaining: [99, 3, 2] }
    const random = vi.fn(() => 0)
    const api = source()
    const result = await resolvePlaybackAdvance(
      state('shuffle', { shuffleTrackPool: pool, shuffleCycle: cycle }),
      api,
      'gapless-prefetch',
      random,
    )
    expect(result).toMatchObject({
      kind: 'play',
      plan: { track: { id: 3 }, nextShuffleCycle: { seed: 42, remaining: [2] } },
    })
    if (result.kind === 'play') expect(result.plan.queue).toBe(pool)
    expect(cycle).toEqual({ seed: 42, remaining: [99, 3, 2] })
    expect(random).not.toHaveBeenCalled()
    expect(api.getRandomTrack).not.toHaveBeenCalled()
  })

  it('starts a scoped shuffle round with every other track exactly once', async () => {
    const pool = [track(1), track(2), track(3)]
    const random = vi.fn(() => 0)
    const result = await resolvePlaybackAdvance(
      state('shuffle', { shuffleTrackPool: pool, shuffleCycle: null }),
      source(),
      'manual-next',
      random,
    )
    expect(result.kind).toBe('play')
    if (result.kind !== 'play') return
    expect([result.plan.track.id, ...result.plan.nextShuffleCycle!.remaining].sort()).toEqual([
      2, 3,
    ])
    expect(result.plan.nextShuffleCycle!.seed).toBe(1)
    expect(random).toHaveBeenCalledTimes(1)
  })

  it('refills a shuffle round without immediately repeating the current track', async () => {
    const pool = [track(1), track(2), track(3)]
    const cycle = { seed: 0, remaining: [] }
    const random = vi.fn(() => 0.9)
    const result = await resolvePlaybackAdvance(
      state('shuffle', { shuffleTrackPool: pool, shuffleCycle: cycle }),
      source(),
      'natural-ended',
      random,
    )
    expect(result.kind).toBe('play')
    if (result.kind !== 'play') return
    expect(result.plan.track.id).not.toBe(1)
    expect([result.plan.track.id, ...result.plan.nextShuffleCycle!.remaining].sort()).toEqual([
      1, 2, 3,
    ])
    expect(cycle).toEqual({ seed: 0, remaining: [] })
    expect(random).toHaveBeenCalledTimes(1)
  })

  it.each([
    { mode: 'shuffle' as const, shuffleCycle: undefined },
    { mode: 'shuffle' as const, shuffleCycle: null },
    { mode: 'album-shuffle' as const, shuffleCycle: undefined },
  ])('keeps an exhausted shuffle scope empty for every advance trigger: %j', async (options) => {
    const api = source({
      getRandomTrack: vi.fn(async () => track(9)),
      getAlbumTracks: vi.fn(async () => ({
        album: 'Album',
        albumArtist: 'Artist',
        tracks: [track(1), track(9)],
      })),
      getRandomAlbumTracks: vi.fn(async () => ({
        album: 'Other',
        albumArtist: 'Artist',
        tracks: [track(10, 'Other')],
      })),
    })
    for (const trigger of ['manual-next', 'natural-ended', 'gapless-prefetch'] as const) {
      expect(
        await resolvePlaybackAdvance(
          state(options.mode, { shuffleTrackPool: [], shuffleCycle: options.shuffleCycle }),
          api,
          trigger,
        ),
      ).toEqual({ kind: 'noop' })
    }
    expect(api.getRandomTrack).not.toHaveBeenCalled()
    expect(api.getAlbumTracks).not.toHaveBeenCalled()
    expect(api.getRandomAlbumTracks).not.toHaveBeenCalled()
  })

  it.each(['shuffle', 'album-shuffle'] as const)(
    'keeps explicitly queued tracks ahead of an empty %s scope',
    async (mode) => {
      expect(
        await resolvePlaybackTransition(
          state(mode, { shuffleTrackPool: [], queuedNextTrackId: 2 }),
          source(),
        ),
      ).toMatchObject({ track: { id: 2 }, consumeQueued: true })
    },
  )

  it.each(['shuffle', 'album-shuffle'] as const)(
    'keeps whole-library %s available when no scope is set',
    async (mode) => {
      const api = source({
        getRandomTrack: vi.fn(async () => track(9)),
        getRandomAlbumTracks: vi.fn(async () => ({
          album: 'Other',
          albumArtist: 'Artist',
          tracks: [track(9, 'Other')],
        })),
      })
      expect(await resolvePlaybackAdvance(state(mode), api, 'manual-next')).toMatchObject({
        kind: 'play',
        plan: { track: { id: 9 } },
      })
    },
  )

  it('keeps sequential playback independent of the shuffle scope', async () => {
    expect(
      await resolvePlaybackAdvance(
        state('sequential', { shuffleTrackPool: [] }),
        source(),
        'manual-next',
      ),
    ).toMatchObject({ kind: 'play', plan: { track: { id: 2 } } })
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
