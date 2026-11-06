import { cpus } from 'node:os'
import { isWorkerMessageChannelOpen } from '@main/shared/workerMessageCredits'
import { visitAudioFiles } from './libraryScanInventory'
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
  const source = input.databasePath
    ? (await import('./libraryScanReadSource')).openScanReadSource(input)
    : undefined
  const reader = new LibraryScanTrackReader(
    source?.known ?? input.knownFiles,
    artwork,
    (filePath, reason) => reporter.reportFileFailure(filePath, reason),
    source?.cached,
  )
  reporter.beginCollection()
  reporter.beginScanning(0)

  const executing = new Set<Promise<void>>()

  try {
    await visitAudioFiles(
      input.rootPath,
      (directoryPath) => reporter.reportUnreadableDirectory(directoryPath),
      async (filePath) => {
        reporter.discoverFile()
        const p = Promise.resolve().then(() => reader.read(filePath))

        const tracker: Promise<void> = p.then(
          (res) => {
            executing.delete(tracker)
            reporter.handleReadResult(res, filePath)
          },
          (error: unknown) => {
            executing.delete(tracker)
            reporter.reportFileFailure(
              filePath,
              error instanceof Error ? error.message : 'Unable to read file',
            )
            reporter.handleReadResult({ kind: 'skip' }, filePath)
          },
        )
        executing.add(tracker)

        if (executing.size >= SCAN_CONCURRENCY) await Promise.race(executing)
      },
      () => isWorkerMessageChannelOpen(input.messageCredits),
    )
    await Promise.all(executing)

    reporter.complete()
  } finally {
    await Promise.allSettled(executing)
    source?.close()
  }
}
