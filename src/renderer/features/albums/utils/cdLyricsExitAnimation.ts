export type LyricsExitAnimation =
  | 'classic-fade'
  | 'orbit-drift'
  | 'stagger-dissolve'
  | 'centrifugal-drift'
  | 'spacing-expand'

export const LYRICS_EXIT_ANIMATIONS: readonly LyricsExitAnimation[] = [
  'classic-fade',
  'orbit-drift',
  'stagger-dissolve',
  'centrifugal-drift',
  'spacing-expand',
]

export const LYRICS_EXIT_DURATIONS: Record<LyricsExitAnimation, number> = {
  'classic-fade': 140,
  'orbit-drift': 180,
  'stagger-dissolve': 200,
  'centrifugal-drift': 180,
  'spacing-expand': 180,
}

export function pickLyricsExitAnimation(
  last: LyricsExitAnimation | null,
  random = Math.random,
): LyricsExitAnimation {
  const pool = LYRICS_EXIT_ANIMATIONS.filter((item) => item !== last)
  const index = Math.floor(random() * pool.length)
  return pool[index] ?? 'classic-fade'
}

export function calculateStaggerOpacities(glyphCount: number, progress: number): number[] {
  const p = Math.max(0, Math.min(1, progress))
  if (glyphCount <= 0) return []
  if (glyphCount === 1) return [1 - p]

  const staggerWindow = 0.45
  const fadeWindow = 0.55
  return Array.from({ length: glyphCount }, (_, index) => {
    const start = (index / (glyphCount - 1)) * staggerWindow
    const local = Math.max(0, Math.min(1, (p - start) / fadeWindow))
    return 1 - local
  })
}

export function calculateOrbitOffset(
  driftSign: 1 | -1,
  progress: number,
  maxDriftPercent = 4.5,
): string {
  const p = Math.max(0, Math.min(1, progress))
  const eased = 1 - (1 - p) ** 2
  const offset = 50 + driftSign * maxDriftPercent * eased
  return `${offset.toFixed(2)}%`
}

export function calculateSpacingExpand(fontSize: number, progress: number, maxSpread = 4): number {
  const p = Math.max(0, Math.min(1, progress))
  const eased = 1 - (1 - p) ** 2
  const limit = Math.min(Math.max(0, fontSize * 0.18), maxSpread)
  return limit * eased
}

export function calculateCentrifugalRadius(progress: number, maxDistance = 8): number {
  const p = Math.max(0, Math.min(1, progress))
  const eased = 1 - (1 - p) ** 2
  return maxDistance * eased
}
