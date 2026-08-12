<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useI18n } from 'vue-i18n'
import type { EditableTrackMetadata, TrackListItem } from '@shared/types/libraryScan'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import { auralis } from '@renderer/shared/ipc/client'
import SongRow from '../components/SongRow.vue'
import AlbumCoverGroup from '../components/AlbumCoverGroup.vue'
import type { LibraryAlbumGroup } from '../components/AlbumCoverGroup.vue'
import MetadataEditDialog from '../components/MetadataEditDialog.vue'
import LibraryContextMenu from '../components/LibraryContextMenu.vue'
import VisualStyleSwitch from '../components/VisualStyleSwitch.vue'
import LibraryArchiveHeader from '../components/LibraryArchiveHeader.vue'
import LibraryLedgerHeader from '../components/LibraryLedgerHeader.vue'
import LibraryStatusState from '../components/LibraryStatusState.vue'
import { useVisualStyle } from '../composables/useVisualStyle'
import { calculateFolioInfo } from '../constants/libraryArchivePresentation'
import {
  getAlbumGroupEstimatedHeight,
  LIBRARY_LAYOUT_CSS_VARS,
  LIBRARY_LAYOUT_METRICS,
} from '../constants/libraryLayoutMetrics'
import type { LibraryPresentation } from '../types/libraryPresentation'
import type {
  LibraryContextMenuAnchor,
  LibraryContextMenuSource,
  LibraryContextMenuState,
  LibrarySearchOutcome,
  LibraryViewMode,
} from '../types/libraryInteraction'
import '../styles/manuscript.tokens.css'
import '../styles/manuscript.css'
import '../styles/manuscript.overlays.css'
import { getArtworkUrl } from '../utils/getArtworkUrl'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { normalizeSearchText } from '../utils/normalizeSearchText'

const { t } = useI18n()

const playback = usePlayback()
const route = useRoute()
const router = useRouter()

const { visualStyle } = useVisualStyle()
const isLibraryRoute = computed(() => route.name === 'library')
const isManuscriptLibrary = computed(
  () => route.name === 'library' && visualStyle.value === 'manuscript',
)
const libraryPresentation = computed<LibraryPresentation>(() =>
  isManuscriptLibrary.value ? 'manuscript' : 'modern',
)

const tracks = shallowRef<TrackListItem[]>([])
const isLoading = ref(true)
const scrollRef = ref<HTMLElement | null>(null)
const firstVisibleTrackIndex = ref(0)
const folioInfo = computed(() =>
  calculateFolioInfo(tracks.value.length, firstVisibleTrackIndex.value),
)
const editingMetadata = ref<EditableTrackMetadata | null>(null)
const isSavingMetadata = ref(false)
const metadataEditError = ref<string | null>(null)

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

// Search state
const searchQuery = ref('')
const isSearchFocused = ref(false)
const isSearchZoneHovered = ref(false)
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchRootRef = ref<HTMLElement | null>(null)
const searchOutcome = ref<LibrarySearchOutcome>({ kind: 'idle' })
let lastSearchQuery = ''
let lastMatchedTrackIndex = -1
let pendingViewSwitchTrackId: number | null = null
let pendingViewSwitchScrollFrame: number | null = null

watch(searchQuery, (q) => {
  if (!q.trim()) {
    searchOutcome.value = { kind: 'idle' }
    lastSearchQuery = ''
    lastMatchedTrackIndex = -1
  }
})

const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0)
const shouldRenderSearchBar = computed(
  () => isSearchZoneHovered.value || isSearchFocused.value || hasSearchQuery.value,
)

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

const albumGroups = computed<LibraryAlbumGroup[]>(() => {
  const groups: LibraryAlbumGroup[] = []
  const indexByKey = new Map<string, number>()

  for (let i = 0; i < tracks.value.length; i++) {
    const track = tracks.value[i]
    const artist = track.albumArtist || track.artist || ''
    const album = track.album || ''
    const key = `${artist}\u0000${album}`

    const existingIndex = indexByKey.get(key)
    if (existingIndex !== undefined) {
      const g = groups[existingIndex]
      g.albumArtist ??= track.albumArtist || track.artist
      g.album ??= track.album
      g.releaseDate ??= track.releaseDate
      g.artworkCacheKey ??= track.artworkCacheKey
      g.tracks.push(track)
    } else {
      indexByKey.set(key, groups.length)
      groups.push({
        key,
        album: track.album,
        albumArtist: track.albumArtist || track.artist,
        releaseDate: track.releaseDate,
        artworkCacheKey: track.artworkCacheKey,
        tracks: [track],
        firstTrackIndex: i,
      })
    }
  }

  return groups
})

