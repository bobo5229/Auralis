<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useI18n } from 'vue-i18n'
import { useElementSize } from '@vueuse/core'
import type { TrackListItem } from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'
import { useSettingsDialog } from '@renderer/features/settings/composables/useSettingsDialog'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { useSongFontWeights } from '@renderer/features/appearance/composables/useSongFontWeights'
import { useSongFontSizes } from '@renderer/features/appearance/composables/useSongFontSizes'
import SongRow from '../components/SongRow.vue'
import FlatTrackColumnHeader from '../components/FlatTrackColumnHeader.vue'
import FlatTrackColumnMenu from '../components/FlatTrackColumnMenu.vue'
import AlbumCoverGroup from '../components/AlbumCoverGroup.vue'
import type { LibraryAlbumGroup } from '../types/libraryAlbumGroup'
import MetadataEditDialog from '../components/MetadataEditDialog.vue'
import LibraryContextMenu from '../components/LibraryContextMenu.vue'
import LibraryStatusState from '../components/LibraryStatusState.vue'
import {
  getAlbumGroupEstimatedHeight,
  LIBRARY_LAYOUT_CSS_VARS,
  LIBRARY_LAYOUT_METRICS,
} from '../constants/libraryLayoutMetrics'
import type { LibraryPageIdentity } from '../types/libraryPageIdentity'
import type { LibraryViewMode } from '../types/libraryInteraction'
import { getArtworkUrl } from '../utils/getArtworkUrl'
import { createLibraryCatalogViewIndex } from '../utils/libraryCatalogViewIndex'
import { getAlbumCoverDiscHeadingCount } from '../utils/albumCoverDiscHeadings'
import { resolveLibrarySurfaceKind } from '../utils/librarySurface'
import type { LibraryRouteScope } from '../utils/libraryRouteScope'
import {
  resolveKeyboardFocusTrackId,
  resolveKeyboardMoveIndex,
  type LibraryKeyboardMoveDirection,
} from '../utils/libraryKeyboardFocus'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import {
  useLibraryMetadataEditor,
  type LibraryMetadataFocusTarget,
} from '../composables/useLibraryMetadataEditor'
import { useLibrarySearchSession } from '../composables/useLibrarySearchSession'
import { useLibraryViewport } from '../composables/useLibraryViewport'
import { useLibraryContextMenu } from '../composables/useLibraryContextMenu'
import { useLibraryFlatColumnLayout } from '../composables/useLibraryFlatColumnLayout'
import { useLibraryCatalogLoader } from '../composables/useLibraryCatalogLoader'
import { libraryCatalogClient } from '../utils/libraryCatalogClient'
import { libraryNavigationViewportStore } from '../utils/libraryNavigationViewport'
import type { LibraryFlatColumnId, LibraryFlatColumnWidths } from '../utils/libraryFlatColumnLayout'
import '../styles/flatTrackGrid.css'

const { t } = useI18n()

const playback = usePlayback()
const route = useRoute()
const router = useRouter()
const instanceRouteName = route.name
let hasLeftInstanceRoute = false
// Route transitions can keep an outgoing instance mounted while the next page
// loads. Once it has left, returning to the same route must not revive its work.
watch(
  () => route.name,
  (name) => {
    if (name !== instanceRouteName) hasLeftInstanceRoute = true
  },
  { flush: 'sync' },
)

const librarySurfaceKind = computed(() => resolveLibrarySurfaceKind(route.name))
const isLibrarySurface = computed(() => librarySurfaceKind.value !== null)
const { songFontWeightStyle } = useSongFontWeights()
const { songFontSizeStyle } = useSongFontSizes()

const pageIdentity = ref<LibraryPageIdentity | null>(null)
const showPlayCount = computed(
  () =>
    pageIdentity.value?.kind === 'smart-playlist' && pageIdentity.value.preset === 'mostListened',
)
const tracks = shallowRef<TrackListItem[]>([])
const isLoading = ref(true)
const scrollRef = ref<HTMLElement | null>(null)
const flatHeaderRef = ref<{
  beginPointerResize: (handleId: string, event: PointerEvent) => void
  getResizeHandles: () => HTMLElement[]
} | null>(null)
const isFlatColumnResizeActive = ref(false)
const isFlatColumnResizeTarget = ref(false)
// content-box 排除底部播放栏安全区；只在容器尺寸变化时更新。
const { height: coverViewportHeight, width: measuredFlatContainerWidth } = useElementSize(scrollRef)
const flatContainerWidth = ref(0)
let flatContainerWidthFrame = 0

const LIBRARY_VIEW_MODE_KEY = 'auralis-library-view-mode'
const COVER_TOP_INSET = LIBRARY_LAYOUT_METRICS.coverContentTopInset
const smartPlaylistId = computed(() => {
  if (route.name !== 'smart-playlist') return null
  const parsed = Number(route.params.id)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
})
const playlistId = computed(() => {
  if (route.name !== 'playlist') return null
  const parsed = Number(route.params.id)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
})
const isScopedPlaylist = computed(() => smartPlaylistId.value !== null || playlistId.value !== null)

