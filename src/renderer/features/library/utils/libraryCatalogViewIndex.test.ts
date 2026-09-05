import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { createLibraryCatalogViewIndex } from './libraryCatalogViewIndex'

function createTrack(id: number, patch: Partial<TrackListItem> = {}): TrackListItem {
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
    createdAt: '2026-08-24T00:00:00.000Z',
    ...patch,
  }
}

describe('createLibraryCatalogViewIndex', () => {
  it('builds ordered album groups and every lookup from one track pass', () => {
    const first = createTrack(1, { artist: 'A', album: 'One', releaseDate: null })
    const second = createTrack(2, {
      artist: 'A',
      album: 'One',
      releaseDate: '2026',
      artworkCacheKey: 'cover',
    })
    const third = createTrack(3, { albumArtist: 'B', album: 'Two' })
    const result = createLibraryCatalogViewIndex([first, second, third], (group) =>
      group.releaseDate ? 100 : 80,
    )

    expect(result.albumGroups).toHaveLength(2)
    expect(result.albumGroups[0]).toMatchObject({
      album: 'One',
      albumArtist: 'A',
      releaseDate: '2026',
      artworkCacheKey: 'cover',
      tracks: [first, second],
      firstTrackIndex: 0,
    })
    expect(result.albumGroups[1].tracks).toEqual([third])
    expect(result.trackIndexById.get(3)).toBe(2)
    expect(result.trackById.get(2)).toBe(second)
    expect(result.albumGroupIndexByTrackId.get(2)).toBe(0)
    expect(result.albumGroupIndexByTrackId.get(3)).toBe(1)
    expect(result.albumGroupStartOffsets).toEqual([0, 100])
  })

  it('keeps the first lookup occurrence when duplicate ids enter a snapshot', () => {
    const first = createTrack(7, { artist: 'A', album: 'One' })
    const duplicate = createTrack(7, { artist: 'B', album: 'Two' })
    const result = createLibraryCatalogViewIndex([first, duplicate], () => 80)

    expect(result.trackIndexById.get(7)).toBe(0)
    expect(result.trackById.get(7)).toBe(first)
    expect(result.albumGroupIndexByTrackId.get(7)).toBe(0)
  })
})
