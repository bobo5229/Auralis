import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { createAlbumFocusPresentation } from './albumFocusPresentation'
import type { AlbumCaseLabels } from './albumCaseModel'

type InputMode = 'pointer' | 'keyboard' | 'touch'
type Point = { x: number; y: number }
interface ReturnCopy {
  overlay: HTMLElement
}

/** DOM motion is local to this display; it never navigates to or plays an album. */
export function createAlbumSpineInteraction(
  viewport: HTMLElement,
  row: HTMLElement,
  onSelect: (index: number | null) => void,
  caseLabels: () => AlbumCaseLabels,
) {
  const controller = new AbortController()
  const options = { signal: controller.signal }
  const motion = createReducedMotionQuery()
  const slots = [...row.querySelectorAll<HTMLElement>(':scope > .archive-album-slot')]
  const part = (slot: HTMLElement, name: string) =>
    slot.querySelector<HTMLElement>(`.archive-album-${name}`)!
  const buttons = slots.map((slot) => part(slot, 'trigger') as HTMLButtonElement)
  const ranks = slots.map((slot) => part(slot, 'rank'))
  const fronts = slots.map((slot) => part(slot, 'front'))
  const envelopes = slots.map((slot) => part(slot, 'envelope'))
  let hitRegions:
    | { viewport: DOMRect; ranks: DOMRect[]; buttons: DOMRect[]; envelopes: DOMRect[] }
    | undefined
  function invalidateHitRegions(): void {
    hitRegions = undefined
  }
  function regions() {
    const bounds = viewport.getBoundingClientRect()
    if (
      hitRegions &&
      bounds.left === hitRegions.viewport.left &&
      bounds.top === hitRegions.viewport.top &&
      bounds.width === hitRegions.viewport.width &&
      bounds.height === hitRegions.viewport.height
    )
      return hitRegions
    // A translated ancestor or a wrapping heading can move this viewport without
    // resizing it. Keep cached hit boxes tied to its current screen position.
    return (hitRegions = {
      viewport: bounds,
      ranks: ranks.map((rank) => rank.getBoundingClientRect()),
      buttons: buttons.map((button) => button.getBoundingClientRect()),
      envelopes: envelopes.map((envelope) => envelope.getBoundingClientRect()),
    })
  }
  const returning = new Map<HTMLElement, ReturnCopy>()
  let active: number | null = null
  let inputMode: InputMode = 'pointer'
  let lastPointerType = 'mouse'
  let touchWasActive = false
  let pointerFrame = 0
  let lastPoint: Point | null = null
  let focus: ReturnType<typeof createAlbumFocusPresentation> | undefined
  let focusing = false

  function openFocus(): void {
    if (focusing || active === null) return
    const index = active
    focusing = true
    cancelPointer()
    slots.forEach(clearReturn)
    buttons[index].setAttribute('aria-expanded', 'true')
    focus = createAlbumFocusPresentation(
      slots[index],
      () => motion.matches,
      () => {
        focus = undefined
        focusing = false
        active = null
        inputMode = 'keyboard'
        buttons[index].setAttribute('aria-expanded', 'false')
        buttons[index].setAttribute('aria-pressed', 'false')
        onSelect(null)
      },
      caseLabels,
    )
  }

  function alignRanks(): void {
    const offsets = slots.map((slot, index) => {
      const spine = part(slot, 'spine').getBoundingClientRect()
      return (spine.left + spine.right) / 2 - buttons[index].getBoundingClientRect().left
    })
    ranks.forEach((rank, index) => {
      rank.style.left = `${offsets[index]}px`
    })
    invalidateHitRegions()
  }

  function clearReturn(slot: HTMLElement): void {
    const item = returning.get(slot)
    if (!item) return
    item.overlay.getAnimations({ subtree: true }).forEach((animation) => animation.cancel())
    item.overlay.remove()
    returning.delete(slot)
  }

  function returnAlbum(slot: HTMLElement): void {
    clearReturn(slot)
    if (motion.matches) {
      slot.classList.remove('is-active')
      return
    }
    const lift = part(slot, 'lift')
    const object = part(slot, 'object')
    const coverRect = lift.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const left = slot.offsetLeft
    const top = slot.offsetTop
    const fromPoses = [getComputedStyle(lift).transform, getComputedStyle(object).transform]
    slot.classList.remove('is-active')

    const transitions = [lift, object].flatMap((source, index) =>
      source
        .getAnimations()
        .flatMap((animation) =>
          animation instanceof CSSTransition &&
          animation.transitionProperty === 'transform' &&
          animation.effect instanceof KeyframeEffect
            ? [{ animation, effect: animation.effect, index }]
            : [],
        ),
    )
    const duration = Math.max(
      0,
      ...transitions.map(({ effect }) => Number(effect.getComputedTiming().endTime)),
    )
    if (!duration) return

    // Reveal the normal stacking order progressively, without an extra turn or
    // a sudden z-index change. Mirror the browser's transition keyframes and
    // timeline once, including shortened reversals, rather than sampling per frame.
    const overlay = document.createElement('div')
    overlay.className = 'archive-album-occlusion'
    overlay.setAttribute('aria-hidden', 'true')
    const copy = slot.cloneNode(false) as HTMLElement
    copy.style.left = `${left}px`
    copy.style.top = `${top}px`
    copy.append(lift.cloneNode(true))
    overlay.append(copy)
    row.append(overlay)
    const copyLift = part(copy, 'lift')
    const copyObject = part(copy, 'object')
    returning.set(slot, { overlay })
    const endRect = copyLift.getBoundingClientRect()
    for (const { animation, effect, index } of transitions) {
      // Blink may serialize a CSS transition's starting pixel lengths at device
      // scale. The resolved CSS matrix keeps the copy in the source's CSS units.
      const frames = effect
        .getKeyframes()
        .map((frame, frameIndex) =>
          frameIndex === 0 ? { ...frame, transform: fromPoses[index] } : frame,
        )
      const mirrored = [copyLift, copyObject][index].animate(frames, effect.getTiming())
      if (animation.startTime !== null) mirrored.startTime = animation.startTime
      else mirrored.currentTime = animation.currentTime
    }
    const wipe = overlay.animate(
      [
        { clipPath: `inset(0 ${Math.max(0, rowRect.right - coverRect.right - 16)}px 0 0)` },
        {
          clipPath: `inset(0 ${Math.max(0, rowRect.right - Math.min(coverRect.left, endRect.left) + 16)}px 0 0)`,
        },
      ],
      { duration, easing: 'cubic-bezier(0.22, 0.8, 0.22, 1)', fill: 'both' },
    )
    void wipe.finished.then(
      () => clearReturn(slot),
      () => {},
    )
  }

  function select(index: number | null, source: InputMode = 'pointer'): void {
    if (focusing) return
    inputMode = source
    if (active === index) return
    if (active !== null) {
      returnAlbum(slots[active])
      buttons[active].setAttribute('aria-pressed', 'false')
    }
    active = index
    if (index !== null) {
      clearReturn(slots[index])
      slots[index].classList.add('is-active')
      buttons[index].setAttribute('aria-pressed', 'true')
    }
    onSelect(index)
  }

  function contains(
    rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
    point: Point,
    padding = 0,
  ): boolean {
    return (
      point.x >= rect.left - padding &&
      point.x <= rect.right + padding &&
      point.y >= rect.top - padding &&
      point.y <= rect.bottom + padding
    )
  }

  function inActiveRegion(point: Point, hit: ReturnType<typeof regions>): boolean {
    if (active === null) return false
    const original = hit.buttons[active]
    const expanded = hit.envelopes[active]
    const bounds = {
      left: Math.min(original.left, expanded.left),
      top: Math.min(original.top, expanded.top),
      right: Math.max(original.right, expanded.right),
      bottom: Math.max(original.bottom, expanded.bottom),
    }
    if (contains(bounds, point, 8)) return true
    const current = fronts[active].getBoundingClientRect()
    return contains(
      {
        left: Math.min(bounds.left, current.left),
        top: Math.min(bounds.top, current.top),
        right: Math.max(bounds.right, current.right),
        bottom: Math.max(bounds.bottom, current.bottom),
      },
      point,
      8,
    )
  }

  function cancelPointer(): void {
    cancelAnimationFrame(pointerFrame)
    pointerFrame = 0
    lastPoint = null
  }

  function pointerSelection(): void {
    pointerFrame = 0
    if (!lastPoint) return
    const hit = regions()
    const rank = hit.ranks.findIndex((rect) => contains(rect, lastPoint!, 5))
    if (rank !== -1) {
      select(rank)
      return
    }
    const candidate = hit.buttons.findIndex((rect) => contains(rect, lastPoint!))
    if (!inActiveRegion(lastPoint, hit)) select(candidate === -1 ? null : candidate)
  }

  function reset(): void {
    focus?.dispose()
    focus = undefined
    focusing = false
    cancelPointer()
    active = null
    slots.forEach((slot, index) => {
      clearReturn(slot)
      slot.classList.remove('is-active')
      buttons[index].setAttribute('aria-pressed', 'false')
      buttons[index].setAttribute('aria-expanded', 'false')
      slot.getAnimations({ subtree: true }).forEach((animation) => animation.cancel())
    })
    alignRanks()
    onSelect(null)
  }

  function overActiveCover(point: Point): boolean {
    return active !== null && contains(fronts[active].getBoundingClientRect(), point)
  }

  viewport.addEventListener(
    'pointerdown',
    (event) => {
      lastPointerType = event.pointerType
      if (event.button !== 0 || !overActiveCover({ x: event.clientX, y: event.clientY })) return
      touchWasActive = true
      // The extracted cover can extend over a neighboring button. Keep that click
      // attached to the visible album instead of focusing the hidden neighbor.
      event.preventDefault()
      event.stopPropagation()
    },
    { ...options, capture: true },
  )
  viewport.addEventListener(
    'click',
    (event) => {
      if (event.button !== 0 || !overActiveCover({ x: event.clientX, y: event.clientY })) return
      if (lastPointerType === 'touch' && !touchWasActive) return
      event.stopPropagation()
      openFocus()
    },
    { ...options, capture: true },
  )

  viewport.addEventListener(
    'pointermove',
    (event) => {
      if (focusing || event.pointerType === 'touch') return
      inputMode = 'pointer'
      lastPoint = { x: event.clientX, y: event.clientY }
      if (!pointerFrame) pointerFrame = requestAnimationFrame(pointerSelection)
    },
    options,
  )
  viewport.addEventListener(
    'pointerleave',
    () => {
      cancelPointer()
      if (inputMode === 'pointer') select(null)
    },
    options,
  )
  viewport.addEventListener(
    'scroll',
    () => {
      invalidateHitRegions()
      cancelPointer()
      if (inputMode === 'pointer') select(null)
    },
    { ...options, passive: true },
  )
  row.addEventListener(
    'focusin',
    (event) => {
      const index = buttons.indexOf(event.target as HTMLButtonElement)
      if (index !== -1)
        select(
          index,
          buttons[index].matches(':focus-visible')
            ? 'keyboard'
            : lastPointerType === 'touch'
              ? 'touch'
              : 'pointer',
        )
    },
    options,
  )
  row.addEventListener(
    'focusout',
    (event) => {
      if (!row.contains(event.relatedTarget as Node | null) && inputMode === 'keyboard')
        select(null)
    },
    options,
  )
  row.addEventListener(
    'keydown',
    (event) => {
      const index = buttons.indexOf(event.target as HTMLButtonElement)
      if (index === -1) return
      let next = index
      if (event.key === 'ArrowRight') next = Math.min(index + 1, buttons.length - 1)
      else if (event.key === 'ArrowLeft') next = Math.max(index - 1, 0)
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = buttons.length - 1
      else if (event.key === 'Escape') {
        event.preventDefault()
        select(null, 'keyboard')
        return
      } else return
      event.preventDefault()
      buttons[next].focus({ preventScroll: true })
      buttons[next].scrollIntoView({
        block: 'nearest',
        inline: 'center',
        behavior: motion.matches ? 'instant' : 'smooth',
      })
      select(next, 'keyboard')
    },
    options,
  )
  row.addEventListener(
    'pointerdown',
    (event) => {
      lastPointerType = event.pointerType
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        '.archive-album-trigger',
      )
      touchWasActive = buttons.indexOf(button!) === active
    },
    options,
  )
  row.addEventListener(
    'click',
    (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        '.archive-album-trigger',
      )
      const index = buttons.indexOf(button!)
      if (index === -1) return
      if (event.detail === 0) {
        select(index, 'keyboard')
        openFocus()
      } else if (lastPointerType === 'touch') select(touchWasActive ? null : index, 'touch')
    },
    options,
  )
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!viewport.contains(event.target as Node)) select(null)
    },
    options,
  )
  document.addEventListener('scroll', invalidateHitRegions, {
    ...options,
    capture: true,
    passive: true,
  })
  document.fonts?.addEventListener('loadingdone', invalidateHitRegions, options)
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) reset()
    },
    options,
  )
  const layoutChanged = () => {
    invalidateHitRegions()
    if (focus) focus.reposition()
    else reset()
  }
  window.addEventListener('resize', layoutChanged, options)
  const resize = new ResizeObserver(layoutChanged)
  resize.observe(viewport)
  function syncMotion(): void {
    viewport.dataset.reducedMotion = String(motion.matches)
    if (motion.matches) {
      if (focus) focus.reposition()
      else reset()
    }
  }
  syncMotion()
  alignRanks()
  motion.addEventListener('change', syncMotion)

  return {
    dispose(): void {
      controller.abort()
      resize.disconnect()
      motion.removeEventListener('change', syncMotion)
      reset()
    },
  }
}
