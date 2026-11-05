<script setup lang="ts">
import ArtistLetterIndex from '@renderer/shared/components/ArtistLetterIndex.vue'
import { currentArtistLetter, visibleIndex } from '@renderer/shared/artistIndexPosition'
import {
  buildArtistAnchors,
  resolveIndexArtist,
  type ArtistIndexLetter,
} from '@shared/utils/artistIndex'
import { useSettingsDialog } from '@renderer/features/settings/composables/useSettingsDialog'
import { useAlbumMetadataEditor } from '@renderer/shared/albumMetadataEditor'
import { useAlbumGridViewport } from '../composables/useAlbumGridViewport'
import { useAlbumSearchSession } from '../composables/useAlbumSearchSession'
import { useAlbumContextMenu } from '../composables/useAlbumContextMenu'
import { useAlbumPlaybackActions } from '../composables/useAlbumPlaybackActions'
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, toRef, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import MainPageStatus from '@renderer/shared/components/MainPageStatus.vue'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import { writeAlbumDetailSnapshot } from '../albumDetailSnapshot'
import AlbumCard from '../components/AlbumCard.vue'
import AlbumGridTransitionLayer from '../components/AlbumGridTransitionLayer.vue'
import type { AlbumSummary } from '../types'
import { indexedAlbums } from '../utils/indexedAlbums'
import { getAlbumCatalogIndex } from '../utils/albumCatalogIndex'
import { useAlbumCatalog } from '../composables/useAlbumCatalog'
import { useAlbumGridLayout } from '../composables/useAlbumGridLayout'
import { useAlbumListParameters } from '@renderer/features/appearance/composables/useAlbumListParameters'
import { usePageParameterSource } from '@renderer/features/appearance/composables/usePageParameters'
import { usePageParameters } from '@renderer/features/appearance/composables/usePageParameters'
import PageParameterTrigger from '@renderer/features/appearance/components/PageParameterTrigger.vue'
import { useAlbumLayoutTransition } from '../composables/useAlbumLayoutTransition'
import type { AlbumLayoutTransitionParticipant } from '@renderer/shared/animation/albumLayoutTransition'

defineOptions({ name: 'AlbumsPage' })
const props = withDefaults(
  defineProps<{ isTransitioning?: boolean; isLayoutResizing?: boolean }>(),
  {
    isTransitioning: false,
    isLayoutResizing: false,
  },
)
const route = useRoute()
usePageParameterSource('albums')
const router = useRouter()
const { t } = useI18n()
const { openSettings } = useSettingsDialog()
const pageParameters = usePageParameters()
const hasPageParameters = computed(() => pageParameters?.context.value?.kind === 'albums')
const { songText } = useChineseTextDisplay()
const playback = usePlayback()
const { displayMode } = usePlayerDisplayMode()
const hasCurrentTrack = computed(() => Boolean(playback.state.currentTrackId))
const isPageActive = ref(false)
const canRefresh = computed(
  () => isPageActive.value && route.name === 'albums' && !props.isTransitioning,
)
const {
  tracks,
  isLoading,
  error: catalogError,
  refresh: loadAlbums,
} = useAlbumCatalog(auralis.library, canRefresh, (cause) =>
  rendererDiagnostics.error({
    scope: 'albums.catalog',
    message: 'Failed to load albums',
    cause,
  }),
)
const loadError = computed(() => (catalogError.value ? t('albums.status.loadError') : null))
const scrollRef = ref<HTMLElement | null>(null)
const indexScrollTop = ref(0)
const albumMetadataEditor = useAlbumMetadataEditor()
function editContextAlbum(): void {
  const album = contextMenu.value?.album
  if (!album) return
  albumMetadataEditor?.open({
    album: { title: album.title, artist: album.albumArtist },
    returnFocusTo: document.activeElement as HTMLElement,
  })
  closeContextMenu()
}
const albumMenu = useAlbumContextMenu({
  hasCurrentTrack,
  revealInExplorer: (request) => auralis.library.revealInExplorer(request),
  t,
})
const {
  contextMenu,
  contextMenuRef,
  revealFeedback,
  closeContextMenu,
  onContextMenuKeydown,
  openContextMenu,
  revealContextAlbumInExplorer,
} = albumMenu

