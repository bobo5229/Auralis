import type Database from 'better-sqlite3'
import type { Dirent } from 'node:fs'
import { readdir, stat, unlink } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { logger } from '@main/logging/logger'
import { isCacheFileName } from './artworkCachePolicy'

export interface ArtworkCacheGarbageCollectionSummary {
  orphanFileCount: number
  bytesBefore: number
  bytesAfter: number
  bytesReclaimed: number
  warnedUnknownFileCount: number
  durationMs: number
}

function isPathUnderCacheDir(filePath: string, cacheDir: string): boolean {
  const resolvedFile = resolve(filePath)
  const resolvedCache = resolve(cacheDir)
  const fileForCompare = process.platform === 'win32' ? resolvedFile.toLowerCase() : resolvedFile
  const cacheForCompare = process.platform === 'win32' ? resolvedCache.toLowerCase() : resolvedCache
  const rel = relative(cacheForCompare, fileForCompare)

  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Removes cache files that are no longer referenced by any persisted
 * artwork_cache_key column (TechDoc §11). Reference collection always comes
 * from the real storage tables (albums + track_metadata), and deletion is
 * serialized against writers by the maintenance coordinator.
 */
export class ArtworkCacheGarbageCollector {
  private running = false

  constructor(
    private readonly db: Database.Database,
    private readonly cacheDir: string,
  ) {}

  isRunning(): boolean {
    return this.running
  }

  collectReferencedKeys(): Set<string> {
    const rows = this.db
      .prepare(
        `SELECT artwork_cache_key AS key
         FROM albums
         WHERE artwork_cache_key IS NOT NULL
         UNION
         SELECT artwork_cache_key AS key
         FROM track_metadata
         WHERE artwork_cache_key IS NOT NULL`,
      )
      .all() as Array<{ key: string }>

    return new Set(rows.map((row) => row.key))
  }

  async collectGarbage(): Promise<ArtworkCacheGarbageCollectionSummary> {
    if (this.running) {
      return {
        orphanFileCount: 0,
        bytesBefore: 0,
        bytesAfter: 0,
        bytesReclaimed: 0,
        warnedUnknownFileCount: 0,
        durationMs: 0,
      }
    }

    this.running = true
    const startedAt = Date.now()

    try {
      const referenced = this.collectReferencedKeys()
      let entries: Dirent[]

      try {
        entries = await readdir(this.cacheDir, { withFileTypes: true })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          entries = []
        } else {
          throw error
        }
      }

      let bytesBefore = 0
      let bytesReclaimed = 0
      let orphanFileCount = 0
      let warnedUnknownFileCount = 0

      for (const entry of entries) {
        if (!entry.isFile()) {
          continue
        }

        const filePath = join(this.cacheDir, entry.name)

        if (!isCacheFileName(entry.name)) {
          logger.warn({ fileName: entry.name }, 'Unknown file inside artwork cache ignored')
          warnedUnknownFileCount += 1
          continue
        }

        // Defensive containment check — readdir scoped to the cache dir, but a
        // crafted symlink / rename must never escape it (§11.3).
        if (!isPathUnderCacheDir(filePath, this.cacheDir)) {
          logger.warn({ fileName: entry.name }, 'Artwork cache file outside cache dir ignored')
          continue
        }

        let size = 0
        try {
          size = (await stat(filePath)).size
        } catch {
          continue
        }
        bytesBefore += size

        if (referenced.has(entry.name)) {
          continue
        }

        try {
          await unlink(filePath)
          bytesReclaimed += size
          orphanFileCount += 1
        } catch (error) {
          // One failing file must not abort the whole sweep (§11.3).
          logger.warn(
            {
              fileName: entry.name,
              errorType: error instanceof Error ? error.name : 'UnknownError',
              errorMessage: error instanceof Error ? error.message : String(error),
            },
            'Failed to delete orphan artwork cache file',
          )
        }
      }

      const summary: ArtworkCacheGarbageCollectionSummary = {
        orphanFileCount,
        bytesBefore,
        bytesAfter: bytesBefore - bytesReclaimed,
        bytesReclaimed,
        warnedUnknownFileCount,
        durationMs: Date.now() - startedAt,
      }
      logger.info(summary, 'Artwork cache garbage collection complete')
      return summary
    } finally {
      this.running = false
    }
  }
}
