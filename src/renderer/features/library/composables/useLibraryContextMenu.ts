import { computed, ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { AddPlaylistTracksResult, SidebarPlaylistItem } from '@shared/types/playlist'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import type { LibraryAlbumGroup } from '../types/libraryAlbumGroup'
import type {
  LibraryContextMenuAnchor,
  LibraryContextMenuSource,
  LibraryContextMenuState,
  LibraryPlaylistFeedback,
  LibraryRevealFeedback,
  LibraryRevealRequest,
} from '../types/libraryInteraction'
import type { LibraryMetadataFocusTarget } from './useLibraryMetadataEditor'

export function useLibraryContextMenu(options: {
  tracks: { readonly value: TrackListItem[] }
  isScopedPlaylist: () => boolean
  getTrackById: (trackId: number) => TrackListItem | null
  getAlbumGroupByTrackId: (trackId: number) => LibraryAlbumGroup | null
  currentTrackId: () => number | null
  selectedTrackId: () => number | null
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
  addTracksToPlaylist: (playlistId: number, trackIds: number[]) => Promise<AddPlaylistTracksResult>
  revealInExplorer: LibraryRevealRequest
}) {
  const contextMenu = ref<LibraryContextMenuState | null>(null)
  // 菜单选中态只在菜单打开期间生效，不写入播放器的持久选择。
  const contextSelectedTrackId = computed(() =>
    contextMenu.value?.source === 'track' && contextMenu.value.trackId !== options.selectedTrackId()
      ? contextMenu.value.trackId
      : null,
  )
  const contextSelectedAlbumKey = computed(() =>
    contextMenu.value?.source === 'album-artwork'
      ? (options.getAlbumGroupByTrackId(contextMenu.value.trackId)?.key ?? null)
      : null,
  )
  const highlightedTrackId = computed(
    () => contextSelectedTrackId.value ?? options.selectedTrackId(),
  )
  const regularPlaylistItems = ref<SidebarPlaylistItem[]>([])
  const feedbackSource = ref<{
    playlistId: number | null
    name: string
    kind: LibraryPlaylistFeedback['kind']
    key: string
    count?: number
    unavailable?: number
  } | null>(null)
  const revealFeedback = ref<LibraryRevealFeedback | null>(null)
  const addToPlaylistFeedback = computed<LibraryPlaylistFeedback | null>(() =>
    feedbackSource.value
      ? {
          playlistId: feedbackSource.value.playlistId,
          kind: feedbackSource.value.kind,
          message: options.t(`library.contextMenu.${feedbackSource.value.key}`, {
            name: feedbackSource.value.name,
            count: feedbackSource.value.count,
            unavailable: feedbackSource.value.unavailable,
          }),
        }
      : null,
  )
  const isCreatingPlaylistFromMenu = ref(false)
  const playlistLoading = ref(false)
  const playlistLoadFailed = ref(false)
  const playlistLoadError = computed(() =>
    playlistLoadFailed.value ? options.t('library.contextMenu.playlistLoadError') : null,
  )
  let addToPlaylistFeedbackTimer: number | null = null
  let disposed = false
  let playlistLoadRevision = 0
  let playlistOperationRevision = 0
  let revealRevision = 0
  let revealInFlight = false

  function ownsMenu(origin: LibraryContextMenuState | null): boolean {
    return !disposed && origin !== null && contextMenu.value === origin
  }

  const contextMenuAnchor = computed<LibraryContextMenuAnchor>(() => ({
    clientX: contextMenu.value?.anchor.clientX ?? 0,
    clientY: contextMenu.value?.anchor.clientY ?? 0,
    returnFocusTrackId: contextMenu.value?.anchor.returnFocusTrackId ?? null,
    openReason: contextMenu.value?.anchor.openReason ?? 'pointer',
  }))

  const contextMenuTrackTitle = computed(() => {
    if (!contextMenu.value) return ''
    const track = options.getTrackById(contextMenu.value.trackId)
    return track?.title || options.t('library.missing.title')
  })

  const contextMenuAlbumTitle = computed(() => {
    if (!contextMenu.value) return ''
    const track = options.getTrackById(contextMenu.value.trackId)
    return track?.album || options.t('library.missing.album')
  })

  function clearAddToPlaylistFeedback(): void {
    if (addToPlaylistFeedbackTimer !== null) {
      window.clearTimeout(addToPlaylistFeedbackTimer)
      addToPlaylistFeedbackTimer = null
    }
    feedbackSource.value = null
  }

  function invalidateReveal(): void {
    revealRevision++
    revealFeedback.value = null
    revealInFlight = false
  }

  function closeContextMenu(handoffTarget?: 'metadata-dialog' | 'view-switch'): void {
    clearAddToPlaylistFeedback()
    invalidateReveal()
    playlistOperationRevision++
    playlistLoadRevision++
    playlistLoading.value = false
    isCreatingPlaylistFromMenu.value = false
    if (!contextMenu.value) return

    const target: LibraryMetadataFocusTarget = {
      trackId: contextMenu.value.trackId,
      source: contextMenu.value.source,
      openReason: contextMenu.value.anchor.openReason,
    }

    contextMenu.value = null

    if (handoffTarget === 'metadata-dialog') {
      options.setMetadataReturnTarget(target)
    } else if (handoffTarget === 'view-switch') {
      options.setViewSwitchReturnTarget(target)
    } else {
      void options.restoreFocus(target, target.openReason !== 'pointer')
    }
  }

  async function loadRegularPlaylistItems(): Promise<void> {
    if (disposed) return
    const revision = ++playlistLoadRevision
    playlistLoading.value = true
    playlistLoadFailed.value = false
    try {
      const items = await options.listSidebarItems()
      if (disposed || revision !== playlistLoadRevision) return
      regularPlaylistItems.value = items.filter((item) => item.kind === 'playlist')
    } catch (error) {
      if (disposed || revision !== playlistLoadRevision) return
      rendererDiagnostics.error({
        scope: 'library.context-menu',
        message: 'Failed to load playlists',
        cause: error,
      })
      playlistLoadFailed.value = true
    } finally {
      if (!disposed && revision === playlistLoadRevision) playlistLoading.value = false
    }
  }

  function onOpenContextMenu(
    trackId: number,
    event: MouseEvent,
    source: LibraryContextMenuSource = 'track',
    openReason: 'pointer' | 'keyboard' = 'pointer',
  ): void {
    if (disposed) return
    clearAddToPlaylistFeedback()
    invalidateReveal()
    playlistOperationRevision++
    isCreatingPlaylistFromMenu.value = false
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
    origin: LibraryContextMenuState | null,
    revision: number,
  ): Promise<void> {
    const result = await options.addTracksToPlaylist(playlistId, trackIds)
    if (!ownsMenu(origin) || revision !== playlistOperationRevision) return
    const key = !result.playlistExists
      ? 'playlistNotFound'
      : result.unavailableCount > 0
        ? result.addedCount > 0
          ? 'addedPartial'
          : 'tracksUnavailable'
        : result.addedCount > 0
          ? 'addedSuccess'
          : result.alreadyPresentCount > 0
            ? 'alreadyInPlaylist'
            : 'tracksUnavailable'
    const kind = key === 'addedSuccess' ? 'success' : key === 'alreadyInPlaylist' ? 'info' : 'error'
    feedbackSource.value = {
      playlistId,
      name: playlistName,
      kind,
      key,
      count: result.addedCount,
      unavailable: result.unavailableCount,
    }
    if (kind === 'error') {
      if (!result.playlistExists) await loadRegularPlaylistItems()
      return
    }
    addToPlaylistFeedbackTimer = window.setTimeout(() => {
      addToPlaylistFeedbackTimer = null
      if (ownsMenu(origin) && revision === playlistOperationRevision) closeContextMenu()
    }, 1200)
  }

  function reportPlaylistOperationError(
    error: unknown,
    origin: LibraryContextMenuState | null,
    revision: number,
  ): void {
    rendererDiagnostics.error({
      scope: 'library.context-menu',
      message: 'Failed to add tracks to playlist',
      cause: error,
    })
    if (!ownsMenu(origin) || revision !== playlistOperationRevision) return
    feedbackSource.value = { playlistId: null, name: '', kind: 'error', key: 'playlistAddError' }
  }

  async function onAddContextTracksToPlaylist(playlist: SidebarPlaylistItem): Promise<void> {
    const trackIds = getContextMenuTrackIds()
    if (trackIds.length === 0) return
    const origin = contextMenu.value
    const revision = ++playlistOperationRevision
    clearAddToPlaylistFeedback()
    invalidateReveal()
    try {
      await addContextTracksToPlaylist(playlist.id, playlist.name, trackIds, origin, revision)
    } catch (error) {
      reportPlaylistOperationError(error, origin, revision)
    }
  }

  async function onCreatePlaylistAndAddContextTracks(): Promise<void> {
    if (isCreatingPlaylistFromMenu.value) return

    const trackIds = getContextMenuTrackIds()
    if (trackIds.length === 0) return

    const origin = contextMenu.value
    const revision = ++playlistOperationRevision
    clearAddToPlaylistFeedback()
    invalidateReveal()
    isCreatingPlaylistFromMenu.value = true
    try {
      const playlist = await options.createPlaylist()
      await addContextTracksToPlaylist(playlist.id, playlist.name, trackIds, origin, revision)
      if (ownsMenu(origin) && revision === playlistOperationRevision)
        await loadRegularPlaylistItems()
    } catch (error) {
      reportPlaylistOperationError(error, origin, revision)
      if (ownsMenu(origin) && revision === playlistOperationRevision)
        await loadRegularPlaylistItems()
    } finally {
      if (ownsMenu(origin)) isCreatingPlaylistFromMenu.value = false
    }
  }

  async function onRevealInExplorer(): Promise<void> {
    const origin = contextMenu.value
    if (!origin || revealInFlight) return
    const trackIds = getContextMenuTrackIds()
    if (trackIds.length === 0) {
      revealFeedback.value = {
        kind: 'error',
        message: options.t('library.contextMenu.reveal.not-found'),
      }
      return
    }

    const revision = ++revealRevision
    clearAddToPlaylistFeedback()
    revealFeedback.value = null
    revealInFlight = true
    try {
      const result = await options.revealInExplorer(trackIds)
      if (!ownsMenu(origin) || revision !== revealRevision) return
      if (result.ok) {
        closeContextMenu()
        return
      }
      revealFeedback.value = {
        kind: 'error',
        message: options.t(`library.contextMenu.reveal.${result.reason}`),
      }
    } catch (error) {
      rendererDiagnostics.error({
        scope: 'library.context-menu',
        message: 'Failed to reveal tracks in Explorer',
        cause: error,
      })
      if (!ownsMenu(origin) || revision !== revealRevision) return
      revealFeedback.value = {
        kind: 'error',
        message: options.t('library.contextMenu.reveal.reveal-failed'),
      }
    } finally {
      if (revision === revealRevision) revealInFlight = false
    }
  }

  function dispose(): void {
    disposed = true
    playlistLoadRevision++
    revealRevision++
    revealInFlight = false
    contextMenu.value = null
    playlistLoading.value = false
    isCreatingPlaylistFromMenu.value = false
    clearAddToPlaylistFeedback()
    revealFeedback.value = null
  }

  return {
    contextMenu,
    contextSelectedTrackId,
    contextSelectedAlbumKey,
    highlightedTrackId,
    contextMenuAnchor,
    contextMenuTrackTitle,
    contextMenuAlbumTitle,
    regularPlaylistItems,
    addToPlaylistFeedback,
    revealFeedback,
    playlistLoading,
    playlistLoadError,
    isCreatingPlaylistFromMenu,
    closeContextMenu,
    onOpenContextMenu,
    onOpenAlbumArtworkContextMenu,
    onContextMenuPlay,
    onContextMenuInsert,
    onEditMetadataFromContextMenu,
    onLocateCurrentTrack,
    onAddContextTracksToPlaylist,
    onCreatePlaylistAndAddContextTracks,
    onRevealInExplorer,
    loadRegularPlaylistItems,
    dispose,
  }
}
