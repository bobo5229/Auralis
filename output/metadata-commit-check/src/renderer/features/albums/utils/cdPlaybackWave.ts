const TAU = Math.PI * 2
const WAVE_CENTER = 200
const WAVE_RADIUS = 216
// The disc radius is 200; leave room for the 1.5px stroke as well as a visible gap.
const WAVE_MIN_RADIUS = 208
const WAVE_SAMPLES = 1440

function circularDistance(angle: number, center: number): number {
  const distance = Math.abs(angle - center) % TAU
  return Math.min(distance, TAU - distance)
}

function burst(angle: number, center: number, width: number, height: number): number {
  const distance = circularDistance(angle, center) / width
  return height * Math.exp(-distance * distance * 2.4)
}

export function cdPlaybackWaveSeed(key: string): number {
  let hash = 2166136261
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 0xffffffff
}

export function cdPlaybackWaveRadius(
  angle: number,
  seed: number,
  seconds = 0,
  active = false,
): number {
  const phase = seed * TAU
  const centers = [
    (0.42 + phase * 0.31) % TAU,
    (2.65 + phase * 0.17) % TAU,
    (4.78 + phase * 0.23) % TAU,
  ]
  const carrier = Math.sin(angle * 64 + phase) + 0.2 * Math.sin(angle * 103 + phase * 1.61)
  const normalizedCarrier = Math.max(-1, Math.min(1, carrier / 1.2))
  const sharpness = 0.68 + 0.36 * (0.5 + 0.5 * Math.sin(angle * 7 + phase))
  const quietMotion = 3.2 + 1.8 * (0.5 + 0.5 * Math.sin(angle * 9 - phase * 0.7))
  const energy =
    burst(angle, centers[0], 0.24, 13) +
    burst(angle, centers[1], 0.34, 8.5) +
    burst(angle, centers[2], 0.18, 10.5)
  const localBeat =
    0.72 +
    0.2 * Math.sin(seconds * 8.4 + angle * 3.2 + phase) +
    0.13 * Math.sin(seconds * 13.7 - angle * 4.6 + phase * 0.63)
  const accent = Math.max(0, Math.sin(seconds * 6.1 + angle * 2.1 + phase * 1.4)) ** 4
  const motion = active ? Math.max(0.48, localBeat + accent * 0.38) : 1
  const amplitude = (quietMotion + energy) * motion
  const offset = amplitude * Math.sign(normalizedCarrier) * Math.abs(normalizedCarrier) ** sharpness
  const inwardRoom = WAVE_RADIUS - WAVE_MIN_RADIUS
  // Smoothly compress inward troughs without flattening them or reducing outward peaks.
  return WAVE_RADIUS + (offset < 0 ? inwardRoom * Math.tanh(offset / inwardRoom) : offset)
}

export function cdPlaybackWavePath(seed: number, seconds = 0, active = false): string {
  const points = Array.from({ length: WAVE_SAMPLES + 1 }, (_, index) => {
    const angle = (index / WAVE_SAMPLES) * TAU
    const radius = cdPlaybackWaveRadius(angle, seed, seconds, active)
    const x = WAVE_CENTER + Math.sin(angle) * radius
    const y = WAVE_CENTER - Math.cos(angle) * radius
    return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`
  })
  return `${points.join(' ')} Z`
}
