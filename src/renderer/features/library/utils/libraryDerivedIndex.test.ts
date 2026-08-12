import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { createLibraryDerivedIndex } from './libraryDerivedIndex'

function createTrack(id: number): TrackListItem {
  return {
    id,
    title: `Track ${id}`,
    artist: null,
    album: null,
    albumArtist: null,
    trackNo: null,
    discNo: null,
    releaseDate: null,
    copyright: null,
    durationSeconds: null,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-08-12T00:00:00.000Z',
  }
}

describe('createLibraryDerivedIndex', () => {
  it('builds track, group and cumulative offset lookups from one snapshot', () => {
    const first = createTrack(1)
    const second = createTrack(2)
    const third = createTrack(3)
    const groups = [
      { tracks: [first, second], height: 300 },
      { tracks: [third], height: 220 },
    ]

    const index = createLibraryDerivedIndex([first, second, third], groups, (group) => group.height)

    expect([...index.trackIndexById]).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
    ])
    expect(index.trackById.get(2)).toBe(second)
    expect([...index.albumGroupIndexByTrackId]).toEqual([
      [1, 0],
      [2, 0],
      [3, 1],
    ])
    expect(index.albumGroupStartOffsets).toEqual([0, 300])
    expect(Object.isFrozen(index.albumGroupStartOffsets)).toBe(true)
  })

  it('keeps the first occurrence when duplicate ids enter a snapshot', () => {
    const original = createTrack(1)
    const duplicate = { ...original, title: 'Duplicate' }
    const index = createLibraryDerivedIndex([original, duplicate], [], () => 0)

    expect(index.trackIndexById.get(1)).toBe(0)
    expect(index.trackById.get(1)).toBe(original)
  })
})
