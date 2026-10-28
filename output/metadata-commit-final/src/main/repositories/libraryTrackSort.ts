import { pinyin } from 'pinyin-pro'
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
  const artistSortKeys = new Map<string, string>()

  function artistSortKey(name: string): string {
    let key = artistSortKeys.get(name)
    if (key === undefined) {
      key = pinyin(name.trim(), { toneType: 'none', type: 'string', nonZh: 'consecutive' })
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
      artistSortKeys.set(name, key)
    }
    return key
  }

  function compareAlbumArtists(left: string | null, right: string | null): number {
    if (left !== null && right !== null) {
      const leftStartsWithDigit = /^\p{Decimal_Number}/u.test(left.trimStart())
      const rightStartsWithDigit = /^\p{Decimal_Number}/u.test(right.trimStart())
      if (leftStartsWithDigit !== rightStartsWithDigit) return leftStartsWithDigit ? 1 : -1

      return (
        artistCollator.compare(artistSortKey(left), artistSortKey(right)) ||
        artistCollator.compare(left, right)
      )
    }
    return compareNullableText(left, right)
  }

  return tracks.sort(
    (left, right) =>
      compareAlbumArtists(left.albumArtist, right.albumArtist) ||
      compareNullableText(left.releaseDate, right.releaseDate) ||
      compareNullableNumber(left.discNo, right.discNo) ||
      compareNullableNumber(left.trackNo, right.trackNo) ||
      left.id - right.id,
  )
}
