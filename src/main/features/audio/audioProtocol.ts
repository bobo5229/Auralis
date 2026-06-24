import type Database from 'better-sqlite3'
import { protocol } from 'electron'
import { open, readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { logger } from '@main/logging/logger'
import { TrackRepository } from '@main/repositories/trackRepository'

const VALID_TRACK_ID = /^[1-9]\d*$/

const EXT_TO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
}

const SUPPORTED_EXTENSIONS = new Set(Object.keys(EXT_TO_MIME))

type ByteRange = {
  start: number
  end: number
}

function parseRangeHeader(rangeHeader: string | null, fileSize: number): ByteRange | null {
  if (!rangeHeader) {
    return null
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)

  if (!match) {
    return null
  }

  const [, rawStart, rawEnd] = match

  if (!rawStart && !rawEnd) {
    return null
  }

  if (!rawStart) {
    const suffixLength = Number.parseInt(rawEnd, 10)

    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null
    }

    return {
      start: Math.max(fileSize - suffixLength, 0),
      end: fileSize - 1,
    }
  }

  const start = Number.parseInt(rawStart, 10)
  const requestedEnd = rawEnd ? Number.parseInt(rawEnd, 10) : fileSize - 1

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= fileSize
  ) {
    return null
  }

  return {
    start,
    end: Math.min(requestedEnd, fileSize - 1),
  }
}

async function readFileRange(filePath: string, range: ByteRange): Promise<Buffer> {
  const length = range.end - range.start + 1
  const file = await open(filePath, 'r')

  try {
    const buffer = Buffer.alloc(length)
    const result = await file.read(buffer, 0, length, range.start)
    return result.bytesRead === length ? buffer : buffer.subarray(0, result.bytesRead)
  } finally {
    await file.close()
  }
}

export function registerAudioProtocol(db: Database.Database): void {
  const trackRepository = new TrackRepository(db)

  protocol.handle('auralis-audio', async (request) => {
    const url = new URL(request.url)

    if (url.hostname !== 'track') {
      logger.warn({ hostname: url.hostname }, 'Invalid audio protocol hostname')
      return new Response(null, { status: 400 })
    }

    const idStr = url.pathname.replace(/^\//, '')

    if (!VALID_TRACK_ID.test(idStr)) {
      logger.warn({ idStr }, 'Invalid audio track id')
      return new Response(null, { status: 400 })
    }

    const trackId = Number.parseInt(idStr, 10)
    const filePath = trackRepository.getFilePathById(trackId)

    if (!filePath) {
      return new Response(null, { status: 404 })
    }

    const ext = extname(filePath).toLowerCase()

    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      logger.warn({ ext, trackId }, 'Unsupported audio format')
      return new Response(null, { status: 415 })
    }

    const contentType = EXT_TO_MIME[ext] ?? 'application/octet-stream'

    try {
      const fileStats = await stat(filePath)

      if (!fileStats.isFile()) {
        return new Response(null, { status: 404 })
      }

      const fileSize = fileStats.size
      const range = parseRangeHeader(request.headers.get('range'), fileSize)

      if (request.headers.has('range') && !range) {
        return new Response(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
            'Accept-Ranges': 'bytes',
          },
        })
      }

      if (range) {
        const data = request.method === 'HEAD' ? null : await readFileRange(filePath, range)
        const contentLength = range.end - range.start + 1

        return new Response(data, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(contentLength),
            'Content-Range': `bytes ${range.start}-${range.end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=31536000',
          },
        })
      }

      const data = request.method === 'HEAD' ? null : await readFile(filePath)
      return new Response(data, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000',
        },
      })
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : null
      if (code === 'ENOENT') {
        return new Response(null, { status: 404 })
      }
      logger.warn({ filePath, code }, 'Failed to read audio file')
      return new Response(null, { status: 500 })
    }
  })
}
