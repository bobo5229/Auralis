import { parentPort, workerData } from 'node:worker_threads'
import { cpus } from 'node:os'
import { basename, dirname, join, parse } from 'node:path'
import { readFile, readdir, stat } from 'node:fs/promises'
import { parseFile } from 'music-metadata'
import { isSupportedAudioFile } from './audioFileFilter'
import { writeArtworkToCache } from '../artwork/artworkCache'
import { isCurrentArtworkCacheKey } from '../artwork/artworkCachePolicy'
import { resolveArtworkForFile } from '../artwork/resolveArtworkForFile'
import {
  normalizeMetadata,
  normalizeIdentityText,
  buildMetadataSignature,
} from '../metadata/metadataNormalizer'
import { resolveLyricsForFile } from '../metadata/resolveLyricsForFile'
import type { LibraryScanWorkerInput, LibraryScanWorkerMessage } from './libraryScanTypes'
import type {
  AlbumArtworkPatch,
  LibraryScanProgress,
  ScannedTrack,
  TrackLyricsPatch,
} from '@shared/types/libraryScan'

const input = workerData as LibraryScanWorkerInput
const knownFiles = new Map(input.knownFiles.map((file) => [file.filePath, file]))
const trackBatch: ScannedTrack[] = []
const artworkBatch: AlbumArtworkPatch[] = []
const lyricsBatch: TrackLyricsPatch[] = []
const foundFilePaths: string[] = []
const unreadableDirectoryPaths: string[] = []

const SCAN_CONCURRENCY = Math.max(4, Math.min(cpus().length || 4, 8))

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
        unreadableDirectoryPaths.push(entryPath)
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

async function resolveDirectoryCover(filePath: string): Promise<string | null> {
  const dir = dirname(filePath)
  const cached = directoryCoverCache.get(dir)

  if (cached !== undefined) {
    return cached
  }

  const coverPath = join(dir, 'cover.jpg')

  try {
    const data = await readFile(coverPath)
    const key = await writeArtworkToCache(input.artworkCacheDir, {
      data,
      mimeType: 'image/jpeg',
    })
    directoryCoverCache.set(dir, key)
    return key
  } catch {
    directoryCoverCache.set(dir, null)
    return null
  }
}