const catalogIndex = computed(() => getAlbumCatalogIndex(tracks.value))
const albums = computed<AlbumSummary[]>(() => indexedAlbums(catalogIndex.value.albums))
const artistAnchors = computed(() =>
  buildArtistAnchors(
    albums.value,
    (album) => album.indexArtist ?? resolveIndexArtist(album.albumArtist, album.tracks[0]?.artist),
  ),
)
// A letter can begin in the middle of a grid row. Keep the requested letter
// until the viewport moves away, rather than selecting that row's first artist.
const artistJump = ref<{ letter: ArtistIndexLetter; scrollTop: number } | null>(null)
function jumpToArtist(index: number): void {
  const letter = currentArtistLetter(artistAnchors.value, index)
  rowVirtualizer.value.scrollToIndex(Math.floor(index / columnCount.value), { align: 'start' })
  artistJump.value = letter ? { letter, scrollTop: scrollRef.value?.scrollTop ?? 0 } : null
}
function onAlbumScroll(event: Event): void {
  const scrollTop = (event.target as HTMLElement).scrollTop
  indexScrollTop.value = scrollTop
  if (artistJump.value && Math.abs(scrollTop - artistJump.value.scrollTop) > 1)
    artistJump.value = null
}
const albumSearch = useAlbumSearchSession({
  tracks,
  albums,
  canRefresh,
  displayMode,
  contextMenu,
  isLayoutTransitionActive: computed(() => isLayoutTransitionActive.value),
  scrollToAlbum: (index) => {
    artistJump.value = null
    rowVirtualizer.value.scrollToIndex(Math.floor(index / columnCount.value), { align: 'center' })
  },
  t,
})
const {
  searchOutcome,
  searchQuery,
  searchInputRef,
  searchRootRef,
  highlightedAlbumKey,
  searchFeedback,
  onSearchBlur,
  onSearchFocus,
  onSearchKeydown,
} = albumSearch
const { metadataOccupancy } = useAlbumListParameters()
const gridLayout = useAlbumGridLayout({
  container: scrollRef,
  isResizing: toRef(props, 'isLayoutResizing'),
  isActive: isPageActive,
  albumKeys: computed(() => albums.value.map((album) => album.key)),
  measure: () => rowVirtualizer.value.measure(),
  metadataOccupancy,
})
const { gridWidth, columnCount, rowHeight, update: updateAdaptiveGrid } = gridLayout
const gridViewport = useAlbumGridViewport({
  albums,
  scrollRef,
  isPageActive,
  canRefresh,
  columnCount,
  rowHeight,
  updateAdaptiveGrid,
})
const { albumRows, rowVirtualizer, virtualRows, totalHeight, connectGrid } = gridViewport
watch([albums, columnCount], () => {
  artistJump.value = null
})
const currentLetter = computed(() => {
  if (artistJump.value) return artistJump.value.letter
  const row = visibleIndex(virtualRows.value, indexScrollTop.value - 16)
  return currentArtistLetter(artistAnchors.value, row === null ? null : row * columnCount.value)
})
const gridContentRef = ref<HTMLElement | null>(null)
const transitionLayerRef = ref<InstanceType<typeof AlbumGridTransitionLayer> | null>(null)
const emit = defineEmits<{ 'cancel-layout-transition': [] }>()
const {
  isLayoutTransitionActive,
  participant: layoutTransition,
  cancelCurrentTransition,
} = useAlbumLayoutTransition({
  container: scrollRef,
  layer: transitionLayerRef,
  isPageActive,
  grid: gridLayout,
  getVirtualRows: () => virtualRows.value,
  requestCancel: () => emit('cancel-layout-transition'),
  getIndex: () =>
    scrollRef.value?.parentElement?.querySelector<HTMLElement>('.main-artist-index') ?? null,
})
watch(metadataOccupancy, () => {
  if (isLayoutTransitionActive.value) emit('cancel-layout-transition')
})
function seedAlbumDetailSnapshot(album: AlbumSummary): void {
  writeAlbumDetailSnapshot({
    albumArtist: album.albumArtist,
    albumTitle: album.title,
    artworkCacheKey: album.artworkCacheKey,
    releaseDate: album.releaseDate,
    tracks: catalogIndex.value.selectTracks(album.albumArtist, album.title),
    moreAlbums: catalogIndex.value.moreAlbums(album.albumArtist, album.title),
    catalogTracks: tracks.value,
  })
}

