import foamTexture from '../assets/milestones/case/foam.png?url'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import type { PressurePatch } from './badgePressurePainter'
import {
  preparePressure,
  pressureShapeKey,
  PressureShapeCache,
  type PressureGeometry,
  type PressureLayout,
  type PressureResponse,
} from './badgePressurePreparation'

export interface PressureBadge {
  id: string
  contour: string
}
interface SurfaceField {
  id: string
  key: string
  geometry: PressureGeometry
  x: number
  y: number
  pressure: number
  velocity: number
  target: number
}

import { createPressurePainter } from './badgePressurePainter'

const PADDING = 38
// Long-held badges leave a compression set. Removing one only releases a small
// part of the depression; the retained shape stays visible without a timer.
const RESIDUAL_COMPRESSION = 0.82
const shapeCache = new PressureShapeCache()

// Closed-form critically damped motion: fast compression, slower partial rebound.
// No oscillation, persistent simulation loop, or dependency on frame rate.
function advance(field: SurfaceField, seconds: number) {
  const omega = field.target === 1 ? 18 : 5.5
  const delta = field.pressure - field.target
  const velocity = field.velocity + omega * delta
  const decay = Math.exp(-omega * seconds)
  field.pressure = field.target + (delta + velocity * seconds) * decay
  field.velocity = (field.velocity - omega * velocity * seconds) * decay
  if (Math.abs(field.pressure - field.target) < 0.001 && Math.abs(field.velocity) < 0.008) {
    field.pressure = field.target
    field.velocity = 0
  }
}

