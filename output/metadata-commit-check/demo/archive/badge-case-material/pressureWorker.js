import { createPressurePainter } from './pressurePainter.js'

let painter,
  generation = 0
self.onmessage = ({ data }) => {
  if (data.type === 'reset') {
    generation = data.generation
    painter = createPressurePainter(data.configuration)
  }
  if (!painter || generation !== data.generation) return
  const started = performance.now()
  const patch = painter.paint(data.pressures)
  const computeMs = performance.now() - started
  self.postMessage({ generation, patch, computeMs }, patch ? [patch.pixels.buffer] : [])
}
