import type { IAudioMetadata } from 'music-metadata'
import { basename, parse } from 'node:path'
import { cleanDelimitedValues, joinDelimitedValues } from '@shared/utils/delimitedValues'

export interface NormalizedMetadata {
  title: string
  artistDisplay: string
  artists: string[]
  artist: string
  albumTitle: string
  album: string
  albumArtistDisplay: string
  albumArtists: string[]
  albumArtist: string
  trackNo: number | null
  discNo: number | null
  durationSeconds: number | null
  year: number | null
  releaseDate: string | null
  copyright: string | null
  composers: string[]
  composer: string | null
  genres: string[]
  genre: string | null
  lyricsText: string | null
  lyricsFormat: 'lrc' | 'plain' | null
  isrc: string | null
}

export interface NormalizedIdentity {
  title: string
  artist: string
  album: string
  isrc: string | null
}

// ---------------------------------------------------------------------------
// Year extraction
// ---------------------------------------------------------------------------

export function getYear(commonYear: number | undefined, date: string | undefined): number | null {
  if (typeof commonYear === 'number') return commonYear

  if (date) {
    const parsedYear = Number.parseInt(date.slice(0, 4), 10)
    return Number.isNaN(parsedYear) ? null : parsedYear
  }

  return null
}

// ---------------------------------------------------------------------------
// Multi-value artist / albumArtist
// ---------------------------------------------------------------------------

export function normalizeArtists(artists?: string[], artist?: string): string[] {
  const values = cleanDelimitedValues(artists ?? [])
  return values.length > 0 ? values : cleanDelimitedValues([artist])
}

// ---------------------------------------------------------------------------
// Lyrics extraction (from scan worker — pure, no filesystem access)
// ---------------------------------------------------------------------------

const LRC_TIMESTAMP = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/

const NATIVE_LYRICS_KEYS = new Set(['USLT', 'SYLT', 'LYR', 'LYRI', 'LYRICS', 'UNSYNCEDLYRICS'])
const NATIVE_GENRE_KEYS = new Set(['GEN', 'GNRE', 'GENRE', 'TCON', 'TCO', 'STYLE'])
const NATIVE_COMPOSER_KEYS = new Set(['TCOM', 'TCM', 'COMPOSER', 'WRT'])
const NATIVE_ARTIST_KEYS = new Set(['ARTIST', 'ART', 'TPE1', 'TP1', 'IART', 'AUTHOR', 'AUTH'])
const NATIVE_ALBUM_ARTIST_KEYS = new Set(['ALBUMARTIST', 'AART', 'TPE2', 'TP2', 'BAND'])
const NATIVE_COPYRIGHT_KEYS = new Set(['COPYRIGHT', 'CPRT', 'CPY', 'TCOP', 'TCR', 'ICOP'])

type NativeTag = { id: string; value: unknown }
type MetadataTags = Pick<IAudioMetadata, 'common' | 'native'>

function getTextValuesFromUnknown(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.trim() ? [value] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap(getTextValuesFromUnknown)
  }

  if (value && typeof value === 'object' && 'text' in value) {
    const text = (value as { text: unknown }).text
    return getTextValuesFromUnknown(text)
  }

  return []
}

function getNativeTagGroups(metadata: MetadataTags): NativeTag[][] {
  const native = metadata.native as unknown

  if (!native || typeof native !== 'object') {
    return []
  }

  if ('values' in native && typeof native.values === 'function') {
    return Array.from(native.values()).filter(Array.isArray) as NativeTag[][]
  }

  return Object.values(native).filter(Array.isArray) as NativeTag[][]
}

function isNativeLyricsTag(id: string): boolean {
  const normalized = id.replace(/[^a-zA-Z]/g, '').toUpperCase()

  return NATIVE_LYRICS_KEYS.has(normalized) || normalized.endsWith('LYRICS')
}

function isNativeGenreTag(id: string): boolean {
  return NATIVE_GENRE_KEYS.has(nativeTextKey(id))
}

function isNativeComposerTag(id: string): boolean {
  return NATIVE_COMPOSER_KEYS.has(nativeTextKey(id))
}