function getAlbumGroupSize(group: LibraryAlbumGroup): number {
  return getAlbumGroupEstimatedHeight(group.tracks.length, Boolean(group.releaseDate))
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

interface FocusRestoreTarget {
  trackId: number
  source: LibraryContextMenuSource
  openReason?: 'pointer' | 'keyboard'
}

let pendingMetadataDialogReturnTarget: FocusRestoreTarget | null = null
let pendingViewSwitchReturnTarget: FocusRestoreTarget | null = null

async function restoreLibraryFocus(target: FocusRestoreTarget | null): Promise<void> {
  if (!target || !isManuscriptLibrary.value) return

  let activeTrackId = target.trackId
  const trackExists = tracks.value.some((tr) => tr.id === activeTrackId)

  if (!trackExists) {
    if (tracks.value.length === 0) {
      scrollRef.value?.focus()
      return
    }

    const selectedExists =
      playback.state.selectedTrackId != null &&
      tracks.value.some((tr) => tr.id === playback.state.selectedTrackId)
    const currentExists =
      playback.state.currentTrackId != null &&
      tracks.value.some((tr) => tr.id === playback.state.currentTrackId)

    if (selectedExists) {
      activeTrackId = playback.state.selectedTrackId!
    } else if (currentExists) {
      activeTrackId = playback.state.currentTrackId!
    } else {
      activeTrackId = tracks.value[0].id
    }
  }

  keyboardFocusTrackId.value = activeTrackId

  await scrollToTrackById(activeTrackId)
  await nextTick()
  await new Promise((resolve) => window.requestAnimationFrame(resolve))

  let targetEl: HTMLElement | null = null

  if (target.source === 'album-artwork' && trackExists) {
    targetEl = document.querySelector<HTMLElement>(
      `[data-first-track-id="${activeTrackId}"] .album-cover-artwork`,
    )
    if (!targetEl) {
      const group = albumGroups.value.find((g) => g.tracks.some((t) => t.id === activeTrackId))
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

  targetEl?.focus()
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
    pendingMetadataDialogReturnTarget = target
  } else if (handoffTarget === 'view-switch') {
    pendingViewSwitchReturnTarget = target
  } else {
    void restoreLibraryFocus(target)
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
  return tracks.value.find((track) => track.id === trackId) ?? null
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
    console.error('[Auralis] Failed to load playlists for context menu:', error)
    playlistLoadError.value =
      error instanceof Error ? error.message : t('library.contextMenu.playlistLoadError')
  } finally {
    playlistLoading.value = false
  }
}

async function reloadTracks(): Promise<void> {
  if (smartPlaylistId.value !== null) {
    const detail = await auralis.smartPlaylists.getDetail(smartPlaylistId.value)
    if (!detail) {
      await router.replace('/')
      return
    }
    tracks.value = detail.tracks
    libraryViewMode.value = detail.playlist.viewMode
  } else if (playlistId.value !== null) {
    const detail = await auralis.playlists.getDetail(playlistId.value)
    if (!detail) {
      await router.replace('/')
      return
    }
    tracks.value = detail.tracks
    libraryViewMode.value = detail.playlist.viewMode
  } else {
    tracks.value = await auralis.library.getTracks()
    libraryViewMode.value = readPersistedViewMode()
  }
  lastMatchedTrackIndex = -1
  ensureKeyboardFocusTrackId()
}

const SCROLL_POSITION_RATIO = 0.33

function scrollRenderedTrackToRatio(targetTrackId: number): boolean {
  const container = scrollRef.value
  if (!container) return false

  if (isCoverView.value) {
    const targetGroupIndex = albumGroups.value.findIndex((group) =>
      group.tracks.some((track) => track.id === targetTrackId),
    )
    if (targetGroupIndex < 0) return false

    let targetOffset = 0
    for (let index = 0; index < targetGroupIndex; index += 1) {
      targetOffset += getAlbumGroupSize(albumGroups.value[index])
    }

    container.scrollTop = Math.max(
      0,
      targetOffset + LIBRARY_TOP_INSET - container.clientHeight * SCROLL_POSITION_RATIO,
    )
    return true
  }

  const targetIndex = tracks.value.findIndex((track) => track.id === targetTrackId)
  if (targetIndex < 0) return false

  const offset =
    targetIndex * LIBRARY_LAYOUT_METRICS.flatRowHeight +
    LIBRARY_TOP_INSET -
    container.clientHeight * SCROLL_POSITION_RATIO
  container.scrollTop = Math.max(0, offset)
  return true
}

async function scrollToTrackById(targetTrackId: number): Promise<void> {
  await nextTick()
  await new Promise((resolve) => window.requestAnimationFrame(resolve))
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

  pendingViewSwitchScrollFrame = window.requestAnimationFrame(() => {
    pendingViewSwitchScrollFrame = null
    scrollRenderedTrackToRatio(targetTrackId)
    finishViewSwitch()
  })
}

async function scrollToPlaybackTrack(): Promise<void> {
  const targetTrackId = playback.state.currentTrackId ?? playback.state.selectedTrackId

  if (!targetTrackId) {
    return
  }

  await scrollToTrackById(targetTrackId)
}

function doesTrackMatchSearch(track: TrackListItem, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return false
  return [track.title, track.artist, track.albumArtist, track.album].some((v) =>
    normalizeSearchText(v).startsWith(normalizedQuery),
  )
}

function findNextMatchIndex(query: string, fromIndex: number, upTo?: number): number | null {
  const end = upTo ?? tracks.value.length
  for (let i = fromIndex; i < end; i++) {
    if (doesTrackMatchSearch(tracks.value[i], query)) return i
  }
  return null
}

async function scrollToTrackIndex(index: number): Promise<void> {
  const track = tracks.value[index]
  if (!track) return
  await scrollToTrackById(track.id)
}

async function jumpToNextSearchMatch(): Promise<void> {
  const query = searchQuery.value.trim()
  if (!query) {
    searchOutcome.value = { kind: 'idle' }
    return
  }

  const matchingIndices: number[] = []
  for (let i = 0; i < tracks.value.length; i++) {
    if (doesTrackMatchSearch(tracks.value[i], query)) {
      matchingIndices.push(i)
    }
  }

  if (matchingIndices.length === 0) {
    searchOutcome.value = { kind: 'not-found' }
    return
  }

  if (query !== lastSearchQuery) {
    lastSearchQuery = query
    lastMatchedTrackIndex = -1
  }

  const startIndex = lastMatchedTrackIndex + 1
  let nextIndex = findNextMatchIndex(query, startIndex)
  let wrapped = false

  if (nextIndex == null) {
    nextIndex = findNextMatchIndex(query, 0, startIndex)
    wrapped = true
  }

  if (nextIndex == null) {
    searchOutcome.value = { kind: 'not-found' }
    return
  }

  lastMatchedTrackIndex = nextIndex
  const matchPosition = matchingIndices.indexOf(nextIndex) + 1

  searchOutcome.value = {
    kind: 'matched',
    index: matchPosition,
    total: matchingIndices.length,
    wrapped,
  }

  await scrollToTrackIndex(nextIndex)
}

// Search event handlers
function onLibraryListMouseMove(event: MouseEvent): void {
  const containerRect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (event.clientY - containerRect.top > 48) {
    isSearchZoneHovered.value = false
    return
  }

  const bar = searchRootRef.value
  if (!bar) {
    isSearchZoneHovered.value = true
    return
  }

  const barRect = bar.getBoundingClientRect()
  isSearchZoneHovered.value =
    event.clientX >= barRect.left &&
    event.clientX <= barRect.right &&
    event.clientY >= barRect.top &&
    event.clientY <= barRect.bottom
}

function onLibraryListMouseLeave(): void {
  if (!isSearchFocused.value && !hasSearchQuery.value) {
    isSearchZoneHovered.value = false
  }
}

function onSearchBarPointerDown(): void {
  searchInputRef.value?.focus()
}

function onSearchInputFocus(): void {
  isSearchFocused.value = true
}

function onSearchInputBlur(): void {
  isSearchFocused.value = false
}

function onSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    void jumpToNextSearchMatch()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    if (searchQuery.value !== '') {
      clearSearch()
    } else {
      searchInputRef.value?.blur()
      isSearchFocused.value = false
    }
  }
}

