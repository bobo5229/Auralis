import { dirname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { writeArtworkToCache } from './artworkCache'
import type { ArtworkSource } from './artworkTypes'
import type { IAudioMetadata } from 'music-metadata'

function extractEmbeddedArtwork(metadata: IAudioMetadata): ArtworkSource | null {
  const picture = metadata.common.picture?.[0]

  if (!picture) {
    return null
  }

  return { data: Buffer.from(picture.data), mimeType: picture.format }
}

async function readCoverJpgSource(audioFilePath: string): Promise<ArtworkSource | null> {
  const coverPath = join(dirname(audioFilePath), 'cover.jpg')

  try {
    const data = await readFile(coverPath)
    return { data, mimeType: 'image/jpeg' }
  } catch {
    return null
  }
}

export async function resolveArtworkForFile(
  filePath: string,
  metadata: IAudioMetadata,
  artworkCacheDir: string,
): Promise<string | null> {
  // 1. Try embedded artwork from audio file
  const embedded = extractEmbeddedArtwork(metadata)

  if (embedded) {
    return writeArtworkToCache(artworkCacheDir, embedded)
  }

  // 2. Fall back to directory cover.jpg
  const coverJpg = await readCoverJpgSource(filePath)

  if (coverJpg) {
    return writeArtworkToCache(artworkCacheDir, coverJpg)
  }

  return null
}
