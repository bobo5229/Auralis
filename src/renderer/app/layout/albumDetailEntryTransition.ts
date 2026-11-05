import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'

const DURATION_MS = 650
const CONTENT_DELAY_MS = 80
const EASING = 'ease-in-out'
const MAX_PREPARATION_MS = 1000
const STABLE_FRAME_INTERVAL_MS = 34
const REQUIRED_STABLE_INTERVALS = 2

type Participant = {
  element: HTMLElement
  restore: () => void
  restoreInteraction?: () => void
  done?: () => void
}

const FOREGROUND_TOKENS = [
  '--auralis-text',
  '--auralis-text-muted',
  '--auralis-text-faint',
  '--auralis-text-subtle',
  '--auralis-theme-accent',
  '--auralis-control-primary-text',
  '--auralis-focus-ring',
] as const
const DETAIL_TOKENS = [
  '--album-detail-main',
  '--album-detail-more',
  '--album-detail-more-text',
  '--album-detail-more-faint',
  '--album-detail-main-text',
  '--album-detail-main-muted',
  '--album-detail-main-faint',
  '--album-detail-accent',
  '--album-detail-accent-text',
  '--album-detail-accent-border',
  '--album-detail-divider',
] as const

function captureColors(element: HTMLElement, detail: boolean): Record<string, string> {
  const style = getComputedStyle(element)
  const colors: Record<string, string> = {}
  for (const token of [...FOREGROUND_TOKENS, ...(detail ? DETAIL_TOKENS : [])]) {
    const value = style.getPropertyValue(token).trim()
    if (value) colors[token] = value
  }
  if (detail) {
    colors['background-color'] = colors['--album-detail-main'] || style.backgroundColor
  }
  return colors
}

function detailTargetColors(
  fallback: Record<string, string>,
  target: Record<string, string>,
): Record<string, string> {
  const value = (token: string, fallbackToken: string) =>
    target[token] || fallback[fallbackToken] || 'inherit'
  return {
    ...fallback,
    ...target,
    'background-color': value('--album-detail-main', '--album-detail-main'),
    '--auralis-text': value('--album-detail-main-text', '--auralis-text'),
    '--auralis-text-muted': value('--album-detail-main-muted', '--auralis-text-muted'),
    '--auralis-text-faint': value('--album-detail-main-faint', '--auralis-text-faint'),
    '--auralis-text-subtle': value('--album-detail-main-faint', '--auralis-text-subtle'),
    '--auralis-theme-accent': value('--album-detail-accent', '--auralis-theme-accent'),
    '--auralis-control-primary-text': value(
      '--album-detail-accent-text',
      '--auralis-control-primary-text',
    ),
    '--auralis-focus-ring': value('--album-detail-main-text', '--auralis-focus-ring'),
  }
}

function applyStyles(element: HTMLElement, styles: Record<string, string>): () => void {
  const previous = Object.keys(styles).map((property) => ({
    property,
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  }))
  for (const [property, value] of Object.entries(styles)) element.style.setProperty(property, value)
  return () => {
    for (const { property, value, priority } of previous) {
      if (value) element.style.setProperty(property, value, priority)
      else element.style.removeProperty(property)
    }
  }
}

