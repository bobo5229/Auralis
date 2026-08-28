<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
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
import type { LibraryViewMode } from '../types/libraryInteraction'
import '@renderer/features/appearance/styles/manuscript.tokens.css'
import '../styles/manuscript.css'
import '../styles/manuscript.overlays.css'
import { getArtworkUrl } from '../utils/getArtworkUrl'
import { createLibraryCatalogViewIndex } from '../utils/libraryCatalogViewIndex'
import { resolveLibraryPresentation, resolveLibrarySurfaceKind } from '../utils/libraryPresentation'
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
import { useLibraryCatalogLoader } from '../composables/useLibraryCatalogLoader'

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

const viewport = useLibraryViewport({
  scrollRef,
  tracks,
  isCoverView,
  derivedIndex: libraryDerivedIndex,
  albumGroups,
  virtualAlbumGroups,
  currentTrackId: () => playback.state.currentTrackId,
  selectedTrackId: () => playback.state.selectedTrackId,
  isDisposed: () => isPageUnmounted,
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
  dispose: disposeLibraryContextMenu,
} = useLibraryContextMenu({
  tracks,
  isScopedPlaylist: () => isScopedPlaylist.value,
  getTrackById: (trackId) => libraryDerivedIndex.value.trackById.get(trackId) ?? null,
  getAlbumGroupByTrackId,
  currentTrackId: () => playback.state.currentTrackId,
  onTrackActivated: (trackId) => {
    keyboardFocusTrackId.value = trackId
    playback.selectTrack(trackId)
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
  restoreFocus: restoreLibraryFocus,
  t: (key, values) => (values ? String(t(key, values)) : String(t(key))),
  listSidebarItems: () => auralis.playlists.listSidebarItems(),
  createPlaylist: () => auralis.playlists.create(),
  addTracksToPlaylist: (playlistId, trackIds) => auralis.playlists.addTracks(playlistId, trackIds),
  getLibraryRoots: () => auralis.library.getRoots(),
  startLibraryScan: (rootId) => auralis.library.startScan(rootId),
})

function switchLibraryViewMode(nextMode: LibraryViewMode, anchorTrackId?: number | null): void {
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

const {
  initialLoadError,
  loadLibraryData,
  retryInitialLoad,
  bindExternalPlaylistEvents,
  subscribeLibraryEvents,
  dispose: disposeLibraryCatalogLoader,
} = useLibraryCatalogLoader({
  isDisposed: () => isPageUnmounted,
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
    ensureKeyboardFocusTrackId()
    scheduleLibrarySearchIndex(snapshot.tracks)
  },
  captureViewportRestore: captureLibraryViewportRestore,
  restoreViewportRestore: restoreLibraryViewportRestore,
  scrollToPlaybackTrack,
  replaceWithLibraryHome: () => router.replace('/'),
  loadErrorMessage: () => t('library.status.loadError'),
  onLibraryChanged: (callback) => auralis.library.onChanged(callback),
  onScanProgress: (callback) => auralis.library.onScanProgress(callback),
})

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

onMounted(async () => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('keydown', onWindowKeyDown)
  bindExternalPlaylistEvents()
  void loadRegularPlaylistItems()
  await loadLibraryData('foreground')
  if (isPageUnmounted) return
  subscribeLibraryEvents()
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

onBeforeUnmount(() => {
  isPageUnmounted = true
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
