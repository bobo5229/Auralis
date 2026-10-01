import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import type { CoverQuantizeWorkerInput, CoverQuantizeWorkerOutput } from './coverQuantize.worker'

const MAX_LRU_CACHE_SIZE = 24
const COVER_SIZE = 96
const QUANTIZE_COLORS = 32
const QUANTIZE_STRENGTH = 0.65

export interface CoverPipelineOptions {
  workerFactory?: () => Worker
}

export class CoverPipeline {
  private worker: Worker | null = null
  private lruCache = new Map<string, HTMLCanvasElement>()
  private inFlight = new Map<string, Promise<HTMLCanvasElement>>()
  private pendingCallbacks = new Map<
    string,
    {
      resolve: (canvas: HTMLCanvasElement) => void
      reject: (error: Error) => void
      revision: number
    }
  >()
  private taskCounter = 0
  private disposed = false
  private imageCancels = new Set<() => void>()

  constructor(options: CoverPipelineOptions = {}) {
    if (options.workerFactory || typeof Worker !== 'undefined') {
      try {
        this.worker = options.workerFactory
          ? options.workerFactory()
          : new Worker(new URL('./coverQuantize.worker.ts', import.meta.url), {
              type: 'module',
            })
        this.worker.onmessage = (event: MessageEvent<CoverQuantizeWorkerOutput>) => {
          this.handleWorkerMessage(event.data)
        }
        this.worker.onerror = (event: ErrorEvent) => {
          this.handleWorkerError(event)
        }
      } catch (err) {
        rendererDiagnostics.warn({
          scope: 'archive.mac.coverPipeline',
          message: 'Worker initialization failed',
          cause: err,
        })
      }
    }
  }

  private handleWorkerMessage(data: CoverQuantizeWorkerOutput): void {
    const callback = this.pendingCallbacks.get(data.taskId)
    if (!callback) return
    this.pendingCallbacks.delete(data.taskId)

    if (this.disposed) return

    if (data.error || !data.pixels) {
      callback.reject(new Error(data.error ?? 'Empty worker output'))
      return
    }

    try {
      const canvas = document.createElement('canvas')
      canvas.width = COVER_SIZE
      canvas.height = COVER_SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        callback.reject(new Error('Canvas 2D context unavailable'))
        return
      }

      const imgData = new ImageData(new Uint8ClampedArray(data.pixels), COVER_SIZE, COVER_SIZE)
      ctx.putImageData(imgData, 0, 0)

      callback.resolve(canvas)
    } catch (err) {
      callback.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }

  private handleWorkerError(event: ErrorEvent): void {
    this.worker?.terminate()
    this.worker = null
    rendererDiagnostics.warn({
      scope: 'archive.mac.coverPipeline',
      message: `Worker error: ${event.message}`,
    })
    for (const [taskId, callback] of this.pendingCallbacks) {
      callback.reject(new Error(`Worker error: ${event.message}`))
      this.pendingCallbacks.delete(taskId)
    }
  }

