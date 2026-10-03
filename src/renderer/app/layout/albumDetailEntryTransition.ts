import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'

const DURATION_MS = 320
const EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'
const MAX_PREPARATION_MS = 1000
const STABLE_FRAME_INTERVAL_MS = 34
const REQUIRED_STABLE_INTERVALS = 4

type Participant = { element: HTMLElement; restore: () => void; done?: () => void }

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

/** Hold the first route transition until the detail's cold paint has had time to finish. */
export function createAlbumDetailEntryTransition(onPrepared: () => void) {
  let active: ReturnType<typeof createSession> | null = null

  function createSession() {
    const preference = createReducedMotionQuery()
    let incoming: Participant | null = null
    let outgoing: Participant | null = null
    let frame: number | null = null
    let deadline: ReturnType<typeof setTimeout> | null = null
    let settled = false
    const animations: Animation[] = []

    function finish(): void {
      if (settled) return
      settled = true
      if (frame !== null) cancelAnimationFrame(frame)
      if (deadline !== null) clearTimeout(deadline)
      preference.removeEventListener('change', finish)
      for (const animation of animations) animation.cancel()
      incoming?.restore()
      outgoing?.restore()
      if (active === session) active = null
      outgoing?.done?.()
      incoming?.done?.()
    }

    function animate(): void {
      if (settled || !incoming) return
      if (deadline !== null) clearTimeout(deadline)
      deadline = null
      onPrepared()
      try {
        animations.push(
          incoming.element.animate(
            [
              { opacity: 0, transform: 'scale(0.94) translate3d(0, 16px, 0)' },
              { opacity: 1, transform: 'none' },
            ],
            { duration: DURATION_MS, easing: EASING, fill: 'forwards' },
          ),
        )
        if (outgoing) {
          animations.push(
            outgoing.element.animate(
              [
                { opacity: 1, transform: 'none' },
                { opacity: 0, transform: 'scale(1.04)' },
              ],
              { duration: DURATION_MS, easing: EASING, fill: 'forwards' },
            ),
          )
        }
        void Promise.all(animations.map((animation) => animation.finished)).then(finish, finish)
      } catch {
        finish()
      }
    }

    async function prepare(): Promise<void> {
      if (preference.matches) return finish()
      preference.addEventListener('change', finish)
      // A hidden/minimized window or a failed decode must not hold navigation indefinitely.
      deadline = setTimeout(finish, MAX_PREPARATION_MS)
      const cover = incoming?.element.querySelector<HTMLImageElement>('.album-hero-cover img')
      if (cover) {
        try {
          await cover.decode()
        } catch {
          // The page's normal artwork fallback remains usable.
        }
      }
      if (settled) return
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
            // Zero opacity may skip rasterization; keep this layer paintable during preparation.
            opacity: '0.01',
            transform: 'scale(0.94) translate3d(0, 16px, 0)',
            'will-change': 'transform, opacity',
            'pointer-events': 'none',
            'z-index': '20',
          }),
        }
      },
      enter(element: HTMLElement, done: () => void) {
        if (!incoming || incoming.element !== element) return done()
        incoming.done = done
        void prepare()
      },
      leave(element: HTMLElement, done: () => void) {
        outgoing = {
          element,
          done,
          restore: applyStyles(element, {
            position: 'absolute',
            inset: '0',
            width: '100%',
            overflow: 'hidden',
            opacity: '1',
            transform: 'none',
            'will-change': 'transform, opacity',
            'pointer-events': 'none',
            'z-index': '10',
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
    beforeEnter: (element: Element) => getSession().beforeEnter(element as HTMLElement),
    enter: (element: Element, done: () => void) => getSession().enter(element as HTMLElement, done),
    leave: (element: Element, done: () => void) => getSession().leave(element as HTMLElement, done),
    cancel: () => active?.finish(),
  }
}
