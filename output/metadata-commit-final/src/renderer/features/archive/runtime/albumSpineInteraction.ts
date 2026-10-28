import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'

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
) {
  const controller = new AbortController()
  const options = { signal: controller.signal }
  const motion = createReducedMotionQuery()
  const slots = [...row.querySelectorAll<HTMLElement>(':scope > .archive-album-slot')]
  const part = (slot: HTMLElement, name: string) =>
    slot.querySelector<HTMLElement>(`.archive-album-${name}`)!
  const buttons = slots.map((slot) => part(slot, 'trigger') as HTMLButtonElement)
  const ranks = slots.map((slot) => part(slot, 'rank'))
  const returning = new Map<HTMLElement, ReturnCopy>()
  let active: number | null = null
  let inputMode: InputMode = 'pointer'
  let lastPointerType = 'mouse'
  let touchWasActive = false
  let pointerFrame = 0
  let lastPoint: Point | null = null

  function alignRanks(): void {
    const offsets = slots.map((slot, index) => {
      const spine = part(slot, 'spine').getBoundingClientRect()
      return (spine.left + spine.right) / 2 - buttons[index].getBoundingClientRect().left
    })
    ranks.forEach((rank, index) => {
      rank.style.left = `${offsets[index]}px`
    })
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

  function pointerIndex(point: Point): number | null {
    // Let the renderer resolve perspective, overlap and in-flight transforms.
    // Only the visible case faces and rank labels accept pointer hits; the
    // untransformed keyboard button and returning visual copies do not.
    const surface = document
      .elementFromPoint(point.x, point.y)
      ?.closest('.archive-album-lift, .archive-album-rank')
    const slot = surface?.closest<HTMLElement>('.archive-album-slot')
    const index = slot ? slots.indexOf(slot) : -1
    return index === -1 ? null : index
  }

  function cancelPointer(): void {
    cancelAnimationFrame(pointerFrame)
    pointerFrame = 0
    lastPoint = null
  }

  function pointerSelection(): void {
    pointerFrame = 0
    if (!lastPoint) return
    select(pointerIndex(lastPoint))
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
    'pointerdown',
    (event) => {
      lastPointerType = event.pointerType
      touchWasActive =
        active !== null && pointerIndex({ x: event.clientX, y: event.clientY }) === active
    },
    { ...options, capture: true },
  )

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
    'click',
    (event) => {
      if (event.detail === 0) {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
          '.archive-album-trigger',
        )
        const index = buttons.indexOf(button!)
        if (index !== -1) select(index, 'keyboard')
      } else if (lastPointerType === 'touch') {
        const index = pointerIndex({ x: event.clientX, y: event.clientY })
        if (index !== null) select(touchWasActive ? null : index, 'touch')
      }
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
  function hasFocusedKeyboardSelection(): boolean {
    return (
      inputMode === 'keyboard' &&
      active !== null &&
      buttons[active] === document.activeElement &&
      viewport.contains(document.activeElement)
    )
  }
  const layoutChanged = () => {
    if (!hasFocusedKeyboardSelection()) reset()
  }
  window.addEventListener('resize', layoutChanged, options)
  const resize = new ResizeObserver(layoutChanged)
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
