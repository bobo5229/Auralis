import type { IAudioMetadata } from 'music-metadata'
import { basename, parse } from 'node:path'
import { cleanDelimitedValues, joinDelimitedValues } from '@shared/utils/delimitedValues'
import type { LyricsFormat } from '@shared/types/libraryScan'
import { classifyLyrics, isTtmlLike, type ResolvedLyrics } from './classifyLyrics'
import { normalizeReleaseDate, releaseDateYear } from '@shared/utils/releaseDate'
import type { FileTagValues } from '@shared/types/trackMetadata'

export interface NormalizedMetadata {
  fileTags: FileTagValues
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
  bitrateBps: number | null
  codec: string | null
  year: number | null
  releaseDate: string | null
  copyright: string | null
  composers: string[]
  composer: string | null
  genres: string[]
  genre: string | null
  lyricsText: string | null
  lyricsFormat: LyricsFormat | null
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

export function resolveFileDate(metadata: MetadataTags): string | null {
  const parse = (value: string | null | undefined): string | null => {
    try {
      return normalizeReleaseDate(value ?? null)
    } catch {
      return null
    }
  }
  const date = parse(metadata.common.date)
  if (date) return date
  const tags = metadata.native['ID3v2.3'] ?? []
  const year = tags.find((tag) => tag.id === 'TYER' && typeof tag.value === 'string')?.value
  if (typeof year === 'string') {
    const parsed = parse(year)
    const matchesYear =
      metadata.common.year === undefined ||
      (parsed !== null && metadata.common.year === releaseDateYear(parsed))
    if (parsed && parsed.length > 4 && matchesYear) return parsed
    const dayMonth = tags.find((tag) => tag.id === 'TDAT' && typeof tag.value === 'string')?.value
    if (
      parsed &&
      parsed.length === 4 &&
      matchesYear &&
      typeof dayMonth === 'string' &&
      /^\d{4}$/.test(dayMonth.trim())
    ) {
      const value = dayMonth.trim()
      const complete = parse(`${parsed}-${value.slice(2)}-${value.slice(0, 2)}`)
      if (complete) return complete
    }
  }
  const commonYear = metadata.common.year
  if (
    typeof commonYear === 'number' &&
    Number.isInteger(commonYear) &&
    commonYear >= 0 &&
    commonYear <= 9999
  )
    return String(commonYear).padStart(4, '0')
  return typeof year === 'string' ? parse(year) : null
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
      tags.flatMap((tag) => {
        const freeform = /^----:([^:]+):(.+)$/.exec(tag.id)
        if (
          freeform &&
          (keys.has('ARTISTS') || keys.has('ALBUMARTISTS')) &&
          freeform[1]!.toLowerCase() !== 'com.apple.itunes'
        )
          return []
        return keys.has(nativeTextKey(tag.id)) ? getTextValuesFromUnknown(tag.value) : []
      }),
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

function lyricCandidates(metadata: MetadataTags, preserveText = false): string[] {
  const nativeCandidates: string[] = []

  for (const tags of getNativeTagGroups(metadata)) {
    for (const tag of tags) {
      if (!isNativeLyricsTag(tag.id)) continue

      nativeCandidates.push(...getTextValuesFromUnknown(tag.value))
    }
  }

  // Common lyrics may already be trimmed or decoded from LRC by music-metadata.
  // Raw editing and write verification need the original native field first.
  const commonCandidates = getTextValuesFromUnknown(metadata.common.lyrics)
  return preserveText
    ? [...nativeCandidates, ...commonCandidates]
    : [...commonCandidates, ...nativeCandidates]
}

export function hasEmbeddedTtml(metadata: MetadataTags): boolean {
  if (getTextValuesFromUnknown(metadata.common.lyrics).some(isTtmlLike)) return true
  return getNativeTagGroups(metadata).some((tags) =>
    tags.some((tag) => {
      const id = tag.id.replace(/[^a-zA-Z]/g, '').toUpperCase()
      const lyricTag =
        isNativeLyricsTag(tag.id) || id.includes('USLT') || id.includes('SYLT') || id === 'ULT'
      return lyricTag && getTextValuesFromUnknown(tag.value).some(isTtmlLike)
    }),
  )
}

export function resolveLyrics(metadata: MetadataTags, preserveText = false): ResolvedLyrics | null {
  const candidates = lyricCandidates(metadata, preserveText)
  const resolved = [...new Set(candidates)].flatMap((candidate) => {
    const lyrics = classifyLyrics(candidate)
    return lyrics ? [{ ...lyrics, text: preserveText ? candidate : lyrics.text }] : []
  })
  return resolved.find((lyrics) => lyrics.format === 'lrc') ?? resolved[0] ?? null
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
  const releaseDate = resolveFileDate(metadata)
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
    fileTags: {
      title: common.title?.trim() || null,
      artistDisplay: joinDelimitedValues(artists),
      albumTitle: common.album?.trim() || null,
      albumArtistDisplay: joinDelimitedValues(taggedAlbumArtists),
      genreDisplay: joinDelimitedValues(genres),
      year: releaseDateYear(releaseDate),
      releaseDate,
    },
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
    codec: metadata.format.codec?.trim() || null,
    bitrateBps:
      typeof metadata.format.bitrate === 'number' &&
      Number.isFinite(metadata.format.bitrate) &&
      metadata.format.bitrate > 0
        ? metadata.format.bitrate
        : null,
    year: releaseDateYear(releaseDate),
    releaseDate,
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
