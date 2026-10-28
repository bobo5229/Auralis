/** Fixed thresholds keep the same color meaningful across dates and years. */
export function playCountIntensity(playCount: number): number {
  if (playCount <= 0) return 0
  if (playCount < 5) return 1
  if (playCount < 10) return 2
  if (playCount < 20) return 3
  return 4
}
