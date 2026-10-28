import type { ObjectDirective } from 'vue'
import { animateProgress } from '@renderer/shared/animation/motion'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'

const controllers = new WeakMap<HTMLElement, ReturnType<typeof createBrandMotion>>()

/** One response per pointer/keyboard engagement; the A contour stays still. */
function createBrandMotion(root: HTMLElement): { stop(): void; dispose(): void } {
  const wave = root.querySelector<SVGPathElement>('.sidebar-brand-resonance')
  const letters = Array.from(root.querySelectorAll<HTMLElement>('.sidebar-brand-letter'))
  const originalPath = wave?.getAttribute('d') ?? ''
  const motion = createReducedMotionQuery()
  let cancelWave: (() => void) | undefined
  let animations: Animation[] = []
  let amplitude = 1
  let pointerInside = false
  let keyboardFocus = false
  let engaged = false

  const paintWave = (value: number): void => {
    amplitude = value
    if (!wave) return
    const y = (coordinate: number): string => (38 + (coordinate - 38) * value).toFixed(3)
    wave.setAttribute('d', `M17 38C23 ${y(29.5)} 28 ${y(45.5)} 34 ${y(37.5)}S42 ${y(32)} 47 38`)
  }
  const restoreWave = (): void => {
    amplitude = 1
    wave?.setAttribute('d', originalPath)
  }
  const stop = (settle = false): void => {
    cancelWave?.()
    cancelWave = undefined
    const colors =
      settle && !motion.matches ? letters.map((letter) => getComputedStyle(letter).color) : []
    for (const animation of animations) animation.cancel()
    animations = []
    if (settle && !motion.matches && root.isConnected) {
      const from = amplitude
      cancelWave = animateProgress(
        90,
        (progress) => paintWave(1 + (from - 1) * (1 - progress) ** 3),
        restoreWave,
      )
      animations = letters.map((letter, index) =>
        letter.animate([{ color: colors[index] }, { color: 'var(--sidebar-brand-ink)' }], {
          duration: 90,
          easing: 'ease-out',
        }),
      )
    } else {
      restoreWave()
    }
  }
  const start = (): void => {
    stop()
    if (motion.matches || document.hidden) return
    cancelWave = animateProgress(
      180,
      (progress) => paintWave(1 + Math.sin(progress * Math.PI * 2) * 0.35 * (1 - progress) ** 2),
      restoreWave,
    )
    animations = letters.map((letter, index) =>
      letter.animate(
        [
          { color: 'var(--sidebar-brand-ink)' },
          { color: 'var(--sidebar-brand-echo)', offset: 0.4 },
          { color: 'var(--sidebar-brand-ink)' },
        ],
        { duration: 210, delay: 90 + index * 9, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      ),
    )
  }
  const sync = (): void => {
    const next = pointerInside || keyboardFocus
    if (next === engaged) return
    engaged = next
    if (engaged) start()
    else stop(true)
  }
  const onEnter = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return
    pointerInside = true
    sync()
  }
  const onLeave = (): void => {
    pointerInside = false
    sync()
  }
  const onFocus = (): void => {
    keyboardFocus = root.matches(':focus-visible')
    sync()
  }
  const onBlur = (event: FocusEvent): void => {
    if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return
    keyboardFocus = false
    sync()
  }
  const onPreference = (): void => stop()
  const onVisibility = (): void => {
    if (document.hidden) stop()
  }
  root.addEventListener('pointerenter', onEnter)
  root.addEventListener('pointerleave', onLeave)
  root.addEventListener('focusin', onFocus)
  root.addEventListener('focusout', onBlur)
  motion.addEventListener('change', onPreference)
  document.addEventListener('visibilitychange', onVisibility)
  return {
    stop,
    dispose: () => {
      stop()
      root.removeEventListener('pointerenter', onEnter)
      root.removeEventListener('pointerleave', onLeave)
      root.removeEventListener('focusin', onFocus)
      root.removeEventListener('focusout', onBlur)
      motion.removeEventListener('change', onPreference)
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}

export const vBrandResonance: ObjectDirective<HTMLElement, boolean> = {
  mounted: (root) => {
    controllers.set(root, createBrandMotion(root))
  },
  updated: (root, binding) => {
    if (binding.value !== binding.oldValue) controllers.get(root)?.stop()
  },
  beforeUnmount: (root) => {
    controllers.get(root)?.dispose()
    controllers.delete(root)
  },
}
