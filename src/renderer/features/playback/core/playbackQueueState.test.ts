import { describe, expect, it } from 'vitest'
import type { PlaybackTrack } from '../types'
import {
  insertTrackAfterCurrent,
  insertTracksAfterCurrent,
  PlaybackHistory,
  type PlaybackHistoryContext,
} from './playbackQueueState'

function track(id: number): PlaybackTrack {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    durationSeconds: 180,
    artworkCacheKey: null,
  }
}

function context(ids: number[]): PlaybackHistoryContext {
  const tracks = ids.map(track)
  return {
    queue: tracks,
    shuffleTrackPool: tracks,
    albumShuffleContext: {
      albumArtist: 'Artist',
      album: 'Album',
      tracks,
    },
  }
}

describe('PlaybackHistory', () => {
  it('restores entries in LIFO order with their full queue context', () => {
    const history = new PlaybackHistory()
    history.push(track(1), 2, context([1, 2]))
    history.push(track(2), 3, context([2, 3]))

    expect(history.pop()).toMatchObject({ track: { id: 2 }, queue: [{ id: 2 }, { id: 3 }] })
    expect(history.pop()).toMatchObject({ track: { id: 1 }, queue: [{ id: 1 }, { id: 2 }] })
    expect(history.pop()).toBeNull()
  })

  it('ignores self-transitions and enforces its capacity', () => {
    const history = new PlaybackHistory(2)
    history.push(track(1), 1, context([1]))
    history.push(track(1), 2, context([1, 2]))
    history.push(track(2), 3, context([2, 3]))
    history.push(track(3), 4, context([3, 4]))

    expect(history.pop()?.track.id).toBe(3)
    expect(history.pop()?.track.id).toBe(2)
    expect(history.pop()).toBeNull()
  })

  it('removes missing tracks from entries and nested contexts', () => {
    const history = new PlaybackHistory()
    history.push(track(1), 2, context([1, 2, 3]))
    history.push(track(2), 3, context([2, 3]))

    history.removeTracks(new Set([2]))
    const entry = history.pop()

    expect(entry?.track.id).toBe(1)
    expect(entry?.queue.map(({ id }) => id)).toEqual([1, 3])
    expect(entry?.shuffleTrackPool?.map(({ id }) => id)).toEqual([1, 3])
    expect(entry?.albumShuffleContext?.tracks.map(({ id }) => id)).toEqual([1, 3])
  })
})

describe('queue insertion', () => {
  it('moves an existing track directly after the current track', () => {
    const result = insertTrackAfterCurrent([track(1), track(2), track(3)], 1, track(3))

    expect(result?.queue.map(({ id }) => id)).toEqual([1, 3, 2])
    expect(result).toMatchObject({ currentIndex: 0, queuedTrackId: 3 })
  })

  it('inserts a batch in order and removes its previous queue positions', () => {
    const result = insertTracksAfterCurrent([track(1), track(2), track(3), track(4)], 2, [
      track(4),
      track(1),
    ])

    expect(result?.queue.map(({ id }) => id)).toEqual([2, 4, 1, 3])
    expect(result).toMatchObject({ currentIndex: 0, queuedTrackId: 4 })
  })

  it('rejects the current track and queues without the current track', () => {
    expect(insertTrackAfterCurrent([track(1)], 1, track(1))).toBeNull()
    expect(insertTrackAfterCurrent([track(2)], 1, track(3))).toBeNull()
    expect(insertTracksAfterCurrent([track(1)], 1, [track(1)])).toBeNull()
  })

  it('inserts a large batch in first-occurrence order without changing either source', () => {
    const batch = Array.from({ length: 200_000 }, (_, index) => track(index + 10))
    const queue = [track(1), batch[1], track(2), batch[0], track(3)]
    const input = [batch[0], track(2), ...batch, batch[1]]
    const result = insertTracksAfterCurrent(queue, 2, input)!

    expect(result).toMatchObject({ currentIndex: 1, queuedTrackId: 10 })
    expect(result.queue).toHaveLength(batch.length + 3)
    expect(result.queue.slice(0, 5).map(({ id }) => id)).toEqual([1, 2, 10, 11, 12])
    expect(result.queue.at(-1)?.id).toBe(3)
    expect(result.queue.slice(2, -1)).toEqual(batch)
    expect(queue.map(({ id }) => id)).toEqual([1, 11, 2, 10, 3])
    expect(input).toHaveLength(batch.length + 3)
  })
})
