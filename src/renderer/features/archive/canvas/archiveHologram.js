export const HOLOGRAM_DURATION = 1500
export const HOLOGRAM_PADDING = 128
const clamp = (n) => Math.max(0, Math.min(1, n))
const ease = (n) => n * n * (3 - 2 * n)

export function hologramFrame(elapsed) {
  const progress = clamp(elapsed / 1200)
  const pulse = clamp((elapsed - 1260) / 200)
  return {
    progress,
    scan: 512 * (1 - ease(clamp((progress - 0.08) / 0.76))),
    energy: progress < 0.98 ? Math.sin(Math.PI * clamp(progress / 0.98)) : 0,
    settle: ease(clamp((progress - 0.72) / 0.28)),
    distortion:
      progress > 0 && progress < 1
        ? Math.sin(Math.PI * progress) ** 2 * (0.35 + 0.65 * Math.sin(progress * 24) ** 2)
        : 0,
    flash: pulse > 0 && pulse < 1 ? Math.sin(Math.PI * pulse) ** 2 : 0,
    active: elapsed < HOLOGRAM_DURATION,
  }
}

// Reuse one padded surface per sleeve; padding keeps torn edges inside its texture.
export function paintHologram(surface, source, state, tint) {
  const c = surface.getContext('2d')
  const { progress, scan, energy, settle, distortion, flash } = state
  const pad = HOLOGRAM_PADDING
  const scale = 512 / 310
  c.clearRect(0, 0, surface.width, surface.height)
  c.save()
  c.beginPath()
  c.rect(0, scan, surface.width, 512 - scan)
  c.clip()
  for (let y = Math.floor(scan / 3) * 3; y < 512; y += 3) {
    const h = y / 512
    const band =
      h > 0.19 && h < 0.31 ? -24 : h > 0.43 && h < 0.59 ? 34 : h > 0.7 && h < 0.79 ? -18 : 0
    const pull = distortion * clamp((1 - h) / 0.12)
    const stretch = 512 * 0.18 * Math.exp(-(((h - 0.5) / 0.2) ** 2)) * pull
    const left = pad + (band + Math.sin(h * 19) * 7) * pull * scale - stretch / 2
    const width = 512 + stretch
    const resolved = clamp((y - scan) / (75 * scale))
    const flicker = progress < 0.72 && Math.sin(progress * 83) > 0.92 ? 0.82 : 1
    c.globalAlpha =
      (settle + (1 - settle) * (0.38 + 0.62 * resolved)) * flicker * (1 - 0.45 * flash)
    const bandHeight = Math.min(3, 512 - y)
    c.drawImage(source, 0, y, 512, bandHeight, left, y, width, bandHeight)
    c.globalAlpha = energy * 0.12 + flash * 0.1
    c.fillStyle = tint
    c.fillRect(left, y, width, bandHeight)
    if (y % 6 === 0) {
      c.globalAlpha = energy * 0.25 + flash * 0.18
      c.fillStyle = '#000'
      c.fillRect(left, y, width, 1)
    }
  }
  c.restore()
  if (energy > 0 && progress > 0.025) {
    c.save()
    c.fillStyle = tint
    c.globalAlpha = energy * 0.85
    c.shadowColor = tint
    c.shadowBlur = 12
    c.fillRect(pad, scan, 512, 1.6)
    c.globalAlpha = energy * 0.18
    c.fillRect(pad, scan, 512, 9)
    c.restore()
  }
}
