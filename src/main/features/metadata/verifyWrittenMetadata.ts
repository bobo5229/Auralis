import type { IAudioMetadata } from 'music-metadata'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import { normalizeArtists, resolveGenres } from './metadataNormalizer'

/** Compare actual tags, not display fallbacks such as filename/Unknown Artist. */
export function verifyWrittenMetadata(
  expected: EditableTrackMetadata,
  actual: Pick<IAudioMetadata, 'common' | 'native'>,
): void {
  const { common, native } = actual
  const text = (value: string | null | undefined) => value?.trim() || ''
  const list = (value: string | null) =>
    (value ?? '')
      .split(';')
      .map((v) => v.trim())
      .filter(Boolean)
      .join('; ')
  const expectedDate = text(expected.releaseDate) || String(expected.year ?? '')
  let actualDate = text(common.date) || String(common.year ?? '')
  if (!common.date && common.year !== undefined) {
    const dayMonth = native['ID3v2.3']?.find((tag) => tag.id === 'TDAT')?.value
    // FFmpeg writes v2.3 dates as TYER + TDAT (DDMM); music-metadata exposes only TYER in common.
    if (typeof dayMonth === 'string' && /^\d{4}$/.test(dayMonth)) {
      actualDate = `${String(common.year).padStart(4, '0')}-${dayMonth.slice(2)}-${dayMonth.slice(0, 2)}`
    }
  }
  const actualGenres = resolveGenres({ common } as Parameters<typeof resolveGenres>[0]).join('; ')
  if (
    text(common.title) !== text(expected.title) ||
    normalizeArtists(common.artists, common.artist).join('; ') !== list(expected.artistDisplay) ||
    text(common.album) !== text(expected.albumTitle) ||
    list(common.albumartist ?? null) !== list(expected.albumArtistDisplay) ||
    actualGenres !== list(expected.genreDisplay) ||
    actualDate !== expectedDate
  ) {
    throw new Error('Written audio tags do not match the requested edit; refresh required')
  }
}
