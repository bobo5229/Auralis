import { describe, expect, it } from 'vitest'
import {
  formatAlbumCoverDiscHeading,
  getAlbumCoverDiscHeadingCount,
  getAlbumCoverTrackDiscHeadings,
} from './albumCoverDiscHeadings'

describe('album cover disc headings', () => {
  it('keeps a single disc unlabelled and treats missing disc numbers as disc 1', () => {
    const tracks = [{ discNo: null }, { discNo: 1 }, { discNo: null }]

    expect(getAlbumCoverDiscHeadingCount(tracks)).toBe(0)
    expect(getAlbumCoverTrackDiscHeadings(tracks)).toEqual([null, null, null])
  })

  it('labels each disc once at its first track without changing track order', () => {
    const tracks = [
      { id: 1, discNo: null },
      { id: 2, discNo: 2 },
      { id: 3, discNo: 1 },
      { id: 4, discNo: 2 },
      { id: 5, discNo: null },
    ]

    expect(getAlbumCoverDiscHeadingCount(tracks)).toBe(2)
    expect(getAlbumCoverTrackDiscHeadings(tracks)).toEqual([1, 2, null, null, null])
    expect(tracks.map((track) => track.id)).toEqual([1, 2, 3, 4, 5])
  })

  it('omits headings when the current view contains tracks from only one disc', () => {
    const playlistTracks = [{ discNo: 2 }, { discNo: 2 }, { discNo: 2 }]

    expect(getAlbumCoverDiscHeadingCount(playlistTracks)).toBe(0)
    expect(getAlbumCoverTrackDiscHeadings(playlistTracks)).toEqual([null, null, null])
  })

  it('formats headings as Disc followed by a two-digit number', () => {
    expect(formatAlbumCoverDiscHeading(1)).toBe('Disc 01')
    expect(formatAlbumCoverDiscHeading(12)).toBe('Disc 12')
  })
})