function captureLibraryRouteScope(): LibraryRouteScope {
  if (smartPlaylistId.value !== null) {
    return { kind: 'smart-playlist', id: smartPlaylistId.value }
  }
  if (playlistId.value !== null) {
    return { kind: 'playlist', id: playlistId.value }
  }
  return { kind: 'library' }
}

function readPersistedViewMode(): LibraryViewMode {
  const stored = localStorage.getItem(LIBRARY_VIEW_MODE_KEY)
  return stored === 'cover' ? 'cover' : 'flat'
}

const libraryViewMode = ref<LibraryViewMode>(readPersistedViewMode())
const isCoverView = computed(() => libraryViewMode.value === 'cover')
let isPageUnmounted = false

interface FlatColumnMenuState {
  clientX: number
  clientY: number
  openReason: 'pointer' | 'keyboard'
  returnFocusElement: HTMLElement | null
}

const flatColumnMenu = ref<FlatColumnMenuState | null>(null)

const flatColumnLayoutState = useLibraryFlatColumnLayout({
  containerWidth: flatContainerWidth,
  showPlayCount,
})
const flatColumnLayout = flatColumnLayoutState.layout
const flatLayoutCssVars = computed<Record<string, string>>(() => ({
  '--library-flat-row-height': `${flatColumnLayout.value.rowHeight}px`,
  '--library-flat-artwork-size': `${flatColumnLayout.value.widths.artwork}px`,
  '--library-flat-grid-template': flatColumnLayout.value.gridTemplateColumns,
  '--library-flat-grid-gap': `${flatColumnLayout.value.gap}px`,
  '--library-flat-grid-padding-inline': `${flatColumnLayout.value.paddingInline}px`,
}))
const libraryPageStyle = computed(() => ({
  ...LIBRARY_LAYOUT_CSS_VARS,
  ...flatLayoutCssVars.value,
  ...(librarySurfaceKind.value === 'library'
    ? { ...songFontWeightStyle.value, ...songFontSizeStyle.value }
    : {}),
}))

watch(measuredFlatContainerWidth, (width) => {
  if (flatContainerWidthFrame) window.cancelAnimationFrame(flatContainerWidthFrame)
  flatContainerWidthFrame = window.requestAnimationFrame(() => {
    flatContainerWidthFrame = 0
    if (isPageUnmounted || !Number.isFinite(width)) return
    flatContainerWidth.value = Math.max(0, width)
  })
})

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: tracks.value.length,
    enabled: !isCoverView.value,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => flatColumnLayout.value.rowHeight,
    paddingStart: LIBRARY_LAYOUT_METRICS.flatHeaderHeight + LIBRARY_LAYOUT_METRICS.flatRowsInset,
    overscan: 12,
  })),
)

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())

function getAlbumGroupSize(group: LibraryAlbumGroup): number {
  return getAlbumGroupEstimatedHeight(
    group.tracks.length,
    Boolean(group.releaseDate),
    getAlbumCoverDiscHeadingCount(group.tracks),
  )
}

const libraryCatalogViewIndex = computed(() =>
  createLibraryCatalogViewIndex(tracks.value, getAlbumGroupSize),
)
const albumGroups = computed(() => libraryCatalogViewIndex.value.albumGroups)
const libraryDerivedIndex = computed(() => libraryCatalogViewIndex.value)

function getAlbumGroupByTrackId(trackId: number): LibraryAlbumGroup | null {
  const groupIndex = libraryDerivedIndex.value.albumGroupIndexByTrackId.get(trackId)
  return groupIndex === undefined ? null : (albumGroups.value[groupIndex] ?? null)
}

const albumVirtualizer = useVirtualizer(
  computed(() => ({
    count: albumGroups.value.length,
    enabled: isCoverView.value,
    getScrollElement: () => scrollRef.value,
    estimateSize: (index) => getAlbumGroupSize(albumGroups.value[index]),
    overscan: 2,
  })),
)

const virtualAlbumGroups = computed(() => albumVirtualizer.value.getVirtualItems())
const albumGroupsTotalSize = computed(() => albumVirtualizer.value.getTotalSize())
const albumVirtualWindowStart = computed(() => virtualAlbumGroups.value[0]?.start ?? 0)

const viewport = useLibraryViewport({
  scrollRef,
  tracks,
  isCoverView,
  derivedIndex: libraryDerivedIndex,
  albumGroups,
  virtualAlbumGroups,
  currentTrackId: () => playback.state.currentTrackId,
  selectedTrackId: () => playback.state.selectedTrackId,
  isDisposed: () => isPageUnmounted || hasLeftInstanceRoute,
  flatRowHeight: computed(() => flatColumnLayout.value.rowHeight),
  onViewSwitchComplete: (targetTrackId) => {
    if (pendingViewSwitchReturnTarget) {
      void restoreLibraryFocus(pendingViewSwitchReturnTarget)
      pendingViewSwitchReturnTarget = null
    } else {
      void restoreLibraryFocus({ trackId: targetTrackId, source: 'track' })
    }
  },
})

