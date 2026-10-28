import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  createReducedMotionQuery,
  type MotionQuery,
} from '@renderer/shared/animation/motionPreference'
import { pointReference, startFloatingPosition } from '@renderer/shared/floating/floatingPosition'
import { useOverlayFocusTrap } from '@renderer/shared/focus/useOverlayFocusTrap'
import { animateTrashLid } from '@renderer/shared/animation/motion'
import { resolveRestorableFocusTarget } from '../utils/sidebarModalFocus'
import { useSidebarOwnedModal } from '../utils/useSidebarOwnedModal'
import type { useSidebarPlaylistActions } from './useSidebarPlaylistActions'

type SidebarPlaylistMenus = Pick<
  ReturnType<typeof useSidebarPlaylistActions>,
  | 'createMenu'
  | 'createPlaylistButton'
  | 'smartCreatePanel'
  | 'smartCreateTrigger'
  | 'smartCreateSubmenu'
  | 'playlistContextMenu'
  | 'playlistContextTrigger'
  | 'closeCreateMenu'
  | 'closePlaylistContextMenu'
  | 'deleteError'
  | 'deletingPlaylist'
  | 'isDeletingPlaylist'
  | 'renamingPlaylist'
  | 'sidebarModalTrigger'
  | 'closeRenameDialog'
>

export function useSidebarPlaylistMenus({
  createMenu,
  createPlaylistButton,
  smartCreatePanel,
  smartCreateTrigger,
  smartCreateSubmenu,
  playlistContextMenu,
  playlistContextTrigger,
  closeCreateMenu,
  closePlaylistContextMenu,
  deleteError,
  deletingPlaylist,
  isDeletingPlaylist,
  renamingPlaylist,
  sidebarModalTrigger,
  closeRenameDialog,
}: SidebarPlaylistMenus) {
  const createMenuPanel = ref<HTMLElement | null>(null)
  const playlistContextPanel = ref<HTMLElement | null>(null)
  const playlistContextPositioned = ref(false)
  let playlistPosition: ReturnType<typeof startFloatingPosition> | undefined
  watch(
    playlistContextMenu,
    () => {
      playlistPosition?.dispose()
      playlistContextPositioned.value = false
    },
    { flush: 'sync' },
  )
  watch(
    [playlistContextMenu, playlistContextPanel],
    (_values, _previous, onCleanup) => {
      const menu = playlistContextMenu.value
      const panel = playlistContextPanel.value
      if (!menu || !panel) return
      const session = startFloatingPosition({
        reference: pointReference(menu.x, menu.y),
        floating: panel,
        profile: 'point-menu',
        onPosition: () => {
          playlistContextPositioned.value = true
        },
        onError: closePlaylistContextMenu,
      })
      playlistPosition = session
      onCleanup(session.dispose)
    },
    { flush: 'post' },
  )
  watch(
    [deleteError, deletingPlaylist, isDeletingPlaylist],
    () => {
      void playlistPosition?.update()
    },
    { flush: 'post' },
  )
  const deleteLid = ref<SVGGElement | null>(null)
  let stopDeleteLidAnimation: (() => void) | undefined
  let deleteMotionPreference: MotionQuery | undefined
  function updateDeleteLid(): void {
    stopDeleteLidAnimation?.()
    if (deleteLid.value) {
      stopDeleteLidAnimation = animateTrashLid(
        deleteLid.value,
        deletingPlaylist.value !== null,
        deleteMotionPreference?.matches ?? false,
      )
    }
  }
  watch([deleteLid, deletingPlaylist], updateDeleteLid, { flush: 'post' })
  const renameDialogRef = ref<HTMLElement | null>(null)
  useOverlayFocusTrap({
    isOpen: () => createMenu.value !== null,
    container: createMenuPanel,
    onEscape() {
      if (smartCreateSubmenu.value && smartCreatePanel.value?.contains(document.activeElement)) {
        smartCreateSubmenu.value = false
        smartCreateTrigger.value?.focus()
      } else closeCreateMenu()
    },
    restoreFocus: (captured) =>
      (
        resolveRestorableFocusTarget(captured) ??
        resolveRestorableFocusTarget(createPlaylistButton.value)
      )?.focus(),
  })
  useOverlayFocusTrap({
    isOpen: () => playlistContextMenu.value !== null && playlistContextPositioned.value,
    container: playlistContextPanel,
    onEscape: closePlaylistContextMenu,
    restoreFocus: () =>
      (
        resolveRestorableFocusTarget(playlistContextTrigger.value) ??
        resolveRestorableFocusTarget(createPlaylistButton.value)
      )?.focus(),
  })
  useSidebarOwnedModal({
    isOpen: () => renamingPlaylist.value !== null,
    container: renameDialogRef,
    trigger: sidebarModalTrigger,
    onEscape: closeRenameDialog,
  })
  onMounted(() => {
    deleteMotionPreference = createReducedMotionQuery()
    deleteMotionPreference.addEventListener('change', updateDeleteLid)
  })
  onBeforeUnmount(() => {
    playlistPosition?.dispose()
    stopDeleteLidAnimation?.()
    deleteMotionPreference?.removeEventListener('change', updateDeleteLid)
  })
  return { createMenuPanel, playlistContextPanel, deleteLid, renameDialogRef }
}