watch(albums, () => {
  if (isLayoutTransitionActive.value) emit('cancel-layout-transition')
})

function locateCurrentAlbum(): void {
  closeContextMenu()
  const currentTrack = playback.state.currentTrack
  if (!currentTrack) return

  const currentAlbumArtist = currentTrack.albumArtist || currentTrack.artist || 'Unknown Artist'
  const currentAlbumTitle = currentTrack.album || 'Unknown Album'
  const currentAlbum = albums.value.find(
    (album) => album.albumArtist === currentAlbumArtist && album.title === currentAlbumTitle,
  )
  if (currentAlbum) seedAlbumDetailSnapshot(currentAlbum)
  void router.push({
    name: 'album-detail',
    query: {
      artist: currentAlbumArtist,
      title: currentAlbumTitle,
    },
  })
}

function openAlbum(album: AlbumSummary): void {
  closeContextMenu()
  seedAlbumDetailSnapshot(album)
  void router.push({
    name: 'album-detail',
    query: {
      artist: album.albumArtist,
      title: album.title,
    },
  })
}

function openContextAlbumInCd(): void {
  const album = contextMenu.value?.album
  closeContextMenu()
  if (!album) return
  void router.push({
    name: 'cd-albums',
    query: { artist: album.albumArtist, title: album.title },
  })
}

const { playAlbum, playContextAlbum, insertContextAlbum } = useAlbumPlaybackActions({
  tracks,
  catalogIndex,
  playback,
  hasCurrentTrack,
  contextMenu,
  closeContextMenu,
})

onActivated(() => {
  isPageActive.value = true
  albumSearch.activate()
  window.addEventListener('resize', closeContextMenu)
  void connectGrid()
})

onBeforeRouteLeave(() => {
  if (isLayoutTransitionActive.value) emit('cancel-layout-transition')
  gridViewport.rememberScroll()
  closeContextMenu()
})

function disconnectPage(): void {
  artistJump.value = null
  albumMenu.deactivate()
  isPageActive.value = false
  albumSearch.deactivate()
  window.removeEventListener('resize', closeContextMenu)
  gridViewport.disconnect()
}

onDeactivated(() => {
  cancelCurrentTransition()
  disconnectPage()
  gridViewport.persistScroll()
})

onBeforeUnmount(() => {
  gridViewport.dispose()
  cancelCurrentTransition()
  disconnectPage()
  albumSearch.dispose()
})

defineExpose<AlbumLayoutTransitionParticipant>(layoutTransition)
</script>

