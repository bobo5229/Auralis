import { parentPort, workerData } from 'node:worker_threads'
import { runLibraryScan } from './libraryScanRun'
import {
  takeWorkerMessageCredit,
  isWorkerMessageChannelOpen,
} from '@main/shared/workerMessageCredits'
import type { LibraryScanWorkerInput, LibraryScanWorkerMessage } from './libraryScanTypes'

const input = workerData as LibraryScanWorkerInput
let sequence = 0

function postMessage(message: LibraryScanWorkerMessage): void {
  if (input.messageCredits) {
    takeWorkerMessageCredit(input.messageCredits)
    parentPort?.postMessage({ ...message, sequence: ++sequence })
  } else parentPort?.postMessage(message)
}

runLibraryScan(input, postMessage).catch((error: unknown) => {
  if (!isWorkerMessageChannelOpen(input.messageCredits)) return
  postMessage({
    type: 'fatal',
    payload: {
      jobId: input.jobId,
      reason: error instanceof Error ? error.message : 'Scan worker failed',
    },
  })
})
