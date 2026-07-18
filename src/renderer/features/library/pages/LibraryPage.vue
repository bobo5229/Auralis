<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { EditableTrackMetadata, TrackListItem } from '@shared/types/libraryScan'
import type { SidebarPlaylistItem } from '@shared/types/playlist'
import { auralis } from '@renderer/shared/ipc/client'
import SongRow from '../components/SongRow.vue'
import AlbumCoverGroup from '../components/AlbumCoverGroup.vue'
import type { LibraryAlbumGroup } from '../components/AlbumCoverGroup.vue'
import LiquidGlassPanel from '../components/LiquidGlassPanel.vue'
import MetadataEditDialog from '../components/MetadataEditDialog.vue'
import { getArtworkUrl } from '../utils/getArtworkUrl'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { normalizeSearchText } from '../utils/normalizeSearchText'

const playback = usePlayback()
const route = useRoute()
const router = useRouter()

const tracks = shallowRef<TrackListItem[]>([])
const isLoading = ref(true)
const scrollRef = ref<HTMLElement | null>(null)
const editingMetadata = ref<EditableTrackMetadata | null>(null)
const isSavingMetadata = ref(false)
const metadataEditError = ref<string | null>(null)
type LibraryViewMode = 'flat' | 'cover'
type LibraryContextMenuSource = 'track' | 'album-artwork'

interface LibraryContextMenuState {
  trackId: number
  x: number
  y: number
  source: LibraryContextMenuSource
}

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
let lastSearchQuery = ''
let lastMatchedTrackIndex = -1
let pendingViewSwitchTrackId: number | null = null
let pendingViewSwitchScrollFrame: number | null = null

const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0)
const shouldRenderSearchBar = computed(
  () => isSearchZoneHovered.value || isSearchFocused.value || hasSearchQuery.value,
)
const emptyMessage = computed(() => {
  if (isSmartPlaylist.value) return '此智能歌单中暂无歌曲。'
  if (isPlaylist.value) return '暂无歌曲'
  return 'No tracks found. Add music folders in Settings.'
})
const contextMenuTrack = computed(() =>
  contextMenu.value ? getTrackById(contextMenu.value.trackId) : null,
)

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: tracks.value.length,
    enabled: !isCoverView.value,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => 44,
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
  const metadataHeight = group.releaseDate ? 322 : 302
  const tracksHeight = group.tracks.length * 40
  return Math.max(metadataHeight, tracksHeight) + 56
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

function onSelect(trackId: number) {
  playback.selectTrack(trackId)
}

function onPlay(trackId: number) {
  playback.playTrackFromQueue(tracks.value, trackId, {
    shufflePool: isScopedPlaylist.value ? tracks.value : undefined,
  })
}

function closeContextMenu(): void {
  contextMenu.value = null
  clearAddToPlaylistFeedback()
}

function onOpenContextMenu(
  trackId: number,
  event: MouseEvent,
  source: LibraryContextMenuSource = 'track',
): void {
  playback.selectTrack(trackId)

  const menuWidth = 448
  const menuHeight = 392
  const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8)
  const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8)

  contextMenu.value = {
    trackId,
    x: Math.max(8, x),
    y: Math.max(8, y),
    source,
  }
  void loadRegularPlaylistItems()
}

function onOpenAlbumArtworkContextMenu(anchorTrackId: number, event: MouseEvent): void {
  onOpenContextMenu(anchorTrackId, event, 'album-artwork')
}

function getTrackById(trackId: number): TrackListItem | null {
  return tracks.value.find((track) => track.id === trackId) ?? null
}

