import { createAlbumForegroundSynchronization } from './albumForegroundSynchronization'

/** Synchronize surfaces mounted after the shared color transition has begun. */
export function createAlbumSurfaceSynchronization(shell: HTMLElement): () => void {
  const main = shell.querySelector<HTMLElement>('.app-main')
  const clock = shell.querySelector<HTMLElement>('.album-more-color-clock')
  const lyricsClock = shell.querySelector<HTMLElement>('.album-lyrics-color-clock')
  if (!main || !clock || !lyricsClock || typeof MutationObserver === 'undefined') return () => {}
  const foreground = createAlbumForegroundSynchronization(shell, main, clock, lyricsClock)

  const active = new Map<HTMLElement, { animation: Animation; reference: Animation }>()
  let scheduled: number | null = null
  let timeout: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let observing = false
  let observedLyrics: HTMLElement | null = null
  const lyricsObserver = new MutationObserver(() => schedule())
  const shellObserver = new MutationObserver(() => schedule())
  const observer = new MutationObserver((records) => {
    if (
      records.some((record) =>
        Array.from(record.addedNodes).some((node) => {
          if (!(node instanceof Element)) return false
          return (
            node.matches('.album-more-gallery, .album-hero-content-stage, .now-playing-panel') ||
            Boolean(
              node.querySelector(
                '.album-more-gallery, .album-hero-content-stage, .now-playing-panel',
              ),
            )
          )
        }),
      )
    )
      schedule()
  })

  function referenceFor(element: HTMLElement): Animation | undefined {
    return element
      .getAnimations()
      .find(
        (animation) =>
          'transitionProperty' in animation &&
          animation.transitionProperty === '--album-surface-color' &&
          animation.playState === 'running',
      )
  }

  function synchronize(
    target: HTMLElement,
    pseudo: string | undefined,
    reference: Animation | undefined,
  ): void {
    const previous = active.get(target)
    if (!reference || reference.startTime === null) {
      if (previous) {
        previous.animation.cancel()
        active.delete(target)
      }
      return
    }
    if (previous?.reference === reference) return
    previous?.animation.cancel()
    active.delete(target)
    const own = target.getAnimations({ subtree: Boolean(pseudo) }).find((animation) => {
      const effect = animation.effect as KeyframeEffect | null
      return (
        effect?.target === target &&
        effect.pseudoElement === (pseudo ?? null) &&
        'transitionProperty' in animation &&
        animation.transitionProperty === '--album-surface-color' &&
        animation.startTime === reference.startTime
      )
    })
    if (own) return
    const effect = reference.effect as KeyframeEffect | null
    const frames = effect?.getKeyframes()
    if (!effect || !frames || frames.length < 2) return
    const timing = effect.getTiming()
    try {
      const animation = target.animate(frames, {
        duration: timing.duration,
        easing: timing.easing,
        fill: 'both',
        ...(pseudo ? { pseudoElement: pseudo } : {}),
      })
      animation.startTime = reference.startTime
      active.set(target, { animation, reference })
      void animation.finished.then(
        () => {
          if (active.get(target)?.animation !== animation) return
          active.delete(target)
          animation.cancel()
        },
        () => {},
      )
    } catch {
      // If the browser cannot animate the pseudo-element, retain the normal CSS result.
    }
  }

  function sync(): void {
    scheduled = null
    if (disposed) return
    const mainReference = referenceFor(main!)
    const moreReference = referenceFor(clock!)
    const lyricsReference = referenceFor(lyricsClock!)
    for (const target of main!.querySelectorAll<HTMLElement>('.album-hero-content-stage')) {
      synchronize(target, '::before', mainReference)
    }
    for (const target of main!.querySelectorAll<HTMLElement>('.album-more-gallery')) {
      synchronize(target, undefined, moreReference)
    }
    const lyrics = shell.querySelector<HTMLElement>('.now-playing-panel')
    if (lyrics !== observedLyrics && observing) {
      lyricsObserver.disconnect()
      observedLyrics = lyrics
      if (lyrics) lyricsObserver.observe(lyrics, { attributes: true, attributeFilter: ['class'] })
    }
    if (lyrics) synchronize(lyrics, undefined, lyricsReference)
    foreground.sync()
    for (const [target, value] of active) {
      if (!target.isConnected) {
        value.animation.cancel()
        active.delete(target)
      }
    }
    if (!mainReference && !moreReference && !lyricsReference && observing) {
      observer.disconnect()
      lyricsObserver.disconnect()
      shellObserver.disconnect()
      observedLyrics = null
      observing = false
    }
  }
  function schedule(): void {
    if (scheduled === null) scheduled = requestAnimationFrame(sync)
  }
  function onTransition(event: Event): void {
    const transition = event as TransitionEvent
    if (
      (transition.target !== main &&
        transition.target !== clock &&
        transition.target !== lyricsClock &&
        transition.target !== shell.querySelector('.app-sidebar')) ||
      transition.propertyName !== '--album-surface-color'
    )
      return
    if (!observing) {
      observer.observe(shell, { childList: true, subtree: true })
      shellObserver.observe(shell, { attributes: true, attributeFilter: ['class'] })
      observing = true
    }
    if (timeout !== null) clearTimeout(timeout)
    timeout = setTimeout(() => {
      observer.disconnect()
      lyricsObserver.disconnect()
      shellObserver.disconnect()
      observedLyrics = null
      observing = false
      schedule()
    }, 1000)
    foreground.sync()
    schedule()
  }
  shell.addEventListener('transitionrun', onTransition, true)
  shell.addEventListener('transitionend', onTransition, true)
  shell.addEventListener('transitioncancel', onTransition, true)
  return () => {
    disposed = true
    shell.removeEventListener('transitionrun', onTransition, true)
    shell.removeEventListener('transitionend', onTransition, true)
    shell.removeEventListener('transitioncancel', onTransition, true)
    observer.disconnect()
    lyricsObserver.disconnect()
    shellObserver.disconnect()
    foreground.dispose()
    if (scheduled !== null) cancelAnimationFrame(scheduled)
    if (timeout !== null) clearTimeout(timeout)
    for (const { animation } of active.values()) animation.cancel()
    active.clear()
  }
}
