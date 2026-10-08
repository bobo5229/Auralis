import { dirname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { IAudioMetadata } from 'music-metadata'
import { writeArtworkToCache } from '../artwork/artworkCache'
import { resolveArtworkForFile } from '../artwork/resolveArtworkForFile'

export function getScanAlbumKey(album: string | null, albumArtist: string | null): string | null {
  if (!album || !albumArtist) return null
  return `${album}\u0000${albumArtist}`
}

/** A fresh instance owns the artwork caches for one scan, including cached misses. */
export class LibraryScanArtwork {
  private readonly albumArtworkCache = new Map<string, string | null>()
  private readonly directoryCoverCache = new Map<string, string | null>()

  constructor(private readonly artworkCacheDir: string) {}

  getAlbumArtwork(albumKey: string): string | null | undefined {
    return this.albumArtworkCache.get(albumKey)
  }

  setAlbumArtwork(albumKey: string, artworkCacheKey: string | null): void {
    this.albumArtworkCache.set(albumKey, artworkCacheKey)
  }

  async resolveDirectoryCover(filePath: string): Promise<string | null> {
    const dir = dirname(filePath)
    const cached = this.directoryCoverCache.get(dir)

    if (cached !== undefined) {
      return cached
    }

    const coverPath = join(dir, 'cover.jpg')

    try {
      const data = await readFile(coverPath)
      const key = await writeArtworkToCache(this.artworkCacheDir, {
        data,
        mimeType: 'image/jpeg',
      })
      this.directoryCoverCache.set(dir, key)
      return key
    } catch {
      this.directoryCoverCache.set(dir, null)
      return null
    }
  }

  async resolveArtwork(filePath: string, metadata: IAudioMetadata | null): Promise<string | null> {
    const dirCoverKey = await this.resolveDirectoryCover(filePath)
    if (dirCoverKey) {
      return dirCoverKey
    }

    if (!metadata) {
      return null
    }

    return resolveArtworkForFile(filePath, metadata, this.artworkCacheDir)
  }
}