<template>
  <section class="albums-page main-page-frame relative">
    <div class="albums-toolbar">
      <div
        ref="searchRootRef"
        class="page-search-tools"
        :class="{ 'page-search-tools--parameters': hasPageParameters }"
      >
        <div
          class="library-search-bar"
          :class="{ 'library-search-bar--parameters': hasPageParameters }"
          @pointerdown="!isLoading && albums.length > 0 && searchInputRef?.focus()"
        >
          <span class="i-lucide-search text-sm text-[var(--auralis-text-faint)]"></span>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            class="library-search-input"
            :disabled="isLoading || albums.length === 0"
            :placeholder="t('albums.search.placeholder')"
            :aria-label="t('albums.search.ariaLabel')"
            spellcheck="false"
            @focus="onSearchFocus"
            @blur="onSearchBlur"
            @keydown="onSearchKeydown"
          />
          <span
            v-if="searchOutcome !== 'idle'"
            class="library-search-outcome ml-auto shrink-0 select-none text-xs tabular-nums"
            :class="
              searchOutcome === 'not-found'
                ? 'text-[var(--auralis-danger)] font-medium'
                : 'text-[var(--auralis-text-muted)]'
            "
            role="status"
            aria-live="polite"
          >
            {{ searchFeedback }}
          </span>
          <span v-if="hasPageParameters" class="page-search-parameters">
            <PageParameterTrigger @pointerdown.stop />
          </span>
        </div>
      </div>
    </div>

    <MainPageStatus v-if="isLoading" kind="loading" :title="t('albums.status.loading')" />
    <MainPageStatus
      v-else-if="loadError"
      kind="error"
      :title="loadError"
      :action-label="t('albums.status.retry')"
      @action="loadAlbums"
    />

    <template v-else>
      <div class="albums-page-body">
        <div
          v-if="albums.length > 0"
          ref="scrollRef"
          class="albums-scroll main-page-scroll"
          @scroll="onAlbumScroll"
        >
          <div
            ref="gridContentRef"
            class="relative w-full"
            :class="{ 'albums-grid-content--transitioning': isLayoutTransitionActive }"
            :inert="isLayoutTransitionActive ? true : undefined"
            :aria-hidden="isLayoutTransitionActive ? 'true' : undefined"
            :style="{
              height: `${totalHeight}px`,
              width: gridWidth === null ? undefined : `${gridWidth}px`,
            }"
            :aria-label="`${albums.length} albums`"
          >
            <div
              v-for="virtualRow in virtualRows"
              :key="String(virtualRow.key)"
              class="albums-grid-row absolute left-0 top-0 grid w-full gap-x-5"
              :data-row-index="virtualRow.index"
              :style="{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
              }"
            >
              <AlbumCard
                v-for="(album, columnIndex) in albumRows[virtualRow.index]"
                :key="album.key"
                :data-album-key="album.key"
                :album="album"
                :highlighted="highlightedAlbumKey === album.key"
                :catalog-number="virtualRow.index * columnCount + columnIndex + 1"
                @open="openAlbum"
                @play="playAlbum"
                @open-context-menu="openContextMenu"
              />
            </div>
          </div>
        </div>

        <MainPageStatus
          v-else
          kind="empty"
          :show-icon="false"
          :title="t('albums.status.empty')"
          :description="t('albums.status.emptyDescription')"
          :action-label="t('albums.status.manageSources')"
          @action="openSettings('library')"
        />
        <ArtistLetterIndex
          v-if="albums.length > 0"
          class="main-artist-index"
          :anchors="artistAnchors"
          :current="currentLetter"
          :label="t('albums.cd.indexPage.letters')"
          @select="jumpToArtist"
        />
      </div>
    </template>

    <AlbumGridTransitionLayer ref="transitionLayerRef" />

    <Teleport to="body">
      <div v-if="contextMenu" class="albums-overlay fixed inset-0 z-[60]" @click="closeContextMenu">
        <div
          ref="contextMenuRef"
          class="collection-context-menu library-context-menu frosted-context-menu fixed w-55"
          role="menu"
          :aria-label="t('nav.albums')"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          @click.stop
          @keydown="onContextMenuKeydown"
        >
          <button
            class="library-context-menu-item"
            role="menuitem"
            type="button"
            data-album-menu-action="play"
            @click="playContextAlbum"
          >
            <span class="i-lucide-circle-play"></span>
            <span>{{
              t('albums.contextMenu.play', { title: songText(contextMenu.album.title) })
            }}</span>
          </button>

          <button
            class="library-context-menu-item library-context-menu-item--insert"
            type="button"
            role="menuitem"
            data-album-menu-action="insert"
            :disabled="!hasCurrentTrack"
            @click="insertContextAlbum"
          >
            <span class="i-lucide-list-end"></span>
            <span>{{
              t('albums.contextMenu.insert', { title: songText(contextMenu.album.title) })
            }}</span>
          </button>

          <div class="library-context-menu-separator" role="separator"></div>

          <template v-if="hasCurrentTrack">
            <button
              class="library-context-menu-item"
              type="button"
              role="menuitem"
              data-album-menu-action="locate"
              @click="locateCurrentAlbum"
            >
              <span class="i-lucide-locate-fixed"></span>
              <span>{{ t('albums.contextMenu.locateCurrent') }}</span>
            </button>
          </template>

          <button
            class="library-context-menu-item"
            role="menuitem"
            type="button"
            data-album-menu-action="open-in-cd"
            @click="openContextAlbumInCd"
          >
            <span class="i-lucide-disc"></span>
            <span>{{ t('albums.contextMenu.openInCd') }}</span>
          </button>

          <div class="library-context-menu-separator" role="separator"></div>

          <button
            class="library-context-menu-item"
            role="menuitem"
            type="button"
            data-album-menu-action="edit-album"
            @click="editContextAlbum"
          >
            <span class="i-lucide-pencil" /><span>{{ t('albumMetadataEditor.editAlbum') }}</span>
          </button>
          <button
            class="library-context-menu-item"
            role="menuitem"
            type="button"
            data-album-menu-action="open-in-explorer"
            @click="revealContextAlbumInExplorer"
          >
            <span class="i-lucide-folder-open"></span>
            <span>{{ t('albums.contextMenu.openInExplorer') }}</span>
          </button>
          <template v-if="revealFeedback">
            <div class="library-context-menu-separator"></div>
            <div
              class="flex items-center gap-2 px-3 py-1.5 auralis-type-caption font-medium text-red-500 select-none"
              role="alert"
              aria-live="polite"
            >
              <span class="i-lucide-circle-alert text-sm shrink-0"></span>
              <span>{{ revealFeedback }}</span>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.albums-page {
  padding-top: 0;
}

