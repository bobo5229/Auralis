export function cdPose(t: number) {
  return {
    x: 0.52 + 0.2825 * t + (t < 0 ? 0.0275 : 0.1325) * t * t,
    y: 0.55 - 0.22 * t - 0.065 * t * t,
    size: 0.41 * Math.pow(1.24, t),
    tilt: -42 + 3 * t,
    turn: 24 - 2 * t,
  }
}

export function cdSlots(position: number, count: number): number[] {
  const base = Math.floor(position + 0.5)
  return [base - 2, base - 1, base, base + 1].filter(
    (index) => count >= 4 || (index >= 0 && index < count),
  )
}

export function cdAlbumIndex(index: number, count: number): number {
  return ((index % count) + count) % count
}
