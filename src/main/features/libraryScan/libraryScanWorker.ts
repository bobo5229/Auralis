import { parentPort, workerData } from 'node:worker_threads'
import { runLibraryScan } from './libraryScanRun'
import type { LibraryScanWorkerInput, LibraryScanWorkerMessage } from './libraryScanTypes'

const input = workerData as LibraryScanWorkerInput

function postMessage(message: LibraryScanWorkerMessage): void {
  parentPort?.postMessage(message)
}

runLibraryScan(input, postMessage).catch((error: unknown) => {
  postMessage({
    type: 'fatal',
    payload: {
      jobId: input.jobId,
      reason: error instanceof Error ? error.message : 'Scan worker failed',
    },
  })
})
