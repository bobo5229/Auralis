import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaybackTrack } from '../types'
import { PlaybackNavigationSession } from './playbackNavigationSession'
import type { PlaybackTransitionSource } from './playbackTransitionPlanner'

function track(id: number, album = 'Album', artist = 'Artist'): PlaybackTrack {
  return {
    id,
    title: `Track ${id}`,
    artist,
    album,
    albumArtist: artist,
    durationSeconds: 180,
    artworkCacheKey: null,
  }
}

function dummySource(overrides: Partial<PlaybackTransitionSource> = {}): PlaybackTransitionSource {
  return {
    getRandomTrack: vi.fn(async () => null),
    getAlbumTracks: vi.fn(async () => null),
    getRandomAlbumTracks: vi.fn(async () => null),
    ...overrides,
  }
}

describe('PlaybackNavigationSession', () => {
  it.each(['shuffle', 'album-shuffle'] as const)(
    'plays every inserted track before resuming %s',
    async (playbackMode) => {
      const navigation = new PlaybackNavigationSession()
      let queue = [track(1), track(9)]
      queue = navigation.insertMultipleTracks(queue, 1, [
        track(2),
        track(2),
        track(3),
        track(4),
      ])!.queue
      queue = navigation.insertSingleTrack(queue, 1, track(5))!.queue
      navigation.removeMissingTracks(new Set([3]), 1)
      queue = queue.filter((item) => item.id !== 3)
      let current = queue[0]
      const source = dummySource()
      for (const expected of [5, 2, 4]) {
        const state = {
          queue,
          currentIndex: queue.indexOf(current),
          currentTrack: current,
          currentTrackId: current.id,
          playbackMode,
        }
        const prefetched = await navigation.resolveAdvance(state, source, 'gapless-prefetch')
        const next = await navigation.resolveAdvance(state, source, 'manual-next')
        expect(next).toEqual(prefetched)
        if (next.kind !== 'play') throw new Error('Missing queued track')
        expect(next.plan.track.id).toBe(expected)
        navigation.applyPlan(next.plan, current, queue)
        current = next.plan.track
      }
      expect(navigation.getQueuedNextTrackId()).toBeNull()
      expect(source.getRandomTrack).not.toHaveBeenCalled()
      expect(source.getRandomAlbumTracks).not.toHaveBeenCalled()
      await navigation.resolveAdvance(
        {
          queue,
          currentIndex: queue.indexOf(current),
          currentTrack: current,
          currentTrackId: current.id,
          playbackMode,
        },
        source,
        'manual-next',
      )
      if (playbackMode === 'shuffle') expect(source.getRandomTrack).toHaveBeenCalledWith(4)
      else expect(source.getRandomAlbumTracks).toHaveBeenCalledTimes(1)
      navigation.resetForTrackSwitch()
      expect(navigation.getQueuedNextTrackId()).toBeNull()
    },
  )

  let session: PlaybackNavigationSession

  beforeEach(() => {
    session = new PlaybackNavigationSession()
  })

  it('plays complete nonrepeating scoped rounds, changes seeds, and does not consume prefetches', async () => {
    const queue = [track(1), track(2), track(3), track(4)]
    session.resetForTrackSwitch({ shufflePool: queue, shuffleCycle: true })
    const source = dummySource()
    let current = queue[0]
    const played = [current.id]
    const seeds: number[] = []
    for (let i = 0; i < 11; i++) {
      const state = {
        queue,
        currentIndex: queue.indexOf(current),
        currentTrackId: current.id,
        currentTrack: current,
        playbackMode: 'shuffle' as const,
      }
      const prefetched = await session.resolveAdvance(state, source, 'gapless-prefetch', () => 0.5)
      const next = await session.resolveAdvance(state, source, 'natural-ended', () => 0.5)
      expect(next).toEqual(prefetched)
      if (next.kind !== 'play') throw new Error('Missing next track')
      seeds.push(next.plan.nextShuffleCycle!.seed)
      session.applyPlan(next.plan, current, queue)
      current = next.plan.track
      played.push(current.id)
    }
    for (let i = 0; i < 12; i += 4) expect([...played.slice(i, i + 4)].sort()).toEqual([1, 2, 3, 4])
    expect(seeds[3]).not.toBe(seeds[2])
    expect(seeds[7]).not.toBe(seeds[6])
    expect(source.getRandomTrack).not.toHaveBeenCalled()
  })

  it('repeats a one-track scoped album and stops a sequential album at its last track', async () => {
    const queue = [track(1)]
    session.resetForTrackSwitch({ shufflePool: queue, shuffleCycle: true })
    const state = {
      queue,
      currentIndex: 0,
      currentTrackId: 1,
      currentTrack: queue[0],
      playbackMode: 'shuffle' as const,
    }
    const next = await session.resolveAdvance(state, dummySource(), 'natural-ended')
    expect(next.kind === 'play' && next.plan.track.id).toBe(1)
    session.setMode('sequential')
    expect(
      await session.resolveAdvance(
        { ...state, playbackMode: 'sequential' },
        dummySource(),
        'natural-ended',
      ),
    ).toEqual({ kind: 'stop', resetTime: true })
    session.resetForTrackSwitch()
    const source = dummySource()
    await session.resolveAdvance(state, source, 'manual-next')
    expect(source.getRandomTrack).toHaveBeenCalledWith(1)
  })

  it('manages queuedNextTrackId via insertion and consumption', () => {
    const queue = [track(1), track(2)]
    const result = session.insertSingleTrack(queue, 1, track(3))
    expect(result?.queue.map((t) => t.id)).toEqual([1, 3, 2])
    expect(session.getQueuedNextTrackId()).toBe(3)

    session.applyPlan(
      {
        queue: result!.queue,
        track: track(3),
        recordHistory: true,
        consumeQueued: true,
      },
      track(1),
      queue,
    )
    expect(session.getQueuedNextTrackId()).toBeNull()
  })

  it('handles resolvePrevious for shuffle/album-shuffle history vs repeat-all wrap', () => {
    const queue = [track(1), track(2)]
    // In sequential at index 0 -> seek-to-start
    expect(session.resolvePrevious({ queue, currentIndex: 0, playbackMode: 'sequential' })).toEqual(
      {
        kind: 'seek-to-start',
      },
    )

    // In repeat-all at index 0 -> wraps to last track
    expect(session.resolvePrevious({ queue, currentIndex: 0, playbackMode: 'repeat-all' })).toEqual(
      {
        kind: 'play-queue-track',
        track: track(2),
      },
    )

    // Push history and resolve previous in shuffle mode -> restore-history
    session.pushHistory(track(1), 2, queue)
    const prev = session.resolvePrevious({ queue, currentIndex: 1, playbackMode: 'shuffle' })
    expect(prev.kind).toBe('restore-history')
  })

  it('cleans up missing tracks across pools, contexts, history, and queuedNextTrackId', () => {
    session.setShuffleTrackPool([track(1), track(2), track(3)])
    session.setAlbumShuffleContext({
      albumArtist: 'Artist',
      album: 'Album',
      tracks: [track(2), track(3)],
    })
    session.setQueuedNextTrackId(3)
    session.pushHistory(track(1), 2, [track(1), track(2)])

    const res = session.removeMissingTracks(new Set([3]), 1)
    expect(res.currentTrackMissing).toBe(false)
    expect(session.getShuffleTrackPool()?.map((t) => t.id)).toEqual([1, 2])
    expect(session.getAlbumShuffleContext()?.tracks.map((t) => t.id)).toEqual([2])
    expect(session.getQueuedNextTrackId()).toBeNull()

    const currentMissing = session.removeMissingTracks(new Set([1]), 1)
    expect(currentMissing.currentTrackMissing).toBe(true)
  })

  it('delegates resolveAdvance correctly', async () => {
    const queue = [track(1), track(2)]
    const decision = await session.resolveAdvance(
      {
        queue,
        currentIndex: 0,
        currentTrackId: 1,
        currentTrack: queue[0],
        playbackMode: 'sequential',
      },
      dummySource(),
      'manual-next',
    )

    expect(decision).toEqual({
      kind: 'play',
      plan: {
        queue,
        track: track(2),
        recordHistory: true,
        consumeQueued: false,
      },
    })
  })

  it('resets queue context including queued tracks, contexts, pools, and mode', () => {
    session.setQueuedNextTrackId(9)
    session.setAlbumShuffleContext({
      albumArtist: 'Artist',
      album: 'Album',
      tracks: [track(1)],
    })
    session.pushHistory(track(1), 2, [track(1), track(2)])

    session.resetQueueContext({
      mode: 'sequential',
      shufflePool: [track(1), track(2)],
      shuffleCycle: true,
    })

    expect(session.getQueuedNextTrackId()).toBeNull()
    expect(session.getAlbumShuffleContext()).toBeNull()
    expect(session.getShuffleTrackPool()?.map((t) => t.id)).toEqual([1, 2])
    expect(session.popHistory()).toBeNull()
  })
})

