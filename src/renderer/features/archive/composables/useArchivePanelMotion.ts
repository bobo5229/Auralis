import { onScopeDispose } from 'vue'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { archivePanelColors } from '../utils/archivePanelColors'
import {
  archivePanelPosition,
  archivePanelTransform,
  type PanelRect,
} from '../utils/archivePanelGeometry'

function createSession(panel: HTMLElement, anchor: HTMLElement, onClose: () => void) {
  const motion = createReducedMotionQuery()
  const animations = new Set<Animation>()
  let root: HTMLElement | undefined = panel
  let observer: ResizeObserver | undefined
  let colorObserver: MutationObserver | undefined
  let leaving = false
  let source: PanelRect
  let target: PanelRect
  let sourceColor = ''

  function updateFill() {
    if (leaving || !anchor.isConnected) return
    const colors = archivePanelColors(getComputedStyle(anchor).backgroundColor)
    if (!colors) return
    sourceColor = colors.fill
    panel.style.setProperty('--archive-panel-fill', colors.fill)
    panel.style.setProperty('--auralis-text', colors.text)
    panel.style.setProperty('--auralis-text-muted', colors.muted)
  }

  function place() {
    if (!root || leaving || !anchor.isConnected) return
    const rect = anchor.getBoundingClientRect()
    source = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    const position = archivePanelPosition(source, root.offsetWidth, root.offsetHeight, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    target = { ...position, width: root.offsetWidth, height: root.offsetHeight }
    root.style.left = `${position.left}px`
    root.style.top = `${position.top}px`
  }
  function onResize() {
    if (!root || leaving) return
    if (root.offsetWidth !== target.width || root.offsetHeight !== target.height) {
      // Opening keyframes use the original panel size; settle before placing new content.
      animations.forEach((animation) => animation.finish())
    }
    place()
  }
  function animate(element: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
    const animation = element.animate(frames, options)
    animations.add(animation)
    void animation.finished
      .catch(() => undefined)
      .finally(() => {
        if (options.fill !== 'forwards') {
          animations.delete(animation)
          animation.cancel()
        }
      })
    return animation
  }

  function enter(element: Element, done: () => void) {
    root = element as HTMLElement
    place()
    updateFill()
    const surface = root.querySelector<HTMLElement>('.archive-day-panel-surface')!
    const content = root.querySelector<HTMLElement>('.archive-day-panel-content')!
    const panelShadow = getComputedStyle(surface).boxShadow
    if (!motion.matches) {
      // Sample a damped spring once; the browser runs the finite transform animation.
      const frames = Array.from({ length: 33 }, (_, index) => {
        const time = index / 32
        const progress =
          index === 32
            ? 1
            : 1 - Math.exp(-8 * time) * (Math.cos(6 * time) + (4 / 3) * Math.sin(6 * time))
        return {
          offset: time,
          transform: archivePanelTransform(source, target, progress),
          borderRadius: `${2 + 8 * Math.min(1, progress)}px`,
        }
      })
      Object.assign(frames[0], { boxShadow: 'none' })
      Object.assign(frames[32], { boxShadow: panelShadow })
      const opening = animate(surface, frames, { duration: 400, easing: 'linear', fill: 'both' })
      animate(
        content,
        [
          { opacity: 0, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 180, delay: 150, easing: 'ease-out', fill: 'both' },
      )
      void opening.finished.then(done, done)
    } else done()
    root.style.visibility = 'visible'
    observer = new ResizeObserver(onResize)
    observer.observe(root)
    colorObserver = new MutationObserver(updateFill)
    colorObserver.observe(anchor, { attributes: true, attributeFilter: ['class', 'style'] })
    colorObserver.observe(document.documentElement, { attributes: true })
  }
  function leave(element: Element, done: () => void) {
    leaving = true
    const panel = element as HTMLElement
    panel.inert = true
    panel.setAttribute('aria-hidden', 'true')
    panel.style.pointerEvents = 'none'
    if (motion.matches || !anchor.isConnected) {
      animations.forEach((animation) => animation.cancel())
      done()
      return
    }
    const rect = anchor.getBoundingClientRect()
    const final = panel.getBoundingClientRect()
    const surface = panel.querySelector<HTMLElement>('.archive-day-panel-surface')!
    const content = panel.querySelector<HTMLElement>('.archive-day-panel-content')!
    const currentTransform = getComputedStyle(surface).transform
    const currentOpacity = getComputedStyle(content).opacity
    const currentColor = getComputedStyle(surface).backgroundColor
    const currentRadius = getComputedStyle(surface).borderRadius
    animations.forEach((animation) => animation.cancel())
    animate(content, [{ opacity: currentOpacity }, { opacity: 0 }], {
      duration: 70,
      fill: 'forwards',
    })
    const closing = animate(
      surface,
      [
        {
          transform: currentTransform,
          backgroundColor: currentColor,
          borderRadius: currentRadius,
        },
        {
          transform: archivePanelTransform(rect, final, 0),
          backgroundColor: sourceColor,
          borderRadius: '2px',
          boxShadow: 'none',
        },
      ],
      { duration: 180, easing: 'cubic-bezier(0.4, 0, 0.8, 0.2)', fill: 'both' },
    )
    void closing.finished.then(done, done)
  }
  function onScroll(event: Event) {
    if (leaving) return
    if (event.target instanceof Node && root?.contains(event.target)) return
    onClose()
  }
  function onMotionChange() {
    if (motion.matches) animations.forEach((animation) => animation.finish())
  }
  motion.addEventListener('change', onMotionChange)
  window.addEventListener('resize', onResize)
  document.addEventListener('scroll', onScroll, true)
  function dispose() {
    observer?.disconnect()
    colorObserver?.disconnect()
    motion.removeEventListener('change', onMotionChange)
    window.removeEventListener('resize', onResize)
    document.removeEventListener('scroll', onScroll, true)
    animations.forEach((animation) => animation.cancel())
  }

  return {
    enter: (done: () => void) => enter(panel, done),
    leave: (done: () => void) =>
      leave(panel, () => {
        dispose()
        done()
      }),
    dispose,
  }
}

export function useArchivePanelMotion(onClose: () => void) {
  const sessions = new Map<HTMLElement, ReturnType<typeof createSession>>()
  let disposed = false
  onScopeDispose(() => {
    disposed = true
    sessions.forEach((session) => session.dispose())
    sessions.clear()
  })
  return {
    beforeEnter(element: Element) {
      ;(element as HTMLElement).style.visibility = 'hidden'
    },
    enter(element: Element, anchor: HTMLElement, done: () => void) {
      if (disposed) {
        done()
        return
      }
      const panel = element as HTMLElement
      const session = createSession(panel, anchor, onClose)
      sessions.set(panel, session)
      session.enter(done)
    },
    leave(element: Element, done: () => void) {
      const panel = element as HTMLElement
      const session = sessions.get(panel)
      if (!session) {
        done()
        return
      }
      session.leave(() => {
        sessions.delete(panel)
        done()
      })
    },
  }
}
