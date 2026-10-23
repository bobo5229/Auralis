export const SOFT_TRANSITION_MIN_SECONDS = 1
export const SOFT_TRANSITION_MAX_SECONDS = 6
export const SOFT_TRANSITION_STEP_SECONDS = 0.5
export const SOFT_TRANSITION_DEFAULT_SECONDS = 2

export function isSoftTransitionDuration(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= SOFT_TRANSITION_MIN_SECONDS &&
    value <= SOFT_TRANSITION_MAX_SECONDS &&
    Number.isInteger(value / SOFT_TRANSITION_STEP_SECONDS)
  )
}
