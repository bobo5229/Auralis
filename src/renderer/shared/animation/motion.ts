import { animate, type AnimationOptionsWithOverrides, type ElementOrSelector } from '@motionone/dom'
import type { AnimationControls } from '@motionone/types'

export function fadeIn(
  target: ElementOrSelector,
  options: AnimationOptionsWithOverrides = {},
): AnimationControls {
  return animate(
    target,
    { opacity: [0, 1], transform: ['translateY(8px)', 'translateY(0)'] },
    {
      duration: 0.28,
      easing: 'ease-out',
      ...options,
    },
  )
}
