import { nextTick, onBeforeUnmount, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import {
  getSidebarModalFocusables,
  resolveRestorableFocusTarget,
  resolveSidebarModalKeyAction,
} from './sidebarModalFocus'

const APP_SHELL_ROOT = '[data-app-shell-root]'

export function useSidebarOwnedModal(options: {
  isOpen: MaybeRefOrGetter<boolean>
  container: Ref<HTMLElement | null>
  trigger: Ref<HTMLElement | null>
  onEscape: () => void
  canDismiss?: MaybeRefOrGetter<boolean>
}): void {
  let attached = false

  function setBackgroundInert(inert: boolean): void {
    const root = document.querySelector<HTMLElement>(APP_SHELL_ROOT)
    if (root) root.inert = inert
  }

  function restoreTriggerFocus(): void {
    const fallback = document.querySelector<HTMLElement>('.app-sidebar .smart-playlist-add-button')
    const target = resolveRestorableFocusTarget(options.trigger.value) ?? fallback
    options.trigger.value = null
    target?.focus()
  }

  function onKeydown(event: KeyboardEvent): void {
    if (!toValue(options.isOpen)) return
    const container = options.container.value
    if (!container) return

    const focusables = getSidebarModalFocusables(container)
    const active = document.activeElement
    const activeIndex = active instanceof HTMLElement ? focusables.indexOf(active) : -1
    const action = resolveSidebarModalKeyAction({
      key: event.key,
      shiftKey: event.shiftKey,
      canDismiss: toValue(options.canDismiss) ?? true,
      focusableCount: focusables.length,
      activeIndex,
    })

    if (action.type === 'none') return

    event.preventDefault()
    event.stopPropagation()
    if (action.type === 'dismiss') {
      options.onEscape()
      return
    }
    focusables[action.nextIndex]?.focus()
  }

  watch(
    () => toValue(options.isOpen),
    async (open) => {
      if (open) {
        attached = true
        document.addEventListener('keydown', onKeydown, true)
        setBackgroundInert(true)
        return
      }

      if (!attached) return
      attached = false
      document.removeEventListener('keydown', onKeydown, true)
      setBackgroundInert(false)
      await nextTick()
      restoreTriggerFocus()
    },
  )

  onBeforeUnmount(() => {
    if (!attached) return
    attached = false
    document.removeEventListener('keydown', onKeydown, true)
    setBackgroundInert(false)
    restoreTriggerFocus()
  })
}