function nativeTextKey(id: string): string {
  return (id.split(':').at(-1) ?? id).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

function nativeTextValues(metadata: MetadataTags, keys: ReadonlySet<string>): string[] {
  return cleanDelimitedValues(
    getNativeTagGroups(metadata).flatMap((tags) =>
      tags.flatMap((tag) =>
        keys.has(nativeTextKey(tag.id)) ? getTextValuesFromUnknown(tag.value) : [],
      ),
    ),
  )
}

/** Prefer explicit plural tags; a combined display string is not an additional artist. */
export function resolveArtists(metadata: MetadataTags): string[] {
  const plural = nativeTextValues(metadata, new Set(['ARTISTS']))
  if (plural.length > 0) return plural
  const common = normalizeArtists(metadata.common.artists)
  if (common.length > 0) return common
  const native = nativeTextValues(metadata, NATIVE_ARTIST_KEYS)
  return native.length > 0 ? native : normalizeArtists(undefined, metadata.common.artist)
}

export function resolveAlbumArtists(metadata: MetadataTags): string[] {
  const plural = nativeTextValues(metadata, new Set(['ALBUMARTISTS']))
  if (plural.length > 0) return plural
  const common = normalizeArtists(metadata.common.albumartists)
  if (common.length > 0) return common
  const native = nativeTextValues(metadata, NATIVE_ALBUM_ARTIST_KEYS)
  if (native.length > 0) return native
  return normalizeArtists(undefined, metadata.common.albumartist)
}

export function resolveCopyright(metadata: MetadataTags): string[] {
  const native = nativeTextValues(metadata, NATIVE_COPYRIGHT_KEYS)
  return native.length > 0 ? native : cleanDelimitedValues([metadata.common.copyright])
}

export function resolveLyrics(
  metadata: IAudioMetadata,
): { text: string; format: 'lrc' | 'plain' } | null {
  const candidates: string[] = []

  candidates.push(...getTextValuesFromUnknown(metadata.common.lyrics))

  for (const tags of getNativeTagGroups(metadata)) {
    for (const tag of tags) {
      if (!isNativeLyricsTag(tag.id)) continue

      candidates.push(...getTextValuesFromUnknown(tag.value))
    }
  }

  const uniqueCandidates = [...new Set(candidates.map((candidate) => candidate.trim()))].filter(
    Boolean,
  )
  const lrc = uniqueCandidates.find((candidate) => LRC_TIMESTAMP.test(candidate))

  if (lrc) return { text: lrc, format: 'lrc' }

  const plain = uniqueCandidates[0]

  if (!plain) return null

  return { text: plain, format: 'plain' }
}

export function resolveGenres(metadata: MetadataTags): string[] {
  const candidates = [...(metadata.common.genre ?? [])]

  for (const tags of getNativeTagGroups(metadata)) {
    for (const tag of tags) {
      if (!isNativeGenreTag(tag.id)) continue

      candidates.push(...getTextValuesFromUnknown(tag.value))
    }
  }

  return cleanDelimitedValues(candidates)
}

export function resolveComposers(metadata: MetadataTags): string[] {
  const candidates = [...getTextValuesFromUnknown(metadata.common.composer)]

  for (const tags of getNativeTagGroups(metadata)) {
    for (const tag of tags) {
      if (!isNativeComposerTag(tag.id)) continue

      candidates.push(...getTextValuesFromUnknown(tag.value))
    }
  }

  return cleanDelimitedValues(candidates)
}

// ---------------------------------------------------------------------------
// ISRC extraction
// ---------------------------------------------------------------------------

const NATIVE_ISRC_KEYS = new Set(['ISRC'])

function isNativeIsrcTag(id: string): boolean {
  const normalized = id.replace(/[^a-zA-Z]/g, '').toUpperCase()

  return NATIVE_ISRC_KEYS.has(normalized) || normalized.endsWith('ISRC')
}

function resolveIsrc(metadata: IAudioMetadata): string | null {
  const commonIsrc = metadata.common.isrc?.[0]

  if (commonIsrc) {
    return commonIsrc
  }

  for (const tags of getNativeTagGroups(metadata)) {
    for (const tag of tags) {
      if (!isNativeIsrcTag(tag.id)) continue

      const values = getTextValuesFromUnknown(tag.value)

      if (values[0]) {
        return values[0]
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Identity & signature
// ---------------------------------------------------------------------------

export function normalizeIdentityText(metadata: IAudioMetadata): NormalizedIdentity {
  const common = metadata.common
  const artists = resolveArtists(metadata)
  const artist = joinDelimitedValues(artists) || 'Unknown Artist'
  const album = common.album || 'Unknown Album'

  return {
    title: common.title || 'Unknown Title',
    artist,
    album,
    isrc: resolveIsrc(metadata),
  }
}

/**
 * Build a content-based fingerprint for scan deduplication.
 *
 * Reserved for future use — the signature is stored on every track but not yet
 * used in matching (the current scan dedup compares file_size + file_mtime_ms).
 * Once the matching path is switched to signature-based comparison, duplicate
 * detection will survive file moves and timestamp-only changes.
 */
export function buildMetadataSignature(
  identity: NormalizedIdentity,
  durationSeconds: number | null,
  fileSize: number,
): string {
  const roundedDuration = durationSeconds != null ? Math.round(durationSeconds) : 0
  const fileSizeBucket = Math.round(fileSize / 102400)

  return `${identity.title} | ${identity.artist} | ${identity.album} | ${roundedDuration} | ${fileSizeBucket}`
}

// ---------------------------------------------------------------------------
// Main normalizer
// ---------------------------------------------------------------------------

export function normalizeMetadata(metadata: IAudioMetadata, filePath?: string): NormalizedMetadata {
  const common = metadata.common
  const lyrics = resolveLyrics(metadata)
  const artists = resolveArtists(metadata)
  const artistDisplay = joinDelimitedValues(artists) || 'Unknown Artist'
  const taggedAlbumArtists = resolveAlbumArtists(metadata)
  const albumArtists = taggedAlbumArtists.length > 0 ? taggedAlbumArtists : artists
  const albumArtistDisplay = joinDelimitedValues(albumArtists) || 'Unknown Artist'
  const albumTitle = common.album || 'Unknown Album'
  const genres = resolveGenres(metadata)
  const composers = resolveComposers(metadata)

  return {
    title:
      common.title || (filePath ? parse(filePath).name || basename(filePath) : 'Unknown Title'),
    artistDisplay,
    artists,
    artist: artistDisplay,
    albumTitle,
    album: albumTitle,
    albumArtistDisplay,
    albumArtists,
    albumArtist: albumArtistDisplay,
    trackNo: common.track.no ?? null,
    discNo: common.disk.no ?? null,
    durationSeconds: metadata.format.duration ?? null,
    year: getYear(common.year, common.date),
    releaseDate: common.date ?? null,
    copyright: joinDelimitedValues(resolveCopyright(metadata)),
    composers,
    composer: joinDelimitedValues(composers),
    genres,
    genre: joinDelimitedValues(genres),
    lyricsText: lyrics?.text ?? null,
    lyricsFormat: lyrics?.format ?? null,
    isrc: resolveIsrc(metadata),
  }
}
