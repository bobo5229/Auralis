import { createFocusTrap, type FocusTrap } from 'focus-trap'
import { nextTick, onBeforeUnmount, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

// One stack lets the library pause lower overlays while a child owns focus.
const trapStack: FocusTrap[] = []

export function useOverlayFocusTrap(options: {
  isOpen: MaybeRefOrGetter<boolean>
  container: Ref<HTMLElement | null>
  initialFocus?: () => HTMLElement | undefined
  onEscape: () => void
  canDismiss?: MaybeRefOrGetter<boolean>
  onActivate?: () => void
  onDeactivate?: () => void
  restoreFocus?: (captured: HTMLElement | null) => void
}): void {
  let session: FocusTrap | undefined
  let activeRoot: HTMLElement | undefined
  let captured: HTMLElement | null = null
  let generation = 0
  let unmounted = false

  function stop(): void {
    if (!session) return
    const trap = session
    session = undefined
    activeRoot = undefined
    const wasTop = trapStack.at(-1) === trap
    const target = captured
    captured = null
    options.onDeactivate?.()
    trap.deactivate({ returnFocus: false })
    const token = ++generation
    if (wasTop && !trapStack.length)
      void nextTick(() => {
        if (
          generation === token &&
          !session &&
          !trapStack.length &&
          (unmounted || !toValue(options.isOpen))
        ) {
          options.restoreFocus?.(target)
        }
      })
  }

  watch(
    () => toValue(options.isOpen),
    (open) => {
      if (!open) stop()
    },
    { flush: 'sync' },
  )

  watch(
    [() => toValue(options.isOpen), options.container],
    () => {
      if (unmounted || !toValue(options.isOpen) || !options.container.value) {
        stop()
        return
      }
      const root = options.container.value
      if (session && activeRoot === root) return
      stop()
      generation++
      if (!root.hasAttribute('tabindex')) root.tabIndex = -1
      captured = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const trap = createFocusTrap(root, {
        trapStack,
        initialFocus: options.initialFocus,
        fallbackFocus: root,
        delayInitialFocus: false,
        returnFocusOnDeactivate: false,
        preventScroll: true,
        allowOutsideClick: true,
        clickOutsideDeactivates: false,
        isolateSubtrees: false,
        escapeDeactivates(event) {
          event.preventDefault()
          event.stopImmediatePropagation()
          if (toValue(options.canDismiss) ?? true) options.onEscape()
          return false // Closing and return-focus remain owned by the component.
        },
      })
      session = trap
      activeRoot = root
      options.onActivate?.()
      trap.activate()
    },
    { flush: 'post', immediate: true },
  )

  onBeforeUnmount(() => {
    unmounted = true
    stop()
  })
}