const {
  captureScrollGeneration,
  isScrollInputCancelled,
  scheduleFirstVisibleTrackIndexUpdate,
  scrollToTrackById,
  scrollToTrackIndex,
  scrollToPlaybackTrack,
  captureLibraryViewportRestore,
  restoreLibraryViewportRestore,
  beginViewSwitch,
  onLibraryViewEnter,
  dispose: disposeLibraryViewport,
} = viewport

let navigationRestorePending = true
let navigationRestoreIntent = viewport.captureNavigationIntent()

function saveNavigationViewport(): void {
  if (
    hasLeftInstanceRoute ||
    !pageIdentity.value ||
    isLoading.value ||
    isPositioningForegroundViewport.value
  )
    return
  libraryNavigationViewportStore.save(pageIdentity.value, viewport.captureNavigationViewport())
}

function leaveLibraryViewport(): void {
  saveNavigationViewport()
  viewport.cancelNavigationRestore()
}

onBeforeRouteLeave(leaveLibraryViewport)
onBeforeRouteUpdate(leaveLibraryViewport)

async function prepareForegroundViewport(isRequestCurrent: () => boolean): Promise<void> {
  await nextTick()
  if (!isRequestCurrent()) return
  const container = scrollRef.value
  if (!container) return
  // Measure before restoring so responsive columns don't alter row height a
  // frame later and move the returned viewport after it becomes visible.
  if (flatContainerWidthFrame) window.cancelAnimationFrame(flatContainerWidthFrame)
  flatContainerWidthFrame = 0
  flatContainerWidth.value = container.clientWidth
  rowVirtualizer.value.measure()
  albumVirtualizer.value.measure()
  await nextTick()
}

async function restoreNavigationViewport(isRequestCurrent: () => boolean): Promise<boolean> {
  if (!navigationRestorePending || !pageIdentity.value) return false
  const saved = libraryNavigationViewportStore.get(pageIdentity.value)
  if (!saved) {
    navigationRestorePending = false
    return false
  }
  if (viewport.captureNavigationIntent() !== navigationRestoreIntent) {
    navigationRestorePending = false
    return true
  }
  // Preserve the record through empty/error states until valid content mounts.
  await nextTick()
  if (!isRequestCurrent()) return true
  if (viewport.restoreNavigationViewport(saved, navigationRestoreIntent, isRequestCurrent)) {
    navigationRestorePending = false
  }
  return true
}

watch(
  () => flatColumnLayout.value.rowHeight,
  (nextHeight, previousHeight) => {
    if (nextHeight === previousHeight) return
    if (!isPositioningForegroundViewport.value) {
      void viewport.preserveFlatScrollAnchorForRowHeight(previousHeight, nextHeight)
    }
    rowVirtualizer.value.measure()
  },
)

function onRowFocus(trackId: number): void {
  keyboardFocusTrackId.value = trackId
}

function onSelect(trackId: number) {
  keyboardFocusTrackId.value = trackId
  playback.selectTrack(trackId)
}

function onPlay(trackId: number) {
  keyboardFocusTrackId.value = trackId
  playback.playTrackFromQueue(tracks.value, trackId, {
    shufflePool: isScopedPlaylist.value ? tracks.value : undefined,
  })
}

let pendingViewSwitchReturnTarget: LibraryMetadataFocusTarget | null = null

async function restoreLibraryFocus(
  target: LibraryMetadataFocusTarget | null,
  scroll = true,
): Promise<void> {
  if (!target) return

  let activeTrackId = target.trackId
  const trackExists = libraryDerivedIndex.value.trackById.has(activeTrackId)

  if (!trackExists) {
    if (tracks.value.length === 0) {
      scrollRef.value?.focus()
      return
    }

    const selectedExists =
      playback.state.selectedTrackId != null &&
      libraryDerivedIndex.value.trackById.has(playback.state.selectedTrackId)
    const currentExists =
      playback.state.currentTrackId != null &&
      libraryDerivedIndex.value.trackById.has(playback.state.currentTrackId)

    if (selectedExists) {
      activeTrackId = playback.state.selectedTrackId!
    } else if (currentExists) {
      activeTrackId = playback.state.currentTrackId!
    } else {
      activeTrackId = tracks.value[0].id
    }
  }

  keyboardFocusTrackId.value = activeTrackId

  const startGeneration = captureScrollGeneration()
  if (scroll) {
    await scrollToTrackById(activeTrackId, undefined, startGeneration)
    await nextTick()
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    if (isScrollInputCancelled(startGeneration)) return
  }

  let targetEl: HTMLElement | null = null

  if (target.source === 'album-artwork' && trackExists) {
    targetEl = document.querySelector<HTMLElement>(
      `[data-first-track-id="${activeTrackId}"] .album-cover-artwork`,
    )
    if (!targetEl) {
      const group = getAlbumGroupByTrackId(activeTrackId)
      if (group) {
        targetEl = document.querySelector<HTMLElement>(
          `[data-album-key="${group.key}"] .album-cover-artwork`,
        )
      }
    }
  }

  if (!targetEl) {
    targetEl = document.querySelector<HTMLElement>(`[data-track-id="${activeTrackId}"]`)
  }

  if (!targetEl) {
    targetEl = scrollRef.value
  }

  targetEl?.focus(scroll ? undefined : { preventScroll: true })
}

