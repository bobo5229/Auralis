import { ref, shallowRef, watch, type Ref } from 'vue'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'
import {
  animateFullscreenPlayerTransition,
  type FullscreenPlayerTransitionSnapshot,
} from '@renderer/shared/animation/motion'
import { resolveRestorablePlayerTrigger } from '../utils/playerOverlayFocus'

interface Options {
  isOpen: Readonly<Ref<boolean>>
  reducedMotion: Readonly<Ref<boolean>>
  artworkCacheKey: Readonly<Ref<string | null>>
  onEntered: () => void
  onEscape: () => void
}

/** Owns overlay transitions, GPU preparation gates and the overlay's focus lifetime. */
export function useFullscreenOverlayLifecycle(options: Options) {
  const { isOpen: isFullscreenPlayerOpen, artworkCacheKey } = options
  const overlayRef = ref<HTMLElement | null>(null)
  // Space can activate :focus-visible after a pointer click; reserve the lyrics ring for Tab navigation.
  const keyboardNavigation = ref(false)
  const exitButtonRef = ref<HTMLButtonElement | null>(null)
  // Park the GPU backgrounds between visits; controls and lyrics still leave with the section.
  const backgroundTarget = shallowRef<HTMLElement | null>(null)
  const deferBackgroundInitialization = ref(false)
  let activeTransition: ReturnType<typeof animateFullscreenPlayerTransition> | undefined
  let interruptedTransition: FullscreenPlayerTransitionSnapshot | undefined
  let backgroundReleaseFrame = 0
  let returnFocusTarget: HTMLElement | null = null

  function releaseBackgroundInitialization(): void {
    cancelAnimationFrame(backgroundReleaseFrame)
    // Let the completed artwork transition reach the compositor before starting a
    // cold context; changing a flag in its completion microtask is still too early.
    backgroundReleaseFrame = requestAnimationFrame(() => {
      backgroundReleaseFrame = requestAnimationFrame(() => {
        backgroundReleaseFrame = 0
        deferBackgroundInitialization.value = false
      })
    })
  }

  watch(
    isFullscreenPlayerOpen,
    () => {
      // Post-render background watchers can run before Transition's enter hook.
      // Block cold preparation synchronously with the open/close state change.
      cancelAnimationFrame(backgroundReleaseFrame)
      backgroundReleaseFrame = 0
      deferBackgroundInitialization.value = true
    },
    { flush: 'sync' },
  )

  function runTransition(element: Element, done: () => void, entering: boolean): void {
    const interrupted = activeTransition?.cancel() ?? interruptedTransition
    cancelAnimationFrame(backgroundReleaseFrame)
    backgroundReleaseFrame = 0
    // Context creation is synchronous even with parallel shader compilation. Keep
    // cold GPU preparation outside both artwork transitions; reuse ready canvases.
    deferBackgroundInitialization.value = true
    ;(element as HTMLElement).inert = !entering
    activeTransition = animateFullscreenPlayerTransition({
      overlay: element as HTMLElement,
      artwork: (element as HTMLElement).querySelector<HTMLElement>('.fullscreen-player-artwork'),
      source: document.querySelector<HTMLElement>('[data-player-bar-artwork]'),
      entering,
      reducedMotion: options.reducedMotion.value,
      interrupted,
      onComplete: () => {
        activeTransition = undefined
        interruptedTransition = undefined
        done()
        releaseBackgroundInitialization()
        if (entering) options.onEntered()
      },
    })
    interruptedTransition = undefined
  }

  function handleEnter(element: Element, done: () => void): void {
    backgroundTarget.value = element as HTMLElement
    runTransition(element, done, true)
  }

  function handleLeave(element: Element, done: () => void): void {
    runTransition(element, done, false)
  }

  function handleAfterLeave(element: Element): void {
    if (backgroundTarget.value === element) backgroundTarget.value = null
  }

  function handleTransitionCancelled(): void {
    interruptedTransition = activeTransition?.cancel()
    activeTransition = undefined
    releaseBackgroundInitialization()
  }

  watch(options.reducedMotion, () => activeTransition?.finish())
  watch(artworkCacheKey, () => activeTransition?.finish())

  watch(
    isFullscreenPlayerOpen,
    (isOpen) => {
      keyboardNavigation.value = false
      if (isOpen) {
        const activeElement = document.activeElement
        if (activeElement instanceof HTMLElement && !overlayRef.value?.contains(activeElement)) {
          returnFocusTarget = activeElement
        }
      }
    },
    { flush: 'sync', immediate: true },
  )

  useOverlayFocusTrap({
    isOpen: isFullscreenPlayerOpen,
    container: overlayRef,
    initialFocus: () => exitButtonRef.value ?? undefined,
    onEscape: options.onEscape,
    restoreFocus: () => {
      resolveRestorablePlayerTrigger(returnFocusTarget)?.focus({ preventScroll: true })
      returnFocusTarget = null
    },
  })

  function dispose(): void {
    activeTransition?.cancel()
    cancelAnimationFrame(backgroundReleaseFrame)
  }

  return {
    overlayRef,
    exitButtonRef,
    keyboardNavigation,
    backgroundTarget,
    deferBackgroundInitialization,
    handleEnter,
    handleLeave,
    handleAfterLeave,
    handleTransitionCancelled,
    dispose,
  }
}
