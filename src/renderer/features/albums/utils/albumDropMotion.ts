import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import type { AlbumSummary } from '../types'

export interface AlbumDropRequest {
  album: AlbumSummary
  cover: HTMLElement
  onLand: () => void
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, Math.max(min, max)))
const smooth = (value: number): number => value * value * (3 - 2 * value)
const transformDisc = (
  x: number,
  y: number,
  size: number,
  angle = 0,
  scale = 1,
  tilt = 0,
): string =>
  `translate3d(${x - size / 2}px,${y - size / 2}px,0) scale(${scale}) rotateX(${tilt}deg) rotate(${angle}deg)`

function snapshot(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement
  for (const element of [clone, ...clone.querySelectorAll<HTMLElement>('*')]) {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/iu.test(attribute.name)) element.removeAttribute(attribute.name)
    }
    element.removeAttribute('id')
    element.removeAttribute('autofocus')
    element.removeAttribute('contenteditable')
    element.removeAttribute('tabindex')
  }
  return clone
}

/** One disposable visual session. Playback is only committed by land(), exactly once. */
export function createAlbumDropMotion(root: HTMLElement, onActive: (active: boolean) => void) {
  let stop: (() => void) | null = null

  function cancel(): void {
    stop?.()
  }

  function play(request: AlbumDropRequest): void {
    cancel()
    const { cover, album, onLand } = request
    const shell = cover.closest<HTMLElement>('.app-shell')
    const target = shell?.querySelector<HTMLElement>('[data-playbar-drop-target]')
    const frame = cover.querySelector<HTMLElement>('.cover-frame')
    if (!cover.isConnected) return
    const source = cover.getBoundingClientRect()
    const bar = target?.getBoundingClientRect()
    const motion = createReducedMotionQuery()
    // The same action remains usable when the landing target or available space is absent.
    if (
      motion.matches ||
      !root.isConnected ||
      !shell ||
      !target ||
      !bar ||
      !frame ||
      source.width <= 0 ||
      bar.width < 140 ||
      bar.top < 180 ||
      typeof cover.animate !== 'function'
    ) {
      onLand()
      return
    }

    const animations = new Set<Animation>()
    const teardown: (() => void)[] = []
    const sceneRestores: (() => void)[] = []
    let sceneActive = false
    let alive = true
    let landed = false
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const background = Array.from(shell.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && !child.classList.contains('player-bar'),
    )
    const restoreScene = (): void => {
      for (const restore of sceneRestores.reverse()) restore()
      sceneRestores.length = 0
      if (!sceneActive) return
      sceneActive = false
      onActive(false)
      if (focused?.isConnected && document.activeElement === document.body)
        focused.focus({ preventScroll: true })
    }
    const cleanup = (): void => {
      if (!alive) return
      alive = false
      if (stop === cleanup) stop = null
      for (const animation of animations) animation.cancel()
      animations.clear()
      for (const restore of teardown.reverse()) restore()
      root.replaceChildren()
      root.style.display = 'none'
      restoreScene()
    }
    stop = cleanup

    const land = (): void => {
      if (!alive || landed || !cover.isConnected || !target.isConnected) return
      landed = true
      onLand()
    }
    const reduced = (): void => {
      if (!motion.matches) return
      try {
        land()
      } finally {
        cleanup()
      }
    }
    const playbar = target.closest('.player-bar')
    const isPlaybarEvent = (event: Event): boolean =>
      playbar !== null && event.target instanceof Node && playbar.contains(event.target)
    const onKey = (event: KeyboardEvent): void => {
      if (
        event.key === 'Escape' ||
        (isPlaybarEvent(event) &&
          [
            'Enter',
            ' ',
            'ArrowLeft',
            'ArrowRight',
            'ArrowUp',
            'ArrowDown',
            'Home',
            'End',
            'PageUp',
            'PageDown',
          ].includes(event.key))
      )
        cleanup()
    }
    // Keyboard and assistive activation can dispatch click without pointerdown.
    const onClick = (event: MouseEvent): void => {
      if (isPlaybarEvent(event)) cleanup()
    }
    const onVisibility = (): void => {
      if (document.hidden) cleanup()
    }
    window.addEventListener('wheel', cleanup, { capture: true, passive: true })
    window.addEventListener('scroll', cleanup, { capture: true, passive: true })
    window.addEventListener('pointerdown', cleanup, true)
    window.addEventListener('resize', cleanup)
    window.addEventListener('blur', cleanup)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('click', onClick, true)
    document.addEventListener('visibilitychange', onVisibility)
    motion.addEventListener('change', reduced)
    const deadline = window.setTimeout(cleanup, 5000)
    teardown.push(() => {
      window.removeEventListener('wheel', cleanup, true)
      window.removeEventListener('scroll', cleanup, true)
      window.removeEventListener('pointerdown', cleanup, true)
      window.removeEventListener('resize', cleanup)
      window.removeEventListener('blur', cleanup)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('click', onClick, true)
      document.removeEventListener('visibilitychange', onVisibility)
      motion.removeEventListener('change', reduced)
      window.clearTimeout(deadline)
    })

    async function animate(
      node: HTMLElement,
      frames: Keyframe[],
      duration: number,
      easing = 'cubic-bezier(.16,1,.3,1)',
    ): Promise<boolean> {
      if (!alive) return false
      const animation = node.animate(frames, { duration, easing, fill: 'forwards' })
      animations.add(animation)
      try {
        await animation.finished
        return alive
      } catch {
        return false
      }
    }

    const run = async (): Promise<void> => {
      const direction = source.left + source.width / 2 > window.innerWidth / 2 ? -1 : 1
      const scale = Math.min(1.18, (bar.top - 56) / source.height)
      const width = source.width * scale
      const diameter = width * 0.9
      const overlap = 18
      const minX = direction === -1 ? diameter - overlap + 20 : 20
      const maxX =
        direction === 1
          ? window.innerWidth - width - diameter + overlap - 20
          : window.innerWidth - width - 20
      const centerX = clamp(source.left + source.width / 2 - width / 2, minX, maxX) + width / 2
      const centerY =
        clamp(source.top + source.height / 2 - width / 2, 24, bar.top - width - 32) + width / 2
      const grown = `translate(${centerX - source.left - source.width / 2}px,${centerY - source.top - source.height / 2}px) scale(${scale})`
      const coverClone = document.createElement('div')
      coverClone.className = 'album-drop-cover'
      Object.assign(coverClone.style, {
        left: `${source.left}px`,
        top: `${source.top}px`,
        width: `${source.width}px`,
        height: `${source.height}px`,
      })
      coverClone.append(snapshot(frame!))
      const disc = document.createElement('div')
      disc.className = 'album-drop-disc-position'
      Object.assign(disc.style, {
        left: '0',
        top: '0',
        width: `${diameter}px`,
        height: `${diameter}px`,
        transform: transformDisc(centerX, centerY, diameter),
        visibility: 'hidden',
      })
      const front = document.createElement('div')
      front.className = 'album-drop-disc'
      const title = document.createElement('div')
      title.className = 'album-drop-disc-label'
      title.textContent = album.title
      const artist = document.createElement('div')
      artist.className = 'album-drop-disc-subtitle'
      artist.textContent = album.albumArtist
      front.append(title, artist)
      const back = document.createElement('div')
      back.className = 'album-drop-disc album-drop-disc-back'
      const image = frame!.querySelector<HTMLImageElement>('img')
      if (image?.complete && image.naturalWidth > 0) {
        const artwork = image.cloneNode() as HTMLImageElement
        artwork.removeAttribute('id')
        artwork.alt = ''
        artwork.loading = 'eager'
        back.append(artwork)
      }
      disc.append(front, back)
      root.append(disc, coverClone)
      root.style.display = 'block'
      // Keep the blur radius fixed: only the composited backdrop's opacity changes.
      // It sits below the Playbar and this layer's cover/CD, so those stay sharp.
      const backdrop = document.createElement('div')
      backdrop.className = 'album-drop-backdrop'
      backdrop.setAttribute('aria-hidden', 'true')
      backdrop.inert = true
      shell.append(backdrop)
      sceneRestores.push(() => backdrop.remove())
      const original = cover.closest<HTMLElement>('.album-card-cover') ?? cover
      const visibility = original.style.getPropertyValue('visibility')
      const priority = original.style.getPropertyPriority('visibility')
      original.style.setProperty('visibility', 'hidden')
      sceneRestores.push(() => {
        if (visibility) original.style.setProperty('visibility', visibility, priority)
        else original.style.removeProperty('visibility')
      })
      for (const child of background) {
        const inert = child.inert
        child.classList.add('album-drop-muted')
        child.inert = true
        sceneRestores.push(() => {
          child.classList.remove('album-drop-muted')
          child.inert = inert
        })
      }
      sceneActive = true
      onActive(true)
      const observer = new ResizeObserver(() => {
        if (!alive) return
        const current = target.getBoundingClientRect()
        const currentSource = cover.getBoundingClientRect()
        if (
          Math.abs(current.width - bar!.width) > 1 ||
          Math.abs(current.top - bar!.top) > 1 ||
          Math.abs(currentSource.width - source.width) > 1
        )
          cleanup()
      })
      observer.observe(target)
      observer.observe(cover)
      teardown.push(() => observer.disconnect())

      void animate(backdrop, [{ opacity: 0 }, { opacity: 1 }], 240, 'ease-out')
      if (!(await animate(coverClone, [{ transform: 'none' }, { transform: grown }], 260))) return
      disc.style.visibility = 'visible'
      const extractedX = centerX + direction * (width / 2 + diameter / 2 - overlap)
      let last = transformDisc(extractedX, centerY, diameter, direction * 18)
      if (
        !(await animate(
          disc,
          [{ transform: transformDisc(centerX, centerY, diameter) }, { transform: last }],
          380,
          'cubic-bezier(.22,1,.36,1)',
        ))
      )
        return
      disc.style.zIndex = '3'
      const targetX = clamp(
        bar!.left + bar!.width / 2 + direction * 80,
        bar!.left + 70,
        bar!.right - 70,
      )
      const targetY = bar!.top + 10
      const frames = Array.from({ length: 61 }, (_, index) => {
        const t = index / 60
        const flip = 360 * smooth(clamp((t - 0.08) / 0.72, 0, 1))
        const tilt = flip + 62 * smooth(clamp((t - 0.8) / 0.2, 0, 1))
        last = transformDisc(
          extractedX + (targetX - extractedX) * t,
          centerY + (targetY - centerY) * t * t,
          diameter,
          direction * (18 + 260 * t),
          1 - 0.58 * smooth(t),
          tilt,
        )
        return { transform: last, offset: t }
      })
      if (!(await animate(disc, frames, 760, 'linear'))) return
      if (!cover.isConnected || !target.isConnected) return cleanup()
      land()
      // Additive translation preserves the Playbar's own layout transform.
      const impact = target.animate(
        [
          { transform: 'translateY(0)' },
          { transform: 'translateY(3px)', offset: 0.35 },
          { transform: 'translateY(0)' },
        ],
        { duration: 290, easing: 'cubic-bezier(.22,1,.36,1)', composite: 'add' },
      )
      animations.add(impact)
      if (
        !(await animate(
          disc,
          [
            { transform: last, opacity: 1 },
            {
              transform: transformDisc(targetX, targetY + 12, diameter, direction * 290, 0.16, 436),
              opacity: 0,
            },
          ],
          180,
        ))
      )
        return
      disc.remove()
      void animate(backdrop, [{ opacity: 1 }, { opacity: 0 }], 240, 'ease-out')
      await animate(coverClone, [{ transform: grown }, { transform: 'none' }], 240)
      cleanup()
    }

    void run().catch((cause) => {
      cleanup()
      rendererDiagnostics.error({
        scope: 'albums.drop',
        message: 'Album drop animation failed',
        cause,
      })
    })
  }

  return { play, cancel }
}
