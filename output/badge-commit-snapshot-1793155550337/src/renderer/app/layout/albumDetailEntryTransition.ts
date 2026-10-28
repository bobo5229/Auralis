import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'

const DURATION_MS = 180
const EASING = 'ease-out'
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

/** Crossfade both routes, preparing the detail's cold paint only on the first entry. */
export function createAlbumDetailEntryTransition(onPrepared?: () => void) {
  let hasPrepared = false
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
      if (!hasPrepared) {
        hasPrepared = true
        onPrepared?.()
      }
      try {
        animations.push(
          incoming.element.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: DURATION_MS,
            easing: EASING,
            fill: 'forwards',
          }),
        )
        if (outgoing) {
          animations.push(
            outgoing.element.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: DURATION_MS,
              easing: EASING,
              fill: 'forwards',
            }),
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
      if (hasPrepared) return animate()
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
            'will-change': 'opacity',
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
            'will-change': 'opacity',
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
