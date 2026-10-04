interface Star {
  x: number
  y: number
  z: number
  worldX: number
  worldY: number
  depth: number
  alpha: number
  color: number
  phase: number
  appearance: number
  sinceSpawn: number
}

export interface StarfieldFrame {
  dt: number
  distance: number
  speed: number
  blend: number
  pointerX: number
  pointerY: number
  pointerStrength: number
  reduced: boolean
}

const homeColors = [
  [239, 230, 211],
  [255, 194, 109],
  [115, 175, 255],
  [95, 220, 185],
  [190, 150, 250],
  [247, 139, 172],
]
const awayColors = [
  [215, 235, 255],
  [255, 203, 127],
  [100, 170, 255],
  [90, 230, 203],
  [172, 133, 255],
  [248, 130, 187],
]

function randomSource(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

/** The demo's continuous depth field, driven by the scene's single animation clock. */
export function createArchiveStarfield(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  let width = 1
  let height = 1
  let elapsed = 0
  let stars: Star[] = []
  let random = randomSource(1281984)
  const pulses: { x: number; y: number; age: number }[] = []
  const sprites = [...homeColors, ...awayColors].map((rgb) => {
    const glow = document.createElement('canvas')
    glow.width = glow.height = 48
    const c = glow.getContext('2d')!
    const gradient = c.createRadialGradient(24, 24, 0, 24, 24, 24)
    gradient.addColorStop(0, `rgba(${rgb},.65)`)
    gradient.addColorStop(0.15, `rgba(${rgb},.2)`)
    gradient.addColorStop(1, `rgba(${rgb},0)`)
    c.fillStyle = gradient
    c.fillRect(0, 0, 48, 48)
    const tail = document.createElement('canvas')
    tail.width = 128
    tail.height = 8
    const t = tail.getContext('2d')!
    const fade = t.createLinearGradient(0, 0, 128, 0)
    fade.addColorStop(0, `rgba(${rgb},0)`)
    fade.addColorStop(0.3, `rgba(${rgb},.22)`)
    fade.addColorStop(1, `rgba(${rgb},1)`)
    t.strokeStyle = fade
    t.lineWidth = 3
    t.beginPath()
    t.moveTo(0, 4)
    t.lineTo(128, 4)
    t.stroke()
    return { glow, tail }
  })

  function reset() {
    elapsed = 0
    random = randomSource(1281984)
    pulses.length = 0
    const count = Math.min(1300, Math.max(300, Math.round((width * height) / 1450)))
    stars = Array.from({ length: count }, () => {
      const x = random() * 1.1 - 0.05
      const y = random() * 1.1 - 0.05
      const z = 0.8 + random() * 10
      const sample = random()
      return {
        x,
        y,
        z,
        worldX: (x - 0.5) * z,
        worldY: (y - 0.5) * z,
        depth: random() ** 2,
        alpha: 0.18 + random() * 0.35,
        color: [0.44, 0.64, 0.77, 0.86, 0.94, 1].findIndex((limit) => sample < limit),
        phase: random() * Math.PI * 2,
        appearance: 1,
        sinceSpawn: Infinity,
      }
    })
  }

  function resize(w: number, h: number) {
    width = Math.max(1, w)
    height = Math.max(1, h)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pixelWidth = Math.round(width * dpr)
    const pixelHeight = Math.round(height * dpr)
    // Assigning even an unchanged size clears the canvas and recreates its backing store.
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    // Keep normalized positions when resizing an already settled galaxy.
    if (!stars.length) reset()
  }

  function draw(frame: StarfieldFrame) {
    if (!ctx) return
    const { dt, distance, speed, blend, pointerX, pointerY, pointerStrength } = frame
    elapsed += dt
    const energy = Math.min(1, speed / 8)
    const colors = homeColors.map((rgb, i) =>
      rgb.map((v, j) => Math.round(v + (awayColors[i][j] - v) * blend)).join(', '),
    )
    ctx.clearRect(0, 0, width, height)
    for (const star of stars) {
      star.appearance = Math.min(1, star.appearance + dt / 0.25)
      if (distance > 0) {
        star.z -= distance
        const x = 0.5 + star.worldX / star.z
        const y = 0.5 + star.worldY / star.z
        if (
          star.z < 0.2 ||
          x < -100 / width ||
          x > 1 + 100 / width ||
          y < -100 / height ||
          y > 1 + 100 / height
        ) {
          star.z = 7 + random() * 5
          star.worldX = (random() - 0.5) * 7
          star.worldY = (random() - 0.5) * 7
          star.appearance = 0
          star.sinceSpawn = 0
        } else star.sinceSpawn += distance
        star.x = 0.5 + star.worldX / star.z
        star.y = 0.5 + star.worldY / star.z
      }
      const parallax = frame.reduced ? 0 : pointerStrength * (1 - energy)
      const x = star.x * width - (pointerX / width - 0.5) * (3 + star.depth * 12) * parallax
      const y = star.y * height - (pointerY / height - 0.5) * (3 + star.depth * 10) * parallax
      if (x < -110 || x > width + 110 || y < -110 || y > height + 110) continue
      const proximity =
        Math.max(0, 1 - Math.hypot(x - pointerX, y - pointerY) / 150) ** 2 *
        pointerStrength *
        (1 - energy)
      let wave = 0
      for (const pulse of pulses)
        wave = Math.max(
          wave,
          Math.max(0, 1 - Math.abs(Math.hypot(x - pulse.x, y - pulse.y) - pulse.age * 175) / 30) *
            (1 - pulse.age / 2) ** 2,
        )
      // Keep the reading area quiet while leaving stars visible around the projection.
      const quiet = 1 - blend * (1 - energy) * (star.x > 0.4 ? 0.58 : 0.18)
      const alpha =
        Math.min(
          1,
          star.alpha * (0.89 + Math.sin(elapsed * 0.4 + star.phase) * 0.11) +
            star.depth * 0.22 +
            energy * 0.22 +
            proximity * 0.6 +
            wave * 0.4,
        ) *
        quiet *
        star.appearance
      const radius = 0.35 + star.depth * 1.2 + proximity * 0.5
      if (speed > 0) {
        const tailZ = star.z + Math.min(speed * 0.055 * (0.45 + star.depth * 0.55), star.sinceSpawn)
        const tx = x + (star.worldX / tailZ - star.worldX / star.z) * width
        const ty = y + (star.worldY / tailZ - star.worldY / star.z) * height
        const length = Math.hypot(x - tx, y - ty)
        if (length > 0.25) {
          const thickness = (0.6 + star.depth * 0.9) * 4
          ctx.save()
          ctx.translate(tx, ty)
          ctx.rotate(Math.atan2(y - ty, x - tx))
          if (blend < 1) {
            ctx.globalAlpha = alpha * (1 - blend)
            ctx.drawImage(sprites[star.color].tail, 0, -thickness / 2, length, thickness)
          }
          if (blend > 0) {
            ctx.globalAlpha = alpha * blend
            ctx.drawImage(sprites[star.color + 6].tail, 0, -thickness / 2, length, thickness)
          }
          ctx.restore()
        }
      }
      if (star.depth > 0.65 || proximity > 0.1) {
        const size = 10 + star.depth * 9 + proximity * 12
        if (blend < 1) {
          ctx.globalAlpha = alpha * 0.5 * (1 - blend)
          ctx.drawImage(sprites[star.color].glow, x - size / 2, y - size / 2, size, size)
        }
        if (blend > 0) {
          ctx.globalAlpha = alpha * 0.5 * blend
          ctx.drawImage(sprites[star.color + 6].glow, x - size / 2, y - size / 2, size, size)
        }
      }
      ctx.globalAlpha = alpha
      ctx.fillStyle = `rgb(${colors[star.color]})`
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pulse = pulses[i]
      pulse.age += dt
      if (pulse.age > 2) {
        pulses.splice(i, 1)
        continue
      }
      ctx.globalAlpha = (1 - pulse.age / 2) ** 3 * 0.15
      ctx.strokeStyle = '#91dce5'
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.arc(pulse.x, pulse.y, pulse.age * 175, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  return {
    resize,
    draw,
    reset,
    pulse(x: number, y: number) {
      if (pulses.length < 4) pulses.push({ x, y, age: 0 })
    },
    dispose() {
      stars = []
      pulses.length = 0
      canvas.width = canvas.height = 1
    },
  }
}
