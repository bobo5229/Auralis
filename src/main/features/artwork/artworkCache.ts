import { existsSync, mkdirSync } from 'node:fs'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { logger } from '@main/logging/logger'
import type { ArtworkSource } from './artworkTypes'
import {
  ARTWORK_CACHE_VERSION,
  ARTWORK_MAX_EDGE,
  ARTWORK_MAX_INPUT_PIXELS,
  ARTWORK_WEBP_EFFORT,
  ARTWORK_WEBP_QUALITY,
  computeArtworkCacheKey,
} from './artworkCachePolicy'

export function ensureArtworkCacheDir(userDataPath: string): string {
  const cacheDir = join(userDataPath, 'artwork-cache')
  mkdirSync(cacheDir, { recursive: true })
  return cacheDir
}

export interface ConvertedArtwork {
  data: Buffer
  width: number
  height: number
}

/**
 * Normalize any decodable image into a max-1024px WebP (TechDoc §6.2).
 * Returns null on any failure and logs a structured warning — never falls back
 * to saving the original bytes.
 */
export async function convertArtworkToWebp(
  source: ArtworkSource,
): Promise<ConvertedArtwork | null> {
  try {
    const image = sharp(source.data, {
      failOn: 'error',
      limitInputPixels: ARTWORK_MAX_INPUT_PIXELS,
    })
    const data = await image
      .rotate()
      .resize({
        width: ARTWORK_MAX_EDGE,
        height: ARTWORK_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: ARTWORK_WEBP_QUALITY,
        effort: ARTWORK_WEBP_EFFORT,
        smartSubsample: true,
      })
      .toBuffer()
    const outputMetadata = await sharp(data).metadata()

    return {
      data,
      width: outputMetadata.width ?? 0,
      height: outputMetadata.height ?? 0,
    }
  } catch (error) {
    logger.warn(
      {
        mimeType: source.mimeType,
        sourceBytes: source.data.byteLength,
        errorType: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
        cacheVersion: ARTWORK_CACHE_VERSION,
      },
      'Failed to convert artwork to v2 webp',
    )
    return null
  }
}

/**
 * Write one artifact only after computing input dimensions (for debug stats).
 * The conversion itself does not need them, so metadata is read lazily.
 */
async function readSourceDimensions(
  source: ArtworkSource,
): Promise<{ width: number; height: number }> {
  try {
    const metadata = await sharp(source.data).metadata()
    return { width: metadata.width ?? 0, height: metadata.height ?? 0 }
  } catch {
    return { width: 0, height: 0 }
  }
}

/**
 * Write the WebP bytes to a unique temp file in the same directory, then rename
 * into place so concurrent writers never observe a partial final file (§6.3).
 * When another task already produced the same key, our temp is discarded and
 * the existing file is reused.
 */
async function writeArtworkFileAtomically(
  cacheDir: string,
  key: string,
  data: Buffer,
): Promise<boolean> {
  const finalPath = join(cacheDir, key)
  const tempPath = join(cacheDir, `${key}.${process.pid}.${Date.now()}.tmp`)

  try {
    await writeFile(tempPath, data)
    await rename(tempPath, finalPath)
    return true
  } catch (error) {
    // rename can fail on Windows when the destination already exists — the
    // other writer's file is complete, so reuse it.
    if (existsSync(finalPath)) {
      await unlink(tempPath).catch(() => {})
      return true
    }

    await unlink(tempPath).catch(() => {})
    logger.warn(
      {
        key,
        cacheVersion: ARTWORK_CACHE_VERSION,
        errorType: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      'Failed to write artwork cache file',
    )
    return false
  }
}

const inFlightConversions = new Map<string, Promise<string | null>>()

/**
 * Generate the v2 WebP display cache for an artwork source.
 * Returns the cache key on success (reusing an existing file when present),
 * or null when the image cannot be converted or written (§6.4).
 */
export async function writeArtworkToCache(
  cacheDir: string,
  source: ArtworkSource,
  sourcePath?: string,
): Promise<string | null> {
  const key = computeArtworkCacheKey(source.data)
  const finalPath = join(cacheDir, key)

  if (existsSync(finalPath)) {
    return key
  }

  const inFlight = inFlightConversions.get(key)
  if (inFlight) {
    return inFlight
  }

  const conversionPromise = (async (): Promise<string | null> => {
    try {
      await mkdir(cacheDir, { recursive: true })
    } catch {
      logger.warn(
        { cacheDir, cacheVersion: ARTWORK_CACHE_VERSION },
        'Artwork cache directory is not writable',
      )
      return null
    }

    const startedAt = Date.now()
    const converted = await convertArtworkToWebp(source)

    if (!converted) {
      return null
    }

    const sourceDimensions = await readSourceDimensions(source)
    const written = await writeArtworkFileAtomically(cacheDir, key, converted.data)

    if (!written) {
      return null
    }

    logger.debug(
      {
        sourcePath,
        mimeType: source.mimeType,
        sourceBytes: source.data.byteLength,
        outputBytes: converted.data.byteLength,
        compressionRatio: source.data.byteLength / Math.max(converted.data.byteLength, 1),
        sourceWidth: sourceDimensions.width,
        sourceHeight: sourceDimensions.height,
        outputWidth: converted.width,
        outputHeight: converted.height,
        durationMs: Date.now() - startedAt,
        cacheVersion: ARTWORK_CACHE_VERSION,
      },
      'Artwork converted to v2 webp',
    )

    return key
  })()

  inFlightConversions.set(key, conversionPromise)
  try {
    return await conversionPromise
  } finally {
    inFlightConversions.delete(key)
  }
}
