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
  let session: PlaybackNavigationSession

  beforeEach(() => {
    session = new PlaybackNavigationSession()
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
})
