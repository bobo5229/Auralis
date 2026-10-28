import type { ArtworkPalette } from '../types'

interface WorkerResponse {
  id: number
  palette?: ArtworkPalette
  error?: string
}

interface PendingRequest {
  resolve: (palette: ArtworkPalette) => void
  reject: (error: Error) => void
}

let worker: Worker | null = null
let workerUnavailable = false
let nextRequestId = 0
const pendingRequests = new Map<number, PendingRequest>()

function rejectPendingRequests(message: string): void {
  for (const request of pendingRequests.values()) request.reject(new Error(message))
  pendingRequests.clear()
}

function getWorker(): Worker | null {
  if (workerUnavailable) return null
  if (worker) return worker

  try {
    worker = new Worker(new URL('../workers/artworkPalette.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      const request = pendingRequests.get(response.id)
      if (!request) return
      pendingRequests.delete(response.id)
      if (response.palette) {
        request.resolve(response.palette)
      } else {
        request.reject(new Error(response.error ?? 'Palette worker failed'))
      }
    }
    worker.onerror = () => {
      workerUnavailable = true
      worker?.terminate()
      worker = null
      rejectPendingRequests('Palette worker stopped unexpectedly')
    }
    return worker
  } catch {
    workerUnavailable = true
    return null
  }
}

export function extractArtworkPaletteInWorker(
  key: string,
  pixels: Uint8ClampedArray,
): Promise<ArtworkPalette> {
  const paletteWorker = getWorker()
  if (!paletteWorker) {
    return Promise.reject(new Error('Palette worker is unavailable'))
  }

  const id = ++nextRequestId
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })
    paletteWorker.postMessage({ id, key, pixels }, [pixels.buffer])
  })
}
