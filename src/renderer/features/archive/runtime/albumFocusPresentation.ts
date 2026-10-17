import {
  ALBUM_CASE_OPEN_ANGLE,
  ALBUM_FOCUS_POSE,
  albumFocusLayout,
  albumFocusProjection,
} from '../utils/albumFocusLayout'
import { createAlbumCase, type AlbumCaseLabels } from './albumCaseModel'

const OPEN_DURATION = 900
const CLOSE_DURATION = 560
const LID_DURATION = 620
const EASING = 'cubic-bezier(0.22, 0.72, 0.24, 1)'
const FINAL_ANGLE = 360 + ALBUM_FOCUS_POSE.tiltY
const FINAL_POSE = `rotateX(${ALBUM_FOCUS_POSE.tiltX}deg) rotateY(${FINAL_ANGLE}deg)`

/** Native modal presentation; the existing row remains the source of album data. */
export function createAlbumFocusPresentation(
  slot: HTMLElement,
  reducedMotion: () => boolean,
  onClosed: () => void,
  caseLabels: () => AlbumCaseLabels,
) {
  const part = (root: HTMLElement, name: string) =>
    root.querySelector<HTMLElement>(`.archive-album-${name}`)!
  const sourceLift = part(slot, 'lift')
  const sourceObject = part(slot, 'object')
  const sourceRect = slot.getBoundingClientRect()
  const albumSize = sourceLift.offsetWidth
  const motionRoot = slot.closest<HTMLElement>('.archive-album-spines')!
  const styles = getComputedStyle(motionRoot)
  const liftPose = getComputedStyle(sourceLift).transform
  const matrix = new DOMMatrixReadOnly(getComputedStyle(sourceObject).transform)
  const startAngle = (Math.atan2(-matrix.m13, matrix.m11) * 180) / Math.PI
  const sideAngle = parseFloat(styles.getPropertyValue('--archive-spine-angle'))
  const sourcePerspective = getComputedStyle(slot).perspective
  const dialog = document.createElement('dialog')
  dialog.className = 'archive-album-focus'
  dialog.setAttribute('aria-label', part(slot, 'trigger').getAttribute('aria-label') ?? '')
  dialog.tabIndex = -1
  for (const variable of [
    '--archive-album-size',
    '--archive-album-pitch',
    '--archive-spine-angle',
    '--archive-pull-depth',
  ]) {
    dialog.style.setProperty(variable, styles.getPropertyValue(variable))
  }
  const mover = document.createElement('div')
  mover.className = 'archive-album-focus-mover'
  Object.assign(mover.style, {
    left: `${sourceRect.left}px`,
    top: `${sourceRect.top}px`,
    width: `${sourceRect.width}px`,
    height: `${sourceRect.height}px`,
    transformOrigin: `${sourceRect.width / 2}px ${albumSize / 2}px`,
  })
  const copy = slot.cloneNode(false) as HTMLElement
  copy.classList.remove('is-active', 'is-focused')
  copy.removeAttribute('data-index')
  copy.style.perspective = sourcePerspective
  copy.append(sourceLift.cloneNode(true))
  mover.append(copy)
  dialog.append(mover)
  const lift = part(copy, 'lift')
  const object = part(copy, 'object')
  const albumCase = createAlbumCase(object, caseLabels)
  lift.style.transform = liftPose
  object.style.transform = `rotateX(0deg) rotateY(${startAngle}deg)`
  const events = new AbortController()
  const animations = new Set<Animation>()
  let rotation: Animation | undefined
  let closing = false
  let disposed = false
  let lidOpen = false
  dialog.dataset.caseOpen = 'false'

  function animate(
    element: HTMLElement,
    from: string,
    to: string,
    duration: number,
    property: 'transform' | 'perspective' = 'transform',
  ): Animation | undefined {
    element.style[property] = to
    if (reducedMotion()) return undefined
    const animation = element.animate([{ [property]: from }, { [property]: to }], {
      duration,
      easing: EASING,
      fill: 'both',
    })
    animations.add(animation)
    return animation
  }

  function cancelAnimations(): void {
    animations.forEach((animation) => animation.cancel())
    animations.clear()
  }

  function layoutContext() {
    const bounds = (slot.closest('main') ?? motionRoot).getBoundingClientRect()
    // The safe area is a calc() token; resolve it as a CSS length rather than
    // parsing its unevaluated custom-property text as a number.
    const ruler = document.createElement('div')
    Object.assign(ruler.style, {
      position: 'absolute',
      visibility: 'hidden',
      width: '0px',
      height: getComputedStyle(motionRoot).getPropertyValue('--auralis-playbar-safe-area'),
    })
    dialog.append(ruler)
    const bottomInset = ruler.getBoundingClientRect().height
    ruler.remove()
    return {
      content: {
        left: Math.max(0, bounds.left),
        top: Math.max(0, bounds.top),
        width: Math.min(window.innerWidth, bounds.right) - Math.max(0, bounds.left),
        height: Math.min(window.innerHeight, bounds.bottom) - Math.max(0, bounds.top),
      },
      bottomInset,
    }
  }

  function targetTransform(lidAngle = 0, context = layoutContext()): string {
    const layout = albumFocusLayout(
      sourceRect,
      albumSize,
      context.content,
      context.bottomInset,
      albumFocusProjection(albumSize, sourceRect.height),
      lidAngle ? albumFocusProjection(albumSize, sourceRect.height, lidAngle) : undefined,
    )
    return `translate(${layout.x}px, ${layout.y}px) scale(${layout.scale})`
  }

  function lidAngle(): number {
    const pose = new DOMMatrixReadOnly(getComputedStyle(albumCase.lid).transform)
    return (Math.atan2(-pose.m13, pose.m11) * 180) / Math.PI
  }

  function toggleCase(): void {
    if (disposed || closing || rotation?.playState === 'running') return
    const angle = lidAngle()
    const moveFrom = getComputedStyle(mover).transform
    cancelAnimations()
    rotation = undefined
    lidOpen = !lidOpen
    const to = lidOpen ? ALBUM_CASE_OPEN_ANGLE : 0
    dialog.dataset.caseOpen = String(lidOpen)
    albumCase.setExpanded(lidOpen)
    const context = layoutContext()
    const frames = Array.from({ length: 33 }, (_, index) => {
      const progress = index / 32
      return {
        offset: progress,
        transform:
          index === 0 ? moveFrom : targetTransform(angle + (to - angle) * progress, context),
      }
    })
    mover.style.transform = targetTransform(to, context)
    if (!reducedMotion()) {
      animations.add(
        mover.animate(frames, { duration: LID_DURATION, easing: EASING, fill: 'both' }),
      )
    }
    animate(
      albumCase.lid,
      `translateZ(6px) rotateY(${angle}deg)`,
      `translateZ(6px) rotateY(${to}deg)`,
      LID_DURATION,
    )
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    events.abort()
    cancelAnimations()
    dialog.close()
    dialog.remove()
    slot.classList.remove('is-focused')
  }

  function close(): void {
    if (disposed || closing) return
    closing = true
    const moveFrom = getComputedStyle(mover).transform
    const liftFrom = getComputedStyle(lift).transform
    const perspectiveFrom = getComputedStyle(copy).perspective
    const lidFrom = lidAngle()
    const progress = rotation?.effect?.getComputedTiming().progress ?? 1
    const angle = startAngle + (FINAL_ANGLE - startAngle) * progress
    const tilt = ALBUM_FOCUS_POSE.tiltX * progress
    cancelAnimations()
    lidOpen = false
    dialog.dataset.caseOpen = 'false'
    albumCase.setExpanded(false)
    slot.classList.remove('is-active')
    slot.getAnimations({ subtree: true }).forEach((animation) => animation.cancel())
    const current = slot.getBoundingClientRect()
    const moveTo = `translate(${current.left - sourceRect.left}px, ${current.top - sourceRect.top}px) scale(1)`
    animate(mover, moveFrom, moveTo, CLOSE_DURATION)
    animate(lift, liftFrom, getComputedStyle(sourceLift).transform, CLOSE_DURATION)
    animate(copy, perspectiveFrom, sourcePerspective, CLOSE_DURATION, 'perspective')
    animate(
      albumCase.lid,
      `translateZ(6px) rotateY(${lidFrom}deg)`,
      'translateZ(6px) rotateY(0deg)',
      CLOSE_DURATION * 0.6,
    )
    const last = animate(
      object,
      `rotateX(${tilt}deg) rotateY(${angle}deg)`,
      `rotateX(0deg) rotateY(${sideAngle}deg)`,
      CLOSE_DURATION,
    )
    const finish = () => {
      if (disposed) return
      dispose()
      part(slot, 'trigger').focus({ preventScroll: true })
      onClosed()
    }
    if (last) void last.finished.then(finish, () => {})
    else finish()
  }

  dialog.addEventListener(
    'cancel',
    (event) => {
      event.preventDefault()
      close()
    },
    { signal: events.signal },
  )
  dialog.addEventListener(
    'click',
    (event) => {
      const target = event.target as Node
      if (albumCase.lid.contains(target)) toggleCase()
      else if (!object.contains(target)) close()
    },
    { signal: events.signal },
  )
  dialog.addEventListener(
    'keydown',
    (event) => {
      if (event.target === dialog && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault()
        toggleCase()
      }
    },
    { signal: events.signal },
  )
  slot.classList.add('is-focused')
  document.body.append(dialog)
  dialog.showModal()
  dialog.focus({ preventScroll: true })
  animate(mover, 'translate(0px, 0px) scale(1)', targetTransform(), OPEN_DURATION)
  animate(lift, liftPose, 'translate3d(-50%, 0px, 0px)', OPEN_DURATION)
  animate(
    copy,
    sourcePerspective,
    `${ALBUM_FOCUS_POSE.perspective}px`,
    OPEN_DURATION,
    'perspective',
  )
  rotation = animate(object, `rotateX(0deg) rotateY(${startAngle}deg)`, FINAL_POSE, OPEN_DURATION)

  return {
    close,
    dispose,
    reposition(): void {
      if (disposed) return
      if (closing) {
        if (reducedMotion()) animations.forEach((animation) => animation.finish())
        return
      }
      animations.forEach((animation) => animation.finish())
      cancelAnimations()
      rotation = undefined
      mover.style.transform = targetTransform(lidOpen ? ALBUM_CASE_OPEN_ANGLE : 0)
      albumCase.lid.style.transform = `translateZ(6px) rotateY(${lidOpen ? ALBUM_CASE_OPEN_ANGLE : 0}deg)`
      lift.style.transform = 'translate3d(-50%, 0px, 0px)'
      copy.style.perspective = `${ALBUM_FOCUS_POSE.perspective}px`
      object.style.transform = FINAL_POSE
    },
  }
}