async function loadRegularPlaylistItems(): Promise<void> {
  const items = await auralis.playlists.listSidebarItems()
  regularPlaylistItems.value = items.filter((item) => item.kind === 'playlist')
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

  const estimatedRowSize = 44
  const offset =
    targetIndex * estimatedRowSize +
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

function switchLibraryViewMode(nextMode: LibraryViewMode, anchorTrackId: number): void {
  pendingViewSwitchTrackId = anchorTrackId
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
  closeContextMenu()
}

function onLibraryViewEnter(): void {
  if (pendingViewSwitchTrackId === null) return

  const targetTrackId = pendingViewSwitchTrackId

  if (scrollRenderedTrackToRatio(targetTrackId)) {
    pendingViewSwitchTrackId = null
    return
  }

  pendingViewSwitchScrollFrame = window.requestAnimationFrame(() => {
    pendingViewSwitchScrollFrame = null
    scrollRenderedTrackToRatio(targetTrackId)
    pendingViewSwitchTrackId = null
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
  if (!query) return

  if (query !== lastSearchQuery) {
    lastSearchQuery = query
    lastMatchedTrackIndex = -1
  }

  const startIndex = lastMatchedTrackIndex + 1
  const nextIndex =
    findNextMatchIndex(query, startIndex) ?? findNextMatchIndex(query, 0, startIndex)

  if (nextIndex == null) return

  lastMatchedTrackIndex = nextIndex
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
    jumpToNextSearchMatch()
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
  closeContextMenu()
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

function getAlbumNameForTrack(trackId: number): string {
  const group = albumGroups.value.find((g) => g.tracks.some((t) => t.id === trackId))
  return group?.album || 'Unknown Album'
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
    message: `已添加到「${playlistName}」`,
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

  editingMetadata.value = null
  metadataEditError.value = null
}

async function saveMetadata(metadata: EditableTrackMetadata): Promise<void> {
  isSavingMetadata.value = true
  metadataEditError.value = null

  try {
    await auralis.metadata.updateTrackMetadata(metadata)
    await reloadTracks()
    editingMetadata.value = null
  } catch (error) {
    metadataEditError.value =
      error instanceof Error ? error.message : 'Unable to save metadata edits'
  } finally {
    isSavingMetadata.value = false
  }
}

onMounted(async () => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  void loadRegularPlaylistItems()

  try {
    await reloadTracks()
  } finally {
    isLoading.value = false
  }

  await scrollToPlaybackTrack()

  unsubscribeChanged = auralis.library.onChanged(async (event) => {
    // Play-count ticks must not full-reload the library list
    if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') return
    await reloadTracks()
  })

  unsubscribeScanProgress = auralis.library.onScanProgress(async (progress) => {
    if (progress.status === 'completed') {
      await reloadTracks()
    }
  })
})

watch(
  () => route.fullPath,
  async () => {
    isLoading.value = true
    searchQuery.value = ''
    closeContextMenu()
    try {
      await reloadTracks()
      await scrollToPlaybackTrack()
    } finally {
      isLoading.value = false
    }
  },
)

onBeforeUnmount(() => {
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
  <section class="flex h-full flex-col">
    <div v-if="isLoading" class="flex flex-1 items-center justify-center">
      <p class="text-sm text-[var(--auralis-text-faint)]">Loading library...</p>
    </div>

    <div
      v-else-if="tracks.length > 0"
      class="library-list-shell relative flex flex-1 flex-col overflow-hidden"
      @mousemove="!isScopedPlaylist && onLibraryListMouseMove($event)"
      @mouseleave="!isScopedPlaylist && onLibraryListMouseLeave()"
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
              placeholder="搜索歌曲、艺术家、专辑"
              aria-label="Search library songs"
              spellcheck="false"
              @focus="onSearchInputFocus"
              @blur="onSearchInputBlur"
              @keydown="onSearchKeydown"
            />
          </div>
        </Transition>
      </div>

      <div
        ref="scrollRef"
        class="library-list-scroll flex-1 overflow-auto pb-[var(--auralis-playbar-safe-area)]"
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
                  :now-playing="playback.state.currentTrackId === tracks[virtualRow.index].id"
                  :artwork-url="getArtworkUrl(tracks[virtualRow.index].artworkCacheKey)"
                  :style="{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start + LIBRARY_TOP_INSET}px)`,
                    willChange: 'transform',
                  }"
                  class="absolute left-0 top-0 w-full"
                  @select="onSelect"
                  @play="onPlay"
                  @open-context-menu="onOpenContextMenu"
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
                <AlbumCoverGroup
                  v-for="virtualGroup in virtualAlbumGroups"
                  :key="String(virtualGroup.key)"
                  :data-album-key="albumGroups[virtualGroup.index].key"
                  :data-first-track-id="albumGroups[virtualGroup.index].tracks[0]?.id"
                  :group="albumGroups[virtualGroup.index]"
                  :now-playing-track-id="playback.state.currentTrackId"
                  :style="{
                    height: `${virtualGroup.size}px`,
                    transform: `translateY(${virtualGroup.start + LIBRARY_TOP_INSET}px)`,
                  }"
                  class="absolute left-0 top-0 w-full"
                  @select="onSelect"
                  @play="onPlay"
                  @open-track-context-menu="(trackId, event) => onOpenContextMenu(trackId, event)"
                  @open-album-artwork-context-menu="onOpenAlbumArtworkContextMenu"
                />
              </div>
            </template>
          </div>
        </Transition>
      </div>
    </div>

    <div v-else class="flex flex-1 items-center justify-center">
      <p class="text-sm text-[var(--auralis-text-faint)]">{{ emptyMessage }}</p>
    </div>

    <MetadataEditDialog
      :metadata="editingMetadata"
      :saving="isSavingMetadata"
      :error-message="metadataEditError"
      @close="closeMetadataEditor"
      @save="saveMetadata"
    />

    <Teleport to="body">
      <div v-if="contextMenu" class="fixed inset-0 z-[60]" @click="closeContextMenu">
        <LiquidGlassPanel
          class="library-context-menu library-context-menu-root fixed w-55"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          @click.stop
        >
          <button
            class="library-context-menu-item"
            type="button"
            :disabled="!playback.state.currentTrackId"
            @click="onLocateCurrentTrack"
          >
            <span class="i-lucide-locate-fixed"></span>
            <span>定位到当前歌曲</span>
          </button>
          <div class="library-context-menu-separator"></div>
          <button
            v-if="contextMenu.source === 'album-artwork'"
            class="library-context-menu-item"
            type="button"
            @click="onPlayAlbum(contextMenu.trackId)"
          >
            <span class="i-lucide-play"></span>
            <span>播放「{{ getAlbumNameForTrack(contextMenu.trackId) }}」</span>
          </button>
          <button
            v-else
            class="library-context-menu-item"
            type="button"
            @click="onPlayContextTrack(contextMenu.trackId)"
          >
            <span class="i-lucide-play"></span>
            <span>播放「{{ contextMenuTrack?.title || 'Unknown Title' }}」</span>
          </button>
          <div class="library-context-menu-separator"></div>
          <button
            v-if="contextMenu.source === 'album-artwork'"
            class="library-context-menu-item"
            type="button"
            :disabled="!playback.state.currentTrackId"
            @click="onInsertAlbumAfterCurrent(contextMenu.trackId)"
          >
            <span class="i-lucide-list-plus"></span>
            <span>插播「{{ getAlbumNameForTrack(contextMenu.trackId) }}」</span>
          </button>
          <button
            v-else-if="playback.state.currentTrackId !== contextMenu.trackId"
            class="library-context-menu-item"
            type="button"
            :disabled="!playback.state.currentTrackId"
            @click="onInsertAfterCurrent(contextMenu.trackId)"
          >
            <span class="i-lucide-list-plus"></span>
            <span>插播「{{ contextMenuTrack?.title || 'Unknown Title' }}」</span>
          </button>
          <div
            v-if="
              contextMenu.source === 'album-artwork' ||
              playback.state.currentTrackId !== contextMenu.trackId
            "
            class="library-context-menu-separator"
          ></div>
          <div class="library-context-menu-submenu-root">
            <button class="library-context-menu-item" type="button">
              <span class="i-lucide-list-plus"></span>
              <span class="library-context-menu-text">添加到歌单</span>
              <span class="i-lucide-chevron-right library-context-menu-chevron"></span>
            </button>
            <div class="playlist-add-submenu">
              <LiquidGlassPanel class="library-context-menu playlist-add-submenu-panel">
                <button
                  v-for="playlist in regularPlaylistItems"
                  :key="playlist.id"
                  class="library-context-menu-item"
                  type="button"
                  @click="onAddContextTracksToPlaylist(playlist)"
                >
                  <span class="i-lucide-list-music"></span>
                  <span>
                    {{
                      addToPlaylistFeedback?.playlistId === playlist.id
                        ? addToPlaylistFeedback.message
                        : playlist.name
                    }}
                  </span>
                </button>
                <div
                  v-if="regularPlaylistItems.length > 0"
                  class="library-context-menu-separator"
                ></div>
                <button
                  class="library-context-menu-item"
                  type="button"
                  :disabled="isCreatingPlaylistFromMenu"
                  @click="onCreatePlaylistAndAddContextTracks"
                >
                  <span class="i-lucide-plus"></span>
                  <span>新建歌单</span>
                </button>
              </LiquidGlassPanel>
            </div>
          </div>
          <div class="library-context-menu-separator"></div>
          <button
            class="library-context-menu-item"
            type="button"
            @click="onEditMetadata(contextMenu.trackId)"
          >
            <span class="i-lucide-pencil"></span>
            <span>编辑元数据</span>
          </button>
          <div class="library-context-menu-separator"></div>
          <button
            v-if="!isCoverView"
            class="library-context-menu-item"
            type="button"
            @click="switchLibraryViewMode('cover', contextMenu.trackId)"
          >
            <span class="i-lucide-layout-grid"></span>
            <span>切换到封面视图</span>
          </button>
          <button
            v-else
            class="library-context-menu-item"
            type="button"
            @click="switchLibraryViewMode('flat', contextMenu.trackId)"
          >
            <span class="i-lucide-list-music"></span>
            <span>切换到平铺视图</span>
          </button>
          <div class="library-context-menu-separator"></div>
          <button
            class="library-context-menu-item"
            type="button"
            :disabled="isStartingLibraryRefresh"
            @click="onRefreshLibrary"
          >
            <span class="i-lucide-refresh-cw"></span>
            <span>刷新</span>
          </button>
        </LiquidGlassPanel>
      </div>
    </Teleport>
  </section>
</template>
