import { computed, ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import type { LibraryAlbumGroup } from '../types/libraryAlbumGroup'
import type {
  LibraryContextMenuAnchor,
  LibraryContextMenuSource,
  LibraryContextMenuState,
} from '../types/libraryInteraction'
import type { LibraryMetadataFocusTarget } from './useLibraryMetadataEditor'
import { LIBRARY_PLAYLISTS_CHANGED_EVENT } from '../utils/libraryRouteScope'

export function useLibraryContextMenu(options: {
  tracks: { readonly value: TrackListItem[] }
  isScopedPlaylist: () => boolean
  getTrackById: (trackId: number) => TrackListItem | null
  getAlbumGroupByTrackId: (trackId: number) => LibraryAlbumGroup | null
  currentTrackId: () => number | null
  onTrackActivated: (trackId: number) => void
  playTrackFromQueue: (
    queue: TrackListItem[],
    trackId: number,
    playOptions?: { shufflePool?: TrackListItem[] },
  ) => void | Promise<void>
  insertTrackAfterCurrent: (track: TrackListItem) => void
  insertTracksAfterCurrent: (tracks: TrackListItem[]) => void
  scrollToTrackById: (trackId: number) => Promise<void>
  openMetadataEditor: (trackId: number) => void | Promise<void>
  setMetadataReturnTarget: (target: LibraryMetadataFocusTarget) => void
  setViewSwitchReturnTarget: (target: LibraryMetadataFocusTarget) => void
  restoreFocus: (target: LibraryMetadataFocusTarget, scroll: boolean) => Promise<void>
  t: (key: string, values?: Record<string, unknown>) => string
  listSidebarItems: () => Promise<SidebarPlaylistItem[]>
  createPlaylist: () => Promise<{ id: number; name: string }>
  addTracksToPlaylist: (playlistId: number, trackIds: number[]) => Promise<unknown>
  getLibraryRoots: () => Promise<ReadonlyArray<{ id: number }>>
  startLibraryScan: (rootId: number) => Promise<unknown>
}) {
  const contextMenu = ref<LibraryContextMenuState | null>(null)
  const isStartingLibraryRefresh = ref(false)
  const regularPlaylistItems = ref<SidebarPlaylistItem[]>([])
  const addToPlaylistFeedback = ref<{ playlistId: number; message: string } | null>(null)
  const isCreatingPlaylistFromMenu = ref(false)
  const playlistLoading = ref(false)
  const playlistLoadError = ref<string | null>(null)
  let addToPlaylistFeedbackTimer: number | null = null

  const contextMenuAnchor = computed<LibraryContextMenuAnchor>(() => ({
    clientX: contextMenu.value?.anchor.clientX ?? 0,
    clientY: contextMenu.value?.anchor.clientY ?? 0,
    returnFocusTrackId: contextMenu.value?.anchor.returnFocusTrackId ?? null,
    openReason: contextMenu.value?.anchor.openReason ?? 'pointer',
  }))

  const contextMenuTrackTitle = computed(() => {
    if (!contextMenu.value) return ''
    const track = options.getTrackById(contextMenu.value.trackId)
    return track?.title || options.t('library.manuscript.missing.title')
  })

  const contextMenuAlbumTitle = computed(() => {
    if (!contextMenu.value) return ''
    const track = options.getTrackById(contextMenu.value.trackId)
    return track?.album || options.t('library.manuscript.missing.album')
  })

  function clearAddToPlaylistFeedback(): void {
    if (addToPlaylistFeedbackTimer !== null) {
      window.clearTimeout(addToPlaylistFeedbackTimer)
      addToPlaylistFeedbackTimer = null
    }
    addToPlaylistFeedback.value = null
  }

  function closeContextMenu(handoffTarget?: 'metadata-dialog' | 'view-switch'): void {
    if (!contextMenu.value) return

    const target: LibraryMetadataFocusTarget = {
      trackId: contextMenu.value.trackId,
      source: contextMenu.value.source,
      openReason: contextMenu.value.anchor.openReason,
    }

    contextMenu.value = null
    clearAddToPlaylistFeedback()

    if (handoffTarget === 'metadata-dialog') {
      options.setMetadataReturnTarget(target)
    } else if (handoffTarget === 'view-switch') {
      options.setViewSwitchReturnTarget(target)
    } else {
      void options.restoreFocus(target, target.openReason !== 'pointer')
    }
  }

  async function loadRegularPlaylistItems(): Promise<void> {
    playlistLoading.value = true
    playlistLoadError.value = null
    try {
      const items = await options.listSidebarItems()
      regularPlaylistItems.value = items.filter((item) => item.kind === 'playlist')
    } catch (error) {
      rendererDiagnostics.error({
        scope: 'library.context-menu',
        message: 'Failed to load playlists',
        cause: error,
      })
      playlistLoadError.value =
        error instanceof Error ? error.message : options.t('library.contextMenu.playlistLoadError')
    } finally {
      playlistLoading.value = false
    }
  }

  function onOpenContextMenu(
    trackId: number,
    event: MouseEvent,
    source: LibraryContextMenuSource = 'track',
    openReason: 'pointer' | 'keyboard' = 'pointer',
  ): void {
    options.onTrackActivated(trackId)
    contextMenu.value = {
      trackId,
      source,
      anchor: {
        clientX: event.clientX,
        clientY: event.clientY,
        returnFocusTrackId: trackId,
        openReason,
      },
    }
    void loadRegularPlaylistItems()
  }

  function onOpenAlbumArtworkContextMenu(
    anchorTrackId: number,
    event: MouseEvent,
    openReason: 'pointer' | 'keyboard' = 'pointer',
  ): void {
    onOpenContextMenu(anchorTrackId, event, 'album-artwork', openReason)
  }

  function getContextMenuTrackIds(): number[] {
    if (!contextMenu.value) return []

    if (contextMenu.value.source === 'album-artwork') {
      const group = options.getAlbumGroupByTrackId(contextMenu.value.trackId)
      return group?.tracks.map((track) => track.id) ?? []
    }

    return [contextMenu.value.trackId]
  }

  function getShufflePool(): TrackListItem[] | undefined {
    return options.isScopedPlaylist() ? options.tracks.value : undefined
  }

  async function onPlayContextTrack(trackId: number): Promise<void> {
    closeContextMenu()
    await options.playTrackFromQueue(options.tracks.value, trackId, {
      shufflePool: getShufflePool(),
    })
  }

  function onInsertAfterCurrent(trackId: number): void {
    closeContextMenu()
    const track = options.getTrackById(trackId)
    if (!track) return
    options.insertTrackAfterCurrent(track)
  }

  function onInsertAlbumAfterCurrent(trackId: number): void {
    closeContextMenu()
    const group = options.getAlbumGroupByTrackId(trackId)
    if (!group) return
    options.insertTracksAfterCurrent(group.tracks)
  }

  function onPlayAlbum(trackId: number): void {
    closeContextMenu()
    const group = options.getAlbumGroupByTrackId(trackId)
    if (!group || group.tracks.length === 0) return
    void options.playTrackFromQueue(group.tracks, group.tracks[0].id, {
      shufflePool: getShufflePool(),
    })
  }

  function onContextMenuPlay(): void {
    if (!contextMenu.value) return
    if (contextMenu.value.source === 'album-artwork') {
      onPlayAlbum(contextMenu.value.trackId)
    } else {
      void onPlayContextTrack(contextMenu.value.trackId)
    }
  }

  function onContextMenuInsert(): void {
    if (!contextMenu.value) return
    if (contextMenu.value.source === 'album-artwork') {
      onInsertAlbumAfterCurrent(contextMenu.value.trackId)
    } else {
      onInsertAfterCurrent(contextMenu.value.trackId)
    }
  }

  function onEditMetadataFromContextMenu(): void {
    if (!contextMenu.value) return
    const trackId = contextMenu.value.trackId
    closeContextMenu('metadata-dialog')
    void options.openMetadataEditor(trackId)
  }

  async function onLocateCurrentTrack(): Promise<void> {
    closeContextMenu()
    const currentTrackId = options.currentTrackId()
    if (!currentTrackId) return
    await options.scrollToTrackById(currentTrackId)
  }

  async function addContextTracksToPlaylist(
    playlistId: number,
    playlistName: string,
    trackIds: number[],
  ): Promise<void> {
    await options.addTracksToPlaylist(playlistId, trackIds)
    window.dispatchEvent(new CustomEvent(LIBRARY_PLAYLISTS_CHANGED_EVENT))
    addToPlaylistFeedback.value = {
      playlistId,
      message: options.t('library.contextMenu.addedSuccess', { name: playlistName }),
    }

    if (addToPlaylistFeedbackTimer !== null) {
      window.clearTimeout(addToPlaylistFeedbackTimer)
    }
    addToPlaylistFeedbackTimer = window.setTimeout(() => {
      addToPlaylistFeedbackTimer = null
      closeContextMenu()
    }, 1200)
  }

  async function onAddContextTracksToPlaylist(playlist: SidebarPlaylistItem): Promise<void> {
    const trackIds = getContextMenuTrackIds()
    if (trackIds.length === 0) return
    await addContextTracksToPlaylist(playlist.id, playlist.name, trackIds)
  }

  async function onCreatePlaylistAndAddContextTracks(): Promise<void> {
    if (isCreatingPlaylistFromMenu.value) return

    const trackIds = getContextMenuTrackIds()
    if (trackIds.length === 0) return

    isCreatingPlaylistFromMenu.value = true
    try {
      const playlist = await options.createPlaylist()
      await addContextTracksToPlaylist(playlist.id, playlist.name, trackIds)
      await loadRegularPlaylistItems()
    } finally {
      isCreatingPlaylistFromMenu.value = false
    }
  }

  async function onRefreshLibrary(): Promise<void> {
    if (isStartingLibraryRefresh.value) return

    closeContextMenu()
    isStartingLibraryRefresh.value = true

    try {
      const roots = await options.getLibraryRoots()
      const activeRoot = roots[0]
      if (!activeRoot) return
      await options.startLibraryScan(activeRoot.id)
    } finally {
      isStartingLibraryRefresh.value = false
    }
  }

  function dispose(): void {
    clearAddToPlaylistFeedback()
  }

  return {
    contextMenu,
    contextMenuAnchor,
    contextMenuTrackTitle,
    contextMenuAlbumTitle,
    regularPlaylistItems,
    addToPlaylistFeedback,
    playlistLoading,
    playlistLoadError,
    isCreatingPlaylistFromMenu,
    isStartingLibraryRefresh,
    closeContextMenu,
    onOpenContextMenu,
    onOpenAlbumArtworkContextMenu,
    onContextMenuPlay,
    onContextMenuInsert,
    onEditMetadataFromContextMenu,
    onLocateCurrentTrack,
    onAddContextTracksToPlaylist,
    onCreatePlaylistAndAddContextTracks,
    onRefreshLibrary,
    loadRegularPlaylistItems,
    dispose,
  }
}
