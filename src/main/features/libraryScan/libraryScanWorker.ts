import { parentPort, workerData } from 'node:worker_threads'
import { basename, dirname, join, parse } from 'node:path'
import { readFile, readdir, stat } from 'node:fs/promises'
import { parseFile } from 'music-metadata'
import { isSupportedAudioFile } from './audioFileFilter'
import { writeArtworkToCache } from '../artwork/artworkCache'
import type { ArtworkSource } from '../artwork/artworkTypes'
import type { LibraryScanWorkerInput, LibraryScanWorkerMessage } from './libraryScanTypes'
import type {
  AlbumArtworkPatch,
  LibraryScanProgress,
  ScannedTrack,
} from '@shared/types/libraryScan'

const input = workerData as LibraryScanWorkerInput
const knownFiles = new Map(input.knownFiles.map((file) => [file.filePath, file]))
const trackBatch: ScannedTrack[] = []
const artworkBatch: AlbumArtworkPatch[] = []

let totalFiles = 0
let scannedFiles = 0
let failedFiles = 0
let lastProgressAt = 0

function postMessage(message: LibraryScanWorkerMessage): void {
  parentPort?.postMessage(message)
}

function postProgress(currentFile: string | null, message: string | null, force = false): void {
  const now = Date.now()

  if (!force && scannedFiles % 100 !== 0 && now - lastProgressAt < 200) {
    return
  }

  lastProgressAt = now

  const progress: LibraryScanProgress = {
    jobId: input.jobId,
    status: 'scanning',
    totalFiles,
    scannedFiles,
    failedFiles,
    currentFile,
    message,
  }

  postMessage({ type: 'progress', payload: progress })
}

async function collectAudioFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name)

    if (entry.isDirectory()) {
      try {
        files.push(...(await collectAudioFiles(entryPath)))
      } catch {
        postMessage({
          type: 'failure',
          payload: {
            jobId: input.jobId,
            filePath: entryPath,
            reason: 'Unable to read directory',
          },
        })
        failedFiles += 1
      }
    } else if (entry.isFile() && isSupportedAudioFile(entryPath)) {
      files.push(entryPath)
    }
  }

  return files
}

function getYear(commonYear: number | undefined, date: string | undefined): number | null {
  if (typeof commonYear === 'number') return commonYear

  if (date) {
    const parsedYear = Number.parseInt(date.slice(0, 4), 10)
    return Number.isNaN(parsedYear) ? null : parsedYear
  }

  return null
}

async function extractEmbeddedArtwork(
  metadata: Awaited<ReturnType<typeof parseFile>>,
): Promise<ArtworkSource | null> {
  const picture = metadata.common.picture?.[0]

  if (!picture) {
    return null
  }

  return { data: Buffer.from(picture.data), mimeType: picture.format }
}

async function readCoverJpg(audioFilePath: string): Promise<ArtworkSource | null> {
  const dir = dirname(audioFilePath)
  const coverPath = join(dir, 'cover.jpg')

  try {
    const data = await readFile(coverPath)
    return { data, mimeType: 'image/jpeg' }
  } catch {
    return null
  }
}

async function resolveArtwork(
  filePath: string,
  metadata: Awaited<ReturnType<typeof parseFile>> | null,
): Promise<string | null> {
  let source: ArtworkSource | null = null

  if (metadata) {
    source = await extractEmbeddedArtwork(metadata)
  }

  if (!source) {
    source = await readCoverJpg(filePath)
  }

  if (!source) {
    return null
  }

  return writeArtworkToCache(input.artworkCacheDir, source)
}

function flushTrackBatch(): void {
  if (trackBatch.length === 0) {
    return
  }

  postMessage({ type: 'tracks', payload: trackBatch.splice(0, trackBatch.length) })
}

function flushArtworkBatch(): void {
  if (artworkBatch.length === 0) {
    return
  }

  postMessage({ type: 'albumArtwork', payload: artworkBatch.splice(0, artworkBatch.length) })
}

