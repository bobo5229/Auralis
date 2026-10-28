import { type MaybeRefOrGetter, type Ref } from 'vue'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'
import { resolveRestorableFocusTarget } from './sidebarModalFocus'
import { acquireModalBackground } from '@renderer/shared/focus/modalBackground'

export function useSidebarOwnedModal(options: {
  isOpen: MaybeRefOrGetter<boolean>
  container: Ref<HTMLElement | null>
  trigger: Ref<HTMLElement | null>
  onEscape: () => void
  canDismiss?: MaybeRefOrGetter<boolean>
}): void {
  let releaseBackground: (() => void) | undefined
  useOverlayFocusTrap({
    ...options,
    onActivate() {
      releaseBackground = acquireModalBackground()
    },
    onDeactivate() {
      releaseBackground?.()
      releaseBackground = undefined
    },
    restoreFocus() {
      const fallback = document.querySelector<HTMLElement>(
        '.app-sidebar .smart-playlist-add-button',
      )
      const target =
        resolveRestorableFocusTarget(options.trigger.value) ??
        resolveRestorableFocusTarget(fallback)
      options.trigger.value = null
      target?.focus()
    },
  })
}
