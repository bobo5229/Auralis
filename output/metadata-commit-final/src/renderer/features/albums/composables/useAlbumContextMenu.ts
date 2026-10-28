import { nextTick, ref, watch, type Ref } from 'vue'
import type { AuralisApi } from '@shared/ipc/api'
import type { AlbumSummary } from '../types'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { resolveMenuNavigationIndex } from '@renderer/shared/menu/menuKeyboardNavigation'

interface AlbumContextMenuState {
  album: AlbumSummary
  x: number
  y: number
}

export function useAlbumContextMenu({
  hasCurrentTrack,
  revealInExplorer,
  t,
}: {
  hasCurrentTrack: Readonly<Ref<boolean>>
  revealInExplorer: AuralisApi['library']['revealInExplorer']
  t: (key: string) => string
}) {
  const contextMenu = ref<AlbumContextMenuState | null>(null)

  const contextMenuRef = ref<HTMLElement | null>(null)

  const revealFeedback = ref<string | null>(null)

  let revealInFlight = false

  let revealGeneration = 0

  let contextMenuTrigger: HTMLElement | null = null

  function closeContextMenu(): void {
    if (contextMenuRef.value?.contains(document.activeElement) && contextMenuTrigger?.isConnected) {
      contextMenuTrigger.focus({ preventScroll: true })
    }
    cancelAlbumReveal()
    contextMenu.value = null
  }

  function cancelAlbumReveal(): void {
    revealGeneration++
    revealFeedback.value = null
    revealInFlight = false
  }

  function clampContextMenu(menu: AlbumContextMenuState): void {
    const element = contextMenuRef.value
    if (!element || contextMenu.value !== menu) return
    const bounds = element.getBoundingClientRect()
    menu.x = Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - 8))
    menu.y = Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8))
  }

  watch(hasCurrentTrack, async (available) => {
    const menu = contextMenu.value
    if (!menu) return
    const focusedElement = document.activeElement
    const focusedAction =
      focusedElement instanceof HTMLElement && contextMenuRef.value?.contains(focusedElement)
        ? focusedElement.dataset.albumMenuAction
        : undefined
    const restoreFocus = !available && (focusedAction === 'locate' || focusedAction === 'insert')
    await nextTick()
    if (contextMenu.value !== menu || hasCurrentTrack.value !== available) return
    clampContextMenu(menu)
    if (restoreFocus) {
      contextMenuRef.value
        ?.querySelector<HTMLButtonElement>('[data-album-menu-action="play"]')
        ?.focus()
    }
  })

  function onContextMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      closeContextMenu()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.stopPropagation()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(
      contextMenuRef.value?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [],
    )
    if (!items.length) return
    event.preventDefault()
    event.stopPropagation()
    const focusedAction =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.albumMenuAction
        : undefined
    const current = items.findIndex((item) => item.dataset.albumMenuAction === focusedAction)
    const next = resolveMenuNavigationIndex(
      event.key,
      current,
      items.map((_, index) => index),
    )
    if (next !== null) items[next]?.focus()
  }

  function openContextMenu(album: AlbumSummary, event: MouseEvent): void {
    contextMenuTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
    cancelAlbumReveal()

    contextMenu.value = {
      album,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 8)),
    }
    const menu = contextMenu.value
    void nextTick(() => {
      const element = contextMenuRef.value
      if (!element || contextMenu.value !== menu) return
      clampContextMenu(menu)
      element.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    })
  }

  async function revealContextAlbumInExplorer(): Promise<void> {
    const menu = contextMenu.value
    if (!menu || revealInFlight) return
    const generation = ++revealGeneration
    const trackIds = menu.album.tracks.map((track) => track.id)
    revealFeedback.value = null
    revealInFlight = true
    try {
      if (trackIds.length === 0) {
        if (generation !== revealGeneration || contextMenu.value !== menu) return
        revealFeedback.value = t('library.contextMenu.reveal.not-found')
      } else {
        const result = await revealInExplorer({ trackIds })
        if (generation !== revealGeneration || contextMenu.value !== menu) return
        if (result.ok) {
          closeContextMenu()
          return
        }
        revealFeedback.value = t(`library.contextMenu.reveal.${result.reason}`)
      }
    } catch (error) {
      rendererDiagnostics.error({
        scope: 'albums.context-menu',
        message: 'Failed to reveal album in Explorer',
        cause: error,
      })
      if (generation !== revealGeneration || contextMenu.value !== menu) return
      revealFeedback.value = t('library.contextMenu.reveal.reveal-failed')
    } finally {
      if (generation === revealGeneration) revealInFlight = false
    }
    await nextTick()
    if (generation !== revealGeneration || contextMenu.value !== menu) return
    clampContextMenu(menu)
  }
  function deactivate() {
    closeContextMenu()
    contextMenuTrigger = null
  }
  return {
    contextMenu,
    contextMenuRef,
    revealFeedback,
    closeContextMenu,
    onContextMenuKeydown,
    openContextMenu,
    revealContextAlbumInExplorer,
    deactivate,
  }
}
