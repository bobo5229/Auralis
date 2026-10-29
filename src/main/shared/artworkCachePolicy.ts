import { createHash } from 'node:crypto'

/**
 * Artwork Cache v2 policy — single source of truth for key format, version
 * detection and image conversion profile. Shared by the scan worker, metadata
 * refresh worker, migration and garbage collector so no module maintains its
 * own copy of the regex or profile (TechDoc §5).
 */
export const ARTWORK_CACHE_VERSION = 'v2'
const ARTWORK_CACHE_EXTENSION = 'webp'
export const ARTWORK_CACHE_PROFILE = `${ARTWORK_CACHE_VERSION}-${ARTWORK_CACHE_EXTENSION}-1024-q82-effort4`
/** SQL promotion checks intentionally preserve the existing permissive LIKE semantics. */
export const CURRENT_ARTWORK_KEY_SQL_LIKE_PATTERN = `${ARTWORK_CACHE_VERSION}-%.${ARTWORK_CACHE_EXTENSION}`
export const ARTWORK_MAX_EDGE = 1024
export const ARTWORK_WEBP_QUALITY = 82
export const ARTWORK_WEBP_EFFORT = 4
export const ARTWORK_MAX_INPUT_PIXELS = 64 * 1024 * 1024

const CURRENT_KEY_PATTERN = new RegExp(
  `^${ARTWORK_CACHE_VERSION}-[a-f0-9]{64}\\.${ARTWORK_CACHE_EXTENSION}$`,
)
const LEGACY_KEY_PATTERN = /^[a-f0-9]{64}\.(jpg|png|webp)$/
const TEMP_FILE_PATTERN = new RegExp(
  `^${ARTWORK_CACHE_VERSION}-[a-f0-9]{64}\\.${ARTWORK_CACHE_EXTENSION}\\.\\d+\\.\\d+\\.tmp$`,
)

/**
 * Hash input must include the conversion profile together with the source
 * bytes: a profile change (size/format/quality) must produce a different key
 * without re-encoding existing caches, and a key hit must be able to skip
 * decode + encode entirely (TechDoc §5.1).
 */
export function computeArtworkCacheKey(sourceData: Buffer): string {
  const hash = createHash('sha256')
  hash.update(ARTWORK_CACHE_PROFILE)
  hash.update('\0')
  hash.update(sourceData)
  return `${ARTWORK_CACHE_VERSION}-${hash.digest('hex')}.${ARTWORK_CACHE_EXTENSION}`
}

export function isCurrentArtworkCacheKey(key: string | null): key is string {
  return key !== null && CURRENT_KEY_PATTERN.test(key)
}

export function isLegacyArtworkCacheKey(key: string | null): boolean {
  return key !== null && LEGACY_KEY_PATTERN.test(key)
}

/** True when the file name is a legacy, v2 or migration temp cache file. */
export function isCacheFileName(fileName: string): boolean {
  return (
    CURRENT_KEY_PATTERN.test(fileName) ||
    LEGACY_KEY_PATTERN.test(fileName) ||
    TEMP_FILE_PATTERN.test(fileName)
  )
}

/** Matches the temp name layout produced by writeArtworkToCache (§6.3). */
export function isArtworkTempFileName(fileName: string): boolean {
  return TEMP_FILE_PATTERN.test(fileName)
}
