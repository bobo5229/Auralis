import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'

type InputMode = 'pointer' | 'keyboard' | 'touch'
type Point = { x: number; y: number }
interface ReturnCopy {
  overlay: HTMLElement
  lift: HTMLElement
  object: HTMLElement
  copyLift: HTMLElement
  copyObject: HTMLElement
}

/** DOM motion is local to this display; it never opens or plays an album. */
export function createAlbumSpineInteraction(
  viewport: HTMLElement,
  row: HTMLElement,
  onSelect: (index: number | null) => void,
) {
  const controller = new AbortController()
  const options = { signal: controller.signal }
  const motion = createReducedMotionQuery()
  const slots = [...row.querySelectorAll<HTMLElement>(':scope > .archive-album-slot')]
  const part = (slot: HTMLElement, name: string) =>
    slot.querySelector<HTMLElement>(`.archive-album-${name}`)!
  const buttons = slots.map((slot) => part(slot, 'trigger') as HTMLButtonElement)
  const returning = new Map<HTMLElement, ReturnCopy>()
  let active: number | null = null
  let inputMode: InputMode = 'pointer'
  let lastPointerType = 'mouse'
  let touchWasActive = false
  let pointerFrame = 0
  let returnFrame = 0
  let lastPoint: Point | null = null

  function alignRanks(): void {
    const offsets = slots.map((slot, index) => {
      const spine = part(slot, 'spine').getBoundingClientRect()
      return (spine.left + spine.right) / 2 - buttons[index].getBoundingClientRect().left
    })
    slots.forEach((slot, index) => {
      part(slot, 'rank').style.left = `${offsets[index]}px`
    })
  }

  function syncReturnCopies(): void {
    returnFrame = 0
    const poses = [...returning.values()].map((item) => ({
      ...item,
      liftPose: getComputedStyle(item.lift).transform,
      objectPose: getComputedStyle(item.object).transform,
    }))
    poses.forEach(({ copyLift, copyObject, liftPose, objectPose }) => {
      copyLift.style.transform = liftPose
      copyObject.style.transform = objectPose
    })
    if (returning.size) returnFrame = requestAnimationFrame(syncReturnCopies)
  }

  function clearReturn(slot: HTMLElement): void {
    const item = returning.get(slot)
    if (!item) return
    item.overlay.getAnimations({ subtree: true }).forEach((animation) => animation.cancel())
    item.overlay.remove()
    returning.delete(slot)
    if (!returning.size) {
      cancelAnimationFrame(returnFrame)
      returnFrame = 0
    }
  }

  function returnAlbum(slot: HTMLElement): void {
    clearReturn(slot)
    const lift = part(slot, 'lift')
    const object = part(slot, 'object')
    const coverRect = lift.getBoundingClientRect()
    slot.classList.remove('is-active')
    if (motion.matches) return

    // Reveal the normal stacking order progressively, without an extra turn or
    // a sudden z-index change. Copies follow the real CSS pose, including reversals.
    const overlay = document.createElement('div')
    overlay.className = 'archive-album-occlusion'
    overlay.setAttribute('aria-hidden', 'true')
    const copy = slot.cloneNode(false) as HTMLElement
    copy.style.left = `${slot.offsetLeft}px`
    copy.style.top = `${slot.offsetTop}px`
    copy.append(lift.cloneNode(true))
    overlay.append(copy)
    row.append(overlay)
    const copyLift = part(copy, 'lift')
    const copyObject = part(copy, 'object')
    returning.set(slot, { overlay, lift, object, copyLift, copyObject })
    const rowRect = row.getBoundingClientRect()
    const endRect = copyLift.getBoundingClientRect()
    const transitions = [lift, object].flatMap((source) =>
      source
        .getAnimations()
        .filter(
          (animation) =>
            animation instanceof CSSTransition && animation.transitionProperty === 'transform',
        ),
    )
    const duration = Math.max(
      0,
      ...transitions.map((item) => Number(item.effect?.getComputedTiming().endTime ?? 0)),
    )
    if (!duration) {
      clearReturn(slot)
      return
    }
    copyLift.style.transform = getComputedStyle(lift).transform
    copyObject.style.transform = getComputedStyle(object).transform
    if (!returnFrame) returnFrame = requestAnimationFrame(syncReturnCopies)
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

  function inActiveRegion(point: Point): boolean {
    if (active === null) return false
    const slot = slots[active]
    const original = buttons[active].getBoundingClientRect()
    const current = part(slot, 'front').getBoundingClientRect()
    const expanded = part(slot, 'envelope').getBoundingClientRect()
    return contains(
      {
        left: Math.min(original.left, current.left, expanded.left),
        top: Math.min(original.top, current.top, expanded.top),
        right: Math.max(original.right, current.right, expanded.right),
        bottom: Math.max(original.bottom, current.bottom, expanded.bottom),
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
    const rank = slots.findIndex((slot) =>
      contains(part(slot, 'rank').getBoundingClientRect(), lastPoint!, 5),
    )
    if (rank !== -1) {
      select(rank)
      return
    }
    const candidate = buttons.findIndex((button) =>
      contains(button.getBoundingClientRect(), lastPoint!),
    )
    if (!inActiveRegion(lastPoint)) select(candidate === -1 ? null : candidate)
  }

  function reset(): void {
    cancelPointer()
    active = null
    slots.forEach((slot, index) => {
      clearReturn(slot)
      slot.classList.remove('is-active')
      buttons[index].setAttribute('aria-pressed', 'false')
      slot.getAnimations({ subtree: true }).forEach((animation) => animation.cancel())
    })
    alignRanks()
    onSelect(null)
  }

  viewport.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch') return
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
      if (event.detail === 0) select(index, 'keyboard')
      else if (lastPointerType === 'touch') select(touchWasActive ? null : index, 'touch')
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
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) reset()
    },
    options,
  )
  window.addEventListener('resize', reset, options)
  const resize = new ResizeObserver(reset)
  resize.observe(viewport)
  function syncMotion(): void {
    viewport.dataset.reducedMotion = String(motion.matches)
    if (motion.matches) reset()
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
