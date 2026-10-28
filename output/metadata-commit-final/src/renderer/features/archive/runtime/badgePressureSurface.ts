import foamTexture from '../assets/milestones/case/foam.png?url'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import type {
  PressureConfiguration,
  PressureField,
  PressurePatch,
  PressureResponse,
} from './badgePressurePainter'

export interface PressureBadge {
  id: string
  contour: string
}
interface SurfaceField extends PressureField {
  id: string
  velocity: number
  target: number
}

import { signedDistance } from './badgeDistanceField'
import { createPressurePainter } from './badgePressurePainter'

const PADDING = 38
// Long-held badges leave a compression set. Removing one only releases a small
// part of the depression; the retained shape stays visible without a timer.
const RESIDUAL_COMPRESSION = 0.82
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
const smooth = (value: number) => {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

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
  const canvas = document.createElement('canvas')
  canvas.className = 'foam-surface'
  canvas.dataset.renderer = 'canvas2d'
  canvas.setAttribute('aria-hidden', 'true')
  sheet.prepend(canvas)
  const availableContext = canvas.getContext('2d', { willReadFrequently: true })
  if (!availableContext) throw new Error('海绵材质无法绘制')
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
  try {
    worker = new Worker(new URL('./badgePressure.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<PressureResponse>) => {
      if (disposed || data.generation !== generation) return
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
      inFlight = pendingPaint = false
      if (!disposed) rebuild()
    }
  } catch {
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
    const mask = document.createElement('canvas')
    mask.width = sizeX
    mask.height = sizeY
    const paint = mask.getContext('2d', { willReadFrequently: true })!
    const image = button.querySelector('img')!
    paint.translate((PADDING + image.offsetLeft) * scale, (PADDING + image.offsetTop + 2) * scale)
    paint.scale((image.offsetWidth / 330) * scale, (image.offsetWidth / 330) * scale)
    paint.fill(new Path2D(entry.contour))
    const pixels = paint.getImageData(0, 0, sizeX, sizeY).data
    const alpha = Uint8Array.from({ length: sizeX * sizeY }, (_, i) => pixels[i * 4 + 3])
    const distance = signedDistance(alpha, sizeX, sizeY, scale)
    const envelope = Float32Array.from(distance, (value) => 1 - smooth((value + 7) / 37))
    const gx = new Float32Array(envelope.length),
      gy = new Float32Array(envelope.length)
    for (let y = 1; y < sizeY - 1; y++)
      for (let x = 1; x < sizeX - 1; x++) {
        const i = y * sizeX + x
        gx[i] = (-8 * (envelope[i + 1] - envelope[i - 1]) * scale) / 2
        gy[i] = (-8 * (envelope[i + sizeX] - envelope[i - sizeX]) * scale) / 2
      }
    const target = button.getAttribute('aria-pressed') === 'true' ? RESIDUAL_COMPRESSION : 1
    return {
      id: entry.id,
      x: Math.round(left * scale),
      y: Math.round(top * scale),
      width: sizeX,
      height: sizeY,
      envelope,
      gx,
      gy,
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
    canvas.width = width
    canvas.height = height
    context.setTransform(scale, 0, 0, scale, 0, 0)
    const pattern = context.createPattern(texture, 'repeat')!
    pattern.setTransform(new DOMMatrix().scale(0.5))
    context.fillStyle = pattern
    context.fillRect(0, 0, width / scale, height / scale)
    const gradient = context.createLinearGradient(0, 0, width / scale, height / scale)
    gradient.addColorStop(0, 'rgb(255 255 255 / 2%)')
    gradient.addColorStop(1, 'rgb(0 0 0 / 20%)')
    context.fillStyle = gradient
    context.fillRect(0, 0, width / scale, height / scale)
    context.resetTransform()
    fields = entries.map((entry) => makeField(entry, old.get(entry.id)))
    const configuration: PressureConfiguration = {
      width,
      height,
      scale,
      base: context.getImageData(0, 0, width, height).data,
      fields: fields.map(({ x, y, width, height, envelope, gx, gy, pressure }) => ({
        x,
        y,
        width,
        height,
        envelope,
        gx,
        gy,
        pressure,
      })),
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
          pressures: fields.map((field) => field.pressure),
        },
        [
          configuration.base.buffer,
          ...configuration.fields.flatMap((field) => [
            field.envelope.buffer,
            field.gx.buffer,
            field.gy.buffer,
          ]),
        ],
      )
    } else {
      painter = createPressurePainter(configuration)
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
      stop()
      entries = next
      fields = []
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
