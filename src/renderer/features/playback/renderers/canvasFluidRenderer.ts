import type { ArtworkPalette, RgbColor } from '../types'
import { mixRgb, rgbToOklab, getOklabDistance } from '../utils/colorSpace'
import type { FluidRenderer } from './fluidRenderer'

interface RenderPalette {
  background: RgbColor
  accents: RgbColor[]
}

interface FluidBlob {
  colorIndex: number
  phaseX: number
  phaseY: number
  speed: number
  radius: number
  opacity: number
}

const TRANSITION_MS = 1200
const MAX_BLOBS = 6

function cloneColor(color: RgbColor): RgbColor {
  return { ...color }
}

function toRenderPalette(palette: ArtworkPalette): RenderPalette {
  return {
    background: cloneColor(palette.background),
    accents: palette.accents.map(({ rgb }) => cloneColor(rgb)),
  }
}

function colorDistance(a: RgbColor, b: RgbColor): number {
  return getOklabDistance(rgbToOklab(a), rgbToOklab(b))
}

function alignAccents(previous: RgbColor[], next: RgbColor[]): [RgbColor[], RgbColor[]] {
  const count = Math.max(previous.length, next.length, 1)
  const from = previous.length > 0 ? previous.map(cloneColor) : [{ r: 64, g: 92, b: 128 }]
  const available = next.length > 0 ? next.map(cloneColor) : [{ r: 64, g: 92, b: 128 }]
  const alignedFrom: RgbColor[] = []
  const alignedTo: RgbColor[] = []

  for (let i = 0; i < count; i += 1) {
    const source = from[i] ?? from[0]
    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    available.forEach((target, index) => {
      const distance = colorDistance(source, target)
      if (distance < nearestDistance) {
        nearestIndex = index
        nearestDistance = distance
      }
    })
    alignedFrom.push(source)
    alignedTo.push(available[nearestIndex])
    if (available.length > 1) available.splice(nearestIndex, 1)
  }

  while (alignedTo.length < count) alignedTo.push(alignedTo[0])
  return [alignedFrom, alignedTo]
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3)
}

function colorToCss(color: RgbColor, alpha = 1): string {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`
}

export class CanvasFluidRenderer implements FluidRenderer {
  private readonly context: CanvasRenderingContext2D
  private width = 0
  private height = 0
  private dpr = 1
  private motionTime = 0
  private lastRenderAt = 0
  private transitionStartedAt = 0
  private previous: RenderPalette
  private target: RenderPalette
  private blobs: FluidBlob[] = []

  constructor(
    private readonly canvas: HTMLCanvasElement,
    initialPalette: ArtworkPalette,
  ) {
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Unable to create fluid background canvas')
    this.context = context
    this.previous = toRenderPalette(initialPalette)
    this.target = toRenderPalette(initialPalette)
    this.syncBlobs()
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.dpr = Math.max(0.5, dpr)
    this.canvas.width = Math.round(this.width * this.dpr)
    this.canvas.height = Math.round(this.height * this.dpr)
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
  }

  setPalette(palette: ArtworkPalette, startedAt: number): void {
    const current = this.getPaletteAt(startedAt)
    const next = toRenderPalette(palette)
    const [previousAccents, nextAccents] = alignAccents(current.accents, next.accents)
    this.previous = { background: current.background, accents: previousAccents }
    this.target = { background: next.background, accents: nextAccents }
    this.transitionStartedAt = startedAt
    this.syncBlobs()
  }

  render(time: number, motionScale: number): void {
    const delta = this.lastRenderAt > 0 ? Math.min(time - this.lastRenderAt, 100) : 0
    this.lastRenderAt = time
    this.motionTime += delta * motionScale

    const palette = this.getPaletteAt(time)
    const context = this.context
    const width = this.width
    const height = this.height
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    context.globalCompositeOperation = 'source-over'
    context.fillStyle = colorToCss(palette.background)
    context.fillRect(0, 0, width, height)
    context.globalCompositeOperation = 'screen'

    const phase = this.motionTime * 0.000055
    this.blobs.forEach((blob, index) => {
      const color = palette.accents[blob.colorIndex % palette.accents.length]
      const angle = phase * blob.speed + blob.phaseX
      const x = width * (0.5 + Math.cos(angle) * (0.2 + (index % 3) * 0.04))
      const y = height * (0.47 + Math.sin(angle * 1.17 + blob.phaseY) * (0.22 + (index % 2) * 0.05))
      const radius = Math.max(width, height) * blob.radius
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
      gradient.addColorStop(0, colorToCss(color, blob.opacity))
      gradient.addColorStop(0.43, colorToCss(color, blob.opacity * 0.38))
      gradient.addColorStop(1, colorToCss(color, 0))
      context.fillStyle = gradient
      context.fillRect(0, 0, width, height)
    })

    context.globalCompositeOperation = 'source-over'
  }

  dispose(): void {
    this.canvas.width = 1
    this.canvas.height = 1
    this.blobs = []
  }

  private getPaletteAt(time: number): RenderPalette {
    const rawProgress =
      this.transitionStartedAt === 0
        ? 1
        : Math.min(1, Math.max(0, (time - this.transitionStartedAt) / TRANSITION_MS))
    const progress = easeOutCubic(rawProgress)
    const count = Math.max(this.previous.accents.length, this.target.accents.length, 1)
    const accents = Array.from({ length: count }, (_, index) =>
      mixRgb(
        this.previous.accents[index] ?? this.previous.accents[0],
        this.target.accents[index] ?? this.target.accents[0],
        progress,
      ),
    )
    return {
      background: mixRgb(this.previous.background, this.target.background, progress),
      accents,
    }
  }

  private syncBlobs(): void {
    const desiredCount = Math.min(
      MAX_BLOBS,
      Math.max(3, this.previous.accents.length, this.target.accents.length),
    )
    this.blobs = Array.from({ length: desiredCount }, (_, index) => ({
      colorIndex: index,
      phaseX: index * 2.17 + 0.4,
      phaseY: index * 1.31 + 0.7,
      speed: (index % 2 === 0 ? 1 : -1.3) * (0.86 + index * 0.05),
      radius: 0.5 + (index % 3) * 0.08,
      opacity: index === 0 ? 0.78 : 0.68,
    }))
  }
}
