import { computed, nextTick, ref, type Ref } from 'vue'
import type { Router, RouteLocationNormalizedLoaded } from 'vue-router'
import type { AuralisApi } from '@shared/ipc/api'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import { DEFAULT_RECENT_PLAYED_DAYS } from '@shared/smartPlaylists/recentFrequent'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { resolveRestorableFocusTarget } from '../utils/sidebarModalFocus'

interface SidebarPlaylistActionsOptions {
  api: {
    playlists: Pick<AuralisApi['playlists'], 'create' | 'rename' | 'delete'>
    smartPlaylists: Pick<AuralisApi['smartPlaylists'], 'create' | 'rename' | 'delete'>
  }
  route: Pick<RouteLocationNormalizedLoaded, 'path'>
  router: Pick<Router, 'push'>
  t: (key: string) => string
  playlistItems: Ref<SidebarPlaylistItem[]>
  reloadPlaylists: () => Promise<void>
  cancelReorder: (immediate?: boolean) => void
  canMove: (item: SidebarPlaylistItem, direction: -1 | 1) => boolean
  move: (item: SidebarPlaylistItem, direction: -1 | 1) => void
  closeRecentAddedContextMenu: () => void
  getPlaylistKey: (item: SidebarPlaylistItem) => string
  getPlaylistPath: (item: SidebarPlaylistItem) => string
  onMenuKeydown: (event: KeyboardEvent) => void
}

