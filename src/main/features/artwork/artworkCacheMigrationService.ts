import type Database from 'better-sqlite3'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseFile } from 'music-metadata'
import { logger } from '@main/logging/logger'
import { writeArtworkToCache } from './artworkCache'
import { ARTWORK_CACHE_VERSION, isLegacyArtworkCacheKey } from './artworkCachePolicy'
import type { ArtworkSource } from './artworkTypes'

const LEGACY_EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export interface ArtworkCacheMigrationSummary {
  legacyKeyCount: number
  migratedKeyCount: number
  failedKeyCount: number
  skippedCurrentKeyCount: number
  bytesBefore: number
  bytesAfter: number
  durationMs: number
}

interface LegacyKeyRefs {
  albumRows: Array<{ title: string; artist: string | null }>
  trackMetadataIds: number[]
}

/** Extract embedded artwork (or cover.jpg) from an audio file, for §10.3 fallback. */
export async function extractArtworkFromAudioFile(filePath: string): Promise<ArtworkSource | null> {
  try {
    const metadata = await parseFile(filePath, { duration: false, skipCovers: false })
    const picture = metadata.common.picture?.[0]

    if (picture) {
      return { data: Buffer.from(picture.data), mimeType: picture.format }
    }

    const coverPath = join(dirname(filePath), 'cover.jpg')
    const data = await readFile(coverPath)
    return { data, mimeType: 'image/jpeg' }
  } catch {
    return null
  }
}

/**
 * Migrates legacy (v1, raw-copy) artwork cache keys to v2 WebP keys in the
 * background (TechDoc §10). Iterates by legacy key — one conversion per unique
 * image regardless of how many albums / metadata rows reference it — and only
 * touches the database after the new file exists. Old files are kept until the
 * garbage collector runs.
 */
export class ArtworkCacheMigrationService {
  private running = false

  constructor(
    private readonly db: Database.Database,
    private readonly cacheDir: string,
    private readonly extractTrackArtwork: (
      filePath: string,
    ) => Promise<ArtworkSource | null> = extractArtworkFromAudioFile,
  ) {}

  isRunning(): boolean {
    return this.running
  }

