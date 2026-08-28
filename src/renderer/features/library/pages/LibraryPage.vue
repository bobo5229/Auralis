<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import SongRow from '../components/SongRow.vue'
import AlbumCoverGroup from '../components/AlbumCoverGroup.vue'
import type { LibraryAlbumGroup } from '../types/libraryAlbumGroup'
import MetadataEditDialog from '../components/MetadataEditDialog.vue'
import LibraryContextMenu from '../components/LibraryContextMenu.vue'
import LibraryLedgerHeader from '../components/LibraryLedgerHeader.vue'
import LibraryStatusState from '../components/LibraryStatusState.vue'
import { useVisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'
import {
  getAlbumGroupEstimatedHeight,
  LIBRARY_LAYOUT_CSS_VARS,
  LIBRARY_LAYOUT_METRICS,
} from '../constants/libraryLayoutMetrics'
import type { LibraryPageIdentity, LibraryPresentation } from '../types/libraryPresentation'
import type {
  LibraryContextMenuAnchor,
  LibraryContextMenuSource,
  LibraryContextMenuState,
  LibraryViewMode,
} from '../types/libraryInteraction'
import '@renderer/features/appearance/styles/manuscript.tokens.css'
import '../styles/manuscript.css'
import '../styles/manuscript.overlays.css'
import { getArtworkUrl } from '../utils/getArtworkUrl'
import { createLibraryCatalogViewIndex } from '../utils/libraryCatalogViewIndex'
import {
  resolveLibraryViewportRestoreAction,
  type LibraryViewportRestore,
} from '../utils/libraryViewportRestore'
import { resolveLibraryPresentation, resolveLibrarySurfaceKind } from '../utils/libraryPresentation'
import { LibraryRequestCoordinator, type LibraryLoadMode } from '../utils/libraryRequestCoordinator'
import {
  LIBRARY_PLAYLISTS_CHANGED_EVENT,
  LIBRARY_SMART_PLAYLISTS_CHANGED_EVENT,
  isSameLibraryRouteScope,
  shouldRefreshLibraryForExternalPlaylistEvent,
  type LibraryRouteScope,
} from '../utils/libraryRouteScope'
import {
  createAllSongsLibrarySnapshot,
  createPlaylistLibrarySnapshot,
  createSmartPlaylistLibrarySnapshot,
  type LibraryDataSnapshot,
} from '../utils/libraryDataSnapshot'
import { loadLibraryCatalogSnapshot } from '../utils/loadLibraryCatalogSnapshot'
import {
  resolveKeyboardFocusTrackId,
  resolveKeyboardMoveIndex,
  type LibraryKeyboardMoveDirection,
} from '../utils/libraryKeyboardFocus'
import { resolveFirstVisibleTrackIndex } from '../utils/libraryFirstVisibleTrack'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import {
  useLibraryMetadataEditor,
  type LibraryMetadataFocusTarget,
  type LibraryMetadataRefreshResult,
} from '../composables/useLibraryMetadataEditor'
import { useLibrarySearchSession } from '../composables/useLibrarySearchSession'

const { t } = useI18n()

const playback = usePlayback()
const route = useRoute()
const router = useRouter()

const { visualStyle } = useVisualStyle()
const libraryPresentation = computed<LibraryPresentation>(() =>
  resolveLibraryPresentation(route.name, visualStyle.value),
)
const isManuscriptLibrary = computed(() => libraryPresentation.value === 'manuscript')
const librarySurfaceKind = computed(() => resolveLibrarySurfaceKind(route.name))
const isLibrarySurface = computed(() => librarySurfaceKind.value !== null)

const pageIdentity = ref<LibraryPageIdentity | null>(null)
const tracks = shallowRef<TrackListItem[]>([])
const isLoading = ref(true)
const scrollRef = ref<HTMLElement | null>(null)
const firstVisibleTrackIndex = ref(0)

const LIBRARY_VIEW_MODE_KEY = 'auralis-library-view-mode'
const LIBRARY_TOP_INSET = 16
const LIBRARY_FLAT_BOTTOM_INSET = 28
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
const isSmartPlaylist = computed(() => smartPlaylistId.value !== null)
const isPlaylist = computed(() => playlistId.value !== null)
const isScopedPlaylist = computed(() => isSmartPlaylist.value || isPlaylist.value)

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
const contextMenu = ref<LibraryContextMenuState | null>(null)
const isStartingLibraryRefresh = ref(false)
const regularPlaylistItems = ref<SidebarPlaylistItem[]>([])
const addToPlaylistFeedback = ref<{ playlistId: number; message: string } | null>(null)
const isCreatingPlaylistFromMenu = ref(false)
let unsubscribeChanged: (() => void) | null = null
let unsubscribeScanProgress: (() => void) | null = null
let addToPlaylistFeedbackTimer: number | null = null
const libraryRequestCoordinator = new LibraryRequestCoordinator()

let pendingViewSwitchTrackId: number | null = null
let pendingViewSwitchScrollFrame: number | null = null
let pendingFirstVisibleTrackFrame: number | null = null
let isPageUnmounted = false

// Deferred positioning (scrollToTrackById hops, view-switch frames, focus
// restore) aborts when the user starts scrolling: wheel / touch input bumps
// the generation, and pending tasks check it before touching scrollTop.
let userScrollGeneration = 0

function captureScrollGeneration(): number {
  return userScrollGeneration
}

function isScrollInputCancelled(startGeneration: number): boolean {
  return userScrollGeneration !== startGeneration
}

function onUserScrollInput(): void {
  userScrollGeneration++
}

interface LibraryViewportCapture {
  restore: LibraryViewportRestore
  previousTrackIds: number[]
}

type LibraryLoadResult = LibraryMetadataRefreshResult

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: tracks.value.length,
    enabled: !isCoverView.value,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => LIBRARY_LAYOUT_METRICS.flatRowHeight,
    overscan: 12,
  })),
)

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())