export async function createPressureSurface(
  sheet: HTMLElement,
  row: HTMLElement,
  signal: AbortSignal,
) {
  const texture = new Image()
  texture.src = foamTexture
  await texture.decode()
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  let textureBitmap: ImageBitmap | undefined
  try {
    textureBitmap = await createImageBitmap(texture)
  } catch {
    // Keep the existing main-thread compatibility path when bitmap creation is unavailable.
  }
  if (signal.aborted) {
    textureBitmap?.close()
    throw new DOMException('Cancelled', 'AbortError')
  }
  const canvas = document.createElement('canvas')
  canvas.className = 'foam-surface'
  canvas.dataset.renderer = 'canvas2d'
  canvas.setAttribute('aria-hidden', 'true')
  sheet.prepend(canvas)
  const availableContext = canvas.getContext('2d', { willReadFrequently: true })
  if (!availableContext) {
    textureBitmap?.close()
    canvas.remove()
    throw new Error('海绵材质无法绘制')
  }
  const context = availableContext
  const motion = createReducedMotionQuery()
  let fields: SurfaceField[] = []
  let entries: PressureBadge[] = []
  let painter: ReturnType<typeof createPressurePainter> | undefined
  let width = 0,
    height = 0,
    scale = 1
  let frame = 0,
    previous = 0,
    disposed = false,
    frames = 0
  let resolveReady!: () => void
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  let worker: Worker | null = null
  let generation = 0,
    inFlight = false,
    pendingPaint = false
  let lastMainPaintMs = 0,
    totalMainPaintMs = 0,
    totalComputeMs = 0
  let layoutKey = '',
    rebuilds = 0,
    cacheHits = 0
  try {
    if (!textureBitmap) throw new Error('ImageBitmap unavailable')
    worker = new Worker(new URL('./badgePressure.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<PressureResponse>) => {
      if (disposed) return
      for (const { key, shape } of data.shapes ?? []) shapeCache.set(key, shape)
      if (data.generation !== generation) return
      inFlight = false
      commit(data.patch, data.computeMs)
      if (pendingPaint) {
        pendingPaint = false
        draw()
      }
    }
    worker.onerror = (event) => {
      event.preventDefault()
      worker?.terminate()
      worker = null
      textureBitmap?.close()
      textureBitmap = undefined
      inFlight = pendingPaint = false
      layoutKey = ''
      if (!disposed) rebuild()
    }
  } catch {
    textureBitmap?.close()
    textureBitmap = undefined
    worker = null
  }
  let lastDrawMs = 0,
    maxDrawMs = 0,
    lastDrawPixels = 0,
    totalDrawPixels = 0

  function makeField(entry: PressureBadge, old?: SurfaceField): SurfaceField {
    const button = row.querySelector<HTMLButtonElement>(`[data-badge="${entry.id}"]`)!
    const box = button.getBoundingClientRect(),
      origin = sheet.getBoundingClientRect()
    const left = box.left - origin.left - PADDING,
      top = box.top - origin.top - PADDING
    const sizeX = Math.ceil((button.offsetWidth + PADDING * 2) * scale)
    const sizeY = Math.ceil((button.offsetHeight + PADDING * 2) * scale)
    const image = button.querySelector('img')!
    const geometry: PressureGeometry = {
      contour: entry.contour,
      width: sizeX,
      height: sizeY,
      scale,
      imageX: (PADDING + image.offsetLeft) * scale,
      imageY: (PADDING + image.offsetTop + 2) * scale,
      imageScale: (image.offsetWidth / 330) * scale,
    }
    const target = button.getAttribute('aria-pressed') === 'true' ? RESIDUAL_COMPRESSION : 1
    return {
      id: entry.id,
      key: pressureShapeKey(geometry),
      geometry,
      x: Math.round(left * scale),
      y: Math.round(top * scale),
      pressure: old?.pressure ?? target,
      velocity: old?.velocity ?? 0,
      target,
    }
  }

  function rebuild() {
    if (disposed || !entries.length) return
    const old = new Map(fields.map((field) => [field.id, field]))
    // A shared 2D surface; material detail is capped independently of badge PNGs.
    scale = Math.min(1.5, Math.max(1, devicePixelRatio || 1))
    width = Math.ceil(sheet.clientWidth * scale)
    height = Math.ceil(sheet.clientHeight * scale)
    const next = entries.map((entry) => makeField(entry, old.get(entry.id)))
    const nextKey = JSON.stringify([
      width,
      height,
      scale,
      next.map(({ id, key, x, y }) => [id, key, x, y]),
    ])
    // ResizeObserver sends an initial notification even when the measured layout is unchanged.
    if (nextKey === layoutKey) return
    layoutKey = nextKey
    rebuilds++
    stop()
    canvas.width = width
    canvas.height = height
    fields = next
    const configuration: PressureLayout = {
      width,
      height,
      scale,
      fields: fields.map(({ key, x, y, geometry, pressure }) => {
        const shape = shapeCache.get(key)
        if (shape) cacheHits++
        return { key, x, y, geometry, pressure, shape }
      }),
    }
    generation++
    inFlight = pendingPaint = false
    if (worker) {
      inFlight = true
      worker.postMessage(
        {
          type: 'reset',
          generation,
          configuration,
          texture: textureBitmap,
          pressures: fields.map((field) => field.pressure),
        },
        textureBitmap ? [textureBitmap] : [],
      )
      textureBitmap = undefined
    } else {
      const prepared = preparePressure(configuration, texture, (width, height) => {
        const buffer = document.createElement('canvas')
        buffer.width = width
        buffer.height = height
        return buffer
      })
      for (const { key, shape } of prepared.shapes) shapeCache.set(key, shape)
      // The untouched base is needed outside the dirty pressure patch too.
      context.putImageData(new ImageData(prepared.configuration.base, width, height), 0, 0)
      painter = createPressurePainter(prepared.configuration)
      draw()
    }
    schedule()
  }

  function commit(patch: PressurePatch | null, computeMs: number) {
    totalComputeMs += computeMs
    if (!patch || disposed) return
    const started = performance.now()
    context.putImageData(
      new ImageData(patch.pixels, patch.width, patch.height),
      patch.left,
      patch.top,
    )
    lastMainPaintMs = performance.now() - started
    totalMainPaintMs += lastMainPaintMs
    frames++
    resolveReady()
    lastDrawMs = computeMs + lastMainPaintMs
    maxDrawMs = Math.max(maxDrawMs, lastDrawMs)
    lastDrawPixels = patch.width * patch.height
    totalDrawPixels += lastDrawPixels
  }

  function draw() {
    if (disposed || !fields.length) return
    if (worker) {
      if (inFlight) {
        pendingPaint = true
        return
      }
      inFlight = true
      worker.postMessage({
        type: 'paint',
        generation,
        pressures: fields.map((field) => field.pressure),
      })
    } else {
      const started = performance.now()
      const patch = painter!.paint(fields.map((field) => field.pressure))
      commit(patch, performance.now() - started)
    }
  }

  const moving = () =>
    fields.some((field) => field.pressure !== field.target || field.velocity !== 0)
  function stop() {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    previous = 0
  }
  function tick(time: number) {
    frame = 0
    if (disposed || document.hidden) {
      previous = 0
      return
    }
    // Material settles at 30Hz while the badge's CSS lift remains compositor driven.
    if (previous && time - previous < 30) {
      frame = requestAnimationFrame(tick)
      return
    }
    const elapsed = previous ? Math.min((time - previous) / 1000, 0.05) : 1 / 30
    previous = time
    for (const field of fields) {
      if (motion.matches) {
        field.pressure = field.target
        field.velocity = 0
      } else advance(field, elapsed)
    }
    draw()
    if (moving()) frame = requestAnimationFrame(tick)
    else previous = 0
  }
  function schedule() {
    if (!frame && !disposed && !document.hidden && moving()) frame = requestAnimationFrame(tick)
  }
  function visibility() {
    if (document.hidden) stop()
    else schedule()
  }
  function preference() {
    if (motion.matches) {
      for (const field of fields) {
        field.pressure = field.target
        field.velocity = 0
      }
      stop()
      draw()
    }
  }
  document.addEventListener('visibilitychange', visibility)
  motion.addEventListener('change', preference)
  const observer = new ResizeObserver(rebuild)
  observer.observe(sheet)
  let resolution: MediaQueryList | undefined
  function watchResolution() {
    resolution?.removeEventListener('change', onResolution)
    resolution = matchMedia(`(resolution: ${devicePixelRatio}dppx)`)
    resolution.addEventListener('change', onResolution)
  }
  function onResolution() {
    rebuild()
    watchResolution()
  }
  watchResolution()
  window.addEventListener('resize', rebuild)
  signal.addEventListener('abort', dispose, { once: true })
  function dispose() {
    disposed = true
    generation++
    worker?.terminate()
    textureBitmap?.close()
    textureBitmap = undefined
    inFlight = pendingPaint = false
    stop()
    observer.disconnect()
    resolution?.removeEventListener('change', onResolution)
    window.removeEventListener('resize', rebuild)
    document.removeEventListener('visibilitychange', visibility)
    motion.removeEventListener('change', preference)
    signal.removeEventListener('abort', dispose)
    canvas.remove()
    resolveReady()
  }
  return {
    ready,
    setBadges(next: PressureBadge[]) {
      entries = next
      rebuild()
    },
    setRemoved(id: string, removed: boolean) {
      const field = fields.find((item) => item.id === id)
      if (!field) return
      field.target = removed ? RESIDUAL_COMPRESSION : 1
      if (motion.matches) {
        field.pressure = field.target
        field.velocity = 0
        draw()
      } else schedule()
    },
    snapshot() {
      return {
        renderer: 'canvas2d',
        running: !!frame || inFlight || pendingPaint,
        animating: !!frame,
        pendingPaint: inFlight || pendingPaint,
        backend: worker ? 'worker' : 'main-thread',
        frames,
        width,
        height,
        scale,
        rebuilds,
        cacheHits,
        lastDrawMs,
        maxDrawMs,
        lastDrawPixels,
        lastMainPaintMs,
        totalMainPaintMs,
        totalComputeMs,
        totalDrawPixels,
        fields: fields.map(({ id, pressure, target, velocity }) => ({
          id,
          pressure,
          target,
          velocity,
        })),
      }
    },
    dispose,
  }
}
