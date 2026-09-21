import { parentPort, workerData } from 'node:worker_threads'
import { readStableMetadata } from './readStableMetadata'
import type {
  MetadataRefreshWorkerInput,
  MetadataRefreshWorkerMessage,
} from './metadataRefreshTypes'

const input = workerData as MetadataRefreshWorkerInput
let processed = 0
let failed = 0

function postMessage(message: MetadataRefreshWorkerMessage): void {
  parentPort?.postMessage(message)
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
          generation: track.generation ?? 0,
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
  postMessage({
    type: 'fatal',
    payload: {
      jobId: input.jobId,
      reason: error instanceof Error ? error.message : 'Metadata refresh worker failed',
    },
  })
})