function getAlbumGroupSize(group: LibraryAlbumGroup): number {
  return getAlbumGroupEstimatedHeight(group.tracks.length, Boolean(group.releaseDate))
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

type FocusRestoreTarget = LibraryMetadataFocusTarget

let pendingViewSwitchReturnTarget: FocusRestoreTarget | null = null

async function restoreLibraryFocus(
  target: FocusRestoreTarget | null,
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

function closeContextMenu(handoffTarget?: 'metadata-dialog' | 'view-switch'): void {
  if (!contextMenu.value) return

  const target: FocusRestoreTarget = {
    trackId: contextMenu.value.trackId,
    source: contextMenu.value.source,
    openReason: contextMenu.value.anchor.openReason,
  }

  contextMenu.value = null
  clearAddToPlaylistFeedback()

  if (handoffTarget === 'metadata-dialog') {
    metadataEditor.setReturnTarget(target)
  } else if (handoffTarget === 'view-switch') {
    pendingViewSwitchReturnTarget = target
  } else {
    // Pointer-opened menus only restore focus without yanking the viewport;
    // keyboard-opened menus run the full scroll-and-focus restore.
    void restoreLibraryFocus(target, target.openReason !== 'pointer')
  }
}

function onOpenContextMenu(
  trackId: number,
  event: MouseEvent,
  source: LibraryContextMenuSource = 'track',
  openReason: 'pointer' | 'keyboard' = 'pointer',
): void {
  keyboardFocusTrackId.value = trackId
  playback.selectTrack(trackId)
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

const contextMenuAnchor = computed<LibraryContextMenuAnchor>(() => ({
  clientX: contextMenu.value?.anchor.clientX ?? 0,
  clientY: contextMenu.value?.anchor.clientY ?? 0,
  returnFocusTrackId: contextMenu.value?.anchor.returnFocusTrackId ?? null,
  openReason: contextMenu.value?.anchor.openReason ?? 'pointer',
}))

const contextMenuTrackTitle = computed(() => {
  if (!contextMenu.value) return ''
  const track = getTrackById(contextMenu.value.trackId)
  return track?.title || t('library.manuscript.missing.title')
})

const contextMenuAlbumTitle = computed(() => {
  if (!contextMenu.value) return ''
  const track = getTrackById(contextMenu.value.trackId)
  return track?.album || t('library.manuscript.missing.album')
})

function onContextMenuPlay(): void {
  if (!contextMenu.value) return
  if (contextMenu.value.source === 'album-artwork') {
    onPlayAlbum(contextMenu.value.trackId)
  } else {
    onPlayContextTrack(contextMenu.value.trackId)
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
  onEditMetadata(contextMenu.value.trackId)
}

function getTrackById(trackId: number): TrackListItem | null {
  return libraryDerivedIndex.value.trackById.get(trackId) ?? null
}

const playlistLoading = ref(false)
const playlistLoadError = ref<string | null>(null)

async function loadRegularPlaylistItems(): Promise<void> {
  playlistLoading.value = true
  playlistLoadError.value = null
  try {
    const items = await auralis.playlists.listSidebarItems()
    regularPlaylistItems.value = items.filter((item) => item.kind === 'playlist')
  } catch (error) {
    rendererDiagnostics.error({
      scope: 'library.context-menu',
      message: 'Failed to load playlists',
      cause: error,
    })
    playlistLoadError.value =
      error instanceof Error ? error.message : t('library.contextMenu.playlistLoadError')
  } finally {
    playlistLoading.value = false
  }
}

function isCurrentLibraryRequest(generation: number, scope: LibraryRouteScope): boolean {
  return (
    !isPageUnmounted &&
    libraryRequestCoordinator.isLatest(generation) &&
    isSameLibraryRouteScope(scope, captureLibraryRouteScope())
  )
}

async function fetchLibrarySnapshot(
  scope: LibraryRouteScope,
  isRequestCurrent: () => boolean,
): Promise<LibraryDataSnapshot | null> {
  if (scope.kind === 'smart-playlist') {
    const detail = await auralis.smartPlaylists.getDetail(scope.id)
    if (!detail) return null
    return createSmartPlaylistLibrarySnapshot(detail)
  }

  if (scope.kind === 'playlist') {
    const detail = await auralis.playlists.getDetail(scope.id)
    if (!detail) return null
    return createPlaylistLibrarySnapshot(detail)
  }

  const catalog = await loadLibraryCatalogSnapshot(
    (request) => auralis.library.getTrackPage(request),
    isRequestCurrent,
  )
  if (import.meta.env.DEV) {
    rendererDiagnostics.info({
      scope: 'library.catalog',
      message: 'Library catalog snapshot loaded',
      context: {
        totalTracks: catalog.tracks.length,
        totalPages: catalog.totalPages,
        snapshotBuildMs: catalog.snapshotBuildMs,
        snapshotHeapDeltaBytes: catalog.snapshotHeapDeltaBytes,
        pageSliceMs: catalog.pageSliceMs,
        pageRoundTripMs: catalog.pageRoundTripMs,
        rendererAggregateMs: catalog.rendererAggregateMs,
        rendererLoadMs: catalog.rendererLoadMs,
        rendererHeapDeltaBytes: catalog.rendererHeapDeltaBytes,
      },
    })
  }
  return createAllSongsLibrarySnapshot(catalog.tracks, readPersistedViewMode())
}

function commitLibrarySnapshot(snapshot: LibraryDataSnapshot): void {
  pageIdentity.value = snapshot.identity
  tracks.value = snapshot.tracks
  libraryViewMode.value = snapshot.viewMode
  resetMatchCursor()
  ensureKeyboardFocusTrackId()
  scheduleLibrarySearchIndex(snapshot.tracks)
}

function captureLibraryViewportRestore(): LibraryViewportCapture {
  return {
    restore: {
      scrollTop: scrollRef.value?.scrollTop ?? 0,
      firstVisibleTrackId: tracks.value[firstVisibleTrackIndex.value]?.id ?? null,
      scrollGeneration: userScrollGeneration,
    },
    previousTrackIds: tracks.value.map((track) => track.id),
  }
}

const SCROLL_POSITION_RATIO = 0.33

function scrollRenderedTrackToRatio(targetTrackId: number): boolean {
  const container = scrollRef.value
  if (!container) return false

  if (isCoverView.value) {
    const targetGroupIndex = libraryDerivedIndex.value.albumGroupIndexByTrackId.get(targetTrackId)
    if (targetGroupIndex === undefined) return false

    const targetOffset = libraryDerivedIndex.value.albumGroupStartOffsets[targetGroupIndex]
    if (targetOffset === undefined) return false

    container.scrollTop = Math.max(
      0,
      targetOffset + LIBRARY_TOP_INSET - container.clientHeight * SCROLL_POSITION_RATIO,
    )
    scheduleFirstVisibleTrackIndexUpdate()
    return true
  }

  const targetIndex = libraryDerivedIndex.value.trackIndexById.get(targetTrackId)
  if (targetIndex === undefined) return false

  const offset =
    targetIndex * LIBRARY_LAYOUT_METRICS.flatRowHeight +
    LIBRARY_TOP_INSET -
    container.clientHeight * SCROLL_POSITION_RATIO
  container.scrollTop = Math.max(0, offset)
  scheduleFirstVisibleTrackIndexUpdate()
  return true
}

/** Top-aligned viewport restore (no 33% playback centering). */
function scrollRenderedTrackToTop(targetTrackId: number): boolean {
  const container = scrollRef.value
  if (!container) return false

  if (isCoverView.value) {
    const targetGroupIndex = libraryDerivedIndex.value.albumGroupIndexByTrackId.get(targetTrackId)
    if (targetGroupIndex === undefined) return false

    const targetOffset = libraryDerivedIndex.value.albumGroupStartOffsets[targetGroupIndex]
    if (targetOffset === undefined) return false

    container.scrollTop = Math.max(0, targetOffset + LIBRARY_TOP_INSET)
    scheduleFirstVisibleTrackIndexUpdate()
    return true
  }

  const targetIndex = libraryDerivedIndex.value.trackIndexById.get(targetTrackId)
  if (targetIndex === undefined) return false

  container.scrollTop = Math.max(
    0,
    targetIndex * LIBRARY_LAYOUT_METRICS.flatRowHeight + LIBRARY_TOP_INSET,
  )
  scheduleFirstVisibleTrackIndexUpdate()
  return true
}

async function scrollToTrackById(
  targetTrackId: number,
  isRequestCurrent?: () => boolean,
  startGeneration: number = captureScrollGeneration(),
): Promise<void> {
  await nextTick()
  if (isRequestCurrent && !isRequestCurrent()) return
  if (isScrollInputCancelled(startGeneration)) return
  await new Promise((resolve) => window.requestAnimationFrame(resolve))
  if (isRequestCurrent && !isRequestCurrent()) return
  if (isScrollInputCancelled(startGeneration)) return
  scrollRenderedTrackToRatio(targetTrackId)
}

function switchLibraryViewMode(nextMode: LibraryViewMode, anchorTrackId?: number | null): void {
  pendingViewSwitchTrackId = anchorTrackId ?? null
  if (pendingViewSwitchScrollFrame !== null) {
    window.cancelAnimationFrame(pendingViewSwitchScrollFrame)
    pendingViewSwitchScrollFrame = null
  }

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

function onLibraryViewEnter(): void {
  if (pendingViewSwitchTrackId === null) return

  const targetTrackId = pendingViewSwitchTrackId

  const finishViewSwitch = () => {
    if (pendingViewSwitchReturnTarget) {
      restoreLibraryFocus(pendingViewSwitchReturnTarget)
      pendingViewSwitchReturnTarget = null
    } else {
      restoreLibraryFocus({ trackId: targetTrackId, source: 'track' })
    }
    pendingViewSwitchTrackId = null
  }

  if (scrollRenderedTrackToRatio(targetTrackId)) {
    finishViewSwitch()
    return
  }

  const viewSwitchGeneration = captureScrollGeneration()
  pendingViewSwitchScrollFrame = window.requestAnimationFrame(() => {
    pendingViewSwitchScrollFrame = null
    if (isScrollInputCancelled(viewSwitchGeneration)) {
      finishViewSwitch()
      return
    }
    scrollRenderedTrackToRatio(targetTrackId)
    finishViewSwitch()
  })
}

async function scrollToPlaybackTrack(isRequestCurrent?: () => boolean): Promise<void> {
  const targetTrackId = playback.state.currentTrackId ?? playback.state.selectedTrackId

  if (!targetTrackId) {
    return
  }

  await scrollToTrackById(targetTrackId, isRequestCurrent)
}

async function scrollToTrackIndex(index: number): Promise<void> {
  const track = tracks.value[index]
  if (!track) return
  await scrollToTrackById(track.id)
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
  isSearchFocused,
  searchInputRef,
  searchRootRef,
  searchOutcome,
  hasSearchQuery,
  shouldRenderSearchBar,
  scheduleLibrarySearchIndex,
  clearSearch,
  resetMatchCursor,
  onLibraryListMouseMove,
  onLibraryListMouseLeave,
  onSearchBarPointerDown,
  onSearchInputFocus,
  onSearchInputBlur,
  onSearchKeydown,
  onDocumentPointerDown,
  onWindowKeyDown,
  invalidate: invalidateLibrarySearchSession,
} = useLibrarySearchSession({
  isDisposed: () => isPageUnmounted,
  isLibrarySurface: () => isLibrarySurface.value,
  isInteractiveTarget,
  scrollToTrackIndex,
})

function openSettings(): void {
  void router.push('/settings')
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
  if (!isManuscriptLibrary.value || isInteractiveTarget(event.target)) return
  if (contextMenu.value !== null || editingMetadata.value !== null) return

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

async function onEditMetadata(trackId: number): Promise<void> {
  closeContextMenu('metadata-dialog')
  await metadataEditor.open(trackId)
}

async function onLocateCurrentTrack(): Promise<void> {
  closeContextMenu()

  if (!playback.state.currentTrackId) {
    return
  }

  await scrollToTrackById(playback.state.currentTrackId)
}

async function onPlayContextTrack(trackId: number): Promise<void> {
  closeContextMenu()
  await playback.playTrackFromQueue(tracks.value, trackId, {
    shufflePool: isScopedPlaylist.value ? tracks.value : undefined,
  })
}

function onInsertAfterCurrent(trackId: number): void {
  closeContextMenu()

  const track = getTrackById(trackId)
  if (!track) return

  playback.insertTrackAfterCurrent(track)
}

function onInsertAlbumAfterCurrent(trackId: number): void {
  closeContextMenu()

  const group = getAlbumGroupByTrackId(trackId)
  if (!group) return

  playback.insertTracksAfterCurrent(group.tracks)
}

function onPlayAlbum(trackId: number): void {
  closeContextMenu()

  const group = getAlbumGroupByTrackId(trackId)
  if (!group || group.tracks.length === 0) return

  playback.playTrackFromQueue(group.tracks, group.tracks[0].id, {
    shufflePool: isScopedPlaylist.value ? tracks.value : undefined,
  })
}

function getContextMenuTrackIds(): number[] {
  if (!contextMenu.value) return []

  if (contextMenu.value.source === 'album-artwork') {
    const group = getAlbumGroupByTrackId(contextMenu.value.trackId)
    return group?.tracks.map((track) => track.id) ?? []
  }

  return [contextMenu.value.trackId]
}

function clearAddToPlaylistFeedback(): void {
  if (addToPlaylistFeedbackTimer !== null) {
    window.clearTimeout(addToPlaylistFeedbackTimer)
    addToPlaylistFeedbackTimer = null
  }
  addToPlaylistFeedback.value = null
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
    const playlist = await auralis.playlists.create()
    await addContextTracksToPlaylist(playlist.id, playlist.name, trackIds)
    await loadRegularPlaylistItems()
  } finally {
    isCreatingPlaylistFromMenu.value = false
  }
}

async function addContextTracksToPlaylist(
  playlistId: number,
  playlistName: string,
  trackIds: number[],
): Promise<void> {
  await auralis.playlists.addTracks(playlistId, trackIds)
  window.dispatchEvent(new CustomEvent(LIBRARY_PLAYLISTS_CHANGED_EVENT))
  addToPlaylistFeedback.value = {
    playlistId,
    message: t('library.contextMenu.addedSuccess', { name: playlistName }),
  }

  if (addToPlaylistFeedbackTimer !== null) {
    window.clearTimeout(addToPlaylistFeedbackTimer)
  }
  addToPlaylistFeedbackTimer = window.setTimeout(() => {
    addToPlaylistFeedbackTimer = null
    closeContextMenu()
  }, 1200)
}

async function onRefreshLibrary(): Promise<void> {
  if (isStartingLibraryRefresh.value) {
    return
  }

  closeContextMenu()
  isStartingLibraryRefresh.value = true

  try {
    const roots = await auralis.library.getRoots()
    const activeRoot = roots[0]
    if (!activeRoot) return

    await auralis.library.startScan(activeRoot.id)
  } finally {
    isStartingLibraryRefresh.value = false
  }
}

const metadataEditor = useLibraryMetadataEditor({
  loadTrackMetadata: (trackId) => auralis.metadata.getTrackMetadata(trackId),
  updateTrackMetadata: (metadata) => auralis.metadata.updateTrackMetadata(metadata),
  captureRouteScope: captureLibraryRouteScope,
  refreshLibrary: () => loadLibraryData('metadata-save'),
  restoreFocus: restoreLibraryFocus,
  isDisposed: () => isPageUnmounted,
  getSaveErrorMessage: () => t('library.metadataEditor.errors.saveFailed'),
  logSaveError: (error) =>
    rendererDiagnostics.error({
      scope: 'library.metadata',
      message: 'Failed to save metadata edits',
      cause: error,
    }),
})

const { editingMetadata, isSavingMetadata, metadataEditError } = metadataEditor
const closeMetadataEditor = metadataEditor.close
const saveMetadata = metadataEditor.save

const initialLoadError = ref<string | null>(null)

/**
 * Viewport-first restore after a background refresh. Never drags the list
 * back to the playing / selected / keyboard-focused track; if the user
 * scrolled during the snapshot round-trip the restore is abandoned.
 */
async function restoreLibraryViewportRestore(
  capture: LibraryViewportCapture,
  isRequestCurrent: () => boolean,
): Promise<void> {
  if (!isRequestCurrent()) return

  const action = resolveLibraryViewportRestoreAction({
    captured: capture.restore,
    currentScrollGeneration: userScrollGeneration,
    previousTrackIds: capture.previousTrackIds,
    nextTrackIds: tracks.value.map((track) => track.id),
    hasTrack: (id) => libraryDerivedIndex.value.trackById.has(id),
  })

  if (action.type === 'keep-scroll-top') {
    const container = scrollRef.value
    if (!container) return
    container.scrollTop = action.scrollTop
    scheduleFirstVisibleTrackIndexUpdate()
    return
  }

  if (action.type === 'scroll-to-track') {
    scrollRenderedTrackToTop(action.trackId)
    scheduleFirstVisibleTrackIndexUpdate()
  }
}

async function loadLibraryData(mode: LibraryLoadMode = 'foreground'): Promise<LibraryLoadResult> {
  if (mode === 'metadata-save') {
    while (libraryRequestCoordinator.hasActiveForeground && !isPageUnmounted) {
      await libraryRequestCoordinator.waitForForegroundIdle()
    }

    if (isPageUnmounted) return 'stale'
  }

  const scope = captureLibraryRouteScope()
  const generation = libraryRequestCoordinator.begin(mode)
  if (generation === null) {
    return mode === 'background' ? 'queued' : 'stale'
  }
  const isRequestCurrent = () => isCurrentLibraryRequest(generation, scope)
  const isForeground = mode === 'foreground'
  const viewportCapture = isForeground ? null : captureLibraryViewportRestore()

  if (isForeground && isRequestCurrent()) {
    isLoading.value = true
    initialLoadError.value = null
    pageIdentity.value = null
  }

  try {
    const snapshot = await fetchLibrarySnapshot(scope, isRequestCurrent)
    if (!isRequestCurrent()) return 'stale'

    if (snapshot === null) {
      await router.replace('/')
      return 'redirected'
    }

    commitLibrarySnapshot(snapshot)
    initialLoadError.value = null

    if (viewportCapture) {
      await restoreLibraryViewportRestore(viewportCapture, isRequestCurrent)
    } else {
      await scrollToPlaybackTrack(isRequestCurrent)
    }

    return isRequestCurrent() ? 'committed' : 'stale'
  } catch (error) {
    if (!isRequestCurrent()) return 'stale'

    if (isForeground) {
      rendererDiagnostics.error({
        scope: 'library.catalog',
        message: 'Initial library load failed',
        cause: error,
      })
      initialLoadError.value = t('library.status.loadError')
    } else {
      rendererDiagnostics.error({
        scope: 'library.catalog',
        message: 'Background library refresh failed',
        cause: error,
      })
    }

    return 'failed'
  } finally {
    const completion = libraryRequestCoordinator.finish(generation)

    if (completion.ownedForeground) {
      if (!isPageUnmounted && isRequestCurrent()) {
        isLoading.value = false
      }
    }

    if (completion.shouldFlushBackground) {
      void loadLibraryData('background')
    }
  }
}

async function retryInitialLoad(): Promise<void> {
  await loadLibraryData('foreground')
}

function onExternalPlaylistCollectionChanged(eventName: string): void {
  if (isPageUnmounted) return
  if (!shouldRefreshLibraryForExternalPlaylistEvent(captureLibraryRouteScope(), eventName)) return
  void loadLibraryData('background')
}

function onPlaylistsChanged(): void {
  onExternalPlaylistCollectionChanged(LIBRARY_PLAYLISTS_CHANGED_EVENT)
}

function onSmartPlaylistsChanged(): void {
  onExternalPlaylistCollectionChanged(LIBRARY_SMART_PLAYLISTS_CHANGED_EVENT)
}

onMounted(async () => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener(LIBRARY_PLAYLISTS_CHANGED_EVENT, onPlaylistsChanged)
  window.addEventListener(LIBRARY_SMART_PLAYLISTS_CHANGED_EVENT, onSmartPlaylistsChanged)
  void loadRegularPlaylistItems()
  await loadLibraryData('foreground')
  if (isPageUnmounted) return

  unsubscribeChanged = auralis.library.onChanged(async (event) => {
    // Play-count ticks must not full-reload the library list
    if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') return
    await loadLibraryData('background')
  })

  unsubscribeScanProgress = auralis.library.onScanProgress(async (progress) => {
    if (progress.status === 'completed') {
      await loadLibraryData('background')
    }
  })
})

watch(
  () => route.fullPath,
  async () => {
    clearSearch()
    closeContextMenu()
    await loadLibraryData('foreground')
    await nextTick()
    scheduleFirstVisibleTrackIndexUpdate()
  },
)

function updateFirstVisibleTrackIndex(): void {
  // Both visual styles share the same virtualizer geometry, and the modern
  // viewport anchor is needed for background-refresh restore, so the first
  // visible track is tracked in modern and manuscript alike.
  if (!scrollRef.value) return

  const nextIndex = resolveFirstVisibleTrackIndex({
    scrollTop: scrollRef.value.scrollTop,
    topInset: LIBRARY_TOP_INSET,
    isCoverView: isCoverView.value,
    flatRowHeight: LIBRARY_LAYOUT_METRICS.flatRowHeight,
    trackCount: tracks.value.length,
    virtualAlbumGroups: virtualAlbumGroups.value,
    albumGroups: albumGroups.value,
  })
  if (nextIndex !== firstVisibleTrackIndex.value) {
    firstVisibleTrackIndex.value = nextIndex
  }
}

function scheduleFirstVisibleTrackIndexUpdate(): void {
  if (isPageUnmounted || pendingFirstVisibleTrackFrame !== null) return

  pendingFirstVisibleTrackFrame = window.requestAnimationFrame(() => {
    pendingFirstVisibleTrackFrame = null
    if (isPageUnmounted) return
    updateFirstVisibleTrackIndex()
  })
}

function onScroll(): void {
  scheduleFirstVisibleTrackIndexUpdate()
}

watch(
  scrollRef,
  (el, oldEl) => {
    oldEl?.removeEventListener('scroll', onScroll)
    oldEl?.removeEventListener('wheel', onUserScrollInput)
    oldEl?.removeEventListener('touchstart', onUserScrollInput)
    el?.addEventListener('scroll', onScroll, { passive: true })
    el?.addEventListener('wheel', onUserScrollInput, { passive: true })
    el?.addEventListener('touchstart', onUserScrollInput, { passive: true })
    if (el) {
      void nextTick(() => scheduleFirstVisibleTrackIndexUpdate())
    }
  },
  { immediate: true },
)

watch(
  [isManuscriptLibrary, libraryViewMode, tracks, albumGroups],
  () => {
    if (isManuscriptLibrary.value) {
      void nextTick(() => scheduleFirstVisibleTrackIndexUpdate())
    }
  },
  { immediate: true },
)

watch(libraryPresentation, async () => {
  if (!isSearchFocused.value && !hasSearchQuery.value) return
  await nextTick()
  if (isPageUnmounted) return
  if (isSearchFocused.value) {
    searchInputRef.value?.focus()
  }
})

onMounted(() => {
  window.addEventListener('keydown', onWindowKeyDown)
})

onBeforeUnmount(() => {
  isPageUnmounted = true
  invalidateLibrarySearchSession()
  libraryRequestCoordinator.invalidate()
  window.removeEventListener('keydown', onWindowKeyDown)
  scrollRef.value?.removeEventListener('scroll', onScroll)
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  if (pendingFirstVisibleTrackFrame !== null) {
    window.cancelAnimationFrame(pendingFirstVisibleTrackFrame)
    pendingFirstVisibleTrackFrame = null
  }
  if (pendingViewSwitchScrollFrame !== null) {
    window.cancelAnimationFrame(pendingViewSwitchScrollFrame)
    pendingViewSwitchScrollFrame = null
  }
  unsubscribeChanged?.()
  unsubscribeScanProgress?.()
  window.removeEventListener(LIBRARY_PLAYLISTS_CHANGED_EVENT, onPlaylistsChanged)
  window.removeEventListener(LIBRARY_SMART_PLAYLISTS_CHANGED_EVENT, onSmartPlaylistsChanged)
  clearAddToPlaylistFeedback()
})
</script>

<template>
  <section
    class="library-page relative flex h-full min-h-0 flex-col"
    :data-visual-style="libraryPresentation"
    :data-library-surface="librarySurfaceKind ?? undefined"
    :style="LIBRARY_LAYOUT_CSS_VARS"
  >
    <LibraryStatusState v-if="isLoading" kind="loading" :presentation="libraryPresentation" />

    <LibraryStatusState
      v-else-if="initialLoadError"
      kind="error"
      :presentation="libraryPresentation"
      :error-message="initialLoadError"
      @retry="retryInitialLoad"
    />

    <LibraryStatusState
      v-else-if="tracks.length === 0"
      kind="empty"
      :presentation="libraryPresentation"
      :is-playlist="playlistId !== null"
      :is-smart-playlist="smartPlaylistId !== null"
      @open-settings="openSettings"
    />

    <div
      v-else
      class="library-list-shell relative flex min-h-0 flex-1 flex-col overflow-hidden"
      @mousemove="onLibraryListMouseMove($event)"
      @mouseleave="onLibraryListMouseLeave()"
      @keydown="onListShellKeyDown"
    >
      <div class="library-search-zone">
        <Transition name="search-bar">
          <div
            v-if="shouldRenderSearchBar"
            ref="searchRootRef"
            class="library-search-bar"
            @pointerdown="onSearchBarPointerDown"
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
              @blur="onSearchInputBlur"
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
                <span class="text-red-500 font-medium">
                  {{ t('library.search.notFound') }}
                </span>
              </template>
            </span>
          </div>
        </Transition>
      </div>

      <LibraryLedgerHeader v-if="isManuscriptLibrary && !isCoverView" />

      <div
        ref="scrollRef"
        tabindex="-1"
        class="library-list-scroll flex-1 overflow-auto pb-[var(--auralis-playbar-safe-area)] outline-none"
      >
        <Transition name="library-view-fade" mode="out-in" @enter="onLibraryViewEnter">
          <div :key="libraryViewMode" class="min-h-full">
            <template v-if="!isCoverView">
              <div
                :style="{
                  height: `${totalSize + LIBRARY_TOP_INSET + LIBRARY_FLAT_BOTTOM_INSET}px`,
                  width: '100%',
                  position: 'relative',
                }"
              >
                <SongRow
                  v-for="virtualRow in virtualRows"
                  :key="String(virtualRow.key)"
                  :track="tracks[virtualRow.index]"
                  :index="virtualRow.index"
                  :total-tracks="tracks.length"
                  :presentation="libraryPresentation"
                  :now-playing="playback.state.currentTrackId === tracks[virtualRow.index].id"
                  :is-playing="playback.state.isPlaying"
                  :selected="playback.state.selectedTrackId === tracks[virtualRow.index].id"
                  :focused="keyboardFocusTrackId === tracks[virtualRow.index].id"
                  :artwork-url="getArtworkUrl(tracks[virtualRow.index].artworkCacheKey)"
                  :style="{
                    height: `${virtualRow.size}px`,
                    top: `${virtualRow.start + LIBRARY_TOP_INSET}px`,
                  }"
                  class="absolute left-0 w-full"
                  @select="onSelect"
                  @play="onPlay"
                  @focus="onRowFocus"
                  @open-context-menu="
                    (trackId, event, openReason) =>
                      onOpenContextMenu(trackId, event, 'track', openReason)
                  "
                />
              </div>
            </template>

            <template v-else>
              <div
                :style="{
                  height: `${albumGroupsTotalSize + LIBRARY_TOP_INSET}px`,
                  width: '100%',
                  position: 'relative',
                }"
              >
                <div
                  class="library-cover-virtual-window"
                  :style="{
                    paddingTop: `${albumVirtualWindowStart + LIBRARY_TOP_INSET}px`,
                  }"
                >
                  <AlbumCoverGroup
                    v-for="virtualGroup in virtualAlbumGroups"
                    :key="String(virtualGroup.key)"
                    :data-album-key="albumGroups[virtualGroup.index].key"
                    :data-first-track-id="albumGroups[virtualGroup.index].tracks[0]?.id"
                    :group="albumGroups[virtualGroup.index]"
                    :group-index="virtualGroup.index"
                    :total-groups="albumGroups.length"
                    :now-playing-track-id="playback.state.currentTrackId"
                    :is-playing="playback.state.isPlaying"
                    :selected-track-id="playback.state.selectedTrackId"
                    :focused-track-id="keyboardFocusTrackId"
                    :presentation="libraryPresentation"
                    :style="{
                      height: `${virtualGroup.size}px`,
                    }"
                    class="w-full"
                    @select="onSelect"
                    @play="onPlay"
                    @focus-track="onRowFocus"
                    @open-track-context-menu="
                      (trackId, event, openReason) =>
                        onOpenContextMenu(trackId, event, 'track', openReason)
                    "
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
      :presentation="libraryPresentation"
      :metadata="editingMetadata"
      :saving="isSavingMetadata"
      :error-message="metadataEditError"
      @close="closeMetadataEditor"
      @save="saveMetadata"
    />

    <LibraryContextMenu
      :open="contextMenu !== null"
      :presentation="libraryPresentation"
      :source="contextMenu?.source ?? 'track'"
      :anchor="contextMenuAnchor"
      :track-title="contextMenuTrackTitle"
      :album-title="contextMenuAlbumTitle"
      :can-locate-current="Boolean(playback.state.currentTrackId)"
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
      :refreshing="isStartingLibraryRefresh"
      @close="closeContextMenu"
      @locate-current="onLocateCurrentTrack"
      @play="onContextMenuPlay"
      @insert-after-current="onContextMenuInsert"
      @add-to-playlist="onAddContextTracksToPlaylist"
      @create-playlist="onCreatePlaylistAndAddContextTracks"
      @edit-metadata="onEditMetadataFromContextMenu"
      @switch-view="(mode) => switchLibraryViewMode(mode, contextMenu?.trackId ?? null)"
      @refresh="onRefreshLibrary"
    />
  </section>
</template>
