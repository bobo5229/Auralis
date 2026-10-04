import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { animate } from '@motionone/dom'
import type { AnimationControls } from '@motionone/types'

/** A quiet tooltip fade, with no movement and no animation under reduced motion. */
export function animateTooltipOpacity(target: HTMLElement, visible: boolean): () => void {
  const preference = createReducedMotionQuery()
  target.style.opacity = visible ? '1' : '0'
  if (preference.matches) return () => {}
  const animation = target.animate([{ opacity: visible ? 0 : 1 }, { opacity: visible ? 1 : 0 }], {
    duration: 100,
    easing: 'ease-out',
  })
  const stop = (): void => animation.cancel()
  preference.addEventListener('change', stop)
  return () => {
    stop()
    preference.removeEventListener('change', stop)
  }
}

/** A compositor-only playback marker; paused/reduced motion keeps a static line. */
export function animatePlaybackUnderline(target: HTMLElement, playing: boolean): () => void {
  const preference = createReducedMotionQuery()
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

/**
 * Fixed-height playback bars for the cover track indicator. Each bar keeps a 12px box and
 * animates `transform: scaleY(...)` from its bottom edge, so no frame touches layout.
 * Pausing or reduced motion cancels the loops and restores the static 5/10/7px shape.
 */
const PLAYBACK_BAR_HEIGHT = 12
const PLAYBACK_BAR_MIN_HEIGHT = 4
const PLAYBACK_BAR_SPECS = [
  { staticHeight: 5, duration: 800, peakOffset: 0.5 },
  { staticHeight: 10, duration: 1050, peakOffset: 0.3 },
  { staticHeight: 7, duration: 900, peakOffset: 0.7 },
] as const

export function animatePlaybackBars(bars: readonly HTMLElement[], playing: boolean): () => void {
  if (bars.length === 0) return () => {}
  const preference = createReducedMotionQuery()
  const animations: Animation[] = []
  const toScale = (height: number): string => `scaleY(${(height / PLAYBACK_BAR_HEIGHT).toFixed(3)})`
  const specFor = (index: number): (typeof PLAYBACK_BAR_SPECS)[number] =>
    PLAYBACK_BAR_SPECS[index % PLAYBACK_BAR_SPECS.length]!
  const paintStaticShape = (): void => {
    bars.forEach((bar, index) => {
      bar.style.transform = toScale(specFor(index).staticHeight)
    })
  }
  const stopLoops = (): void => {
    animations.forEach((animation) => animation.cancel())
    animations.length = 0
  }
  const startLoops = (): void => {
    bars.forEach((bar, index) => {
      const spec = specFor(index)
      animations.push(
        bar.animate(
          [
            { transform: toScale(PLAYBACK_BAR_MIN_HEIGHT), offset: 0 },
            { transform: toScale(PLAYBACK_BAR_HEIGHT), offset: spec.peakOffset },
            { transform: toScale(PLAYBACK_BAR_MIN_HEIGHT), offset: 1 },
          ],
          { duration: spec.duration, easing: 'ease-in-out', iterations: Infinity },
        ),
      )
    })
  }
  const update = (): void => {
    stopLoops()
    paintStaticShape()
    if (playing && !preference.matches) startLoops()
  }
  preference.addEventListener('change', update)
  update()
  return () => {
    stopLoops()
    preference.removeEventListener('change', update)
  }
}

/** Sweep a graphite text fill while playback is active, respecting reduced motion. */
export function animatePlaybackTextShimmer(target: HTMLElement): () => void {
  const preference = createReducedMotionQuery()
  let animation: Animation | undefined
  const update = (): void => {
    const elapsed = animation?.currentTime
    animation?.cancel()
    animation = undefined
    if (preference.matches) return
    animation = target.animate([{ backgroundPosition: '100% 0' }, { backgroundPosition: '0% 0' }], {
      duration: 2200,
      iterations: Infinity,
      easing: 'linear',
    })
    if (typeof elapsed === 'number') animation.currentTime = elapsed
  }
  preference.addEventListener('change', update)
  update()
  return () => {
    animation?.cancel()
    preference.removeEventListener('change', update)
  }
}

/** Carry a gallery cover into its destination without retaining route DOM. */
export function createAlbumArtworkTransition(source: HTMLElement, content: HTMLElement) {
  const motionPreference = createReducedMotionQuery()
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

export interface FullscreenPlayerTransitionSnapshot {
  opacity: string
  artwork?: { left: number; top: number; width: number; height: number; radius: number }
}

/** Carry the playbar artwork into the fullscreen player, with reversible visual continuity. */
export function animateFullscreenPlayerTransition(options: {
  overlay: HTMLElement
  artwork: HTMLElement | null
  source: HTMLElement | null
  entering: boolean
  reducedMotion: boolean
  interrupted?: FullscreenPlayerTransitionSnapshot
  onComplete: () => void
}): {
  cancel: () => FullscreenPlayerTransitionSnapshot | undefined
  finish: () => void
} {
  const { overlay, artwork, source, entering, reducedMotion, interrupted, onComplete } = options
  const animations: Animation[] = []
  const restorers: (() => void)[] = []
  let cover: HTMLElement | undefined
  let stopped = false
  let coverWidth = 0
  let coverRadius = 0
  const cleanup = (): void => {
    animations.forEach((animation) => animation.cancel())
    cover?.remove()
    restorers.forEach((restore) => restore())
    window.removeEventListener('resize', finish)
  }
  const finish = (): void => {
    if (stopped) return
    stopped = true
    cleanup()
    onComplete()
  }
  const cancel = (): FullscreenPlayerTransitionSnapshot | undefined => {
    if (stopped) return undefined
    const snapshot: FullscreenPlayerTransitionSnapshot = {
      opacity: getComputedStyle(overlay).opacity,
    }
    if (cover) {
      const rect = cover.getBoundingClientRect()
      snapshot.artwork = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        radius: Number.parseFloat(getComputedStyle(cover).borderRadius) * (rect.width / coverWidth),
      }
    }
    stopped = true
    cleanup()
    return snapshot
  }
  const run = (target: HTMLElement, frames: Keyframe[], timing: KeyframeAnimationOptions): void => {
    animations.push(target.animate(frames, { fill: 'both', ...timing }))
  }
  const hide = (target: HTMLElement): void => {
    const opacity = target.style.opacity
    target.style.opacity = '0'
    restorers.push(() => {
      target.style.opacity = opacity
    })
  }
  const validRect = (rect: DOMRect): boolean =>
    [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 &&
    rect.height > 0
  const sourceRect = source?.getBoundingClientRect()
  const targetRect = artwork?.getBoundingClientRect()
  const carryArtwork =
    !reducedMotion &&
    source &&
    artwork &&
    source.isConnected &&
    sourceRect &&
    targetRect &&
    validRect(sourceRect) &&
    validRect(targetRect)
  const duration = carryArtwork ? (entering ? 400 : 320) : 180
  const easing = 'cubic-bezier(0.16, 1, 0.3, 1)'

  if (carryArtwork) {
    // Clone the noninteractive destination so the high-resolution cover stays sharp while scaling.
    cover = artwork.cloneNode(true) as HTMLElement
    cover.setAttribute('aria-hidden', 'true')
    cover.setAttribute('data-fullscreen-artwork-transition', '')
    const artworkStyle = getComputedStyle(artwork)
    coverRadius = Number.parseFloat(artworkStyle.borderRadius) || 0
    coverWidth = targetRect.width
    Object.assign(cover.style, {
      position: 'fixed',
      left: `${targetRect.left}px`,
      top: `${targetRect.top}px`,
      width: `${targetRect.width}px`,
      height: `${targetRect.height}px`,
      maxWidth: 'none',
      margin: '0',
      transformOrigin: '0 0',
      background: artworkStyle.backgroundColor,
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: '1001',
      boxShadow: 'none',
    })
    const sourceRadius = Number.parseFloat(getComputedStyle(source).borderRadius) || 0
    const small = {
      left: sourceRect.left,
      top: sourceRect.top,
      width: sourceRect.width,
      height: sourceRect.height,
      radius: sourceRadius * (sourceRect.width / source.offsetWidth),
    }
    const large = {
      left: targetRect.left,
      top: targetRect.top,
      width: targetRect.width,
      height: targetRect.height,
      radius: coverRadius,
    }
    const frame = (rect: typeof large): Keyframe => ({
      transform: `translate(${rect.left - targetRect.left}px, ${rect.top - targetRect.top}px) scale(${rect.width / targetRect.width}, ${rect.height / targetRect.height})`,
      borderRadius: `${rect.radius / (rect.width / targetRect.width)}px`,
    })
    document.body.append(cover)
    hide(source)
    hide(artwork)
    run(
      cover,
      [frame(interrupted?.artwork ?? (entering ? small : large)), frame(entering ? large : small)],
      { duration, easing },
    )
  }

  run(
    overlay,
    [
      { opacity: interrupted?.opacity ?? (entering ? '0' : '1') },
      { opacity: entering ? '1' : '0' },
    ],
    {
      duration: carryArtwork ? (entering ? 250 : 180) : duration,
      delay: carryArtwork && !entering ? 100 : 0,
      easing: 'ease-out',
    },
  )

  if (carryArtwork) {
    const content = overlay.querySelectorAll<HTMLElement>(
      '.fullscreen-player-meta-row, .fullscreen-player-progress-group, .fullscreen-player-control-stack, .fullscreen-player-lyrics',
    )
    content.forEach((target) =>
      run(
        target,
        entering
          ? [
              { opacity: 0, transform: 'translateY(12px)' },
              { opacity: 1, transform: 'none' },
            ]
          : [
              { opacity: 1, transform: 'none' },
              { opacity: 0, transform: 'translateY(8px)' },
            ],
        { duration: entering ? 260 : 140, delay: entering ? 100 : 0, easing },
      ),
    )
  }

  window.addEventListener('resize', finish)
  void Promise.all(animations.map((animation) => animation.finished)).then(
    finish,
    (error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      finish()
      throw error
    },
  )
  return { cancel, finish }
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

/** A small tactile press that leaves the disc's tilt and artwork rotation intact. */
export function animateCdPress(target: HTMLElement, reducedMotion: boolean): () => void {
  if (reducedMotion) return () => {}
  const animation = target.animate(
    [{ scale: '1' }, { scale: '0.98', offset: 0.35 }, { scale: '1' }],
    { duration: 220, easing: 'ease-in-out' },
  )
  return () => animation.cancel()
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
