import { dirname } from 'node:path'
import type { IAudioMetadata } from 'music-metadata'
import { readArtworkForFile } from '../artwork/resolveArtworkForFile'
import {
  getDirectoryArtworkFingerprint,
  readDirectoryArtwork,
  type DirectoryArtworkRead,
} from '../artwork/directoryArtwork'

/** A fresh instance owns the artwork caches for one scan, including cached misses. */
export class LibraryScanArtwork {
  private readonly directoryCoverCache = new Map<string, Promise<DirectoryArtworkRead>>()
  private readonly pendingFingerprints = new Map<string, Promise<string>>()

  constructor(private readonly artworkCacheDir: string) {}

  /** Share only concurrent probes; later reads must observe additions/removals. */
  getDirectoryFingerprint(filePath: string): Promise<string> {
    const directory = dirname(filePath)
    const existing = this.pendingFingerprints.get(directory)
    if (existing) return existing
    const pending = getDirectoryArtworkFingerprint(filePath).finally(() => {
      if (this.pendingFingerprints.get(directory) === pending)
        this.pendingFingerprints.delete(directory)
    })
    this.pendingFingerprints.set(directory, pending)
    return pending
  }

  async resolveDirectoryCover(filePath: string): Promise<string | null> {
    return (await this.readDirectoryCover(filePath)).cacheKey
  }

  private readDirectoryCover(filePath: string): Promise<DirectoryArtworkRead> {
    const dir = dirname(filePath)
    const cached = this.directoryCoverCache.get(dir)

    if (cached !== undefined) {
      return cached
    }

    const pending = readDirectoryArtwork(filePath, this.artworkCacheDir)
    this.directoryCoverCache.set(dir, pending)
    return pending
  }

  async resolveArtwork(filePath: string, metadata: IAudioMetadata | null): Promise<string | null> {
    return (await this.readArtwork(filePath, metadata)).artworkCacheKey
  }

  readArtwork(filePath: string, metadata: IAudioMetadata | null) {
    return readArtworkForFile(filePath, metadata, this.artworkCacheDir, () =>
      this.readDirectoryCover(filePath),
    )
  }
}
