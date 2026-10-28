export function getCountdownFractureProgress(elapsed: number, index: number): number {
  if (!Number.isFinite(elapsed)) return 0
  if (elapsed >= index + 1) return 1
  return Math.min(1, Math.max(0, (elapsed - index - 0.55) / 0.45))
}

export function createCountdownParticles(seed: number) {
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const grains: Array<{ x: number; y: number; radius: number; dx: number; dy: number }> = []
  for (let y = 0.5; y < 12; y += 1) {
    for (let x = 0.5; x < 12; x += 1) {
      if (Math.hypot(x - 6, y - 6) > 5.6) continue
      const angle = Math.atan2(y - 6, x - 6) + (random() - 0.5) * 1.6
      const distance = 5 + random() * 15
      grains.push({
        x,
        y,
        radius: (0.45 + random() * 0.5) / 2,
        dx: Math.cos(angle) * distance + 4,
        dy: Math.sin(angle) * distance + 5,
      })
    }
  }
  return grains
}
