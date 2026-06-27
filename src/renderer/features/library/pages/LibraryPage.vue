<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { EditableTrackMetadata, TrackListItem } from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'
import SongRow from '../components/SongRow.vue'
import MetadataEditDialog from '../components/MetadataEditDialog.vue'
import { getArtworkUrl } from '../utils/getArtworkUrl'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'

const playback = usePlayback()

const tracks = shallowRef<TrackListItem[]>([])
const isLoading = ref(true)
const scrollRef = ref<HTMLElement | null>(null)
const editingMetadata = ref<EditableTrackMetadata | null>(null)
const isSavingMetadata = ref(false)
const metadataEditError = ref<string | null>(null)
const contextMenu = ref<{ trackId: number; x: number; y: number } | null>(null)
let unsubscribeChanged: (() => void) | null = null

// Search state
const searchQuery = ref('')
const isSearchFocused = ref(false)
const isSearchZoneHovered = ref(false)
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchRootRef = ref<HTMLElement | null>(null)
let lastSearchQuery = ''
let lastMatchedTrackIndex = -1

const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0)
const shouldRenderSearchBar = computed(
  () => isSearchZoneHovered.value || isSearchFocused.value || hasSearchQuery.value,
)
const contextMenuTrack = computed(() =>
  contextMenu.value ? getTrackById(contextMenu.value.trackId) : null,
)

const NATIVE_LIST_LIMIT = 6000
const shouldUseNativeList = computed(() => tracks.value.length <= NATIVE_LIST_LIMIT)

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: tracks.value.length,
    enabled: !shouldUseNativeList.value,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => 44,
    overscan: 12,
  })),
)

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())

function onSelect(trackId: number) {
  playback.selectTrack(trackId)
}

function onPlay(trackId: number) {
  playback.playTrackFromQueue(tracks.value, trackId)
}

function closeContextMenu(): void {
  contextMenu.value = null
}

function onOpenContextMenu(trackId: number, event: MouseEvent): void {
  playback.selectTrack(trackId)

  const menuWidth = 220
  const menuHeight = 260
  const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8)
  const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8)

  contextMenu.value = {
    trackId,
    x: Math.max(8, x),
    y: Math.max(8, y),
  }
}

function getTrackById(trackId: number): TrackListItem | null {
  return tracks.value.find((track) => track.id === trackId) ?? null
}

async function reloadTracks(): Promise<void> {
  tracks.value = await auralis.library.getTracks()
  lastMatchedTrackIndex = -1
}

async function scrollToTrackById(targetTrackId: number): Promise<void> {
  await nextTick()
  await new Promise((resolve) => window.requestAnimationFrame(resolve))

  const SCROLL_POSITION_RATIO = 0.35

  if (shouldUseNativeList.value) {
    const container = scrollRef.value
    const targetRow = container?.querySelector<HTMLElement>(`[data-track-id="${targetTrackId}"]`)
    if (container && targetRow) {
      container.scrollTop = Math.max(
        0,
        targetRow.offsetTop - container.clientHeight * SCROLL_POSITION_RATIO,
      )
    }
    return
  }

  const targetIndex = tracks.value.findIndex((track) => track.id === targetTrackId)

  if (targetIndex < 0) {
    return
  }

  const container = scrollRef.value
  if (container) {
    const estimatedRowSize = 44
    const offset = targetIndex * estimatedRowSize - container.clientHeight * SCROLL_POSITION_RATIO
    container.scrollTop = Math.max(0, offset)
  }
}

async function scrollToPlaybackTrack(): Promise<void> {
  const targetTrackId = playback.state.currentTrackId ?? playback.state.selectedTrackId

  if (!targetTrackId) {
    return
  }

  await scrollToTrackById(targetTrackId)
}

// Search matching
function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase()
}

