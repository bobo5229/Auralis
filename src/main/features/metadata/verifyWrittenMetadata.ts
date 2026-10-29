import { isDeepStrictEqual } from 'node:util'
import { normalizeMetadata } from './metadataNormalizer'
import { normalizeMetadataField, EDITABLE_TAG_FIELDS } from '@shared/utils/metadataEditRequest'
import type { IAudioMetadata } from 'music-metadata'
import type { AudioTagEdit as EditableTrackMetadata } from './audioTagEdit'
import { canonicalizeDelimitedValues, joinDelimitedValues } from '@shared/utils/delimitedValues'
import {
  resolveArtists,
  resolveAlbumArtists,
  resolveGenres,
  resolveLyrics,
  resolveFileDate,
} from './metadataNormalizer'
import { MetadataSaveError } from './metadataSaveError'

/** Compare actual tags, not display fallbacks such as filename/Unknown Artist. */
export function verifyWrittenMetadata(
  expected: EditableTrackMetadata,
  actual: Pick<IAudioMetadata, 'common' | 'native'>,
): void {
  if (expected.lyricsText !== undefined) {
    const actualLyrics = resolveLyrics(actual, true)
    if ((actualLyrics?.text ?? '') !== expected.lyricsText)
      throw new MetadataSaveError('tag-verification-failed', 'Written lyrics do not match the edit')
    return
  }
  if (expected.expectedArtwork) {
    const pictures = actual.common.picture ?? []
    if (
      pictures.length !== expected.expectedArtwork.length ||
      expected.expectedArtwork.some((picture, index) =>
        picture.original
          ? !isDeepStrictEqual(picture.original, pictures[index])
          : pictures[index]!.format !== picture.format ||
            !Buffer.from(pictures[index]!.data).equals(picture.data),
      )
    )
      throw new MetadataSaveError(
        'tag-verification-failed',
        'Written artwork does not match the requested edit',
      )
  }
  const tags = normalizeMetadata({
    ...actual,
    format: { trackInfo: [], tagTypes: [] },
    quality: { warnings: [] },
  }).fileTags
  for (const field of EDITABLE_TAG_FIELDS) {
    if (!Object.hasOwn(expected, field)) continue
    if (
      normalizeMetadataField(field, tags[field]) !== normalizeMetadataField(field, expected[field])
    )
      throw new MetadataSaveError(
        'tag-verification-failed',
        `Written audio tags do not match the requested edit; refresh required (${field})`,
      )
  }
  const { common } = actual
  const text = (value: string | null | undefined) => value?.trim() || ''
  const list = (value: string | null) => canonicalizeDelimitedValues(value) ?? ''
  const expectedDate = text(expected.releaseDate) || String(expected.year ?? '')
  const actualDate = resolveFileDate(actual) ?? ''
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
    throw new MetadataSaveError(
      'tag-verification-failed',
      'Written audio tags do not match the requested edit; refresh required',
    )
  }
}
