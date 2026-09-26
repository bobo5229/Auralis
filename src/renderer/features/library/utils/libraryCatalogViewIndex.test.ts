import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { getAlbumGroupEstimatedHeight } from '../constants/libraryLayoutMetrics'
import { getAlbumCoverDiscHeadingCount } from './albumCoverDiscHeadings'
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
    composer: null,
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

  it('includes disc headings in cumulative offsets for long cover lists', () => {
    const tracks = Array.from({ length: 120 * 8 }, (_, index) => {
      const groupIndex = Math.floor(index / 8)
      const trackIndex = index % 8
      const discNo =
        groupIndex % 3 === 0 ? (trackIndex < 4 ? 1 : 2) : groupIndex % 3 === 1 ? 2 : null

      return createTrack(index + 1, {
        album: `Album ${groupIndex}`,
        albumArtist: 'Artist',
        discNo,
      })
    })
    const result = createLibraryCatalogViewIndex(tracks, (group) =>
      getAlbumGroupEstimatedHeight(
        group.tracks.length,
        Boolean(group.releaseDate),
        getAlbumCoverDiscHeadingCount(group.tracks),
      ),
    )

    expect(result.albumGroups).toHaveLength(120)
    expect(result.albumGroupStartOffsets[99]).toBe(41_085)
    expect(result.albumGroupStartOffsets[119]).toBe(49_401)
  })
})
