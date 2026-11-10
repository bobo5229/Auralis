import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { observeWindowVisibility } from '@renderer/shared/animation/windowVisibility'
import { albumIdentityKey } from '@shared/utils/albumIdentity'

type Route = { name?: unknown; query: Record<string, unknown> }
interface Options {
  root(): HTMLElement | null
  started(): void
  finished(): void
}
/** One route session owns its image, animations, temporary styles and completion callbacks. */
export function createAlbumDetailEntryTransition(options: Options) {
  let reverse = false
  let fromGallery = false
  let key = ''
  let source: HTMLElement | null = null
  let sourceRect: DOMRect | undefined
  let sourceRadius = ''
  let image: HTMLImageElement | null = null
  let sourcePaint: Record<string, string> = {}
  let active: {
    finish(): void
    beforeEnter(node: HTMLElement): void
    enter(node: HTMLElement, done: () => void): void
    leave(node: HTMLElement, done: () => void): void
  } | null = null
  function cover(root: HTMLElement, detail: boolean, gallery = false): HTMLElement | null {
    if (detail) return root.querySelector('.album-hero-cover')
    if (gallery) {
      let found: HTMLElement | null = null
      let matches = 0
      for (const card of root.querySelectorAll<HTMLElement>(
        '.album-more-gallery-card[data-album-key]',
      )) {
        if (card.dataset.albumKey !== key) continue
        if (++matches > 1) return null
        found = card.querySelector('.album-more-gallery-cover')
      }
      return found
    }
    for (const card of root.querySelectorAll<HTMLElement>('.album-card[data-album-key]')) {
      if (card.dataset.albumKey === key) return card.querySelector('.cover-stage')
    }
    return null
  }
  function usable(node: HTMLElement | null): node is HTMLElement {
    if (!node?.isConnected) return false
    const rect = node.getBoundingClientRect()
    const bounds = options.root()?.getBoundingClientRect()
    const clips = ['.albums-scroll', '.album-more-gallery-scroller', '.album-detail-scroll-wrapper']
      .map((selector) => node.closest(selector)?.getBoundingClientRect())
      .filter((clip): clip is DOMRect => Boolean(clip))
    const img = node.querySelector('img')
    return Boolean(
      bounds &&
      img?.complete &&
      img.naturalWidth > 0 &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.left >= bounds.left &&
      rect.right <= bounds.right &&
      rect.top >= bounds.top &&
      rect.bottom <= bounds.bottom &&
      clips.every(
        (clip) =>
          rect.left >= clip.left &&
          rect.right <= clip.right &&
          rect.top >= clip.top &&
          rect.bottom <= clip.bottom,
      ),
    )
  }
  function session() {
    const animations: Animation[] = []
    const restores: Array<() => void> = []
    const callbacks = new Set<() => void>()
    const preference = createReducedMotionQuery()
    let overlay: HTMLElement | undefined
    let observer: ResizeObserver | undefined
    let stopVisibility = () => {}
    let frame = 0
    let stopped = false
    const paint = sourcePaint
    const originalSource = source
    const incomingSource = image
    const origin = sourceRect
    const radius = sourceRadius
    function style(node: HTMLElement, values: Partial<CSSStyleDeclaration>) {
      const previous = Object.fromEntries(
        Object.keys(values).map((key) => [key, node.style[key as keyof CSSStyleDeclaration]]),
      )
      Object.assign(node.style, values)
      restores.push(() => Object.assign(node.style, previous))
    }
    function finish() {
      if (stopped) return
      stopped = true
      cancelAnimationFrame(frame)
      observer?.disconnect()
      stopVisibility()
      window.removeEventListener('resize', finish)
      document.removeEventListener('scroll', finish, true)
      document.removeEventListener('visibilitychange', finish)
      preference.removeEventListener('change', finish)
      for (const animation of animations) animation.cancel()
      overlay?.remove()
      restores.reverse().forEach((restore) => restore())
      if (active === api) active = null
      options.finished()
      callbacks.forEach((done) => done())
      callbacks.clear()
    }
    function run(node: HTMLElement, frames: Keyframe[], timing: KeyframeAnimationOptions) {
      const animation = node.animate(frames, { fill: 'both', ...timing })
      animations.push(animation)
      return animation.finished.catch(() => {})
    }
    window.addEventListener('resize', finish)
    document.addEventListener('scroll', finish, true)
    document.addEventListener('visibilitychange', finish)
    preference.addEventListener('change', finish)
    const root = options.root()
    if (root && typeof ResizeObserver !== 'undefined') {
      const bounds = root.getBoundingClientRect()
      observer = new ResizeObserver(() => {
        const next = root.getBoundingClientRect()
        if (
          next.width !== bounds.width ||
          next.height !== bounds.height ||
          next.left !== bounds.left ||
          next.top !== bounds.top
        )
          finish()
      })
      observer.observe(root)
    }
    const api = {
      finish,
      beforeEnter(node: HTMLElement) {
        style(node, { opacity: '0' })
      },
      leave(node: HTMLElement, done: () => void) {
        callbacks.add(done)
        for (const [property, value] of Object.entries(paint)) {
          const previous = node.style.getPropertyValue(property)
          const priority = node.style.getPropertyPriority(property)
          node.style.setProperty(property, value)
          restores.push(() => {
            if (previous) node.style.setProperty(property, previous, priority)
            else node.style.removeProperty(property)
          })
        }
        style(node, { position: 'absolute', inset: '0', width: '100%', pointerEvents: 'none' })
        try {
          void run(node, [{ opacity: 1 }, { opacity: 0 }], {
            duration: preference.matches ? 120 : reverse ? 80 : 90,
          }).then(() => {
            if (!callbacks.delete(done)) return
            done()
          })
        } catch {
          finish()
        }
      },
      enter(node: HTMLElement, done: () => void) {
        callbacks.add(done)
        options.started()
        frame = requestAnimationFrame(() => {
          frame = 0
          if (stopped) return
          const target = cover(node, !reverse)
          const shared = !preference.matches && incomingSource && origin && root && usable(target)
          const duration = shared ? (reverse ? 200 : 240) : 120
          try {
            const work: Promise<unknown>[] = []
            if (shared) {
              const bounds = root.getBoundingClientRect()
              const to = target.getBoundingClientRect()
              overlay = document.createElement('div')
              overlay.setAttribute('aria-hidden', 'true')
              Object.assign(overlay.style, {
                position: 'absolute',
                inset: '0',
                overflow: 'hidden',
                pointerEvents: 'none',
                zIndex: '30',
              })
              const picture = document.createElement('div')
              Object.assign(picture.style, {
                position: 'absolute',
                left: `${origin.left - bounds.left}px`,
                top: `${origin.top - bounds.top}px`,
                width: `${origin.width}px`,
                height: `${origin.height}px`,
                transformOrigin: '0 0',
                borderRadius: radius,
                overflow: 'hidden',
              })
              Object.assign(incomingSource.style, {
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              })
              picture.append(incomingSource)
              overlay.append(picture)
              root.append(overlay)
              const originalImage = originalSource?.querySelector<HTMLElement>('img')
              if (originalImage) style(originalImage, { visibility: 'hidden' })
              const targetImage = target.querySelector<HTMLElement>('img')!
              style(targetImage, { visibility: 'hidden' })
              const sx = to.width / origin.width
              work.push(
                run(
                  picture,
                  [
                    { transform: 'translate(0, 0) scale(1)', borderRadius: radius },
                    {
                      transform: `translate(${to.left - origin.left}px, ${to.top - origin.top}px) scale(${sx}, ${to.height / origin.height})`,
                      borderRadius: `${(parseFloat(getComputedStyle(target).borderRadius) || 0) / sx}px`,
                    },
                  ],
                  { duration, easing: 'cubic-bezier(.22,.75,.2,1)' },
                ),
              )
            }
            work.push(
              run(node, [{ opacity: 0 }, { opacity: 1 }], {
                duration: shared ? (reverse ? 160 : 180) : 120,
                delay: shared ? (reverse ? 20 : 40) : 0,
              }),
            )
            void Promise.all(work).then(finish)
          } catch {
            finish()
          }
        })
      },
    }
    let initialVisibility = true
    stopVisibility = observeWindowVisibility((visible) => {
      if (initialVisibility) {
        initialVisibility = false
        return
      }
      if (!visible) finish()
    })
    return api
  }
  function getSession() {
    return (active ??= session())
  }
  return {
    prepare(to: Route, from: Route) {
      active?.finish()
      source = null
      image = null
      sourceRect = undefined
      const entering = from.name === 'albums' && to.name === 'album-detail'
      const leaving = from.name === 'album-detail' && to.name === 'albums'
      const changing =
        from.name === 'album-detail' &&
        to.name === 'album-detail' &&
        (from.query.artist !== to.query.artist || from.query.title !== to.query.title)
      fromGallery = changing
      if (!entering && !leaving && !changing) return
      reverse = leaving
      const identity = leaving ? from : to
      if (typeof identity.query.artist !== 'string' || typeof identity.query.title !== 'string')
        return
      key = albumIdentityKey(identity.query.artist, identity.query.title)
      const root = options.root()
      sourcePaint = {}
      if (root) {
        const computed = getComputedStyle(root)
        for (const token of [
          '--auralis-text',
          '--auralis-text-muted',
          '--auralis-text-faint',
          '--auralis-text-subtle',
          '--auralis-theme-accent',
          '--auralis-control-primary-text',
        ]) {
          const value = computed.getPropertyValue?.(token)
          if (value) sourcePaint[token] = value
        }
        if (computed.backgroundColor) sourcePaint['background-color'] = computed.backgroundColor
      }
      source = root ? cover(root, leaving, fromGallery) : null
      if (!usable(source)) return
      sourceRect = source.getBoundingClientRect()
      sourceRadius = getComputedStyle(source).borderRadius
      image = source.querySelector('img')!.cloneNode(false) as HTMLImageElement
      image.removeAttribute('id')
      image.removeAttribute('alt')
    },
    configure(value: boolean) {
      reverse = value
    },
    beforeEnter(node: Element) {
      getSession().beforeEnter(node as HTMLElement)
    },
    enter(node: Element, done: () => void) {
      getSession().enter(node as HTMLElement, done)
    },
    leave(node: Element, done: () => void) {
      getSession().leave(node as HTMLElement, done)
    },
    cancel() {
      active?.finish()
      image = null
      source = null
    },
  }
}