function openSettings(): void {
  void router.push('/settings')
}

function clearSearch(): void {
  searchQuery.value = ''
  searchOutcome.value = { kind: 'idle' }
}

const keyboardFocusTrackId = ref<number | null>(null)

function ensureKeyboardFocusTrackId(): number | null {
  if (tracks.value.length === 0) {
    keyboardFocusTrackId.value = null
    return null
  }

  const currentId = keyboardFocusTrackId.value
  const isValidCurrent = currentId !== null && tracks.value.some((t) => t.id === currentId)

  if (!isValidCurrent) {
    const selectedId = playback.state.selectedTrackId
    const currentTrackId = playback.state.currentTrackId

    const candidateId =
      (selectedId && tracks.value.some((t) => t.id === selectedId) ? selectedId : null) ??
      (currentTrackId && tracks.value.some((t) => t.id === currentTrackId)
        ? currentTrackId
        : null) ??
      tracks.value[0]?.id ??
      null

    keyboardFocusTrackId.value = candidateId
    return candidateId
  }

  return currentId
}

async function moveKeyboardFocus(direction: 'next' | 'prev' | 'first' | 'last'): Promise<void> {
  if (tracks.value.length === 0) return

  const currentId = ensureKeyboardFocusTrackId()
  const currentIndex = tracks.value.findIndex((t) => t.id === currentId)
  let targetIndex = 0

  if (direction === 'first') {
    targetIndex = 0
  } else if (direction === 'last') {
    targetIndex = tracks.value.length - 1
  } else if (direction === 'next') {
    targetIndex = currentIndex >= 0 ? Math.min(tracks.value.length - 1, currentIndex + 1) : 0
  } else if (direction === 'prev') {
    targetIndex = currentIndex >= 0 ? Math.max(0, currentIndex - 1) : 0
  }

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

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return

  if (searchRootRef.value?.contains(target)) return
  isSearchFocused.value = false
  if (!hasSearchQuery.value) {
    isSearchZoneHovered.value = false
  }
}

