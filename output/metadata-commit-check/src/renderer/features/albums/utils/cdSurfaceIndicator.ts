import { animateProgress } from '@renderer/shared/animation/motion'

export interface CdSurfaceIndicatorMotionState {
  edges: { left: number; right: number } | null
  cancelAnimation: (() => void) | null
}

interface MoveSurfaceIndicatorOptions {
  group: HTMLElement | null
  line: HTMLElement | null
  targetButton: HTMLElement | null
  startButton?: HTMLElement | null
  animate: boolean
  reducedMotion: boolean
}

export function moveSurfaceIndicator(
  state: CdSurfaceIndicatorMotionState,
  options: MoveSurfaceIndicatorOptions,
): void {
  state.cancelAnimation?.()
  state.cancelAnimation = null

  const { group, line, targetButton, startButton, animate, reducedMotion } = options
  if (!group || !line || !targetButton) return

  const groupRect = group.getBoundingClientRect()
  const getEdges = (button: HTMLElement): { left: number; right: number } => {
    const buttonRect = button.getBoundingClientRect()
    return {
      left: buttonRect.left - groupRect.left,
      right: buttonRect.right - groupRect.left,
    }
  }
  const target = getEdges(targetButton)
  const draw = (left: number, right: number): void => {
    state.edges = { left, right }
    line.style.transform = `translateX(${left}px)`
    line.style.width = `${right - left}px`
  }

  if (startButton && startButton !== targetButton) {
    const start = getEdges(startButton)
    draw(start.left, start.right)
  }

  if (!animate || reducedMotion || !state.edges) {
    draw(target.left, target.right)
    return
  }

  const from = { ...state.edges }
  const movingRight = target.left + target.right > from.left + from.right
  state.cancelAnimation = animateProgress(
    440,
    (progress) => {
      // The leading edge reaches out first; the trailing edge releases a little later.
      const lead = 1 - (1 - progress) ** 3
      const delayed = Math.max(0, (progress - 0.18) / 0.82)
      const trail = delayed * delayed * (3 - 2 * delayed)
      draw(
        from.left + (target.left - from.left) * (movingRight ? trail : lead),
        from.right + (target.right - from.right) * (movingRight ? lead : trail),
      )
    },
    () => {
      draw(target.left, target.right)
      state.cancelAnimation = null
    },
  )
}

export function resetSurfaceIndicator(state: CdSurfaceIndicatorMotionState): void {
  state.cancelAnimation?.()
  state.cancelAnimation = null
  state.edges = null
}
