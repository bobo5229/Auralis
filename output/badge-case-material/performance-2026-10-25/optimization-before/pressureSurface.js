import { signedDistance } from './distanceField.js'

const PADDING = 38
// Long-held badges leave a compression set. Removing one only releases a small
// part of the depression; the retained shape stays visible without a timer.
const RESIDUAL_COMPRESSION = 0.82
const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
const smooth = (value) => {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

// Closed-form critically damped motion: fast compression, slower partial rebound.
// No oscillation, persistent simulation loop, or dependency on frame rate.
function advance(field, seconds) {
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

export async function createPressureSurface(sheet, row) {
  const texture = new Image()
  texture.src = '/assets/foam.png'
  await texture.decode()
  const canvas = document.createElement('canvas')
  canvas.className = 'foam-surface'
  canvas.dataset.renderer = 'canvas2d'
  canvas.setAttribute('aria-hidden', 'true')
  sheet.prepend(canvas)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('海绵材质无法绘制')
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  let fields = [],
    entries = [],
    base,
    width = 0,
    height = 0,
    scale = 1
  let frame = 0,
    previous = 0,
    disposed = false,
    frames = 0
  let scratch, compression, slopeX, slopeY, offsetX, offsetY
  let lastDrawMs = 0,
    maxDrawMs = 0

  function makeField(entry, old) {
    const button = row.querySelector(`[data-badge="${entry.id}"]`)
    const box = button.getBoundingClientRect(),
      origin = sheet.getBoundingClientRect()
    const left = box.left - origin.left - PADDING,
      top = box.top - origin.top - PADDING
    const sizeX = Math.ceil((button.offsetWidth + PADDING * 2) * scale)
    const sizeY = Math.ceil((button.offsetHeight + PADDING * 2) * scale)
    const mask = document.createElement('canvas')
    mask.width = sizeX
    mask.height = sizeY
    const paint = mask.getContext('2d', { willReadFrequently: true })
    paint.translate((PADDING + 5) * scale, (PADDING + 7) * scale)
    paint.scale((174 / 330) * scale, (174 / 330) * scale)
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
    const pattern = context.createPattern(texture, 'repeat')
    pattern.setTransform(new DOMMatrix().scale(0.5))
    context.fillStyle = pattern
    context.fillRect(0, 0, width / scale, height / scale)
    const gradient = context.createLinearGradient(0, 0, width / scale, height / scale)
    gradient.addColorStop(0, 'rgb(255 255 255 / 2%)')
    gradient.addColorStop(1, 'rgb(0 0 0 / 20%)')
    context.fillStyle = gradient
    context.fillRect(0, 0, width / scale, height / scale)
    context.resetTransform()
    base = context.getImageData(0, 0, width, height)
    scratch = context.createImageData(width, height)
    compression = new Float32Array(width * height)
    slopeX = new Float32Array(width * height)
    slopeY = new Float32Array(width * height)
    offsetX = new Float32Array(width * height)
    offsetY = new Float32Array(width * height)
    fields = entries.map((entry) => makeField(entry, old.get(entry.id)))
    draw()
    schedule()
  }

  function draw() {
    if (!base || disposed) return
    const started = performance.now()
    compression.fill(0)
    slopeX.fill(0)
    slopeY.fill(0)
    offsetX.fill(0)
    offsetY.fill(0)
    for (const field of fields) {
      const pressure = field.pressure
      if (pressure < 0.0001) continue
      const cx = field.x + field.width / 2,
        cy = field.y + field.height / 2
      for (let y = Math.max(0, field.y); y < Math.min(height, field.y + field.height); y++)
        for (let x = Math.max(0, field.x); x < Math.min(width, field.x + field.width); x++) {
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
    const source = base.data,
      target = scratch.data
    target.set(source)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x,
          amount = Math.min(1, compression[i])
        if (amount < 0.0001) continue
        const nx = -slopeX[i],
          ny = -slopeY[i]
        const diffuse = (-0.45 * nx - 0.55 * ny + 0.9) / Math.sqrt(nx * nx + ny * ny + 1)
        // A deeper compressed surface receives less ambient light. This depth term
        // is separate from slope lighting, so a facing slope cannot light the
        // deepest part back up to the uncompressed surface's brightness.
        const depthAttenuation = 1 - amount * 0.3
        const shade = Math.max(0.25, (0.48 + (0.52 * diffuse) / 0.9) * depthAttenuation)
        const sampleX = clamp(Math.round(x + offsetX[i] + slopeX[i] * scale * 0.5), 0, width - 1)
        const sampleY = clamp(Math.round(y + offsetY[i] + slopeY[i] * scale * 0.5), 0, height - 1)
        const sample = (sampleY * width + sampleX) * 4
        for (let channel = 0; channel < 3; channel++) {
          // Pressure packs the pores, reducing their relief as the same texture contracts.
          const packed = 33 + (source[sample + channel] - 33) * (1 - amount * 0.28)
          const pressed = packed * shade
          target[i * 4 + channel] = source[i * 4 + channel] * (1 - amount) + pressed * amount
        }
      }
    context.putImageData(scratch, 0, 0)
    frames++
    lastDrawMs = performance.now() - started
    maxDrawMs = Math.max(maxDrawMs, lastDrawMs)
  }

  const moving = () =>
    fields.some((field) => field.pressure !== field.target || field.velocity !== 0)
  function stop() {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    previous = 0
  }
  function tick(time) {
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
  window.addEventListener('resize', rebuild)
  return {
    setBadges(next) {
      stop()
      entries = next
      fields = []
      rebuild()
    },
    setRemoved(id, removed) {
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
        running: !!frame,
        frames,
        width,
        height,
        scale,
        lastDrawMs,
        maxDrawMs,
        fields: fields.map(({ id, pressure, target, velocity }) => ({
          id,
          pressure,
          target,
          velocity,
        })),
      }
    },
    dispose() {
      disposed = true
      stop()
      observer.disconnect()
      window.removeEventListener('resize', rebuild)
      document.removeEventListener('visibilitychange', visibility)
      motion.removeEventListener('change', preference)
      canvas.remove()
    },
  }
}
