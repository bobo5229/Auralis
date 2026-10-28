export interface PressureField {
  x: number
  y: number
  width: number
  height: number
  envelope: Float32Array
  gx: Float32Array
  gy: Float32Array
  pressure: number
  paintedPressure?: number
}
export interface PressureConfiguration {
  width: number
  height: number
  scale: number
  base: Uint8ClampedArray
  fields: PressureField[]
}
export interface PressurePatch {
  left: number
  top: number
  width: number
  height: number
  pixels: Uint8ClampedArray<ArrayBuffer>
}
export type PressureRequest = { generation: number; pressures: number[] } & (
  | { type: 'reset'; configuration: PressureConfiguration }
  | { type: 'paint' }
)
export interface PressureResponse {
  generation: number
  patch: PressurePatch | null
  computeMs: number
}

// Pure pixel kernel shared by the worker and the compatibility path. Fixed
// regions stay cached; every dirty region includes its overlapping neighbours.
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

export function createPressurePainter({
  width,
  height,
  scale,
  base,
  fields,
}: PressureConfiguration) {
  const target = new Uint8ClampedArray(base)
  const compression = new Float32Array(width * height)
  const slopeX = new Float32Array(width * height)
  const slopeY = new Float32Array(width * height)
  const offsetX = new Float32Array(width * height)
  const offsetY = new Float32Array(width * height)
  const buffers = [compression, slopeX, slopeY, offsetX, offsetY]
  return {
    paint(pressures: number[]): PressurePatch | null {
      fields.forEach((field, index) => {
        field.pressure = pressures[index]
      })
      const changed = fields.filter((field) => field.pressure !== field.paintedPressure)
      if (!changed.length) return null
      const left = Math.max(0, Math.min(...changed.map((field) => field.x)))
      const top = Math.max(0, Math.min(...changed.map((field) => field.y)))
      const right = Math.min(width, Math.max(...changed.map((field) => field.x + field.width)))
      const bottom = Math.min(height, Math.max(...changed.map((field) => field.y + field.height)))
      for (let y = top; y < bottom; y++) {
        const start = y * width + left,
          end = y * width + right
        for (const buffer of buffers) buffer.fill(0, start, end)
        target.set(base.subarray(start * 4, end * 4), start * 4)
      }
      for (const field of fields) {
        const pressure = field.pressure
        const cx = field.x + field.width / 2,
          cy = field.y + field.height / 2
        for (let y = Math.max(top, field.y); y < Math.min(bottom, field.y + field.height); y++)
          for (let x = Math.max(left, field.x); x < Math.min(right, field.x + field.width); x++) {
            const local = (y - field.y) * field.width + x - field.x
            const amount = field.envelope[local] * pressure
            if (amount < 0.0001) continue
            const i = y * width + x
            compression[i] += amount
            slopeX[i] += field.gx[local] * pressure
            slopeY[i] += field.gy[local] * pressure
            offsetX[i] += (x - cx) * 0.045 * amount
            offsetY[i] += (y - cy) * 0.045 * amount
          }
      }
      for (let y = top; y < bottom; y++)
        for (let x = left; x < right; x++) {
          const i = y * width + x,
            amount = Math.min(1, compression[i])
          if (amount < 0.0001) continue
          const nx = -slopeX[i],
            ny = -slopeY[i]
          const diffuse = (-0.45 * nx - 0.55 * ny + 0.9) / Math.sqrt(nx * nx + ny * ny + 1)
          const depthAttenuation = 1 - amount * 0.3
          const shade = Math.max(0.25, (0.48 + (0.52 * diffuse) / 0.9) * depthAttenuation)
          const sampleX = clamp(Math.round(x + offsetX[i] + slopeX[i] * scale * 0.5), 0, width - 1)
          const sampleY = clamp(Math.round(y + offsetY[i] + slopeY[i] * scale * 0.5), 0, height - 1)
          const sample = (sampleY * width + sampleX) * 4
          for (let channel = 0; channel < 3; channel++) {
            const packed = 33 + (base[sample + channel] - 33) * (1 - amount * 0.28)
            target[i * 4 + channel] = base[i * 4 + channel] * (1 - amount) + packed * shade * amount
          }
        }
      const patchWidth = right - left,
        patchHeight = bottom - top
      const pixels = new Uint8ClampedArray(patchWidth * patchHeight * 4)
      for (let y = top; y < bottom; y++) {
        const start = (y * width + left) * 4
        pixels.set(target.subarray(start, start + patchWidth * 4), (y - top) * patchWidth * 4)
      }
      for (const field of changed) field.paintedPressure = field.pressure
      return { left, top, width: patchWidth, height: patchHeight, pixels }
    },
  }
}
