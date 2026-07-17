import { protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { logger } from '@main/logging/logger'

const VALID_KEY = /^[a-f0-9]{64}\.(jpg|png|webp)$/

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

function isPathUnderCacheDir(filePath: string, cacheDir: string): boolean {
  const resolvedFile = resolve(filePath)
  const resolvedCache = resolve(cacheDir)
  const fileForCompare = process.platform === 'win32' ? resolvedFile.toLowerCase() : resolvedFile
  const cacheForCompare = process.platform === 'win32' ? resolvedCache.toLowerCase() : resolvedCache
  const rel = relative(cacheForCompare, fileForCompare)

  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

export function registerArtworkProtocol(cacheDir: string): void {
  const resolvedCacheDir = resolve(cacheDir)

  protocol.handle('auralis-artwork', async (request) => {
    const url = new URL(request.url)
    const key = decodeURIComponent(url.hostname + url.pathname)

    if (!VALID_KEY.test(key)) {
      logger.warn({ key }, 'Invalid artwork protocol key')
      return new Response(null, { status: 400 })
    }

    const filePath = resolve(join(resolvedCacheDir, key))

    if (!isPathUnderCacheDir(filePath, resolvedCacheDir)) {
      logger.warn({ key }, 'Artwork protocol path traversal attempt')
      return new Response(null, { status: 403 })
    }

    try {
      const data = await readFile(filePath)
      const ext = key.split('.').pop()!
      const contentType = EXT_TO_MIME[ext] ?? 'application/octet-stream'
      return new Response(data, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000',
          // Enables canvas palette extraction if the renderer sets crossOrigin.
          'Access-Control-Allow-Origin': '*',
        },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
