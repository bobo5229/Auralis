import { createArtistIndex, resolveIndexArtist } from '@shared/utils/artistIndex'
import type { TrackListItem } from '@shared/types/libraryScan'

const artistCollator = new Intl.Collator('zh-Hans-u-co-pinyin', {
  sensitivity: 'base',
  numeric: true,
})

function compareNullableText(left: string | null, right: string | null): number {
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  return artistCollator.compare(left, right)
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === right) return 0
  if (left === null) return -1
  if (right === null) return 1
  return left - right
}

export function sortLibraryTracks(tracks: TrackListItem[]): TrackListItem[] {
  const artistIndex = createArtistIndex()

  return tracks.sort(
    (left, right) =>
      artistIndex.compare(
        resolveIndexArtist(left.albumArtist, left.artist),
        resolveIndexArtist(right.albumArtist, right.artist),
      ) ||
      compareNullableText(left.releaseDate, right.releaseDate) ||
      compareNullableNumber(left.discNo, right.discNo) ||
      compareNullableNumber(left.trackNo, right.trackNo) ||
      left.id - right.id,
  )
}