/** Dissolve the detail over the list in both directions, preparing its first cold paint. */
export function createAlbumDetailEntryTransition(
  onPrepared?: () => void,
  onStarted?: () => Record<string, string> | void,
  onFinished?: () => void,
  waitForColors?: (signal: AbortSignal) => Promise<void>,
  onTimeout?: () => void,
  onReturnInteractionReady?: () => void,
) {
  let hasPrepared = false
  let reverse = false
  let active: ReturnType<typeof createSession> | null = null

  function createSession() {
    const preference = createReducedMotionQuery()
    let incoming: Participant | null = null
    let outgoing: Participant | null = null
    let frame: number | null = null
    let deadline: ReturnType<typeof setTimeout> | null = null
    let settled = false
    const animations: Animation[] = []
    let restoreDetailColors: (() => void) | undefined
    let contentObserver: MutationObserver | undefined
    let releaseContentWait: (() => void) | undefined
    const preparation = new AbortController()

    function finish(): void {
      if (settled) return
      settled = true
      if (frame !== null) cancelAnimationFrame(frame)
      if (deadline !== null) clearTimeout(deadline)
      preference.removeEventListener('change', finish)
      window.removeEventListener('resize', finish)
      contentObserver?.disconnect()
      releaseContentWait?.()
      preparation.abort()
      for (const animation of animations) animation.cancel()
      restoreDetailColors?.()
      incoming?.restoreInteraction?.()
      incoming?.restore()
      outgoing?.restore()
      onFinished?.()
      if (active === session) active = null
      outgoing?.done?.()
      incoming?.done?.()
    }

    function animate(): void {
      if (settled || !incoming) return
      if (deadline !== null) clearTimeout(deadline)
      deadline = null
      if (!hasPrepared) {
        hasPrepared = true
        onPrepared?.()
      }
      try {
        const target = onStarted?.() ?? {}
        const detail = reverse ? outgoing?.element : incoming.element
        if (detail) {
          if (!reverse)
            restoreDetailColors = applyStyles(
              detail,
              detailTargetColors(captureColors(detail, true), target),
            )
          animations.push(
            detail.animate(
              reverse ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }],
              {
                duration: DURATION_MS,
                easing: EASING,
                fill: 'both',
              },
            ),
          )
          const content = detail.querySelectorAll<HTMLElement>(
            '.album-hero-content-stage, .album-body-grid, .album-detail-back, .album-more-gallery',
          )
          const contentAnimations: Animation[] = []
          for (const element of content) {
            const animation = element.animate(
              reverse ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }],
              {
                duration: DURATION_MS - CONTENT_DELAY_MS,
                delay: reverse ? 0 : CONTENT_DELAY_MS,
                easing: EASING,
                fill: 'both',
              },
            )
            contentAnimations.push(animation)
            animations.push(animation)
          }
          if (reverse && contentAnimations.length > 0) {
            void Promise.all(contentAnimations.map((animation) => animation.finished)).then(
              () => {
                if (settled) return
                incoming?.restoreInteraction?.()
                if (incoming) incoming.restoreInteraction = undefined
                onReturnInteractionReady?.()
              },
              () => {},
            )
          }
        }
        void Promise.all(animations.map((animation) => animation.finished)).then(finish, finish)
      } catch {
        finish()
      }
    }

    async function prepare(): Promise<void> {
      if (preference.matches) return finish()
      preference.addEventListener('change', finish)
      window.addEventListener('resize', finish)
      // A hidden/minimized window or a failed decode must not hold navigation indefinitely.
      deadline = setTimeout(() => {
        if (!reverse) onTimeout?.()
        finish()
      }, MAX_PREPARATION_MS)
      if (!reverse && incoming?.element.querySelector('.album-detail-skeleton')) {
        await new Promise<void>((resolve) => {
          releaseContentWait = resolve
          contentObserver = new MutationObserver(() => {
            if (incoming?.element.querySelector('.album-detail-skeleton')) return
            contentObserver?.disconnect()
            contentObserver = undefined
            releaseContentWait = undefined
            resolve()
          })
          contentObserver.observe(incoming!.element, { childList: true, subtree: true })
        })
      }
      if (settled) return
      if (!reverse && waitForColors) {
        try {
          await waitForColors(preparation.signal)
        } catch {
          // An unavailable palette must not prevent navigation.
        }
      }
      if (settled) return
      const cover = incoming?.element.querySelector<HTMLImageElement>('.album-hero-cover img')
      if (cover) {
        try {
          await cover.decode()
        } catch {
          // The page's normal artwork fallback remains usable.
        }
      }
      if (settled) return
      if (hasPrepared) return animate()
      let previousTime: number | null = null
      let stableIntervals = 0
      function sample(time: number): void {
        frame = null
        if (settled) return
        if (previousTime !== null) {
          stableIntervals =
            time - previousTime <= STABLE_FRAME_INTERVAL_MS ? stableIntervals + 1 : 0
        }
        previousTime = time
        if (stableIntervals >= REQUIRED_STABLE_INTERVALS) animate()
        else frame = requestAnimationFrame(sample)
      }
      frame = requestAnimationFrame(sample)
    }

    const session = {
      beforeEnter(element: HTMLElement) {
        incoming = {
          element,
          restore: applyStyles(element, {
            ...(reverse
              ? captureColors(element.closest?.('[data-app-shell-root]') ?? element, false)
              : detailTargetColors(captureColors(element, true), {})),
            // Zero opacity may skip rasterization; keep this layer paintable during preparation.
            opacity: reverse ? '1' : '0.01',
            'will-change': 'opacity',
            'z-index': reverse ? '10' : '20',
          }),
          restoreInteraction: applyStyles(element, { 'pointer-events': 'none' }),
        }
      },
      enter(element: HTMLElement, done: () => void) {
        if (!incoming || incoming.element !== element) return done()
        incoming.done = done
        void prepare()
      },
      leave(element: HTMLElement, done: () => void) {
        const colors = captureColors(element, reverse)
        outgoing = {
          element,
          done,
          restore: applyStyles(element, {
            ...colors,
            position: 'absolute',
            inset: '0',
            width: '100%',
            overflow: 'hidden',
            opacity: '1',
            'will-change': 'opacity',
            'pointer-events': 'none',
            'z-index': reverse ? '20' : '10',
          }),
        }
      },
      finish,
    }
    return session
  }

  function getSession() {
    return (active ??= createSession())
  }

  return {
    configure: (isReverse: boolean) => {
      reverse = isReverse
    },
    beforeEnter: (element: Element) => getSession().beforeEnter(element as HTMLElement),
    enter: (element: Element, done: () => void) => getSession().enter(element as HTMLElement, done),
    leave: (element: Element, done: () => void) => getSession().leave(element as HTMLElement, done),
    cancel: () => active?.finish(),
  }
}
