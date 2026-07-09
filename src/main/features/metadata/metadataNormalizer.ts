import type { IAudioMetadata } from 'music-metadata'
import { basename, parse } from 'node:path'

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

function cleanTextValues(values: Array<string | undefined>): string[] {
  return values
    .flatMap((value) => (value ? value.split(/\s*;\s*/) : []))
    .map((value) => value.trim())
    .filter(Boolean)
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    if (seen.has(value)) continue

    seen.add(value)
    result.push(value)
  }

  return result
}

export function normalizeArtists(artists?: string[], artist?: string): string[] {
  return uniqueValues(cleanTextValues([...(artists ?? []), artist]))
}

export function normalizeArtist(artists?: string[], artist?: string): string {
  return normalizeArtists(artists, artist).join('; ') || 'Unknown Artist'
}

export function normalizeAlbumArtists(
  albumArtists?: string[],
  albumArtist?: string,
  artist?: string,
): string[] {
  const normalized = uniqueValues(cleanTextValues([...(albumArtists ?? []), albumArtist]))

  if (normalized.length > 0) {
    return normalized
  }

  return normalizeArtists(undefined, artist)
}

export function normalizeAlbumArtist(
  albumArtists?: string[],
  albumArtist?: string,
  artist?: string,
): string {
  return normalizeAlbumArtists(albumArtists, albumArtist, artist).join('; ') || 'Unknown Artist'
}

// ---------------------------------------------------------------------------
// Lyrics extraction (from scan worker — pure, no filesystem access)
// ---------------------------------------------------------------------------

const LRC_TIMESTAMP = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/

const NATIVE_LYRICS_KEYS = new Set(['USLT', 'SYLT', 'LYR', 'LYRI', 'LYRICS', 'UNSYNCEDLYRICS'])
const NATIVE_GENRE_KEYS = new Set(['GEN', 'GNRE', 'GENRE'])

type NativeTag = { id: string; value: unknown }

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

function getNativeTagGroups(metadata: IAudioMetadata): NativeTag[][] {
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
  const normalized = id.replace(/[^a-zA-Z]/g, '').toUpperCase()

  return NATIVE_GENRE_KEYS.has(normalized) || normalized.endsWith('GENRE')
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

export function resolveGenres(metadata: IAudioMetadata): string[] {
  const candidates = [...(metadata.common.genre ?? [])]

  for (const tags of getNativeTagGroups(metadata)) {
    for (const tag of tags) {
      if (!isNativeGenreTag(tag.id)) continue

      candidates.push(...getTextValuesFromUnknown(tag.value))
    }
  }

  return uniqueValues(candidates.map((value) => value.trim()).filter(Boolean))
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
  const artists = normalizeArtists(common.artists, common.artist)
  const artist = artists.join('; ') || 'Unknown Artist'
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
  const artists = normalizeArtists(common.artists, common.artist)
  const artistDisplay = artists.join('; ') || 'Unknown Artist'
  const albumArtists = normalizeAlbumArtists(common.albumartists, common.albumartist, artistDisplay)
  const albumArtistDisplay = albumArtists.join('; ') || 'Unknown Artist'
  const albumTitle = common.album || 'Unknown Album'
  const genres = resolveGenres(metadata)

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
    copyright: common.copyright?.trim() || null,
    genres,
    genre: genres.join(', ') || null,
    lyricsText: lyrics?.text ?? null,
    lyricsFormat: lyrics?.format ?? null,
    isrc: resolveIsrc(metadata),
  }
}
