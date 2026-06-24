import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ArtworkSource } from './artworkTypes'

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function ensureArtworkCacheDir(userDataPath: string): string {
  const cacheDir = join(userDataPath, 'artwork-cache')
  mkdirSync(cacheDir, { recursive: true })
  return cacheDir
}

export async function writeArtworkToCache(
  cacheDir: string,
  source: ArtworkSource,
): Promise<string | null> {
  const ext = MIME_TO_EXT[source.mimeType]

  if (!ext) {
    return null
  }

  const hash = createHash('sha256').update(source.data).digest('hex')
  const key = `${hash}.${ext}`
  const filePath = join(cacheDir, key)

  if (existsSync(filePath)) {
    return key
  }

  try {
    await writeFile(filePath, source.data)
    return key
  } catch {
    return null
  }
}
