import { protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { logger } from '@main/logging/logger'

const VALID_KEY = /^[a-f0-9]{64}\.(jpg|png|webp)$/

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export function registerArtworkProtocol(cacheDir: string): void {
  protocol.handle('auralis-artwork', async (request) => {
    const url = new URL(request.url)
    const key = decodeURIComponent(url.hostname + url.pathname)

    if (!VALID_KEY.test(key)) {
      logger.warn({ key }, 'Invalid artwork protocol key')
      return new Response(null, { status: 400 })
    }

    const filePath = resolve(join(cacheDir, key))

    if (!filePath.startsWith(cacheDir)) {
      logger.warn({ key }, 'Artwork protocol path traversal attempt')
      return new Response(null, { status: 403 })
    }

    try {
      const data = await readFile(filePath)
      const ext = key.split('.').pop()!
      const contentType = EXT_TO_MIME[ext] ?? 'application/octet-stream'
      return new Response(data, {
        headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000' },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
