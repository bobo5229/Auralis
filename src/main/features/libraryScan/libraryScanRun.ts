import { cpus } from 'node:os'
import { collectAudioFiles } from './libraryScanInventory'
import { LibraryScanArtwork } from './libraryScanArtwork'
import { LibraryScanTrackReader } from './libraryScanTrackReader'
import { LibraryScanReporter } from './libraryScanReporter'
import type { LibraryScanWorkerInput, LibraryScanWorkerMessage } from './libraryScanTypes'

const SCAN_CONCURRENCY = Math.max(4, Math.min(cpus().length || 4, 8))

export async function runLibraryScan(
  input: LibraryScanWorkerInput,
  postMessage: (message: LibraryScanWorkerMessage) => void,
): Promise<void> {
  const reporter = new LibraryScanReporter(input.jobId, postMessage)
  const artwork = new LibraryScanArtwork(input.artworkCacheDir)
  const reader = new LibraryScanTrackReader(input.knownFiles, artwork, (filePath, reason) =>
    reporter.reportFileFailure(filePath, reason),
  )
  reporter.beginCollection()
  const audioFiles = await collectAudioFiles(input.rootPath, (directoryPath) =>
    reporter.reportUnreadableDirectory(directoryPath),
  )
  reporter.beginScanning(audioFiles.length)

  let index = 0
  const executing = new Set<Promise<void>>()

  while (index < audioFiles.length) {
    const filePath = audioFiles[index++]
    const p = Promise.resolve().then(() => reader.read(filePath))

    const tracker: Promise<void> = p.then(
      (res) => {
        executing.delete(tracker)
        reporter.handleReadResult(res, filePath)
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

  reporter.complete()
}
