import { writeArtworkToCache } from './artworkCache'
import type { ArtworkSource } from './artworkTypes'
import type { IAudioMetadata } from 'music-metadata'
import type { FileMetadataSnapshot } from '@shared/types/trackMetadata'
import { readDirectoryArtwork, type DirectoryArtworkRead } from './directoryArtwork'

export function extractEmbeddedArtwork(metadata: IAudioMetadata): ArtworkSource | null {
  const picture = metadata.common.picture?.[0]

  if (!picture) {
    return null
  }

  return { data: Buffer.from(picture.data), mimeType: picture.format }
}

export async function resolveArtworkForFile(
  filePath: string,
  metadata: IAudioMetadata,
  artworkCacheDir: string,
): Promise<string | null> {
  return (await readArtworkForFile(filePath, metadata, artworkCacheDir)).artworkCacheKey
}

export async function readArtworkForFile(
  filePath: string,
  metadata: IAudioMetadata | null,
  cacheDir: string,
  directoryRead?: () => Promise<DirectoryArtworkRead>,
): Promise<FileMetadataSnapshot & { artworkCacheKey: string | null }> {
  const embedded = metadata ? extractEmbeddedArtwork(metadata) : null
  if (embedded) {
    const cacheKey = await writeArtworkToCache(cacheDir, embedded, filePath)
    return {
      artworkCacheKey: cacheKey,
      artworkRead: cacheKey ? { status: 'present', cacheKey } : { status: 'error' },
    }
  }
  const directory = await (directoryRead
    ? directoryRead()
    : readDirectoryArtwork(filePath, cacheDir))
  if (directory.status === 'error')
    return { artworkCacheKey: null, artworkRead: { status: 'error' } }
  return {
    artworkCacheKey: directory.cacheKey,
    artworkRead: { status: 'absent' },
    directoryArtworkCacheKey: directory.cacheKey,
    directoryArtworkFingerprint: directory.fingerprint,
  }
}
