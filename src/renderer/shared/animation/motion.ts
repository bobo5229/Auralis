import { animate } from '@motionone/dom'
import type { AnimationControls } from '@motionone/types'

/** A compositor-only playback marker; paused/reduced motion keeps a static line. */
export function animatePlaybackUnderline(target: HTMLElement, playing: boolean): () => void {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  const title = target.parentElement
  let animation: Animation | undefined
  const update = (): void => {
    const elapsed = animation?.currentTime
    animation?.cancel()
    animation = undefined
    // Read geometry only when the title/marker resizes, never on animation frames.
    const distance = Math.max(0, (title?.clientWidth ?? 0) - target.getBoundingClientRect().width)
    if (playing && !preference.matches && distance > 0) {
      animation = target.animate(
        [{ transform: 'translateX(0)' }, { transform: `translateX(${distance}px)` }],
        { duration: 1400, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' },
      )
      if (typeof elapsed === 'number') animation.currentTime = elapsed
    }
  }
  const resizeObserver = new ResizeObserver(update)
  if (title) resizeObserver.observe(title)
  resizeObserver.observe(target)
  update()
  preference.addEventListener('change', update)
  return () => {
    animation?.cancel()
    resizeObserver.disconnect()
    preference.removeEventListener('change', update)
  }
}

/** Carry a gallery cover into its destination without retaining route DOM. */
export function createAlbumArtworkTransition(source: HTMLElement, content: HTMLElement) {
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  const reducedMotion = motionPreference.matches
  const animations: Animation[] = []
  let stopped = false
  let destination: HTMLElement | null = null
  let previousVisibility = ''
  const rect = source.getBoundingClientRect()
  const cover = source.cloneNode(true) as HTMLElement
  cover.setAttribute('aria-hidden', 'true')
  Object.assign(cover.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    borderRadius: getComputedStyle(source).borderRadius,
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '1001',
    transform: 'none',
  })
  if (!reducedMotion) document.body.append(cover)
  const run = (element: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = element.animate(frames, options)
    animations.push(animation)
    return animation.finished.catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error
    })
  }
  const cancel = (): void => {
    stopped = true
    animations.forEach((animation) => animation.cancel())
    cover.remove()
    if (destination) destination.style.visibility = previousVisibility
    window.removeEventListener('resize', cancel)
    motionPreference.removeEventListener('change', cancel)
  }
  window.addEventListener('resize', cancel)
  motionPreference.addEventListener('change', cancel)
  const ready = run(content, [{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'forwards' })
  return {
    ready,
    cancel,
    async finish(target: HTMLElement, nextContent: HTMLElement): Promise<void> {
      if (stopped) return
      destination = target
      previousVisibility = target.style.visibility
      if (!reducedMotion) target.style.visibility = 'hidden'
      animations.forEach((animation) => animation.cancel())
      const to = target.getBoundingClientRect()
      try {
        await Promise.all([
          reducedMotion
            ? Promise.resolve()
            : run(
                cover,
                [
                  {},
                  {
                    left: `${to.left}px`,
                    top: `${to.top}px`,
                    width: `${to.width}px`,
                    height: `${to.height}px`,
                    borderRadius: getComputedStyle(target).borderRadius,
                  },
                ],
                { duration: 420, easing: 'cubic-bezier(.22,.75,.2,1)', fill: 'forwards' },
              ),
          run(nextContent, [{ opacity: 0 }, { opacity: 1 }], {
            duration: reducedMotion ? 120 : 240,
            delay: reducedMotion ? 0 : 130,
            fill: 'both',
          }),
        ])
      } finally {
        cancel()
      }
    },
  }
}

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

/** The leading edge moves first; the trailing edge catches up like a sticky line. */
export function animateRankingUnderline(
  target: HTMLElement,
  left: number,
  width: number,
  reducedMotion: boolean,
): () => void {
  const fromLeft = Number.parseFloat(target.style.left)
  const fromRight = fromLeft + Number.parseFloat(target.style.width)
  const paint = (start: number, end: number): void => {
    target.style.left = `${start}px`
    target.style.width = `${end - start}px`
  }
  const finish = (): void => paint(left, left + width)
  if (reducedMotion || !Number.isFinite(fromRight)) {
    finish()
    return () => {}
  }
  const movingRight = left + width / 2 >= (fromLeft + fromRight) / 2
  return animateProgress(
    420,
    (progress) => {
      const leading = 1 - Math.pow(1 - progress, 4)
      const trailing = progress * progress * (3 - 2 * progress)
      paint(
        fromLeft + (left - fromLeft) * (movingRight ? trailing : leading),
        fromRight + (left + width - fromRight) * (movingRight ? leading : trailing),
      )
    },
    finish,
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