function doesTrackMatchSearch(track: TrackListItem, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return false
  return [track.title, track.artist, track.albumArtist, track.album].some((v) =>
    normalizeSearchText(v).includes(normalizedQuery),
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

  const SCROLL_POSITION_RATIO = 0.33
  await nextTick()
  await new Promise((resolve) => window.requestAnimationFrame(resolve))

  if (shouldUseNativeList.value) {
    const container = scrollRef.value
    const targetRow = container?.querySelector<HTMLElement>(`[data-track-id="${track.id}"]`)
    if (container && targetRow) {
      container.scrollTop = Math.max(
        0,
        targetRow.offsetTop - container.clientHeight * SCROLL_POSITION_RATIO,
      )
    }
    return
  }

  const container = scrollRef.value
  if (container) {
    const estimatedRowSize = 44
    const offset = index * estimatedRowSize - container.clientHeight * SCROLL_POSITION_RATIO
    container.scrollTop = Math.max(0, offset)
  }
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
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  isSearchZoneHovered.value = event.clientY - rect.top <= 48
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
  await playback.playTrackFromQueue(tracks.value, trackId)
}

function onInsertAfterCurrent(trackId: number): void {
  closeContextMenu()

  const track = getTrackById(trackId)
  if (!track) return

  playback.insertTrackAfterCurrent(track)
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

  try {
    await reloadTracks()
  } finally {
    isLoading.value = false
  }

  await scrollToPlaybackTrack()

  unsubscribeChanged = auralis.library.onChanged(async () => {
    await reloadTracks()
  })
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  unsubscribeChanged?.()
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
      @mousemove="onLibraryListMouseMove"
      @mouseleave="onLibraryListMouseLeave"
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
        <div v-if="shouldUseNativeList">
          <SongRow
            v-for="(track, index) in tracks"
            :key="track.id"
            v-memo="[
              track.id,
              track.title,
              track.artist,
              track.album,
              track.durationSeconds,
              track.artworkCacheKey,
              index,
              playback.state.currentTrackId === track.id,
            ]"
            :data-track-id="track.id"
            :track="track"
            :index="index"
            :now-playing="playback.state.currentTrackId === track.id"
            :artwork-url="getArtworkUrl(track.artworkCacheKey)"
            @select="onSelect"
            @play="onPlay"
            @open-context-menu="onOpenContextMenu"
          />
        </div>

        <div v-else :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
          <SongRow
            v-for="virtualRow in virtualRows"
            :key="String(virtualRow.key)"
            :track="tracks[virtualRow.index]"
            :index="virtualRow.index"
            :now-playing="playback.state.currentTrackId === tracks[virtualRow.index].id"
            :artwork-url="getArtworkUrl(tracks[virtualRow.index].artworkCacheKey)"
            :style="{
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
              willChange: 'transform',
            }"
            class="absolute left-0 top-0 w-full"
            @select="onSelect"
            @play="onPlay"
            @open-context-menu="onOpenContextMenu"
          />
        </div>
      </div>
    </div>

    <div v-else class="flex flex-1 items-center justify-center">
      <p class="text-sm text-[var(--auralis-text-faint)]">
        No tracks found. Add music folders in Settings.
      </p>
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
        <div
          class="library-context-menu fixed w-55"
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
            class="library-context-menu-item"
            type="button"
            @click="onPlayContextTrack(contextMenu.trackId)"
          >
            <span class="i-lucide-play"></span>
            <span>播放"{{ contextMenuTrack?.title || 'Unknown Title' }}"</span>
          </button>
          <div class="library-context-menu-separator"></div>
          <button
            class="library-context-menu-item"
            type="button"
            :disabled="
              !playback.state.currentTrackId ||
              playback.state.currentTrackId === contextMenu.trackId
            "
            @click="onInsertAfterCurrent(contextMenu.trackId)"
          >
            <span class="i-lucide-list-plus"></span>
            <span>插播</span>
          </button>
          <div class="library-context-menu-separator"></div>
          <button
            class="library-context-menu-item"
            type="button"
            @click="onEditMetadata(contextMenu.trackId)"
          >
            <span class="i-lucide-pencil"></span>
            <span>编辑元数据</span>
          </button>
        </div>
      </div>
    </Teleport>
  </section>
</template>