async function resolveArtwork(
  filePath: string,
  metadata: Awaited<ReturnType<typeof parseFile>> | null,
): Promise<string | null> {
  const dirCoverKey = await resolveDirectoryCover(filePath)
  if (dirCoverKey) {
    return dirCoverKey
  }

  if (!metadata) {
    return null
  }

  return resolveArtworkForFile(filePath, metadata, input.artworkCacheDir)
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

function flushLyricsBatch(): void {
  if (lyricsBatch.length === 0) {
    return
  }

  postMessage({ type: 'trackLyrics', payload: lyricsBatch.splice(0, lyricsBatch.length) })
}

async function createScannedTrack(
  filePath: string,
  fileStat: Awaited<ReturnType<typeof stat>>,
  metadata: Awaited<ReturnType<typeof parseFile>>,
  resolvedArtworkKey?: string | null,
): Promise<ScannedTrack> {
  const normalized = normalizeMetadata(metadata, filePath)
  const albumKey = getAlbumKey(normalized.album, normalized.albumArtist)
  const cachedAlbumKey = albumKey ? albumArtworkCache.get(albumKey) : undefined
  const artworkCacheKey =
    resolvedArtworkKey ?? cachedAlbumKey ?? (await resolveArtwork(filePath, metadata))
  const lyrics = await resolveLyricsForFile(filePath, metadata)
  const identity = normalizeIdentityText(metadata)

  if (albumKey && artworkCacheKey) {
    albumArtworkCache.set(albumKey, artworkCacheKey)
  }

  return {
    filePath,
    fileSize: Number(fileStat.size),
    fileMtimeMs: Number(fileStat.mtimeMs),
    title: normalized.title,
    artist: normalized.artist,
    album: normalized.album,
    albumArtist: normalized.albumArtist,
    trackNo: normalized.trackNo,
    discNo: normalized.discNo,
    durationSeconds: normalized.durationSeconds,
    year: normalized.year,
    releaseDate: normalized.releaseDate,
    copyright: normalized.copyright,
    genre: normalized.genre,
    artworkCacheKey,
    lyricsText: lyrics?.text ?? null,
    lyricsFormat: lyrics?.format ?? null,
    isrc: identity.isrc,
    metadataSignature: buildMetadataSignature(
      identity,
      normalized.durationSeconds,
      Number(fileStat.size),
    ),
  }
}

type ReadTrackResult =
  | { kind: 'track'; track: ScannedTrack }
  | { kind: 'artwork'; patch: AlbumArtworkPatch }
  | {
      kind: 'patches'
      artworkPatch: AlbumArtworkPatch | null
      lyricsPatch: TrackLyricsPatch | null
    }
  | { kind: 'skip' }

async function readTrack(filePath: string): Promise<ReadTrackResult> {
  let fileSize: number
  let fileMtimeMs: number
  let fileStat: Awaited<ReturnType<typeof stat>>

  try {
    fileStat = await stat(filePath)
    fileSize = Number(fileStat.size)
    fileMtimeMs = Number(fileStat.mtimeMs)
  } catch (statError) {
    // File disappeared between readdir and stat — single-file failure, not fatal
    failedFiles += 1
    postMessage({
      type: 'failure',
      payload: {
        jobId: input.jobId,
        filePath,
        reason: statError instanceof Error ? statError.message : 'Unable to stat file',
      },
    })
    return { kind: 'skip' }
  }

  const knownFile = knownFiles.get(filePath)
  const fileUnchanged =
    knownFile && knownFile.fileSize === fileSize && knownFile.fileMtimeMs === fileMtimeMs
  const lyricsChecked =
    knownFile?.lyricsCheckedMtimeMs !== null && knownFile?.lyricsCheckedMtimeMs === fileMtimeMs
  const needsLyricsBackfill = Boolean(fileUnchanged && knownFile && !lyricsChecked)
  const metadataChecked =
    knownFile?.metadataCheckedMtimeMs !== null && knownFile?.metadataCheckedMtimeMs === fileMtimeMs
  const needsMetadataBackfill = Boolean(fileUnchanged && knownFile && !metadataChecked)

  // Skip completely: file unchanged, album already has a CURRENT (v2) artwork
  // key, and lyrics were checked for this mtime. A legacy key still requires
  // the lightweight upgrade path below (TechDoc §7.1).
  if (
    fileUnchanged &&
    isCurrentArtworkCacheKey(knownFile.artworkCacheKey) &&
    !needsLyricsBackfill &&
    !needsMetadataBackfill
  ) {
    return { kind: 'skip' }
  }

  try {
    if (!fileUnchanged || needsMetadataBackfill) {
      const dirCoverKey = await resolveDirectoryCover(filePath)
      let knownAlbumArtworkKey: string | null | undefined = dirCoverKey ?? undefined

      if (knownAlbumArtworkKey === undefined && knownFile?.album && knownFile.albumArtist) {
        const albumKey = getAlbumKey(knownFile.album, knownFile.albumArtist)
        if (albumKey) {
          knownAlbumArtworkKey = albumArtworkCache.get(albumKey)
        }
      }

      if (knownAlbumArtworkKey !== undefined && isCurrentArtworkCacheKey(knownAlbumArtworkKey)) {
        const metadata = await parseFile(filePath, { duration: true, skipCovers: true })
        return {
          kind: 'track',
          track: await createScannedTrack(filePath, fileStat, metadata, knownAlbumArtworkKey),
        }
      }

      const metadata = await parseFile(filePath, { duration: true })
      return {
        kind: 'track',
        track: await createScannedTrack(filePath, fileStat, metadata),
      }
    }

    // Lightweight backfill: file unchanged but album missing artwork and/or lyrics not checked yet
    if (fileUnchanged) {
      const albumKey = getAlbumKey(knownFile?.album ?? null, knownFile?.albumArtist ?? null)
      let artworkPatch: AlbumArtworkPatch | null = null
      let lyricsPatch: TrackLyricsPatch | null = null

      // Album-level cache hit: skip artwork work entirely when lyrics do not need backfill.
      if (albumKey && !needsLyricsBackfill) {
        const cached = albumArtworkCache.get(albumKey)

        if (cached !== undefined) {
          // Only a CURRENT v2 key can be committed by the album upsert; a null
          // value means "no artwork" and skips, a legacy value falls through to
          // re-resolution so the upgrade is not lost.
          if (isCurrentArtworkCacheKey(cached) && knownFile?.album && knownFile.albumArtist) {
            return {
              kind: 'artwork',
              patch: {
                album: knownFile.album,
                artist: knownFile.albumArtist,
                artworkCacheKey: cached,
              },
            }
          }

          if (cached === null) {
            return { kind: 'skip' }
          }
        }
      }

      // Cache miss or lyrics backfill: parse file once and reuse metadata for both tasks.
      const dirCoverKey = await resolveDirectoryCover(filePath)
      const hasKnownKey =
        dirCoverKey !== null ||
        (albumKey !== null && albumArtworkCache.get(albumKey!) !== undefined)
      const skipCovers = Boolean(hasKnownKey)

      const metadata = await parseFile(filePath, { duration: false, skipCovers })

      if (needsLyricsBackfill) {
        const lyrics = await resolveLyricsForFile(filePath, metadata)
        lyricsPatch = {
          filePath,
          lyricsText: lyrics?.text ?? null,
          lyricsFormat: lyrics?.format ?? null,
          lyricsCheckedMtimeMs: fileMtimeMs,
        }
      }

      // Reuse only a CURRENT v2 key; legacy keys must be re-resolved so the
      // artwork cache is upgraded even when the audio file itself is unchanged.
      const knownKey = knownFile?.artworkCacheKey ?? null
      const artworkCacheKey = isCurrentArtworkCacheKey(knownKey)
        ? knownKey
        : (dirCoverKey ?? (await resolveArtwork(filePath, metadata)))

      // Cache both success and failure to avoid repeated parseFile for albums without artwork
      if (albumKey) {
        albumArtworkCache.set(albumKey, artworkCacheKey)
      }

      if (artworkCacheKey && knownFile?.album && knownFile.albumArtist) {
        artworkPatch = {
          album: knownFile.album,
          artist: knownFile.albumArtist,
          artworkCacheKey,
        }
      }

      if (artworkPatch || lyricsPatch) {
        return {
          kind: 'patches',
          artworkPatch,
          lyricsPatch,
        }
      }

      return { kind: 'skip' }
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

    if (fileUnchanged) {
      return { kind: 'skip' }
    }

    const fallbackTitle = parse(filePath).name || basename(filePath)

    return {
      kind: 'track',
      track: {
        filePath,
        fileSize,
        fileMtimeMs,
        title: fallbackTitle,
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        albumArtist: 'Unknown Artist',
        trackNo: null,
        discNo: null,
        durationSeconds: null,
        year: null,
        releaseDate: null,
        copyright: null,
        genre: null,
        artworkCacheKey: null,
        lyricsText: null,
        lyricsFormat: null,
        isrc: null,
        metadataSignature: buildMetadataSignature(
          { title: fallbackTitle, artist: 'Unknown Artist', album: 'Unknown Album', isrc: null },
          null,
          fileSize,
        ),
      },
    }
  }

  return { kind: 'skip' }
}

function handleReadResult(result: ReadTrackResult, filePath: string): void {
  scannedFiles += 1
  foundFilePaths.push(filePath)

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
  } else if (result.kind === 'patches') {
    if (result.artworkPatch) {
      artworkBatch.push(result.artworkPatch)
    }

    if (result.lyricsPatch) {
      lyricsBatch.push(result.lyricsPatch)
    }

    if (artworkBatch.length >= 300) {
      flushArtworkBatch()
    }

    if (lyricsBatch.length >= 300) {
      flushLyricsBatch()
    }
  }

  postProgress(filePath, null)
}

async function run(): Promise<void> {
  postProgress(null, 'Collecting audio files', true)
  const audioFiles = await collectAudioFiles(input.rootPath)
  totalFiles = audioFiles.length
  postProgress(null, 'Scanning audio files', true)

  let index = 0
  const executing = new Set<Promise<void>>()

  while (index < audioFiles.length) {
    const filePath = audioFiles[index++]
    const p = Promise.resolve().then(() => readTrack(filePath))

    const tracker: Promise<void> = p.then(
      (res) => {
        executing.delete(tracker)
        handleReadResult(res, filePath)
      },
      () => {
        executing.delete(tracker)
      },
    )
    executing.add(tracker)

    if (executing.size >= SCAN_CONCURRENCY) {
      await Promise.race(executing)
    }
  }
  await Promise.all(executing)

  flushTrackBatch()
  flushArtworkBatch()
  flushLyricsBatch()
  postProgress(null, 'Scan complete', true)
  postMessage({
    type: 'complete',
    payload: { foundFilePaths, unreadableDirectoryPaths },
  })
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
