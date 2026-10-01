export interface NightSkyController {
  pause(paused: boolean): void
  resize(): void
  dispose(): void
}

export function mountNightSky(
  canvas: HTMLCanvasElement,
  options: { prefersReducedMotion?: boolean } = {},
): NightSkyController {
  const TAU = Math.PI * 2
  const VOID = '#030305'
  const HEAT = ['#9f40d0', '#f72585', '#f8961e', '#f9c74f']
  const COOL = ['#f8fafc', '#e2e8f0', '#94a3b8', '#cbd5e1']

  function mulberry32(seed: number) {
    let a = seed >>> 0
    return function rng() {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function hexRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }

  function rgba(hex: string, a: number): string {
    const [r, g, b] = hexRgb(hex)
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }

  function alongBand(rng: () => number, spread: number) {
    const t = rng()
    return {
      x: 0.03 + t * 0.94,
      y: 0.16 + t * 0.24 + (rng() - 0.5) * spread,
    }
  }

  interface StarSpec {
    band: number
    spread: number
    r0: number
    r1: number
    a0: number
    a1: number
    heat: number
    glow: number
    coolGlow: number
  }

  interface Star {
    x: number
    y: number
    r: number
    color: string
    a: number
    glow: number
    period: number
    phase: number
  }

  function makeStars(rng: () => number, count: number, spec: StarSpec): Star[] {
    const stars: Star[] = []
    for (let i = 0; i < count; i++) {
      const onBand = rng() < spec.band
      const pos = onBand ? alongBand(rng, spec.spread) : { x: rng(), y: rng() }
      const heat = rng() < spec.heat
      stars.push({
        x: pos.x,
        y: Math.min(0.98, Math.max(0.02, pos.y)),
        r: spec.r0 + rng() * spec.r1,
        color: heat ? HEAT[(rng() * HEAT.length) | 0] : COOL[(rng() * COOL.length) | 0],
        a: spec.a0 + rng() * spec.a1,
        glow: heat ? spec.glow : spec.coolGlow,
        period: 3.6 + rng() * 6.4,
        phase: rng() * TAU,
      })
    }
    return stars
  }

  const rng = mulberry32(20260918)
  const far = makeStars(rng, 620, {
    band: 0.34,
    spread: 0.22,
    r0: 0.35,
    r1: 0.65,
    a0: 0.14,
    a1: 0.36,
    heat: 0.015,
    glow: 0,
    coolGlow: 0,
  })
  const mid = makeStars(rng, 54, {
    band: 0.5,
    spread: 0.15,
    r0: 0.7,
    r1: 0.7,
    a0: 0.42,
    a1: 0.38,
    heat: 0.1,
    glow: 2.1,
    coolGlow: 0,
  })
  const near = makeStars(rng, 11, {
    band: 0.84,
    spread: 0.09,
    r0: 1.05,
    r1: 0.7,
    a0: 0.7,
    a1: 0.25,
    heat: 0.62,
    glow: 2.8,
    coolGlow: 1.6,
  })

  const ctx = canvas.getContext('2d', { alpha: false })
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  let width = 0
  let height = 0
  let dpr = 1
  let px = 0
  let py = 0
  let tx = 0
  let ty = 0
  let raf = 0
  let transitionPaused = false
  let disposed = false
  let dust: HTMLCanvasElement | null = null
  const PAD = 28

  function paintDust(target: CanvasRenderingContext2D, w: number, h: number) {
    const blob = (x: number, y: number, rx: number, ry: number, color: string, alpha: number) => {
      target.save()
      target.translate(x, y)
      target.scale(rx, ry)
      const g = target.createRadialGradient(0, 0, 0, 0, 0, 1)
      g.addColorStop(0, rgba(color, alpha))
      g.addColorStop(1, rgba(color, 0))
      target.fillStyle = g
      target.beginPath()
      target.arc(0, 0, 1, 0, TAU)
      target.fill()
      target.restore()
    }
    target.fillStyle = VOID
    target.fillRect(-PAD, -PAD, w + PAD * 2, h + PAD * 2)
    blob(w * 0.38, h * 0.2, w * 0.42, h * 0.18, '#9f40d0', 0.07)
    blob(w * 0.62, h * 0.3, w * 0.36, h * 0.14, '#f72585', 0.055)
    blob(w * 0.78, h * 0.72, w * 0.22, h * 0.12, '#f9c74f', 0.03)
    target.save()
    target.translate(w * 0.5, h * 0.28)
    target.rotate(-0.36)
    target.scale(w * 0.62, h * 0.1)
    const band = target.createRadialGradient(0, 0, 0, 0, 0, 1)
    band.addColorStop(0, 'rgba(159, 64, 208, 0.08)')
    band.addColorStop(0.38, 'rgba(247, 37, 133, 0.045)')
    band.addColorStop(0.72, 'rgba(248, 150, 30, 0.02)')
    band.addColorStop(1, rgba('#030305', 0))
    target.fillStyle = band
    target.beginPath()
    target.arc(0, 0, 1, 0, TAU)
    target.fill()
    target.restore()
    blob(w * 0.5, h * 0.42, w * 0.28, h * 0.22, '#07080e', 0.35)
  }

  function plot(
    target: CanvasRenderingContext2D,
    star: Star,
    ox: number,
    oy: number,
    twinkleVal: number,
  ) {
    const x = star.x * width + ox
    const y = star.y * height + oy
    const a = star.a * twinkleVal
    if (star.glow > 0) {
      target.beginPath()
      target.fillStyle = rgba(star.color, a * 0.09)
      target.arc(x, y, star.r * star.glow, 0, TAU)
      target.fill()
    }
    target.beginPath()
    target.fillStyle = rgba(star.color, a)
    target.arc(x, y, star.r, 0, TAU)
    target.fill()
    if (star.glow > 1.8) {
      target.beginPath()
      target.fillStyle = rgba('#f8fafc', a * 0.85)
      target.arc(x, y, Math.max(0.45, star.r * 0.35), 0, TAU)
      target.fill()
    }
  }

  function resize() {
    if (disposed || !ctx) return
    width = Math.max(1, canvas.clientWidth || window.innerWidth)
    height = Math.max(1, canvas.clientHeight || window.innerHeight)
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    dust = document.createElement('canvas')
    dust.width = Math.round((width + PAD * 2) * dpr)
    dust.height = Math.round((height + PAD * 2) * dpr)
    const dctx = dust.getContext('2d', { alpha: false })
    if (dctx) {
      dctx.setTransform(dpr, 0, 0, dpr, PAD, PAD)
      paintDust(dctx, width, height)
      for (const star of far) plot(dctx, star, 0, 0, 1)
    }
    draw(0)
  }

  function twinkle(star: Star, now: number) {
    if (motion.matches || options.prefersReducedMotion) return 1
    return 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(now / 1000 / star.period + star.phase))
  }

  function draw(now: number) {
    if (!ctx || !dust) return
    const farX = px * 2.2
    const farY = py * 1.6
    const midX = px * 4.2
    const midY = py * 3
    const nearX = px * 6.5
    const nearY = py * 4.6
    ctx.drawImage(dust, farX - PAD, farY - PAD, width + PAD * 2, height + PAD * 2)
    for (const star of mid) plot(ctx, star, midX, midY, twinkle(star, now))
    for (const star of near) plot(ctx, star, nearX, nearY, twinkle(star, now))
  }

  function frame(now: number) {
    raf = 0
    if (disposed) return
    if (!motion.matches && !options.prefersReducedMotion) {
      px += (tx - px) * 0.045
      py += (ty - py) * 0.045
    }
    draw(now)
    if (!motion.matches && !options.prefersReducedMotion && !document.hidden && !transitionPaused) {
      raf = requestAnimationFrame(frame)
    }
  }

  function wake() {
    if (
      disposed ||
      document.hidden ||
      motion.matches ||
      options.prefersReducedMotion ||
      transitionPaused ||
      raf
    )
      return
    raf = requestAnimationFrame(frame)
  }

  const handlePointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const w = rect.width || window.innerWidth
    const h = rect.height || window.innerHeight
    tx = ((event.clientX - rect.left) / w) * 2 - 1
    ty = ((event.clientY - rect.top) / h) * 2 - 1
  }

  const handlePointerLeave = () => {
    tx = 0
    ty = 0
  }

  const handleVisibilityChange = () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    } else {
      wake()
    }
  }

  const handleMotionChange = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    resize()
    wake()
  }

  window.addEventListener('pointermove', handlePointerMove, { passive: true })
  window.addEventListener('pointerleave', handlePointerLeave)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  motion.addEventListener('change', handleMotionChange)
  window.addEventListener('resize', resize)

  resize()
  wake()

  return {
    pause(paused: boolean) {
      transitionPaused = paused
      if (transitionPaused) {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
      } else {
        wake()
      }
    },
    resize,
    dispose() {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerleave', handlePointerLeave)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      motion.removeEventListener('change', handleMotionChange)
      window.removeEventListener('resize', resize)
      dust = null
    },
  }
}