  public createPlaceholderCanvas(title?: string | null): HTMLCanvasElement {
    if (typeof document === 'undefined') {
      return { width: COVER_SIZE, height: COVER_SIZE } as HTMLCanvasElement
    }
    const canvas = document.createElement('canvas')
    canvas.width = COVER_SIZE
    canvas.height = COVER_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return canvas

    ctx.fillStyle = '#20232d'
    ctx.fillRect(0, 0, COVER_SIZE, COVER_SIZE)

    ctx.strokeStyle = '#3b4252'
    ctx.lineWidth = 1.5
    ctx.strokeRect(6, 6, COVER_SIZE - 12, COVER_SIZE - 12)

    ctx.fillStyle = '#4c566a'
    ctx.beginPath()
    ctx.arc(COVER_SIZE / 2, COVER_SIZE / 2, 28, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#20232d'
    ctx.beginPath()
    ctx.arc(COVER_SIZE / 2, COVER_SIZE / 2, 10, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#88c0d0'
    ctx.beginPath()
    ctx.arc(COVER_SIZE / 2, COVER_SIZE / 2, 3, 0, Math.PI * 2)
    ctx.fill()

    if (title) {
      ctx.fillStyle = '#d8dee9'
      ctx.font = '12px "Auralis Mac Pixel", monospace'
      ctx.textAlign = 'center'
      ctx.fillText(title.slice(0, 6), COVER_SIZE / 2, COVER_SIZE - 12)
    }

    return canvas
  }

  public getCover(
    artworkCacheKey: string | null,
    revision: number,
    title?: string | null,
  ): Promise<HTMLCanvasElement> {
    if (this.disposed || !artworkCacheKey) {
      return Promise.resolve(this.createPlaceholderCanvas(title))
    }

    const cached = this.lruCache.get(artworkCacheKey)
    if (cached) {
      // Re-insert to refresh LRU position
      this.lruCache.delete(artworkCacheKey)
      this.lruCache.set(artworkCacheKey, cached)
      return Promise.resolve(cached)
    }

    const existingPromise = this.inFlight.get(artworkCacheKey)
    if (existingPromise) {
      return existingPromise
    }

    const task = this.processCover(artworkCacheKey, revision, title)
      .then((canvas) => {
        this.inFlight.delete(artworkCacheKey)
        if (!this.disposed) this.recordToCache(artworkCacheKey, canvas)
        return canvas
      })
      .catch((err) => {
        this.inFlight.delete(artworkCacheKey)
        if (!this.disposed)
          rendererDiagnostics.warn({
            scope: 'archive.mac.coverPipeline',
            message: 'Failed to process cover',
            context: { artworkCacheKey },
            cause: err,
          })
        return this.createPlaceholderCanvas(title)
      })

    this.inFlight.set(artworkCacheKey, task)
    return task
  }

  private recordToCache(key: string, canvas: HTMLCanvasElement): void {
    if (this.lruCache.has(key)) {
      this.lruCache.delete(key)
    } else if (this.lruCache.size >= MAX_LRU_CACHE_SIZE) {
      const oldestKey = this.lruCache.keys().next().value
      if (oldestKey !== undefined) {
        this.lruCache.delete(oldestKey)
      }
    }
    this.lruCache.set(key, canvas)
  }

  private async processCover(
    artworkCacheKey: string,
    revision: number,
    title?: string | null,
  ): Promise<HTMLCanvasElement> {
    const url = getArtworkUrl(artworkCacheKey)
    if (!url) return this.createPlaceholderCanvas(title)

    const img = new Image()
    img.crossOrigin = 'anonymous'

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        img.onload = null
        img.onerror = null
        this.imageCancels.delete(cancel)
      }
      const cancel = () => {
        cleanup()
        img.src = ''
        reject(new Error('CoverPipeline disposed'))
      }
      this.imageCancels.add(cancel)
      img.onload = () => {
        cleanup()
        resolve()
      }
      img.onerror = () => {
        cleanup()
        reject(new Error(`Failed to load artwork image: ${url}`))
      }
      img.src = url
    })

    if (this.disposed) return this.createPlaceholderCanvas(title)

    const edge = Math.min(img.naturalWidth, img.naturalHeight)
    if (edge <= 0) return this.createPlaceholderCanvas(title)

    const prepCanvas = document.createElement('canvas')
    prepCanvas.width = COVER_SIZE
    prepCanvas.height = COVER_SIZE
    const prepCtx = prepCanvas.getContext('2d')
    if (!prepCtx) return this.createPlaceholderCanvas(title)

    prepCtx.drawImage(
      img,
      (img.naturalWidth - edge) / 2,
      (img.naturalHeight - edge) / 2,
      edge,
      edge,
      0,
      0,
      COVER_SIZE,
      COVER_SIZE,
    )

    if (!this.worker) {
      return this.createPlaceholderCanvas(title)
    }

    const imgData = prepCtx.getImageData(0, 0, COVER_SIZE, COVER_SIZE)
    const taskId = `task_${++this.taskCounter}`
    const buffer = imgData.data.buffer

    return new Promise<HTMLCanvasElement>((resolve, reject) => {
      this.pendingCallbacks.set(taskId, {
        resolve,
        reject,
        revision,
      })

      const message: CoverQuantizeWorkerInput = {
        taskId,
        revision,
        size: COVER_SIZE,
        colors: QUANTIZE_COLORS,
        strength: QUANTIZE_STRENGTH,
        pixels: buffer,
      }

      try {
        this.worker!.postMessage(message, [buffer as Transferable])
      } catch (error) {
        this.pendingCallbacks.delete(taskId)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  public dispose(): void {
    this.disposed = true
    this.imageCancels.forEach((cancel) => cancel())
    this.imageCancels.clear()
    for (const [, cb] of this.pendingCallbacks) {
      cb.reject(new Error('CoverPipeline disposed'))
    }
    this.pendingCallbacks.clear()
    this.inFlight.clear()
    this.lruCache.clear()
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }
}
