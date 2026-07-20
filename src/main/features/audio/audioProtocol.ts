import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { logger } from '@main/logging/logger'
import { supportedAudioExtensions } from '@main/features/libraryScan/audioFileFilter'
import { isPathUnderAnyRoot } from './audioPathGuard'

const TRACK_ID_PATH = /^\/(\d+)$/
const BYTES_RANGE = /^bytes=(\d*)-(\d*)$/i

const EXT_TO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
}

const playableExtensions = new Set<string>(supportedAudioExtensions)

export type AudioProtocolResolver = {
  getFilePathByTrackId: (trackId: number) => string | null
  getLibraryRootPaths: () => string[]
  onFileMissing?: (trackId: number, filePath: string) => void
}

function isMissingFileError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

export function buildAudioTrackUrl(trackId: number): string {
  return `auralis-audio://track/${trackId}`
}

export function isPlayableAudioExtension(filePath: string): boolean {
  return playableExtensions.has(extname(filePath).toLowerCase())
}

/**
 * Must be called before app.whenReady().
 * Privileges enable media streaming + CORS so <audio> works with webSecurity: true.
 */
export function registerAudioSchemeAsPrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'auralis-audio',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ])
}

type ByteRange = { start: number; end: number }

/**
 * Parse a single-range `bytes=` header. Multi-range requests are not used by media elements.
 * Returns null when absent/invalid (serve full file), or 'unsatisfiable' for 416.
 */
function parseBytesRange(header: string | null, size: number): ByteRange | 'unsatisfiable' | null {
  if (!header || size <= 0) return null

  const match = BYTES_RANGE.exec(header.trim())
  if (!match) return null

  const startToken = match[1]
  const endToken = match[2]

  if (startToken === '' && endToken === '') return null

  let start: number
  let end: number

  if (startToken === '') {
    const suffixLength = Number(endToken)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null
    start = Math.max(0, size - suffixLength)
    end = size - 1
  } else {
    start = Number(startToken)
    end = endToken === '' ? size - 1 : Number(endToken)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0) return null
    if (start >= size) return 'unsatisfiable'
    end = Math.min(end, size - 1)
    if (start > end) return 'unsatisfiable'
  }

  return { start, end }
}

function buildFileResponse(
  filePath: string,
  size: number,
  contentType: string,
  range: ByteRange | null,
  method: string,
): Response {
  const headers = new Headers({
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  })

  if (range) {
    const { start, end } = range
    const chunkSize = end - start + 1
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
    headers.set('Content-Length', String(chunkSize))

    if (method === 'HEAD') {
      return new Response(null, { status: 206, headers })
    }

    const nodeStream = createReadStream(filePath, { start, end })
    const body = Readable.toWeb(nodeStream) as ReadableStream

    return new Response(body, { status: 206, headers })
  }

  headers.set('Content-Length', String(size))

  if (method === 'HEAD') {
    return new Response(null, { status: 200, headers })
  }

  const nodeStream = createReadStream(filePath)
  const body = Readable.toWeb(nodeStream) as ReadableStream

  return new Response(body, { status: 200, headers })
}

export function registerAudioProtocol(resolver: AudioProtocolResolver): void {
  protocol.handle('auralis-audio', async (request) => {
    try {
      const url = new URL(request.url)

      if (url.hostname !== 'track') {
        logger.warn({ url: request.url }, 'Invalid audio protocol host')
        return new Response(null, { status: 400 })
      }

      const match = TRACK_ID_PATH.exec(url.pathname)

      if (!match) {
        logger.warn({ url: request.url }, 'Invalid audio protocol path')
        return new Response(null, { status: 400 })
      }

      const trackId = Number(match[1])

      if (!Number.isInteger(trackId) || trackId <= 0) {
        return new Response(null, { status: 400 })
      }

      const filePath = resolver.getFilePathByTrackId(trackId)

      if (!filePath) {
        return new Response(null, { status: 404 })
      }

      if (!isPlayableAudioExtension(filePath)) {
        logger.warn({ trackId, filePath }, 'Audio protocol rejected unsupported extension')
        return new Response(null, { status: 415 })
      }

      const roots = resolver.getLibraryRootPaths()

      if (!isPathUnderAnyRoot(filePath, roots)) {
        logger.warn({ trackId, filePath }, 'Audio protocol path outside library roots')
        return new Response(null, { status: 403 })
      }

      const resolvedPath = resolve(filePath)
      let fileStats

      try {
        fileStats = await stat(resolvedPath)
      } catch (error) {
        if (isMissingFileError(error)) resolver.onFileMissing?.(trackId, filePath)
        return new Response(null, { status: 404 })
      }

      if (!fileStats.isFile()) {
        resolver.onFileMissing?.(trackId, filePath)
        return new Response(null, { status: 404 })
      }

      const size = fileStats.size
      const ext = extname(resolvedPath).toLowerCase()
      const contentType = EXT_TO_MIME[ext] ?? 'application/octet-stream'
      const rangeResult = parseBytesRange(request.headers.get('Range'), size)

      if (rangeResult === 'unsatisfiable') {
        return new Response(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${size}`,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }

      // Manual byte-range responses are required for HTMLMediaElement seeking.
      // net.fetch(file://) often ignores Range and returns 200 full-body, which
      // causes Chromium to snap currentTime back to 0 after a seek.
      return buildFileResponse(
        resolvedPath,
        size,
        contentType,
        rangeResult,
        request.method.toUpperCase(),
      )
    } catch (error) {
      logger.warn({ err: error, url: request.url }, 'Audio protocol handler failed')
      return new Response(null, { status: 500 })
    }
  })
}
