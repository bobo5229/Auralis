import { signedDistance } from './badgeDistanceField'
import type { PressureConfiguration, PressureField, PressurePatch } from './badgePressurePainter'

export interface PressureGeometry {
  contour: string
  width: number
  height: number
  scale: number
  imageX: number
  imageY: number
  imageScale: number
}
export type PressureShape = Pick<PressureField, 'envelope' | 'gx' | 'gy'>
export interface PreparedShape {
  key: string
  shape: PressureShape
}
export interface PressurePlacement {
  key: string
  x: number
  y: number
  geometry: PressureGeometry
  shape?: PressureShape
  pressure: number
}
export interface PressureLayout {
  width: number
  height: number
  scale: number
  fields: PressurePlacement[]
}
export type PressureRequest = { generation: number; pressures: number[] } & (
  | { type: 'reset'; configuration: PressureLayout; texture?: ImageBitmap }
  | { type: 'paint' }
)
export interface PressureResponse {
  generation: number
  patch: PressurePatch | null
  computeMs: number
  shapes?: PreparedShape[]
}

// Immutable arrays survive panel disposal, but never retain canvases or workers.
// Cached buffers are cloned by postMessage, never transferred/detached.
export class PressureShapeCache {
  private entries = new Map<string, PressureShape>()
  private bytes = 0
  constructor(private readonly budget = 32 * 1024 * 1024) {}
  get(key: string) {
    const shape = this.entries.get(key)
    if (shape) {
      this.entries.delete(key)
      this.entries.set(key, shape)
    }
    return shape
  }
  set(key: string, shape: PressureShape) {
    const size = (value: PressureShape) =>
      value.envelope.byteLength + value.gx.byteLength + value.gy.byteLength
    const old = this.entries.get(key)
    if (old) {
      this.bytes -= size(old)
      this.entries.delete(key)
    }
    if (size(shape) > this.budget) return
    this.entries.set(key, shape)
    this.bytes += size(shape)
    while (this.bytes > this.budget) {
      const oldest = this.entries.keys().next().value!
      this.bytes -= size(this.entries.get(oldest)!)
      this.entries.delete(oldest)
    }
  }
}

export const pressureShapeKey = (geometry: PressureGeometry) => JSON.stringify(geometry)
type SurfaceCanvas = HTMLCanvasElement | OffscreenCanvas
type SurfaceContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
const contextFor = (canvas: SurfaceCanvas) => {
  const context = canvas.getContext('2d', { willReadFrequently: true }) as SurfaceContext | null
  if (!context) throw new Error('海绵材质无法绘制')
  return context
}
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

/** Pixel preparation runs in the worker; the same kernel serves its compatibility path. */
export function preparePressure(
  layout: PressureLayout,
  texture: CanvasImageSource,
  makeCanvas: (width: number, height: number) => SurfaceCanvas,
) {
  const { width, height, scale } = layout
  const context = contextFor(makeCanvas(width, height))
  context.setTransform(scale, 0, 0, scale, 0, 0)
  const pattern = context.createPattern(texture, 'repeat')!
  // Dense open-cell foam: small pores with a quieter, finer grain between them.
  // Both passes are baked into the cached base, never added to animation frames.
  pattern.setTransform(new DOMMatrix().scale(0.375))
  context.fillStyle = pattern
  context.fillRect(0, 0, width / scale, height / scale)
  const fineGrain = context.createPattern(texture, 'repeat')!
  fineGrain.setTransform(new DOMMatrix().translate(97, 53).scale(0.125))
  context.save()
  context.globalCompositeOperation = 'soft-light'
  context.globalAlpha = 0.18
  context.filter = 'brightness(3.8)'
  context.fillStyle = fineGrain
  context.fillRect(0, 0, width / scale, height / scale)
  context.restore()
  const gradient = context.createLinearGradient(0, 0, width / scale, height / scale)
  gradient.addColorStop(0, 'rgb(255 255 255 / 1%)')
  gradient.addColorStop(1, 'rgb(0 0 0 / 16%)')
  context.fillStyle = gradient
  context.fillRect(0, 0, width / scale, height / scale)
  const lightX = (width / scale) * 0.2
  const diffuse = context.createRadialGradient(
    lightX,
    0,
    0,
    lightX,
    0,
    (Math.hypot(width, height) / scale) * 0.78,
  )
  diffuse.addColorStop(0, 'rgb(255 255 255 / 4%)')
  diffuse.addColorStop(0.7, 'rgb(255 255 255 / 0%)')
  context.fillStyle = diffuse
  context.fillRect(0, 0, width / scale, height / scale)
  context.resetTransform()
  const shapes: PreparedShape[] = []
  const configuration: PressureConfiguration = {
    width,
    height,
    scale,
    base: context.getImageData(0, 0, width, height).data,
    fields: layout.fields.map((field) => {
      const g = field.geometry
      let shape = field.shape
      if (!shape) {
        const paint = contextFor(makeCanvas(g.width, g.height))
        paint.translate(g.imageX, g.imageY)
        paint.scale(g.imageScale, g.imageScale)
        paint.fill(new Path2D(g.contour))
        const pixels = paint.getImageData(0, 0, g.width, g.height).data
        const alpha = new Uint8Array(g.width * g.height)
        for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3]
        const distance = signedDistance(alpha, g.width, g.height, scale)
        const envelope = new Float32Array(distance.length)
        // Let the compressed wall extend just beyond the badge footprint so
        // its weight remains visible while displayed. The shallow shoulder
        // then relaxes into the sheet without a wide dark halo.
        for (let i = 0; i < distance.length; i++) {
          const wall = 1 - smooth((distance[i] + 5) / 19)
          const shoulder = 1 - smooth((distance[i] - 1) / 18)
          envelope[i] = wall * 0.86 + shoulder * 0.14
        }
        const gx = new Float32Array(envelope.length),
          gy = new Float32Array(envelope.length)
        for (let y = 1; y < g.height - 1; y++)
          for (let x = 1; x < g.width - 1; x++) {
            const i = y * g.width + x
            gx[i] = (-8 * (envelope[i + 1] - envelope[i - 1]) * scale) / 2
            gy[i] = (-8 * (envelope[i + g.width] - envelope[i - g.width]) * scale) / 2
          }
        shape = { envelope, gx, gy }
        shapes.push({ key: field.key, shape })
      }
      return {
        x: field.x,
        y: field.y,
        width: g.width,
        height: g.height,
        pressure: field.pressure,
        ...shape,
      }
    }),
  }
  return { configuration, shapes }
}