type ReadTrackResult =
  | { kind: 'track'; track: ScannedTrack }
  | { kind: 'artwork'; patch: AlbumArtworkPatch }
  | { kind: 'skip' }

async function readTrack(filePath: string): Promise<ReadTrackResult> {
  const fileStat = await stat(filePath)
  const knownFile = knownFiles.get(filePath)
  const fileUnchanged =
    knownFile && knownFile.fileSize === fileStat.size && knownFile.fileMtimeMs === fileStat.mtimeMs

  // Skip completely: file unchanged AND album already has artwork
  if (fileUnchanged && knownFile.artworkCacheKey) {
    return { kind: 'skip' }
  }

  try {
    // Lightweight backfill: file unchanged but album missing artwork
    if (fileUnchanged) {
      const metadata = await parseFile(filePath, { duration: false, skipCovers: false })
      const artworkCacheKey = await resolveArtwork(filePath, metadata)

      if (artworkCacheKey && knownFile) {
        return {
          kind: 'artwork',
          patch: {
            album: knownFile.album ?? '',
            artist: knownFile.albumArtist ?? '',
            artworkCacheKey,
          },
        }
      }

      return { kind: 'skip' }
    }

    // Full parse: file changed
    const fallbackTitle = parse(filePath).name || basename(filePath)
    const metadata = await parseFile(filePath, { duration: true })
    const common = metadata.common
    const artworkCacheKey = await resolveArtwork(filePath, metadata)

    return {
      kind: 'track',
      track: {
        filePath,
        fileSize: fileStat.size,
        fileMtimeMs: fileStat.mtimeMs,
        title: common.title || fallbackTitle,
        artist: common.artist || 'Unknown Artist',
        album: common.album || 'Unknown Album',
        albumArtist: common.albumartist || common.artist || 'Unknown Artist',
        trackNo: common.track.no ?? null,
        discNo: common.disk.no ?? null,
        durationSeconds: metadata.format.duration ?? null,
        year: getYear(common.year, common.date),
        releaseDate: common.date ?? null,
        genre: common.genre?.join(', ') ?? null,
        artworkCacheKey,
      },
    }
  } catch (error) {
    failedFiles += 1
    postMessage({
      type: 'failure',
      payload: {
        jobId: input.jobId,
        filePath,
        reason: error instanceof Error ? error.message : 'Unable to parse metadata',
      },
    })

    const fallbackTitle = parse(filePath).name || basename(filePath)

    return {
      kind: 'track',
      track: {
        filePath,
        fileSize: fileStat.size,
        fileMtimeMs: fileStat.mtimeMs,
        title: fallbackTitle,
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        albumArtist: 'Unknown Artist',
        trackNo: null,
        discNo: null,
        durationSeconds: null,
        year: null,
        releaseDate: null,
        genre: null,
        artworkCacheKey: null,
      },
    }
  }
}

async function run(): Promise<void> {
  postProgress(null, 'Collecting audio files', true)
  const audioFiles = await collectAudioFiles(input.rootPath)
  totalFiles = audioFiles.length
  postProgress(null, 'Scanning audio files', true)

  for (const filePath of audioFiles) {
    const result = await readTrack(filePath)
    scannedFiles += 1

    if (result.kind === 'track') {
      trackBatch.push(result.track)

      if (trackBatch.length >= 300) {
        flushTrackBatch()
      }
    } else if (result.kind === 'artwork') {
      artworkBatch.push(result.patch)

      if (artworkBatch.length >= 300) {
        flushArtworkBatch()
      }
    }

    postProgress(filePath, null)
  }

  flushTrackBatch()
  flushArtworkBatch()
  postProgress(null, 'Scan complete', true)
  postMessage({ type: 'complete' })
}

run().catch((error: unknown) => {
  postMessage({
    type: 'fatal',
    payload: {
      jobId: input.jobId,
      reason: error instanceof Error ? error.message : 'Scan worker failed',
    },
  })
})
