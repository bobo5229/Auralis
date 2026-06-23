import { parentPort, workerData } from 'node:worker_threads'
import { basename, join, parse } from 'node:path'
import { readdir, stat } from 'node:fs/promises'
import { parseFile } from 'music-metadata'
import { isSupportedAudioFile } from './audioFileFilter'
import type { LibraryScanWorkerInput, LibraryScanWorkerMessage } from './libraryScanTypes'
import type { LibraryScanProgress, ScannedTrack } from '@shared/types/libraryScan'

const input = workerData as LibraryScanWorkerInput
const knownFiles = new Map(input.knownFiles.map((file) => [file.filePath, file]))
const trackBatch: ScannedTrack[] = []

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

function flushTrackBatch(): void {
  if (trackBatch.length === 0) {
    return
  }

  postMessage({ type: 'tracks', payload: trackBatch.splice(0, trackBatch.length) })
}

async function readTrack(filePath: string): Promise<ScannedTrack> {
  const fileStat = await stat(filePath)
  const knownFile = knownFiles.get(filePath)

  if (
    knownFile &&
    knownFile.fileSize === fileStat.size &&
    knownFile.fileMtimeMs === fileStat.mtimeMs
  ) {
    return {
      filePath,
      fileSize: fileStat.size,
      fileMtimeMs: fileStat.mtimeMs,
      title: '',
      artist: '',
      album: '',
      albumArtist: '',
      trackNo: null,
      discNo: null,
      durationSeconds: null,
      year: null,
      genre: null,
    }
  }

  const fallbackTitle = parse(filePath).name || basename(filePath)

  try {
    const metadata = await parseFile(filePath, { duration: true })
    const common = metadata.common

    return {
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
      year: common.year ?? null,
      genre: common.genre?.join(', ') ?? null,
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

    return {
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
      genre: null,
    }
  }
}

async function run(): Promise<void> {
  postProgress(null, 'Collecting audio files', true)
  const audioFiles = await collectAudioFiles(input.rootPath)
  totalFiles = audioFiles.length
  postProgress(null, 'Scanning audio files', true)

  for (const filePath of audioFiles) {
    const track = await readTrack(filePath)
    scannedFiles += 1

    if (track.title) {
      trackBatch.push(track)
    }

    if (trackBatch.length >= 300) {
      flushTrackBatch()
    }

    postProgress(filePath, null)
  }

  flushTrackBatch()
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