const {
  contextMenu,
  highlightedTrackId,
  contextMenuAnchor,
  contextMenuTrackTitle,
  contextMenuAlbumTitle,
  regularPlaylistItems,
  addToPlaylistFeedback,
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
  loadRegularPlaylistItems,
  dispose: disposeLibraryContextMenu,
} = useLibraryContextMenu({
  tracks,
  isScopedPlaylist: () => isScopedPlaylist.value,
  getTrackById: (trackId) => libraryDerivedIndex.value.trackById.get(trackId) ?? null,
  getAlbumGroupByTrackId,
  currentTrackId: () => playback.state.currentTrackId,
  selectedTrackId: () => playback.state.selectedTrackId,
  onTrackActivated: (trackId) => {
    keyboardFocusTrackId.value = trackId
  },
  playTrackFromQueue: (queue, trackId, playOptions) =>
    playback.playTrackFromQueue(queue, trackId, playOptions),
  insertTrackAfterCurrent: (track) => playback.insertTrackAfterCurrent(track),
  insertTracksAfterCurrent: (albumTracks) => playback.insertTracksAfterCurrent(albumTracks),
  scrollToTrackById,
  openMetadataEditor: (trackId) => metadataEditor.open(trackId),
  setMetadataReturnTarget: (target) => metadataEditor.setReturnTarget(target),
  setViewSwitchReturnTarget: (target) => {
    pendingViewSwitchReturnTarget = target
  },
  restoreFocus: (target, scroll) =>
    flatColumnMenu.value ? Promise.resolve() : restoreLibraryFocus(target, scroll),
  t: (key, values) => (values ? String(t(key, values)) : String(t(key))),
  listSidebarItems: () => auralis.playlists.listSidebarItems(),
  createPlaylist: () => auralis.playlists.create(),
  addTracksToPlaylist: (playlistId, trackIds) => auralis.playlists.addTracks(playlistId, trackIds),
})

function switchLibraryViewMode(nextMode: LibraryViewMode, anchorTrackId?: number | null): void {
  closeFlatColumnMenu()
  beginViewSwitch(anchorTrackId ?? null)

  libraryViewMode.value = nextMode
  if (smartPlaylistId.value !== null) {
    void auralis.smartPlaylists.updateViewMode(smartPlaylistId.value, nextMode)
  } else if (playlistId.value !== null) {
    void auralis.playlists.updateViewMode(playlistId.value, nextMode)
  } else {
    localStorage.setItem(LIBRARY_VIEW_MODE_KEY, nextMode)
  }
  closeContextMenu('view-switch')
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  if (['input', 'textarea', 'select', 'button'].includes(tagName)) return true
  if (target.isContentEditable) return true
  if (target.closest('[role="dialog"]') || target.closest('[role="menu"]')) return true
  return false
}

const {
  searchQuery,
  searchInputRef,
  searchRootRef,
  searchOutcome,
  shouldRenderSearchBar,
  scheduleLibrarySearchIndex,
  clearSearch,
  resetMatchCursor,
  onLibraryListMouseMove: updateSearchHoverFromMouseMove,
  onLibraryListMouseLeave: clearSearchHover,
  onSearchBarPointerDown,
  onSearchInputFocus,
  onSearchBarFocusOut,
  onSearchKeydown,
  onDocumentPointerDown,
  onWindowKeyDown,
  invalidate: invalidateLibrarySearchSession,
} = useLibrarySearchSession({
  isDisposed: () => isPageUnmounted || hasLeftInstanceRoute,
  isLibrarySurface: () => isLibrarySurface.value,
  isInteractiveTarget,
  scrollToTrackIndex,
})

const isFlatSearchRowReserved = ref(false)
watch(
  shouldRenderSearchBar,
  (shouldRender) => {
    if (shouldRender) isFlatSearchRowReserved.value = true
  },
  { flush: 'sync' },
)

function onSearchBarAfterLeave(): void {
  if (!shouldRenderSearchBar.value) isFlatSearchRowReserved.value = false
}

function onFlatColumnResizePreview(widths: LibraryFlatColumnWidths): void {
  flatColumnLayoutState.preview(widths)
}

function onFlatColumnResizeCommit(
  widths: LibraryFlatColumnWidths,
  changedColumns: readonly LibraryFlatColumnId[],
): void {
  flatColumnLayoutState.commit(widths, changedColumns)
}

function onFlatColumnResizeCancel(): void {
  flatColumnLayoutState.cancelPreview()
}

function onFlatColumnResizeStateChange(active: boolean): void {
  isFlatColumnResizeActive.value = active
  isFlatColumnResizeTarget.value = active
  if (active) clearSearchHover()
}

function isPointInsideFlatResizeHandle(clientX: number, clientY: number): boolean {
  if (isCoverView.value) return false
  return (
    flatHeaderRef.value?.getResizeHandles().some((handle) => {
      const rect = handle.getBoundingClientRect()
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      )
    }) ?? false
  )
}