async function onEditMetadata(trackId: number): Promise<void> {
  closeContextMenu('metadata-dialog')
  metadataEditError.value = null
  editingMetadata.value = await auralis.metadata.getTrackMetadata(trackId)
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

  const group = albumGroups.value.find((g) => g.tracks.some((t) => t.id === trackId))
  if (!group) return

  playback.insertTracksAfterCurrent(group.tracks)
}

function onPlayAlbum(trackId: number): void {
  closeContextMenu()

  const group = albumGroups.value.find((g) => g.tracks.some((t) => t.id === trackId))
  if (!group || group.tracks.length === 0) return

  playback.playTrackFromQueue(group.tracks, group.tracks[0].id, {
    shufflePool: isScopedPlaylist.value ? tracks.value : undefined,
  })
}

function getContextMenuTrackIds(): number[] {
  if (!contextMenu.value) return []

  if (contextMenu.value.source === 'album-artwork') {
    const group = albumGroups.value.find((g) =>
      g.tracks.some((track) => track.id === contextMenu.value?.trackId),
    )
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
  window.dispatchEvent(new CustomEvent('auralis-playlists-changed'))
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

function closeMetadataEditor(): void {
  if (isSavingMetadata.value) {
    return
  }

  const returnTarget =
    pendingMetadataDialogReturnTarget ??
    (editingMetadata.value
      ? { trackId: editingMetadata.value.trackId, source: 'track' as const }
      : null)
  editingMetadata.value = null
  metadataEditError.value = null
  pendingMetadataDialogReturnTarget = null

  void restoreLibraryFocus(returnTarget)
}

async function saveMetadata(metadata: EditableTrackMetadata): Promise<void> {
  isSavingMetadata.value = true
  metadataEditError.value = null

  try {
    await auralis.metadata.updateTrackMetadata(metadata)
    const returnTarget = pendingMetadataDialogReturnTarget ?? {
      trackId: metadata.trackId,
      source: 'track' as const,
    }
    await reloadTracks()
    editingMetadata.value = null
    pendingMetadataDialogReturnTarget = null

    await restoreLibraryFocus(returnTarget)
  } catch (error) {
    console.error('[Auralis] failed to save metadata edits:', error)
    metadataEditError.value = t('library.metadataEditor.errors.saveFailed')
  } finally {
    isSavingMetadata.value = false
  }
}

const initialLoadError = ref<string | null>(null)

async function loadLibraryData(): Promise<void> {
  isLoading.value = true
  initialLoadError.value = null
  try {
    await reloadTracks()
    await scrollToPlaybackTrack()
  } catch (error) {
    console.error('[Auralis] Initial library load failed:', error)
    initialLoadError.value = t('library.status.loadError')
  } finally {
    isLoading.value = false
  }
}

async function retryInitialLoad(): Promise<void> {
  await loadLibraryData()
}

onMounted(async () => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  void loadRegularPlaylistItems()
  await loadLibraryData()

  unsubscribeChanged = auralis.library.onChanged(async (event) => {
    // Play-count ticks must not full-reload the library list
    if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') return
    try {
      await reloadTracks()
    } catch (error) {
      console.error('[Auralis] Background tracks refresh failed:', error)
    }
  })

  unsubscribeScanProgress = auralis.library.onScanProgress(async (progress) => {
    if (progress.status === 'completed') {
      try {
        await reloadTracks()
      } catch (error) {
        console.error('[Auralis] Background scan tracks refresh failed:', error)
      }
    }
  })
})

watch(
  () => route.fullPath,
  async () => {
    searchQuery.value = ''
    closeContextMenu()
    await loadLibraryData()
  },
)

function updateFirstVisibleTrackIndex(): void {
  if (!isManuscriptLibrary.value || !scrollRef.value || tracks.value.length === 0) return

  let newIndex = 0
  const offset = Math.max(0, scrollRef.value.scrollTop - LIBRARY_TOP_INSET)

  if (!isCoverView.value) {
    newIndex = Math.floor(offset / LIBRARY_LAYOUT_METRICS.flatRowHeight)
  } else {
    const virtualItems = virtualAlbumGroups.value
    if (virtualItems.length > 0) {
      const firstVisibleVirtualItem =
        virtualItems.find((item) => item.end > offset) ?? virtualItems[0]
      const group = albumGroups.value[firstVisibleVirtualItem.index]
      if (group) {
        newIndex = group.firstTrackIndex
      }
    }
  }

  const clamped = Math.max(0, Math.min(newIndex, tracks.value.length - 1))
  if (clamped !== firstVisibleTrackIndex.value) {
    firstVisibleTrackIndex.value = clamped
  }
}

function onScroll(): void {
  updateFirstVisibleTrackIndex()
}

watch(
  scrollRef,
  (el, oldEl) => {
    oldEl?.removeEventListener('scroll', onScroll)
    el?.addEventListener('scroll', onScroll, { passive: true })
    if (el) {
      void nextTick(() => updateFirstVisibleTrackIndex())
    }
  },
  { immediate: true },
)

watch(
  [isManuscriptLibrary, libraryViewMode, tracks, albumGroups],
  async () => {
    if (isManuscriptLibrary.value) {
      await nextTick()
      updateFirstVisibleTrackIndex()
    }
  },
  { immediate: true },
)

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  if (['input', 'textarea', 'select', 'button'].includes(tagName)) return true
  if (target.isContentEditable) return true
  if (target.closest('[role="dialog"]') || target.closest('[role="menu"]')) return true
  return false
}

