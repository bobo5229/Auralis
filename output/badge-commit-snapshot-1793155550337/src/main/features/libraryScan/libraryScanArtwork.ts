import { dirname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { IAudioMetadata } from 'music-metadata'
import { writeArtworkToCache } from '../artwork/artworkCache'
import { extractEmbeddedArtwork } from '../artwork/resolveArtworkForFile'

/** A fresh instance owns the artwork caches for one scan, including cached misses. */
export class LibraryScanArtwork {
  private readonly directoryCoverCache = new Map<string, Promise<string | null>>()

  constructor(private readonly artworkCacheDir: string) {}

  async resolveDirectoryCover(filePath: string): Promise<string | null> {
    const dir = dirname(filePath)
    const cached = this.directoryCoverCache.get(dir)

    if (cached !== undefined) {
      return cached
    }

    const pending = this.readDirectoryCover(dir)
    this.directoryCoverCache.set(dir, pending)
    return pending
  }

  private async readDirectoryCover(dir: string): Promise<string | null> {
    try {
      const data = await readFile(join(dir, 'cover.jpg'))
      return await writeArtworkToCache(this.artworkCacheDir, {
        data,
        mimeType: 'image/jpeg',
      })
    } catch {
      return null
    }
  }

  async resolveArtwork(filePath: string, metadata: IAudioMetadata | null): Promise<string | null> {
    if (metadata) {
      const embedded = extractEmbeddedArtwork(metadata)
      if (embedded) return writeArtworkToCache(this.artworkCacheDir, embedded, filePath)
    }
    return this.resolveDirectoryCover(filePath)
  }
}
