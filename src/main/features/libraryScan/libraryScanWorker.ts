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

// In-memory caches scoped to this scan run (see §4–7 of TechDoc)
const albumArtworkCache = new Map<string, string | null>()
const directoryCoverCache = new Map<string, string | null>()

function getAlbumKey(album: string | null, albumArtist: string | null): string | null {
  if (!album || !albumArtist) return null
  return `${album}\u0000${albumArtist}`
}

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

async function readCoverJpgSource(audioFilePath: string): Promise<ArtworkSource | null> {
  const coverPath = join(dirname(audioFilePath), 'cover.jpg')

  try {
    const data = await readFile(coverPath)
    return { data, mimeType: 'image/jpeg' }
  } catch {
    return null
  }
}

async function resolveDirectoryCover(filePath: string): Promise<string | null> {
  const dir = dirname(filePath)
  const cached = directoryCoverCache.get(dir)

  // Cache hit: string = artwork key, null = no cover in this directory
  if (cached !== undefined) {
    return cached
  }

  const source = await readCoverJpgSource(filePath)

  if (!source) {
    directoryCoverCache.set(dir, null)
    return null
  }

  const key = await writeArtworkToCache(input.artworkCacheDir, source)
  directoryCoverCache.set(dir, key)
  return key
}

async function resolveArtwork(
  filePath: string,
  metadata: Awaited<ReturnType<typeof parseFile>> | null,
): Promise<string | null> {
  // 1. Try embedded artwork from audio file
  if (metadata) {
    const source = await extractEmbeddedArtwork(metadata)

    if (source) {
      return writeArtworkToCache(input.artworkCacheDir, source)
    }
  }

  // 2. Fall back to directory cover.jpg (cached per directory)
  return resolveDirectoryCover(filePath)
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
      const albumKey = getAlbumKey(knownFile?.album ?? null, knownFile?.albumArtist ?? null)

      // Album-level cache hit: skip parseFile entirely
      if (albumKey) {
        const cached = albumArtworkCache.get(albumKey)

        if (cached !== undefined) {
          if (cached && knownFile?.album && knownFile.albumArtist) {
            return {
              kind: 'artwork',
              patch: {
                album: knownFile.album,
                artist: knownFile.albumArtist,
                artworkCacheKey: cached,
              },
            }
          }

          return { kind: 'skip' }
        }
      }

      // Cache miss: parse file and resolve artwork
      const metadata = await parseFile(filePath, { duration: false, skipCovers: false })
      const artworkCacheKey = await resolveArtwork(filePath, metadata)

      // Cache both success and failure to avoid repeated parseFile for albums without artwork
      if (albumKey) {
        albumArtworkCache.set(albumKey, artworkCacheKey)
      }

      if (artworkCacheKey && knownFile?.album && knownFile.albumArtist) {
        return {
          kind: 'artwork',
          patch: {
            album: knownFile.album,
            artist: knownFile.albumArtist,
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

    // Populate album cache from full parse results
    const album = common.album || 'Unknown Album'
    const albumArtist =
      common.albumartists?.join('; ') || common.albumartist || common.artist || 'Unknown Artist'
    const albumKey = getAlbumKey(album, albumArtist)

    if (albumKey && artworkCacheKey) {
      albumArtworkCache.set(albumKey, artworkCacheKey)
    }

    return {
      kind: 'track',
      track: {
        filePath,
        fileSize: fileStat.size,
        fileMtimeMs: fileStat.mtimeMs,
        title: common.title || fallbackTitle,
        artist: common.artists?.join('; ') || common.artist || 'Unknown Artist',
        album,
        albumArtist,
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