function onLibrarySurfaceMouseMove(event: MouseEvent): void {
  const insideHandle = isPointInsideFlatResizeHandle(event.clientX, event.clientY)
  isFlatColumnResizeTarget.value = insideHandle || isFlatColumnResizeActive.value
  if (insideHandle || isFlatColumnResizeActive.value) {
    clearSearchHover()
    return
  }
  updateSearchHoverFromMouseMove(event)
}

function onLibrarySurfaceMouseLeave(): void {
  if (isFlatColumnResizeActive.value) return
  isFlatColumnResizeTarget.value = false
  clearSearchHover()
}

function onLibraryPointerDownCapture(event: PointerEvent): void {
  if (isCoverView.value) return
  const header = flatHeaderRef.value
  if (!header) return

  const handles = header.getResizeHandles()
  const target = event.target instanceof Element ? event.target : null
  const directHandle = target?.closest<HTMLElement>('[data-column-resize-handle]')
  const handle =
    directHandle && handles.includes(directHandle)
      ? directHandle
      : handles.find((candidate) => {
          const rect = candidate.getBoundingClientRect()
          return (
            event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom
          )
        })
  const handleId = handle?.dataset.columnResizeHandle
  if (handleId) header.beginPointerResize(handleId, event)
}

function onLibraryContextMenuCapture(event: MouseEvent): void {
  if (isCoverView.value) return
  const header = scrollRef.value?.querySelector<HTMLElement>('.library-flat-track-header')
  const target = event.target instanceof Element ? event.target : null
  if (!header || (target && header.contains(target))) return
  const rect = header.getBoundingClientRect()
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  ) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  openFlatColumnMenu(event, 'pointer')
}

function openFlatColumnMenu(event: MouseEvent, openReason: 'pointer' | 'keyboard'): void {
  flatColumnMenu.value = {
    clientX: event.clientX,
    clientY: event.clientY,
    openReason,
    returnFocusElement:
      openReason === 'keyboard'
        ? event.target instanceof HTMLElement
          ? event.target
          : (document.activeElement as HTMLElement)
        : null,
  }
  if (contextMenu.value) closeContextMenu()
}

function closeFlatColumnMenu(): void {
  flatColumnMenu.value = null
}

function openSongRowContextMenu(
  trackId: number,
  event: MouseEvent,
  openReason: 'pointer' | 'keyboard' = 'pointer',
): void {
  flatColumnMenu.value = null
  onOpenContextMenu(trackId, event, 'track', openReason)
}

function restoreDefaultFlatColumns(): void {
  flatColumnLayoutState.reset()
}

function openSettings(): void {
  useSettingsDialog().openSettings('library')
}

const keyboardFocusTrackId = ref<number | null>(null)

function ensureKeyboardFocusTrackId(): number | null {
  const nextId = resolveKeyboardFocusTrackId({
    trackCount: tracks.value.length,
    currentFocusId: keyboardFocusTrackId.value,
    selectedTrackId: playback.state.selectedTrackId,
    currentTrackId: playback.state.currentTrackId,
    hasTrack: (id) => libraryDerivedIndex.value.trackIndexById.has(id),
    firstTrackId: tracks.value[0]?.id ?? null,
  })
  keyboardFocusTrackId.value = nextId
  return nextId
}

