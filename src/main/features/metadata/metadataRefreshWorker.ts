import { parentPort, workerData } from 'node:worker_threads'
import { readStableMetadata } from './readStableMetadata'
import {
  takeWorkerMessageCredit,
  isWorkerMessageChannelOpen,
} from '@main/shared/workerMessageCredits'
import type {
  MetadataRefreshWorkerInput,
  MetadataRefreshWorkerMessage,
} from './metadataRefreshTypes'

const input = workerData as MetadataRefreshWorkerInput
let processed = 0
let failed = 0
let sequence = 0

function postMessage(message: MetadataRefreshWorkerMessage): void {
  if (input.messageCredits) {
    takeWorkerMessageCredit(input.messageCredits)
    parentPort?.postMessage({ ...message, sequence: ++sequence })
  } else parentPort?.postMessage(message)
}

async function run(): Promise<void> {
  for (const track of input.tracks) {
    try {
      const result = await readStableMetadata(track.trackId, track.filePath, input.artworkCacheDir)
      postMessage({
        type: 'result',
        payload: {
          ...result,
          jobId: input.jobId,
        },
      })
      processed++
    } catch (error) {
      failed++
      postMessage({
        type: 'failure',
        payload: {
          jobId: input.jobId,
          trackId: track.trackId,
          filePath: track.filePath,
          reason: error instanceof Error ? error.message : 'Unable to parse metadata',
        },
      })
    }
    postMessage({ type: 'progress', payload: { jobId: input.jobId, processed, failed } })
  }
  postMessage({ type: 'complete' })
}

run().catch((error: unknown) => {
  if (!isWorkerMessageChannelOpen(input.messageCredits)) return
  postMessage({
    type: 'fatal',
    payload: {
      jobId: input.jobId,
      reason: error instanceof Error ? error.message : 'Metadata refresh worker failed',
    },
  })
})
