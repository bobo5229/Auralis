import { animate, type AnimationOptions, type ElementOrSelector } from '@motionone/dom'

export function fadeIn(target: ElementOrSelector, options: AnimationOptions = {}) {
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
