import { type MaybeRefOrGetter, type Ref } from 'vue'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'
import { resolveRestorableFocusTarget } from './sidebarModalFocus'

// Restore the original inert state after the last Sidebar dialog closes.
const inertOwners = new Map<HTMLElement, { count: number; previous: boolean }>()

export function useSidebarOwnedModal(options: {
  isOpen: MaybeRefOrGetter<boolean>
  container: Ref<HTMLElement | null>
  trigger: Ref<HTMLElement | null>
  onEscape: () => void
  canDismiss?: MaybeRefOrGetter<boolean>
}): void {
  let background: HTMLElement | null = null
  useOverlayFocusTrap({
    ...options,
    onActivate() {
      background = document.querySelector<HTMLElement>('[data-app-shell-root]')
      if (!background) return
      const entry = inertOwners.get(background) ?? { count: 0, previous: background.inert }
      entry.count++
      inertOwners.set(background, entry)
      background.inert = true
    },
    onDeactivate() {
      if (!background) return
      const entry = inertOwners.get(background)!
      if (--entry.count === 0) {
        background.inert = entry.previous
        inertOwners.delete(background)
      }
      background = null
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
