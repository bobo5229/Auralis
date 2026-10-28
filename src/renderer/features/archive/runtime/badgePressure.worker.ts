import { createPressurePainter } from './badgePressurePainter'

import { preparePressure } from './badgePressurePreparation'
import type { PreparedShape, PressureRequest, PressureResponse } from './badgePressurePreparation'

let painter: ReturnType<typeof createPressurePainter> | undefined,
  generation = 0,
  texture: ImageBitmap | undefined
self.onmessage = ({ data }: MessageEvent<PressureRequest>) => {
  const started = performance.now()
  let shapes: PreparedShape[] | undefined
  let base: Uint8ClampedArray | undefined
  if (data.type === 'reset') {
    if (data.texture) {
      texture?.close()
      texture = data.texture
    }
    if (!texture) throw new Error('Missing foam texture')
    generation = data.generation
    const prepared = preparePressure(
      data.configuration,
      texture,
      (width, height) => new OffscreenCanvas(width, height),
    )
    shapes = prepared.shapes
    base = prepared.configuration.base
    painter = createPressurePainter(prepared.configuration)
  }
  if (!painter || generation !== data.generation) return
  let patch = painter.paint(data.pressures)
  if (patch && base && data.type === 'reset') {
    // The main canvas receives its entire first frame, including foam outside dents.
    const { width, height } = data.configuration
    const pixels = new Uint8ClampedArray(base)
    for (let y = 0; y < patch.height; y++)
      pixels.set(
        patch.pixels.subarray(y * patch.width * 4, (y + 1) * patch.width * 4),
        ((y + patch.top) * width + patch.left) * 4,
      )
    patch = { left: 0, top: 0, width, height, pixels }
  }
  const computeMs = performance.now() - started
  const response: PressureResponse = { generation, patch, computeMs, shapes }
  self.postMessage(response, { transfer: patch ? [patch.pixels.buffer] : [] })
}