/** Operation state only; the sidebar retains positioning, focus traps and lifecycle effects. */
export function useSidebarPlaylistActions({
  api: auralis,
  route,
  router,
  t,
  playlistItems,
  reloadPlaylists: loadSidebarPlaylists,
  cancelReorder: cancelPlaylistReorder,
  canMove: canMovePlaylist,
  move: movePlaylist,
  closeRecentAddedContextMenu,
  getPlaylistKey,
  getPlaylistPath,
  onMenuKeydown,
}: SidebarPlaylistActionsOptions) {
  const createPlaylistButton = ref<HTMLButtonElement | null>(null)
  const createMenu = ref<{ x: number; y: number } | null>(null)
  const smartCreateTrigger = ref<HTMLButtonElement | null>(null)
  const smartCreatePanel = ref<HTMLElement | null>(null)
  const smartCreateSubmenu = ref(false)
  const creatingPlaybackPreset = ref<'recentPlayed' | 'mostListened' | null>(null)
  const createError = ref('')
  const creatingRegularPlaylist = ref(false)
  let createdRegularPlaylistId: number | null = null
  const playlistContextMenu = ref<{ item: SidebarPlaylistItem; x: number; y: number } | null>(null)
  const playlistContextIndex = computed(() => {
    const item = playlistContextMenu.value?.item
    if (!item) return -1
    return playlistItems.value.findIndex(
      (candidate) => getPlaylistKey(candidate) === getPlaylistKey(item),
    )
  })
  const playlistContextHasPrevious = computed(() => playlistContextIndex.value > 0)
  const playlistContextHasNext = computed(
    () =>
      playlistContextIndex.value >= 0 &&
      playlistContextIndex.value < playlistItems.value.length - 1,
  )
  const playlistContextTrigger = ref<HTMLElement | null>(null)
  const renamingPlaylist = ref<SidebarPlaylistItem | null>(null)
  const deletingPlaylist = ref<SidebarPlaylistItem | null>(null)
  const isDeletingPlaylist = ref(false)
  const deleteError = ref('')
  const renameValue = ref('')
  const renameError = ref('')
  const isSavingRename = ref(false)
  let renameSession = 0
  const renameInput = ref<HTMLInputElement | null>(null)
  const isBuilderOpen = ref(false)
  const sidebarModalTrigger = ref<HTMLElement | null>(null)

  function rememberSidebarModalTrigger(preferred?: HTMLElement | null): void {
    sidebarModalTrigger.value =
      resolveRestorableFocusTarget(preferred ?? null) ??
      resolveRestorableFocusTarget(
        document.activeElement instanceof HTMLElement ? document.activeElement : null,
      )
  }

  function playlistRowElement(item: SidebarPlaylistItem): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      `[data-sidebar-playlist-key="${CSS.escape(getPlaylistKey(item))}"]`,
    )
  }

  function openCreateMenu(): void {
    if (!createPlaylistButton.value) return
    closePlaylistContextMenu()
    closeRecentAddedContextMenu()
    smartCreateSubmenu.value = false
    createError.value = ''
    if (!creatingRegularPlaylist.value) createdRegularPlaylistId = null
    const rect = createPlaylistButton.value.getBoundingClientRect()
    createMenu.value = {
      x: Math.max(8, Math.min(rect.right - 190, window.innerWidth - 198)),
      y: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 220)),
    }
  }

  function closeCreateMenu(): void {
    smartCreateSubmenu.value = false
    createMenu.value = null
  }

  function openSmartCreateSubmenu(): void {
    smartCreateSubmenu.value = true
  }

  function toggleSmartCreateSubmenu(): void {
    smartCreateSubmenu.value = !smartCreateSubmenu.value
  }

  async function enterSmartCreateSubmenu(): Promise<void> {
    openSmartCreateSubmenu()
    await nextTick()
    smartCreatePanel.value?.querySelector<HTMLButtonElement>('button')?.focus()
  }

  function onSmartCreateSubmenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' || event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      smartCreateTrigger.value?.focus()
      smartCreateSubmenu.value = false
    } else {
      onMenuKeydown(event)
    }
  }

  async function createPlaybackPreset(preset: 'recentPlayed' | 'mostListened'): Promise<void> {
    if (creatingPlaybackPreset.value) return
    creatingPlaybackPreset.value = preset
    createError.value = ''
    try {
      const { playlist } = await auralis.smartPlaylists.create(
        t(preset === 'recentPlayed' ? 'sidebar.recentPlayed' : 'sidebar.mostListened'),
        preset === 'recentPlayed' ? { preset, days: DEFAULT_RECENT_PLAYED_DAYS } : { preset },
      )
      await loadSidebarPlaylists()
      window.dispatchEvent(new CustomEvent('auralis-playlists-changed'))
      closeCreateMenu()
      await router.push(`/smart-playlists/${playlist.id}`)
    } catch (cause) {
      createError.value = 'sidebar.createPlaylistFailed'
      rendererDiagnostics.warn({
        scope: 'sidebar.create-playlist',
        message: 'Failed to create playback preset playlist',
        cause,
      })
    } finally {
      creatingPlaybackPreset.value = null
    }
  }

  async function createRegularPlaylist(): Promise<void> {
    if (creatingRegularPlaylist.value) return
    const menu = createMenu.value
    creatingRegularPlaylist.value = true
    createError.value = ''
    try {
      // Retry a failed refresh/navigation without creating another playlist.
      if (createdRegularPlaylistId === null) {
        createdRegularPlaylistId = (await auralis.playlists.create()).id
      }
      await loadSidebarPlaylists()
      window.dispatchEvent(new CustomEvent('auralis-playlists-changed'))
      await router.push(`/playlists/${createdRegularPlaylistId}`)
      createdRegularPlaylistId = null
      if (createMenu.value === menu) closeCreateMenu()
    } catch (cause) {
      if (createMenu.value === menu) createError.value = 'sidebar.createPlaylistFailed'
      rendererDiagnostics.warn({
        scope: 'sidebar.create-playlist',
        message: 'Failed to create or open regular playlist',
        cause,
      })
    } finally {
      creatingRegularPlaylist.value = false
    }
  }

  function openSmartPlaylistBuilder(): void {
    rememberSidebarModalTrigger(
      document.querySelector<HTMLElement>('.app-sidebar .smart-playlist-add-button'),
    )
    closeCreateMenu()
    isBuilderOpen.value = true
  }

  function openPlaylistContextMenu(item: SidebarPlaylistItem, event: MouseEvent): void {
    cancelPlaylistReorder(true)
    closeCreateMenu()
    closeRecentAddedContextMenu()
    playlistContextTrigger.value = playlistRowElement(item)
    deletingPlaylist.value = null
    deleteError.value = ''
    playlistContextMenu.value = {
      item,
      x: event.clientX,
      y: event.clientY,
    }
  }

  function closePlaylistContextMenu(): void {
    deletingPlaylist.value = null
    deleteError.value = ''
    playlistContextMenu.value = null
  }

  function movePlaylistFromMenu(direction: -1 | 1): void {
    const item = playlistContextMenu.value?.item
    if (!item || !canMovePlaylist(item, direction)) return
    closePlaylistContextMenu()
    movePlaylist(item, direction)
  }

  function cancelDeleteOnOtherClick(event: MouseEvent): void {
    if (!(event.target as Element).closest('[data-delete-playlist]')) {
      deletingPlaylist.value = null
      deleteError.value = ''
    }
  }

  async function openRenameDialog(): Promise<void> {
    if (!playlistContextMenu.value) return
    const item = playlistContextMenu.value.item
    renameSession++
    isSavingRename.value = false
    rememberSidebarModalTrigger(playlistRowElement(item))
    renamingPlaylist.value = item
    renameValue.value = item.name
    renameError.value = ''
    closePlaylistContextMenu()
    await nextTick()
    renameInput.value?.select()
  }

  function closeRenameDialog(): void {
    renameSession++
    isSavingRename.value = false
    renamingPlaylist.value = null
    renameError.value = ''
  }

  async function submitRename(): Promise<void> {
    if (!renamingPlaylist.value || isSavingRename.value) return
    if (!renameValue.value.trim()) {
      renameError.value = 'sidebar.playlistNameRequired'
      return
    }

    const item = renamingPlaylist.value
    const name = renameValue.value
    const session = renameSession
    isSavingRename.value = true
    renameError.value = ''
    try {
      const renamed =
        item.kind === 'playlist'
          ? await auralis.playlists.rename(item.id, name)
          : await auralis.smartPlaylists.rename(item.id, name)
      if (renamed) {
        window.dispatchEvent(
          new CustomEvent(
            item.kind === 'playlist'
              ? 'auralis-playlists-changed'
              : 'auralis-smart-playlists-changed',
          ),
        )
        await loadSidebarPlaylists()
      }
      if (session === renameSession) closeRenameDialog()
    } catch (cause) {
      rendererDiagnostics.warn({
        scope: 'sidebar.rename-playlist',
        message: 'Failed to rename playlist',
        cause,
      })
      if (session === renameSession) renameError.value = 'sidebar.renameFailed'
    } finally {
      if (session === renameSession) isSavingRename.value = false
    }
  }

  async function requestDelete(): Promise<void> {
    if (!playlistContextMenu.value || isDeletingPlaylist.value) return
    const item = playlistContextMenu.value.item
    if (deletingPlaylist.value && getPlaylistKey(deletingPlaylist.value) === getPlaylistKey(item)) {
      await confirmDelete()
      return
    }
    deletingPlaylist.value = item
    deleteError.value = ''
  }

  async function confirmDelete(): Promise<void> {
    if (!deletingPlaylist.value || isDeletingPlaylist.value) return
    const deleting = deletingPlaylist.value
    const menu = playlistContextMenu.value
    isDeletingPlaylist.value = true
    try {
      const result =
        deleting.kind === 'playlist'
          ? await auralis.playlists.delete(deleting.id)
          : await auralis.smartPlaylists.delete(deleting.id)

      if (result.deleted) {
        playlistItems.value = playlistItems.value.filter(
          (item) => getPlaylistKey(item) !== getPlaylistKey(deleting),
        )
        window.dispatchEvent(
          new CustomEvent(
            deleting.kind === 'playlist'
              ? 'auralis-playlists-changed'
              : 'auralis-smart-playlists-changed',
          ),
        )
        if (route.path === getPlaylistPath(deleting)) {
          await router.push('/songs')
        }
      }

      if (playlistContextMenu.value === menu) closePlaylistContextMenu()
    } catch (cause) {
      rendererDiagnostics.warn({
        scope: 'sidebar.delete-playlist',
        message: 'Failed to delete playlist',
        cause,
      })
      if (playlistContextMenu.value === menu) {
        deletingPlaylist.value = null
        deleteError.value = 'sidebar.deleteFailed'
      }
    } finally {
      isDeletingPlaylist.value = false
    }
  }

  return {
    createPlaylistButton,
    createMenu,
    smartCreateTrigger,
    smartCreatePanel,
    smartCreateSubmenu,
    creatingPlaybackPreset,
    createError,
    creatingRegularPlaylist,
    playlistContextMenu,
    playlistContextHasPrevious,
    playlistContextHasNext,
    playlistContextTrigger,
    renamingPlaylist,
    deletingPlaylist,
    isDeletingPlaylist,
    deleteError,
    renameValue,
    renameError,
    isSavingRename,
    renameInput,
    isBuilderOpen,
    sidebarModalTrigger,
    openCreateMenu,
    closeCreateMenu,
    toggleSmartCreateSubmenu,
    enterSmartCreateSubmenu,
    onSmartCreateSubmenuKeydown,
    createPlaybackPreset,
    createRegularPlaylist,
    openSmartPlaylistBuilder,
    openPlaylistContextMenu,
    closePlaylistContextMenu,
    movePlaylistFromMenu,
    cancelDeleteOnOtherClick,
    openRenameDialog,
    closeRenameDialog,
    submitRename,
    requestDelete,
  }
}