async function moveKeyboardFocus(direction: LibraryKeyboardMoveDirection): Promise<void> {
  if (tracks.value.length === 0) return

  const currentId = ensureKeyboardFocusTrackId()
  const currentIndex =
    currentId === null ? -1 : (libraryDerivedIndex.value.trackIndexById.get(currentId) ?? -1)
  const targetIndex = resolveKeyboardMoveIndex({
    direction,
    currentIndex,
    lastIndex: tracks.value.length - 1,
  })

  const targetTrack = tracks.value[targetIndex]
  if (!targetTrack) return

  keyboardFocusTrackId.value = targetTrack.id
  await scrollToTrackById(targetTrack.id)

  void nextTick(() => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-track-id="${targetTrack.id}"]`)
      el?.focus()
    })
  })
}

function onListShellKeyDown(event: KeyboardEvent): void {
  // 曲目行已经处理的 Enter/Space 不再冒泡触发第二次播放或选择。
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
  if (isInteractiveTarget(event.target)) return
  if (contextMenu.value !== null || isMetadataEditorOpen.value) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    void moveKeyboardFocus('next')
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    void moveKeyboardFocus('prev')
  } else if (event.key === 'Home') {
    event.preventDefault()
    void moveKeyboardFocus('first')
  } else if (event.key === 'End') {
    event.preventDefault()
    void moveKeyboardFocus('last')
  } else if (event.key === ' ') {
    const focusId = ensureKeyboardFocusTrackId()
    if (focusId) {
      event.preventDefault()
      playback.selectTrack(focusId)
    }
  } else if (event.key === 'Enter') {
    const focusId = ensureKeyboardFocusTrackId()
    if (focusId) {
      event.preventDefault()
      onPlay(focusId)
    }
  }
}

const {
  initialLoadError,
  isPositioningForegroundViewport,
  loadLibraryData,
  retryInitialLoad,
  bindExternalPlaylistEvents,
  subscribeLibraryEvents,
  dispose: disposeLibraryCatalogLoader,
} = useLibraryCatalogLoader({
  catalogClient: libraryCatalogClient,
  isDisposed: () => isPageUnmounted || hasLeftInstanceRoute,
  captureRouteScope: captureLibraryRouteScope,
  pageIdentity,
  tracks,
  libraryViewMode,
  isLoading,
  getTrackPage: (request) => auralis.library.getTrackPage(request),
  getPlaylistDetail: (id) => auralis.playlists.getDetail(id),
  getSmartPlaylistDetail: (id) => auralis.smartPlaylists.getDetail(id),
  readPersistedViewMode,
  onSnapshotCommitted: (snapshot) => {
    resetMatchCursor()
    searchOutcome.value = { kind: 'idle' }
    ensureKeyboardFocusTrackId()
    scheduleLibrarySearchIndex(snapshot.tracks)
  },
  captureViewportRestore: captureLibraryViewportRestore,
  restoreViewportRestore: restoreLibraryViewportRestore,
  scrollToPlaybackTrack,
  prepareForegroundViewport,
  restoreNavigationViewport,
  replaceWithLibraryHome: () => router.replace('/songs'),
  loadErrorMessage: () => t('library.status.loadError'),
  onLibraryChanged: (callback) => auralis.library.onChanged(callback),
  onScanProgress: (callback) => auralis.library.onScanProgress(callback),
})

const hasLibraryList = computed(
  () =>
    !isLoading.value && !(initialLoadError.value && !pageIdentity.value) && tracks.value.length > 0,
)
watch(
  hasLibraryList,
  (hasList) => {
    if (!hasList) {
      isFlatSearchRowReserved.value = false
    } else if (shouldRenderSearchBar.value) {
      isFlatSearchRowReserved.value = true
    }
  },
  { flush: 'sync' },
)

const metadataEditor = useLibraryMetadataEditor({
  loadTrackMetadata: (trackId) => auralis.metadata.getTrackMetadata(trackId),
  updateTrackMetadata: (metadata) => auralis.metadata.updateTrackMetadata(metadata),
  captureRouteScope: captureLibraryRouteScope,
  refreshLibrary: () => loadLibraryData('metadata-save'),
  restoreFocus: restoreLibraryFocus,
  isDisposed: () => isPageUnmounted,
  getSaveErrorMessage: () => t('library.metadataEditor.errors.saveFailed'),
  getSaveFailureMessage: (reason) => {
    const keys: Record<string, string> = {
      'buffer-preparation-failed': 'bufferPreparationFailed',
      'file-in-use': 'fileInUse',
      'playback-restore-failed': 'playbackRestoreFailed',
      'playback-changed': 'playbackChanged',
    }
    return t(`library.metadataEditor.errors.${keys[reason] ?? 'saveFailed'}`)
  },
  getLoadErrorMessage: () => t('library.metadataEditor.errors.loadFailed'),
  getPlaybackInUseMessage: () => t('library.metadataEditor.status.playbackInUse'),
  getQueryFailedMessage: () => t('library.metadataEditor.status.queryFailed'),
  getTrackEditState: (trackId) => auralis.metadata.getTrackEditState(trackId),
  onTrackEditStateChanged: (callback) => auralis.metadata.onTrackEditStateChanged(callback),
  logSaveError: (error) =>
    rendererDiagnostics.error({
      scope: 'library.metadata',
      message: 'Failed to save metadata edits',
      cause: error,
    }),
  logLoadError: (error) =>
    rendererDiagnostics.error({
      scope: 'library.metadata',
      message: 'Failed to load track metadata',
      cause: error,
    }),
})

const {
  editingMetadata,
  isMetadataEditorOpen,
  isLoadingMetadata,
  isSavingMetadata,
  metadataEditError,
  editStatus: metadataEditStatus,
} = metadataEditor
const closeMetadataEditor = metadataEditor.close
const saveMetadata = metadataEditor.save
const retryMetadataEditStatus = metadataEditor.retryCheckStatus

onMounted(async () => {
  if (hasLeftInstanceRoute) return
  document.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('keydown', onWindowKeyDown)
  bindExternalPlaylistEvents()
  void loadRegularPlaylistItems()
  await loadLibraryData('foreground')
  if (isPageUnmounted || hasLeftInstanceRoute) return
  subscribeLibraryEvents()
})

watch(
  () => route.fullPath,
  async () => {
    if (hasLeftInstanceRoute) return
    navigationRestorePending = true
    navigationRestoreIntent = viewport.captureNavigationIntent()
    clearSearch()
    closeFlatColumnMenu()
    closeContextMenu()
    await loadLibraryData('foreground')
    await nextTick()
    scheduleFirstVisibleTrackIndexUpdate()
  },
)

onBeforeUnmount(() => {
  isPageUnmounted = true
  if (flatContainerWidthFrame) window.cancelAnimationFrame(flatContainerWidthFrame)
  flatContainerWidthFrame = 0
  flatColumnMenu.value = null
  flatColumnLayoutState.cancelPreview()
  metadataEditor.dispose()
  invalidateLibrarySearchSession()
  disposeLibraryViewport()
  disposeLibraryContextMenu()
  disposeLibraryCatalogLoader()
  window.removeEventListener('keydown', onWindowKeyDown)
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<template>
  <section
    class="library-page main-page-frame relative"
    :data-library-surface="librarySurfaceKind ?? undefined"
    :class="{
      'library-page--flat-resize-target': isFlatColumnResizeTarget,
      'library-page--flat-column-resizing': isFlatColumnResizeActive,
    }"
    :style="libraryPageStyle"
    @mousemove="onLibrarySurfaceMouseMove($event)"
    @mouseleave="onLibrarySurfaceMouseLeave()"
    @pointerdown.capture="onLibraryPointerDownCapture"
    @contextmenu.capture="onLibraryContextMenuCapture"
  >
    <div
      v-if="initialLoadError && pageIdentity"
      class="flex shrink-0 items-center gap-3 px-4 py-2 text-xs text-[var(--auralis-text-muted)]"
      role="status"
    >
      <span>{{ initialLoadError }}</span>
      <button type="button" class="underline" @click="retryInitialLoad">
        {{ t('library.status.retry') }}
      </button>
    </div>
    <LibraryStatusState v-if="isLoading" kind="loading" />

    <LibraryStatusState
      v-else-if="initialLoadError && !pageIdentity"
      kind="error"
      :error-message="initialLoadError"
      @retry="retryInitialLoad"
    />

    <LibraryStatusState
      v-else-if="tracks.length === 0"
      kind="empty"
      :is-playlist="playlistId !== null"
      :is-smart-playlist="smartPlaylistId !== null"
      @open-settings="openSettings"
    />

    <div
      v-else
      class="library-list-shell flex min-h-0 flex-1 flex-col overflow-hidden"
      :style="{ visibility: isPositioningForegroundViewport ? 'hidden' : undefined }"
      :class="{ 'library-list-shell--play-count': showPlayCount }"
      @keydown="onListShellKeyDown"
    >
      <div
        class="library-search-zone"
        :class="{ 'library-search-zone--flat-row': !isCoverView && isFlatSearchRowReserved }"
      >
        <Transition name="search-overlay" :duration="160" @after-leave="onSearchBarAfterLeave">
          <div v-if="shouldRenderSearchBar" class="library-search-overlay">
            <div
              ref="searchRootRef"
              class="library-search-bar"
              @pointerdown="onSearchBarPointerDown"
              @focusout="onSearchBarFocusOut"
            >
              <span class="i-lucide-search text-sm text-[var(--auralis-text-faint)]"></span>
              <input
                ref="searchInputRef"
                v-model="searchQuery"
                type="text"
                class="library-search-input"
                :placeholder="t('library.search.placeholder')"
                :aria-label="t('library.search.ariaLabel')"
                spellcheck="false"
                @focus="onSearchInputFocus"
                @keydown="onSearchKeydown"
              />
              <span
                v-if="searchOutcome.kind !== 'idle'"
                class="library-search-outcome ml-auto text-xs tabular-nums text-[var(--auralis-text-muted)] select-none shrink-0"
                role="status"
                aria-live="polite"
              >
                <template v-if="searchOutcome.kind === 'matched'">
                  {{
                    searchOutcome.wrapped
                      ? t('library.search.wrapped', {
                          index: searchOutcome.index,
                          total: searchOutcome.total,
                        })
                      : t('library.search.matched', {
                          index: searchOutcome.index,
                          total: searchOutcome.total,
                        })
                  }}
                </template>
                <template v-else-if="searchOutcome.kind === 'not-found'">
                  <span class="text-[var(--auralis-danger)] font-medium">
                    {{ t('library.search.notFound') }}
                  </span>
                </template>
              </span>
            </div>
          </div>
        </Transition>
      </div>

      <div
        ref="scrollRef"
        tabindex="-1"
        class="library-list-scroll main-page-scroll flex-1 overflow-auto pb-[var(--auralis-playbar-safe-area)] outline-none"
      >
        <Transition name="library-view-fade" mode="out-in" @enter="onLibraryViewEnter">
          <div :key="libraryViewMode" class="min-h-full">
            <template v-if="!isCoverView">
              <div
                :style="{
                  height: `${totalSize + LIBRARY_LAYOUT_METRICS.flatBottomInset}px`,
                  width: '100%',
                  position: 'relative',
                }"
              >
                <FlatTrackColumnHeader
                  ref="flatHeaderRef"
                  :layout="flatColumnLayout"
                  :resizing="isFlatColumnResizeActive"
                  @resize-preview="onFlatColumnResizePreview"
                  @resize-commit="onFlatColumnResizeCommit"
                  @resize-cancel="onFlatColumnResizeCancel"
                  @resize-state="onFlatColumnResizeStateChange"
                  @open-context-menu="openFlatColumnMenu"
                />
                <SongRow
                  v-for="virtualRow in virtualRows"
                  :key="String(virtualRow.key)"
                  :track="tracks[virtualRow.index]"
                  :show-play-count="showPlayCount"
                  :visible-columns="flatColumnLayout.visibleColumnIds"
                  :index="virtualRow.index"
                  :now-playing="playback.state.currentTrackId === tracks[virtualRow.index].id"
                  :is-playing="playback.state.isPlaying"
                  :selected="highlightedTrackId === tracks[virtualRow.index].id"
                  :focused="keyboardFocusTrackId === tracks[virtualRow.index].id"
                  :artwork-url="getArtworkUrl(tracks[virtualRow.index].artworkCacheKey)"
                  :style="{
                    height: `${virtualRow.size}px`,
                    top: `${virtualRow.start}px`,
                  }"
                  class="absolute left-0 w-full"
                  @select="onSelect"
                  @play="onPlay"
                  @focus="onRowFocus"
                  @open-context-menu="openSongRowContextMenu"
                />
              </div>
            </template>

            <template v-else>
              <div
                :style="{
                  height: `${albumGroupsTotalSize + COVER_TOP_INSET}px`,
                  width: '100%',
                  position: 'relative',
                }"
              >
                <div
                  class="library-cover-virtual-window"
                  :style="{
                    paddingTop: `${albumVirtualWindowStart + COVER_TOP_INSET}px`,
                  }"
                >
                  <AlbumCoverGroup
                    v-for="virtualGroup in virtualAlbumGroups"
                    :key="String(virtualGroup.key)"
                    :data-album-key="albumGroups[virtualGroup.index].key"
                    :data-first-track-id="albumGroups[virtualGroup.index].tracks[0]?.id"
                    :group="albumGroups[virtualGroup.index]"
                    :viewport-height="coverViewportHeight"
                    :scroll-element="scrollRef"
                    :start-offset="virtualGroup.start + COVER_TOP_INSET"
                    :now-playing-track-id="playback.state.currentTrackId"
                    :is-playing="playback.state.isPlaying"
                    :selected-track-id="highlightedTrackId"
                    :focused-track-id="keyboardFocusTrackId"
                    :style="{
                      height: `${virtualGroup.size}px`,
                    }"
                    class="w-full"
                    @select="onSelect"
                    @play="onPlay"
                    @focus-track="onRowFocus"
                    @open-track-context-menu="openSongRowContextMenu"
                    @open-album-artwork-context-menu="
                      (anchorTrackId, event, openReason) =>
                        onOpenAlbumArtworkContextMenu(anchorTrackId, event, openReason)
                    "
                  />
                </div>
              </div>
            </template>
          </div>
        </Transition>
      </div>
    </div>

    <MetadataEditDialog
      :open="isMetadataEditorOpen"
      :loading="isLoadingMetadata"
      :metadata="editingMetadata"
      :saving="isSavingMetadata"
      :error-message="metadataEditError"
      :edit-status="metadataEditStatus"
      @close="closeMetadataEditor"
      @save="saveMetadata"
      @retry-status="retryMetadataEditStatus"
      @retry-load="metadataEditor.retryLoad"
    />

    <LibraryContextMenu
      :open="contextMenu !== null"
      :source="contextMenu?.source ?? 'track'"
      :anchor="contextMenuAnchor"
      :track-title="contextMenuTrackTitle"
      :album-title="contextMenuAlbumTitle"
      :can-locate-current="Boolean(playback.state.currentTrackId)"
      :hide-insert="
        contextMenu?.source === 'track' &&
        playback.state.currentTrackId != null &&
        playback.state.currentTrackId === contextMenu?.trackId
      "
      :can-insert="
        Boolean(
          playback.state.currentTrackId &&
          (contextMenu?.source === 'album-artwork' ||
            playback.state.currentTrackId !== contextMenu?.trackId),
        )
      "
      :current-view-mode="libraryViewMode"
      :playlists="regularPlaylistItems"
      :playlist-feedback="addToPlaylistFeedback"
      :playlist-loading="playlistLoading"
      :playlist-load-error="playlistLoadError"
      :creating-playlist="isCreatingPlaylistFromMenu"
      @close="closeContextMenu"
      @locate-current="onLocateCurrentTrack"
      @play="onContextMenuPlay"
      @insert-after-current="onContextMenuInsert"
      @add-to-playlist="onAddContextTracksToPlaylist"
      @create-playlist="onCreatePlaylistAndAddContextTracks"
      @edit-metadata="onEditMetadataFromContextMenu"
      @switch-view="(mode) => switchLibraryViewMode(mode, contextMenu?.trackId ?? null)"
    />

    <FlatTrackColumnMenu
      :open="flatColumnMenu !== null"
      :client-x="flatColumnMenu?.clientX ?? 0"
      :client-y="flatColumnMenu?.clientY ?? 0"
      :open-reason="flatColumnMenu?.openReason ?? 'pointer'"
      :return-focus-element="flatColumnMenu?.returnFocusElement ?? null"
      @close="closeFlatColumnMenu"
      @restore-defaults="restoreDefaultFlatColumns"
    />
  </section>
</template>