  /** Cheap startup gate: are there any non-current (legacy) keys to migrate? */
  hasLegacyKeys(): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 AS found
         FROM (
           SELECT artwork_cache_key FROM albums
           WHERE artwork_cache_key IS NOT NULL
             AND artwork_cache_key NOT LIKE 'v2-%.webp'
           UNION
           SELECT artwork_cache_key FROM track_metadata
           WHERE artwork_cache_key IS NOT NULL
             AND artwork_cache_key NOT LIKE 'v2-%.webp'
         )
         LIMIT 1`,
      )
      .get() as { found: number } | undefined

    return row !== undefined
  }

  async runMigration(): Promise<ArtworkCacheMigrationSummary> {
    if (this.running) {
      return {
        legacyKeyCount: 0,
        migratedKeyCount: 0,
        failedKeyCount: 0,
        skippedCurrentKeyCount: 0,
        bytesBefore: 0,
        bytesAfter: 0,
        durationMs: 0,
      }
    }

    this.running = true
    const startedAt = Date.now()

    try {
      const legacyKeys = this.listLegacyKeys()
      const summary: ArtworkCacheMigrationSummary = {
        legacyKeyCount: legacyKeys.length,
        migratedKeyCount: 0,
        failedKeyCount: 0,
        skippedCurrentKeyCount: 0,
        bytesBefore: 0,
        bytesAfter: 0,
        durationMs: 0,
      }

      for (const key of legacyKeys) {
        const result = await this.migrateLegacyKey(key)

        if (result.status === 'migrated') {
          summary.migratedKeyCount += 1
          summary.bytesBefore += result.bytesBefore
          summary.bytesAfter += result.bytesAfter
        } else if (result.status === 'failed') {
          summary.failedKeyCount += 1
        } else if (result.status === 'skipped') {
          summary.skippedCurrentKeyCount += 1
        }
      }

      summary.durationMs = Date.now() - startedAt
      logger.info(
        {
          ...summary,
          cacheVersion: ARTWORK_CACHE_VERSION,
        },
        'Artwork cache migration complete',
      )
      return summary
    } finally {
      this.running = false
    }
  }

  private listLegacyKeys(): string[] {
    const rows = this.db
      .prepare(
        `SELECT artwork_cache_key AS key
         FROM (
           SELECT artwork_cache_key FROM albums
           WHERE artwork_cache_key IS NOT NULL
             AND artwork_cache_key NOT LIKE 'v2-%.webp'
           UNION
           SELECT artwork_cache_key FROM track_metadata
           WHERE artwork_cache_key IS NOT NULL
             AND artwork_cache_key NOT LIKE 'v2-%.webp'
         )`,
      )
      .all() as Array<{ key: string }>

    return rows.map((row) => row.key).filter((key) => isLegacyArtworkCacheKey(key))
  }

  private queryRefs(key: string): LegacyKeyRefs {
    const albumRows = this.db
      .prepare(
        `SELECT title, artist
         FROM albums
         WHERE artwork_cache_key = ?`,
      )
      .all(key) as LegacyKeyRefs['albumRows']
    const trackMetadataIds = this.db
      .prepare(
        `SELECT track_id AS trackId
         FROM track_metadata
         WHERE artwork_cache_key = ?`,
      )
      .all(key)
      .map((row) => (row as { trackId: number }).trackId)

    return { albumRows, trackMetadataIds }
  }

  private findRepresentativeTrack(refs: LegacyKeyRefs): string | null {
    for (const trackId of refs.trackMetadataIds) {
      const row = this.db
        .prepare(
          `SELECT file_path AS filePath
           FROM tracks
           WHERE id = ? AND availability = 'available'
           LIMIT 1`,
        )
        .get(trackId) as { filePath: string } | undefined

      if (row?.filePath) {
        return row.filePath
      }
    }

    for (const album of refs.albumRows) {
      const row =
        album.artist !== null
          ? (this.db
              .prepare(
                `SELECT file_path AS filePath
                 FROM tracks
                 WHERE album = ? AND album_artist = ? AND availability = 'available'
                 LIMIT 1`,
              )
              .get(album.title, album.artist) as { filePath: string } | undefined)
          : (this.db
              .prepare(
                `SELECT file_path AS filePath
                 FROM tracks
                 WHERE album = ? AND availability = 'available'
                 LIMIT 1`,
              )
              .get(album.title) as { filePath: string } | undefined)

      if (row?.filePath) {
        return row.filePath
      }
    }

    return null
  }

  private async readLegacyCacheSource(key: string): Promise<ArtworkSource | null> {
    const ext = key.split('.').pop() ?? ''
    const mimeType = LEGACY_EXT_TO_MIME[ext]

    if (!mimeType) {
      return null
    }

    try {
      const data = await readFile(join(this.cacheDir, key))
      return { data, mimeType }
    } catch {
      return null
    }
  }

  private async migrateLegacyKey(
    key: string,
  ): Promise<
    | { status: 'migrated'; bytesBefore: number; bytesAfter: number }
    | { status: 'failed'; bytesBefore: number; bytesAfter: number }
    | { status: 'skipped'; bytesBefore: number; bytesAfter: number }
  > {
    const refs = this.queryRefs(key)

    // 1. Prefer the old cache file; fall back to a representative track (§10.3).
    let source = await this.readLegacyCacheSource(key)
    let sourceHint = join(this.cacheDir, key)

    if (!source) {
      const trackPath = this.findRepresentativeTrack(refs)

      if (trackPath) {
        source = await this.extractTrackArtwork(trackPath)
        sourceHint = trackPath
      }
    }

    if (!source) {
      logger.warn(
        { key, cacheVersion: ARTWORK_CACHE_VERSION },
        'Artwork migration failed: legacy cache missing and no recoverable track',
      )
      return { status: 'failed', bytesBefore: 0, bytesAfter: 0 }
    }

    // 2. Write the v2 WebP (reuses an existing file for the same source bytes).
    const v2Key = await writeArtworkToCache(this.cacheDir, source, sourceHint)

    if (!v2Key) {
      logger.warn(
        { key, cacheVersion: ARTWORK_CACHE_VERSION },
        'Artwork migration failed: v2 conversion failed',
      )
      return { status: 'failed', bytesBefore: source.data.byteLength, bytesAfter: 0 }
    }

    // 3. Per-key short transaction: database is updated only after the new file
    //    exists, and old files are never removed here (§10.4).
    const updated = this.db.transaction(() => {
      const albumChanges = this.db
        .prepare(
          `UPDATE albums
           SET artwork_cache_key = ?, updated_at = CURRENT_TIMESTAMP
           WHERE artwork_cache_key = ?`,
        )
        .run(v2Key, key).changes
      const metadataChanges = this.db
        .prepare(
          `UPDATE track_metadata
           SET artwork_cache_key = ?, refreshed_at = CURRENT_TIMESTAMP
           WHERE artwork_cache_key = ?`,
        )
        .run(v2Key, key).changes

      return albumChanges + metadataChanges
    })()

    let v2Bytes = 0
    try {
      v2Bytes = (await stat(join(this.cacheDir, v2Key))).size
    } catch {
      v2Bytes = 0
    }

    if (updated === 0) {
      return { status: 'skipped', bytesBefore: source.data.byteLength, bytesAfter: v2Bytes }
    }

    logger.debug({ key, v2Key }, 'Artwork cache key migrated to v2')
    return {
      status: 'migrated',
      bytesBefore: source.data.byteLength,
      bytesAfter: v2Bytes,
    }
  }
}
