import { animate, type AnimationOptionsWithOverrides, type ElementOrSelector } from '@motionone/dom'
import type { AnimationControls } from '@motionone/types'

/** A cancellable frame clock for coordinated geometry (no Vue render per frame). */
export function animateProgress(
  duration: number,
  update: (progress: number) => void,
  complete: () => void,
): () => void {
  const start = performance.now()
  let frame = 0
  let stopped = false
  const tick = (now: number): void => {
    if (stopped) return
    const progress = Math.min(1, Math.max(0, (now - start) / duration))
    update(progress)
    if (stopped) return
    if (progress < 1) frame = requestAnimationFrame(tick)
    else complete()
  }
  frame = requestAnimationFrame(tick)
  return () => {
    stopped = true
    cancelAnimationFrame(frame)
  }
}

export function animateTilt(target: HTMLElement, transform: string): AnimationControls {
  return animate(target, { transform }, { duration: 0.22, easing: [0.2, 0.65, 0.3, 1] })
}

export function animateTrashLid(
  target: SVGGElement,
  open: boolean,
  reducedMotion: boolean,
): () => void {
  const from = Number(target.dataset.openProgress) || 0
  const to = open ? 1 : 0
  const update = (value: number): void => {
    target.dataset.openProgress = String(value)
    target.setAttribute('transform', `translate(0 ${-3 * value}) rotate(${-15 * value} 12 6)`)
  }
  if (reducedMotion || from === to) {
    update(to)
    return () => {}
  }
  return animateProgress(
    200,
    (progress) => update(from + (to - from) * (1 - Math.pow(1 - progress, 3))),
    () => update(to),
  )
}

export function animateRankingRibbon(
  target: HTMLElement,
  expanded: boolean,
  reducedMotion: boolean,
): () => void {
  const from = Number(target.style.getPropertyValue('--reveal')) || 0
  const to = expanded ? 1 : 0
  const finish = (): void => target.style.setProperty('--reveal', String(to))
  if (reducedMotion) {
    finish()
    return () => {}
  }
  return animateProgress(
    540,
    (progress) => {
      const eased = 1 - Math.pow(1 - progress, 4)
      target.style.setProperty('--reveal', String(from + (to - from) * eased))
    },
    finish,
  )
}

export function animateRankingRecord(
  target: HTMLElement,
  pulled: boolean,
  reducedMotion: boolean,
): AnimationControls {
  return animate(
    target,
    {
      transform: pulled
        ? 'translateY(-28px) translateZ(90px) rotateY(-18deg)'
        : 'translateY(0px) translateZ(0px) rotateY(-50deg)',
    },
    { duration: reducedMotion ? 0 : 0.62, easing: [0.18, 0.85, 0.2, 1] },
  )
}

/** Cancellable physics clock; return false once all motion has settled. */
export function animateFrames(update: (seconds: number) => boolean): () => void {
  let previous = performance.now()
  let frame = 0
  let stopped = false
  const tick = (now: number): void => {
    if (stopped) return
    const seconds = Math.min(Math.max((now - previous) / 1000, 0), 0.032)
    previous = now
    if (update(seconds) && !stopped) frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return () => {
    stopped = true
    cancelAnimationFrame(frame)
  }
}

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
