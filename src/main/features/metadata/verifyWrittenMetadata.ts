import type { IAudioMetadata } from 'music-metadata'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import { canonicalizeDelimitedValues, joinDelimitedValues } from '@shared/utils/delimitedValues'
import { resolveArtists, resolveAlbumArtists, resolveGenres } from './metadataNormalizer'

/** Compare actual tags, not display fallbacks such as filename/Unknown Artist. */
export function verifyWrittenMetadata(
  expected: EditableTrackMetadata,
  actual: Pick<IAudioMetadata, 'common' | 'native'>,
): void {
  const { common, native } = actual
  const text = (value: string | null | undefined) => value?.trim() || ''
  const list = (value: string | null) => canonicalizeDelimitedValues(value) ?? ''
  const expectedDate = text(expected.releaseDate) || String(expected.year ?? '')
  let actualDate = text(common.date) || String(common.year ?? '')
  if (!common.date && common.year !== undefined) {
    const dayMonth = native['ID3v2.3']?.find((tag) => tag.id === 'TDAT')?.value
    // FFmpeg writes v2.3 dates as TYER + TDAT (DDMM); music-metadata exposes only TYER in common.
    if (typeof dayMonth === 'string' && /^\d{4}$/.test(dayMonth)) {
      actualDate = `${String(common.year).padStart(4, '0')}-${dayMonth.slice(2)}-${dayMonth.slice(0, 2)}`
    }
  }
  const actualGenres = joinDelimitedValues(resolveGenres(actual)) ?? ''
  if (
    text(common.title) !== text(expected.title) ||
    (joinDelimitedValues(resolveArtists(actual)) ?? '') !== list(expected.artistDisplay) ||
    text(common.album) !== text(expected.albumTitle) ||
    (joinDelimitedValues(resolveAlbumArtists(actual)) ?? '') !==
      list(expected.albumArtistDisplay) ||
    actualGenres !== list(expected.genreDisplay) ||
    actualDate !== expectedDate
  ) {
    throw new Error('Written audio tags do not match the requested edit; refresh required')
  }
}
