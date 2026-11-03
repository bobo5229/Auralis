export const DEFAULT_EFFECTIVE_PLAY_THRESHOLD_PERCENT = 55
export const MIN_EFFECTIVE_PLAY_THRESHOLD_PERCENT = 1
export const MAX_EFFECTIVE_PLAY_THRESHOLD_PERCENT = 100

export function isEffectivePlayThresholdPercent(percent: number): boolean {
  return (
    Number.isInteger(percent) &&
    percent >= MIN_EFFECTIVE_PLAY_THRESHOLD_PERCENT &&
    percent <= MAX_EFFECTIVE_PLAY_THRESHOLD_PERCENT
  )
}
