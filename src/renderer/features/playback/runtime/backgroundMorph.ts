export type BackgroundMorphEndpoint = 0 | 1

export const BACKGROUND_MORPH_MS = 950
export const FLUID_BACKGROUND_FEATHER_PX = 12
export const FLUID_BACKGROUND_SCALE = 1.08

/** The material clock is independent of the music and the background's flow clock. */
export function createBackgroundMorphClock(initial: BackgroundMorphEndpoint = 1) {
  let phase: number = initial
  let target: BackgroundMorphEndpoint = initial
  let transition: { from: number; started: number; duration: number } | null = null

  function sample(now: number): number {
    if (!transition) return phase
    const ratio = Math.min(1, Math.max(0, (now - transition.started) / transition.duration))
    const eased = ratio * ratio * ratio * (ratio * (ratio * 6 - 15) + 10)
    phase = transition.from + (target - transition.from) * eased
    if (ratio === 1) {
      phase = target
      transition = null
    }
    return phase
  }

  return {
    get phase() {
      return phase
    },
    get target() {
      return target
    },
    get transitioning() {
      return transition !== null
    },
    sample,
    to(next: BackgroundMorphEndpoint, now: number, animated: boolean): void {
      sample(now)
      if (transition && target === next && animated) return
      target = next
      const distance = Math.abs(target - phase)
      if (!animated || distance < 0.00001) {
        phase = target
        transition = null
      } else transition = { from: phase, started: now, duration: BACKGROUND_MORPH_MS * distance }
    },
    finish(): void {
      phase = target
      transition = null
    },
  }
}

function smoothstep(start: number, end: number, phase: number): number {
  const value = Math.min(1, Math.max(0, (phase - start) / (end - start)))
  return value * value * (3 - 2 * value)
}

export function backgroundMorphPresentation(phase: number) {
  const softness = 1 - smoothstep(0.04, 0.85, phase)
  return {
    feather: FLUID_BACKGROUND_FEATHER_PX * softness,
    scale: 1 + (FLUID_BACKGROUND_SCALE - 1) * softness,
    effects: 1 - smoothstep(0.18, 0.96, phase),
  }
}
