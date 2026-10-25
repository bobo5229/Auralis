import { createPressurePainter } from './badgePressurePainter'

import type { PressureRequest, PressureResponse } from './badgePressurePainter'

let painter: ReturnType<typeof createPressurePainter> | undefined,
  generation = 0
self.onmessage = ({ data }: MessageEvent<PressureRequest>) => {
  if (data.type === 'reset') {
    generation = data.generation
    painter = createPressurePainter(data.configuration)
  }
  if (!painter || generation !== data.generation) return
  const started = performance.now()
  const patch = painter.paint(data.pressures)
  const computeMs = performance.now() - started
  const response: PressureResponse = { generation, patch, computeMs }
  self.postMessage(response, { transfer: patch ? [patch.pixels.buffer] : [] })
}