.albums-toolbar {
  flex: 0 0 auto;
  display: flex;
  /* Align with the covers, excluding their shadow gutters and the letter index. */
  padding: 8px 48px 8px 20px;
}

.albums-toolbar .page-search-tools {
  position: relative;
  top: auto;
  left: auto;
  transform: none;
  width: 100%;
  max-width: 100%;
}

.albums-toolbar .library-search-bar {
  box-sizing: border-box;
  border-radius: 8px;
  border-color: var(--auralis-border-subtle);
  background: color-mix(in srgb, var(--auralis-text) 3%, var(--auralis-main-bg));
  box-shadow: none;
}

.albums-toolbar :deep(.page-parameter-trigger) {
  border-radius: 4px;
}

.albums-page-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.albums-scroll.main-page-scroll {
  margin-right: 28px;
  min-height: 0;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
  scrollbar-gutter: auto;
  /* Separate the first covers from the persistent toolbar. */
  padding-top: 12px;
  padding-bottom: var(--auralis-playbar-safe-area);
}

.albums-scroll::-webkit-scrollbar {
  display: none;
}

.albums-grid-row {
  box-sizing: border-box;
  /* 左右 20px 阴影缓冲，避免滚动容器裁切封面投影。 */
  padding-left: 20px;
  padding-right: 20px;
  /* 行内允许封面阴影溢出，避免相邻行互相裁切。 */
  overflow: visible;
  transition: opacity 0.3s ease;
}

.albums-grid-content--transitioning {
  visibility: hidden;
  /* Resolve the target layout before its snapshot fades in, rather than at handoff. */
}

:where([data-reduced-motion='true']) .albums-grid-row {
  transition: none !important;
}
</style>
