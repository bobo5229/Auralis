import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { sortLibraryTracks } from './libraryTrackSort'

function track(
  id: number,
  albumArtist: string | null,
  releaseDate: string | null = '2020',
  discNo: number | null = 1,
  trackNo: number | null = 1,
): TrackListItem {
  return { id, albumArtist, releaseDate, discNo, trackNo } as TrackListItem
}

describe('sortLibraryTracks', () => {
  it('interleaves Chinese pinyin and English names while keeping digit-leading names last', () => {
    const tracks = [
      track(1, '周杰伦'),
      track(2, 'Coldplay'),
      track(3, '2Pac'),
      track(4, '陈奕迅'),
      track(5, 'Adele'),
      track(6, 'BTS'),
      track(7, null),
    ]

    expect(sortLibraryTracks(tracks).map((item) => item.id)).toEqual([5, 6, 4, 2, 1, 3, 7])
  })

  it('preserves date, disc, track and id priorities within one artist', () => {
    const tracks = [
      track(6, '陈奕迅', null),
      track(5, '陈奕迅', '2020', 1, 2),
      track(4, '陈奕迅', '2020', 2, 1),
      track(3, '陈奕迅', '2020', 1, 1),
      track(2, '陈奕迅', '2019', 1, 1),
      track(1, '陈奕迅', '2020', 1, 1),
    ]

    expect(sortLibraryTracks(tracks).map((item) => item.id)).toEqual([2, 1, 3, 5, 4, 6])
  })
})
