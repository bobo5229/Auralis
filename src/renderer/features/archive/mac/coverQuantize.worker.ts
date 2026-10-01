import { buildPaletteSync, distance, image, utils } from 'image-q'

export interface CoverQuantizeWorkerInput {
  taskId: string
  revision: number
  size: number
  colors: number
  strength: number
  pixels: ArrayBufferLike
}

export interface CoverQuantizeWorkerOutput {
  taskId: string
  revision: number
  pixels?: ArrayBufferLike
  error?: string
}

interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void
}

self.onmessage = (event: MessageEvent<CoverQuantizeWorkerInput>) => {
  const data = event.data
  try {
    const { taskId, revision, size, colors, strength, pixels } = data
    const points = utils.PointContainer.fromUint8Array(new Uint8ClampedArray(pixels), size, size)
    const options = {
      colors,
      paletteQuantization: 'wuquant',
      colorDistanceFormula: 'euclidean-bt709',
    } as const
    const palette = buildPaletteSync([points], options)
    const metric = new distance.EuclideanBT709()
    const quantizer =
      strength === 0
        ? new image.NearestColor(metric)
        : new image.ErrorDiffusionArray(
            metric,
            image.ErrorDiffusionArrayKernel.FloydSteinberg,
            true,
            (1 - strength) * 0.2,
          )
    const result = quantizer.quantizeSync(points, palette).toUint8Array()
    const resultBuffer = result.buffer
    const response: CoverQuantizeWorkerOutput = {
      taskId,
      revision,
      pixels: resultBuffer,
    }
    ;(self as unknown as WorkerScope).postMessage(response, [resultBuffer as Transferable])
  } catch (err: unknown) {
    const response: CoverQuantizeWorkerOutput = {
      taskId: event.data?.taskId,
      revision: event.data?.revision,
      error: err instanceof Error ? err.message : String(err),
    }
    ;(self as unknown as WorkerScope).postMessage(response)
  }
}