function onWindowKeyDown(e: KeyboardEvent): void {
  if (isLibraryRoute.value && e.key === '/' && !isInteractiveTarget(e.target)) {
    e.preventDefault()
    isSearchFocused.value = true
    void nextTick(() => {
      searchInputRef.value?.focus()
    })
  }
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeyDown)
  scrollRef.value?.removeEventListener('scroll', onScroll)
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  if (pendingViewSwitchScrollFrame !== null) {
    window.cancelAnimationFrame(pendingViewSwitchScrollFrame)
    pendingViewSwitchScrollFrame = null
  }
  unsubscribeChanged?.()
  unsubscribeScanProgress?.()
  clearAddToPlaylistFeedback()
})
</script>

<template>
  <section
    class="library-page relative flex h-full flex-col"
    :data-visual-style="isManuscriptLibrary ? 'manuscript' : 'modern'"
    :style="LIBRARY_LAYOUT_CSS_VARS"
  >
    <VisualStyleSwitch v-if="isLibraryRoute" />

    <LibraryArchiveHeader
      v-if="isManuscriptLibrary"
      :track-count="tracks.length"
      :current-folio="folioInfo.currentFolio"
      :total-folios="folioInfo.totalFolios"
      :is-loading="isLoading"
    />

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
      class="library-list-shell relative flex flex-1 flex-col overflow-hidden"
      @mousemove="!isScopedPlaylist && onLibraryListMouseMove($event)"
      @mouseleave="!isScopedPlaylist && onLibraryListMouseLeave()"
      @keydown="onListShellKeyDown"
    >
      <div v-if="!isScopedPlaylist" class="library-search-zone">
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
                  :presentation="isManuscriptLibrary ? 'manuscript' : 'modern'"
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
                    :presentation="isManuscriptLibrary ? 'manuscript' : 'modern'"
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
