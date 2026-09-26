<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import CdViewSwitch from '../components/CdViewSwitch.vue'
import { cdAlbumCatalogSession } from '../composables/cdAlbumCatalogSession'
import { useCdCanvasTheme } from '../composables/useCdCanvasTheme'
import {
  cdAlbumFocusQuery,
  cdIndexReleaseLabel,
  findCdIndexAlbumRow,
  groupCdAlbumIndexArtists,
  layoutCdAlbumIndex,
  type CdIndexArtistBlock,
  type CdIndexLetterAnchor,
} from '../utils/cdAlbumIndex'
import {
  consumeCdIndexReturn,
  rememberCdIndexDeparture,
  type CdIndexReturnMarker,
} from '../utils/cdAlbumIndexReturn'
import type { AlbumSummary } from '../types'

const HEADING_ROW_HEIGHT = 48
const SHARED_HEADING_HEIGHT = 38
const CARD_META_HEIGHT = 58
const COLUMN_GAP = 20
const ROW_GAP = 28
const TARGET_CARD_WIDTH = 190
const MAX_CARD_WIDTH = 210
const MIN_COLUMNS = 3
const MAX_COLUMNS = 6
const GRID_PADDING_X = 72

const { t } = useI18n()
const router = useRouter()
const { cdCanvasTheme, setCdCanvasTheme } = useCdCanvasTheme()
const themeToggleLabel = computed(() =>
  t(cdCanvasTheme.value === 'dark' ? 'albums.cd.theme.toLight' : 'albums.cd.theme.toDark'),
)
const albums = shallowRef<AlbumSummary[]>([])
const isLoading = ref(true)
const error = shallowRef<unknown>(null)

const scrollRef = ref<HTMLElement | null>(null)
const columnCount = ref(MIN_COLUMNS)
const albumRowHeight = ref(TARGET_CARD_WIDTH + CARD_META_HEIGHT + ROW_GAP)
const sharedRowHeight = computed(() => albumRowHeight.value + SHARED_HEADING_HEIGHT)
const highlightKey = ref<string | null>(null)
const imageFailed = ref(new Set<string>())
let resizeObserver: ResizeObserver | null = null
let highlightTimer: ReturnType<typeof setTimeout> | null = null
let pendingReturn: CdIndexReturnMarker | null = null
let disposed = false
let unsubscribe: (() => void) | null = null
let loadRevision = 0

const failed = computed(() => error.value != null && albums.value.length === 0)
const artistGroups = computed(() => groupCdAlbumIndexArtists(albums.value))
const indexModel = computed(() => layoutCdAlbumIndex(artistGroups.value, columnCount.value))
const rows = computed(() => indexModel.value.rows)
const anchors = computed(() => indexModel.value.anchors)
const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: rows.value.length,
    getScrollElement: () => scrollRef.value,
    estimateSize: (index: number) => {
      const row = rows.value[index]
      if (row?.type === 'heading') return HEADING_ROW_HEIGHT
      if (row?.type === 'shared') return sharedRowHeight.value
      return albumRowHeight.value
    },
    overscan: 4,
    getItemKey: (index: number) => rows.value[index]?.key ?? index,
  })),
)
const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalHeight = computed(() => rowVirtualizer.value.getTotalSize())

function updateGrid(): void {
  const container = scrollRef.value
  if (!container?.isConnected || container.clientWidth === 0) return
  const availableWidth = Math.max(0, container.clientWidth - GRID_PADDING_X)
  let columns = Math.floor((availableWidth + COLUMN_GAP) / (TARGET_CARD_WIDTH + COLUMN_GAP))
  columns = Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, columns))
  let cardWidth = Math.max(1, (availableWidth - COLUMN_GAP * (columns - 1)) / columns)
  while (columns < MAX_COLUMNS && cardWidth > MAX_CARD_WIDTH) {
    columns += 1
    cardWidth = Math.max(1, (availableWidth - COLUMN_GAP * (columns - 1)) / columns)
  }
  const nextRowHeight = cardWidth + CARD_META_HEIGHT + ROW_GAP
  if (columnCount.value !== columns || albumRowHeight.value !== nextRowHeight) {
    columnCount.value = columns
    albumRowHeight.value = nextRowHeight
    rowVirtualizer.value.measure()
  }
}

function clearHighlight(): void {
  highlightKey.value = null
  if (highlightTimer) {
    clearTimeout(highlightTimer)
    highlightTimer = null
  }
}

function showReturnHighlight(albumKey: string): void {
  clearHighlight()
  highlightKey.value = albumKey
  highlightTimer = setTimeout(clearHighlight, 1000)
}

async function restoreReturn(marker: CdIndexReturnMarker): Promise<void> {
  await nextTick()
  updateGrid()
  await nextTick()
  if (disposed || !scrollRef.value) return
  const rowIndex = findCdIndexAlbumRow(rows.value, marker.albumKey)
  rowVirtualizer.value.scrollToOffset(marker.scrollTop)
  await nextTick()
  const visible = rowVirtualizer.value.getVirtualItems().some((item) => item.index === rowIndex)
  if (rowIndex >= 0 && !visible) {
    rowVirtualizer.value.scrollToIndex(rowIndex, { align: 'center' })
  }
  if (rowIndex >= 0) showReturnHighlight(marker.albumKey)
}

async function finishReturn(): Promise<void> {
  const marker = pendingReturn
  const container = scrollRef.value
  if (!marker || !container || container.clientWidth === 0) return
  pendingReturn = null
  await restoreReturn(marker)
}

function connectScroll(): void {
  const container = scrollRef.value
  if (!container) return
  updateGrid()
  if (!resizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      updateGrid()
      void finishReturn()
    })
    resizeObserver.observe(container)
  }
  void finishReturn()
}

function releaseDate(album: AlbumSummary): string {
  return cdIndexReleaseLabel(album.releaseDate) ?? t('albums.cd.indexPage.missingDate')
}

function headingArtist(index: number): string | null {
  const row = rows.value[index]
  return row?.type === 'heading' ? row.artist : null
}

function albumsAt(index: number): AlbumSummary[] | null {
  const row = rows.value[index]
  return row?.type === 'albums' ? row.albums : null
}

function sharedBlocksAt(index: number): CdIndexArtistBlock[] | null {
  const row = rows.value[index]
  return row?.type === 'shared' ? row.blocks : null
}

function coverFailed(key: string): boolean {
  return imageFailed.value.has(key)
}

function markCoverFailed(key: string): void {
  imageFailed.value = new Set(imageFailed.value).add(key)
}

function openAlbum(album: AlbumSummary): void {
  rememberCdIndexDeparture({
    albumKey: album.key,
    scrollTop: scrollRef.value?.scrollTop ?? 0,
  })
  void router.push({ name: 'cd-albums', query: cdAlbumFocusQuery(album) })
}

function jumpToLetter(anchor: CdIndexLetterAnchor): void {
  if (anchor.rowIndex === null) return
  rowVirtualizer.value.scrollToIndex(anchor.rowIndex, { align: 'start' })
}

function toggleTheme(): void {
  const nextTheme = cdCanvasTheme.value === 'dark' ? 'light' : 'dark'
  const transitionDocument = document as Document & {
    startViewTransition?: (update: () => void | Promise<void>) => unknown
  }
  if (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    !transitionDocument.startViewTransition
  ) {
    setCdCanvasTheme(nextTheme)
    return
  }
  transitionDocument.startViewTransition(() => {
    setCdCanvasTheme(nextTheme)
    return nextTick()
  })
}

async function loadAlbums(): Promise<void> {
  const requestRevision = ++loadRevision
  if (albums.value.length === 0) isLoading.value = true
  error.value = null
  try {
    const nextAlbums = await cdAlbumCatalogSession.load()
    if (disposed || requestRevision !== loadRevision) return
    albums.value = nextAlbums
  } catch (cause) {
    if (disposed || requestRevision !== loadRevision) return
    error.value = cause
    rendererDiagnostics.error({
      scope: 'albums.cd-index',
      message: 'Failed to load CD album index',
      cause,
    })
  } finally {
    if (!disposed && requestRevision === loadRevision) isLoading.value = false
  }
}

function refresh(): void {
  void loadAlbums()
}

watch(isLoading, async (loading) => {
  if (loading || failed.value || rows.value.length === 0) return
  await nextTick()
  if (!disposed) connectScroll()
})

onMounted(() => {
  pendingReturn = consumeCdIndexReturn()
  unsubscribe = cdAlbumCatalogSession.subscribe(refresh)
  refresh()
})

onBeforeUnmount(() => {
  disposed = true
  unsubscribe?.()
  const routeName = router.currentRoute.value.name
  if (routeName !== 'cd-albums' && routeName !== 'cd-album-index') {
    cdAlbumCatalogSession.clear()
  }
  resizeObserver?.disconnect()
  resizeObserver = null
  clearHighlight()
})
</script>

<template>
  <section
    class="cd-index-page"
    :data-theme="cdCanvasTheme"
    :aria-label="t('albums.cd.indexPage.title')"
  >
    <header class="cd-index-header">
      <button
        type="button"
        class="cd-index-back"
        :aria-label="t('albums.detail.returnToAlbums')"
        @click="router.push({ name: 'albums' })"
      >
        <span class="i-lucide-x" aria-hidden="true"></span>
      </button>
      <CdViewSwitch current="index" />
    </header>

    <div v-if="isLoading || failed || rows.length === 0" class="cd-index-status" role="status">
      <template v-if="failed">
        <p>{{ t('albums.status.loadError') }}</p>
        <button type="button" @click="refresh">{{ t('albums.status.retry') }}</button>
      </template>
      <p v-else>{{ t(isLoading ? 'albums.status.loading' : 'albums.status.empty') }}</p>
    </div>

    <div v-else class="cd-index-body">
      <div ref="scrollRef" class="cd-index-scroll">
        <div class="cd-index-canvas" :style="{ height: `${totalHeight}px` }">
          <div
            v-for="virtualRow in virtualRows"
            :key="rows[virtualRow.index]?.key ?? virtualRow.index"
            class="cd-index-row"
            :class="{
              'cd-index-row--albums': albumsAt(virtualRow.index) !== null,
              'cd-index-row--shared': sharedBlocksAt(virtualRow.index) !== null,
            }"
            :style="{
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
              gridTemplateColumns:
                albumsAt(virtualRow.index) !== null || sharedBlocksAt(virtualRow.index) !== null
                  ? `repeat(${columnCount}, minmax(0, 1fr))`
                  : undefined,
            }"
          >
            <h2 v-if="headingArtist(virtualRow.index) !== null" class="cd-index-artist" dir="auto">
              {{ headingArtist(virtualRow.index) }}
            </h2>
            <template v-else-if="albumsAt(virtualRow.index)">
              <button
                v-for="album in albumsAt(virtualRow.index)"
                :key="album.key"
                type="button"
                class="cd-index-card"
                :class="{ 'cd-index-card--return': highlightKey === album.key }"
                :aria-label="t('albums.cd.indexPage.openAlbum', { title: album.title })"
                @click="openAlbum(album)"
                @animationend="highlightKey === album.key ? clearHighlight() : undefined"
              >
                <span class="cd-index-cover">
                  <img
                    v-if="getArtworkUrl(album.artworkCacheKey) && !coverFailed(album.key)"
                    :src="getArtworkUrl(album.artworkCacheKey)!"
                    :alt="album.title"
                    loading="lazy"
                    decoding="async"
                    draggable="false"
                    @error="markCoverFailed(album.key)"
                  />
                  <span
                    v-else
                    class="i-lucide-disc-3 cd-index-placeholder"
                    aria-hidden="true"
                  ></span>
                </span>
                <span class="cd-index-title" dir="auto">{{ album.title }}</span>
                <span class="cd-index-date">{{ releaseDate(album) }}</span>
              </button>
            </template>
            <template v-else-if="sharedBlocksAt(virtualRow.index)">
              <div
                v-for="block in sharedBlocksAt(virtualRow.index)"
                :key="block.artist"
                class="cd-index-shared-block"
                :style="{
                  gridColumn: `span ${block.albums.length}`,
                }"
              >
                <h2 v-tooltip.overflow="block.artist" class="cd-index-shared-artist" dir="auto">
                  {{ block.artist }}
                </h2>
                <div
                  class="cd-index-shared-albums"
                  :style="{
                    gridTemplateColumns: `repeat(${block.albums.length}, minmax(0, 1fr))`,
                  }"
                >
                  <button
                    v-for="album in block.albums"
                    :key="album.key"
                    type="button"
                    class="cd-index-card"
                    :class="{ 'cd-index-card--return': highlightKey === album.key }"
                    :aria-label="t('albums.cd.indexPage.openAlbum', { title: album.title })"
                    @click="openAlbum(album)"
                    @animationend="highlightKey === album.key ? clearHighlight() : undefined"
                  >
                    <span class="cd-index-cover">
                      <img
                        v-if="getArtworkUrl(album.artworkCacheKey) && !coverFailed(album.key)"
                        :src="getArtworkUrl(album.artworkCacheKey)!"
                        :alt="album.title"
                        loading="lazy"
                        decoding="async"
                        draggable="false"
                        @error="markCoverFailed(album.key)"
                      />
                      <span
                        v-else
                        class="i-lucide-disc-3 cd-index-placeholder"
                        aria-hidden="true"
                      ></span>
                    </span>
                    <span class="cd-index-title" dir="auto">{{ album.title }}</span>
                    <span class="cd-index-date">{{ releaseDate(album) }}</span>
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
      <nav class="cd-index-letters" :aria-label="t('albums.cd.indexPage.letters')">
        <button
          v-for="anchor in anchors"
          :key="anchor.letter"
          :class="{ 'cd-index-letter--other': anchor.letter === '#' }"
          type="button"
          :disabled="anchor.rowIndex === null"
          @click="jumpToLetter(anchor)"
        >
          {{ anchor.letter }}
        </button>
        <button
          type="button"
          class="cd-index-theme"
          :aria-label="themeToggleLabel"
          @click="toggleTheme"
        >
          <span
            v-if="cdCanvasTheme === 'dark'"
            class="i-lucide-sun cd-index-theme-icon"
            aria-hidden="true"
          ></span>
          <span v-else class="i-lucide-moon cd-index-theme-icon" aria-hidden="true"></span>
        </button>
      </nav>
    </div>
  </section>
</template>

<style scoped>
.cd-index-page {
  --cd-bg: #eeeeec;
  --cd-text: #292929;
  --cd-text-muted: #62625b;
  --cd-text-faint: #85857d;
  --cd-border: #bdbdb9;
  --cd-hover-bg: #e1e1de;
  --cd-focus-ring: #292929;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  position: relative;
  background: var(--cd-bg);
  color: var(--cd-text);
  color-scheme: light;
  view-transition-name: cd-canvas;
}

.cd-index-page[data-theme='dark'] {
  --cd-bg: #2b2d30;
  --cd-text: #e6e4de;
  --cd-text-muted: #a8a69f;
  --cd-text-faint: #7d7b75;
  --cd-border: #5c6168;
  --cd-hover-bg: #35383d;
  --cd-focus-ring: #d8d6d0;
  background-image: repeating-linear-gradient(
    135deg,
    rgba(224, 226, 230, 0.045) 0 1px,
    transparent 1px 7px
  );
  color-scheme: dark;
}

.cd-index-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  padding: 16px 24px 8px;
}

.cd-index-back,
.cd-index-status button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.cd-index-back {
  width: 32px;
  height: 32px;
  padding: 0;
  color: var(--cd-text-muted);
  -webkit-app-region: no-drag;
}

.cd-index-back {
  justify-self: start;
}

.cd-index-back:hover,
.cd-index-letters button:hover:not(:disabled) {
  color: var(--cd-text);
  background: transparent;
}

.cd-index-back:focus-visible,
.cd-index-theme:focus-visible,
.cd-index-card:focus-visible,
.cd-index-letters button:focus-visible,
.cd-index-status button:focus-visible {
  outline: 2px solid var(--cd-focus-ring);
  outline-offset: 3px;
}

.cd-index-status {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--cd-text-muted);
}

.cd-index-status p {
  margin: 0;
}

.cd-index-status button {
  min-height: 32px;
  padding: 0 14px;
  border-color: var(--cd-border);
  border-radius: 3px;
}

.cd-index-body {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
}

.cd-index-scroll {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 8px 48px 72px 28px;
}

.cd-index-canvas {
  position: relative;
  width: 100%;
}

.cd-index-row {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  box-sizing: border-box;
}

.cd-index-row--albums,
.cd-index-row--shared {
  display: grid;
  column-gap: 20px;
  align-content: start;
}

.cd-index-shared-block {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.cd-index-shared-artist {
  margin: 0;
  padding: 8px 0 6px;
  height: 38px;
  box-sizing: border-box;
  font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  font-size: 18px;
  font-weight: 400;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cd-index-shared-albums {
  display: grid;
  column-gap: 20px;
  align-content: start;
}

.cd-index-artist {
  margin: 8px 0 0;
  font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  font-size: 22px;
  font-weight: 400;
  line-height: 1.3;
}

.cd-index-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.cd-index-cover {
  display: flex;
  aspect-ratio: 1;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--cd-hover-bg);
}

.cd-index-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cd-index-placeholder {
  width: 40px;
  height: 40px;
  color: var(--cd-text-faint);
}

.cd-index-card:hover .cd-index-cover,
.cd-index-card:focus-visible .cd-index-cover,
.cd-index-card--return .cd-index-cover {
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.14);
}

.cd-index-title,
.cd-index-date {
  overflow: hidden;
  font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  font-weight: 400;
  font-synthesis: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cd-index-title {
  font-size: 13px;
  font-style: italic;
  line-height: 1.3;
}

.cd-index-date {
  color: var(--cd-text-muted);
  font-size: 12px;
  line-height: 1.3;
}

.cd-index-letters {
  position: absolute;
  top: 8px;
  right: 10px;
  bottom: 8px;
  width: 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  container-type: size;
  overflow: hidden;
  font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  font-weight: 400;
  font-synthesis: none;
  -webkit-app-region: no-drag;
}

.cd-index-letters button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 22px;
  height: clamp(10px, calc((100cqh - 27px) / 28), 14px);
  min-height: 0;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  appearance: none;
  background: transparent;
  color: var(--cd-text-muted);
  font-family: inherit;
  font-size: 11px;
  font-weight: 400;
  line-height: 1;
  cursor: pointer;
}

.cd-index-letters .cd-index-letter--other {
  font-size: 13px;
}

.cd-index-letters button:disabled {
  opacity: 0.35;
  cursor: default;
}

.cd-index-theme-icon {
  display: block;
  width: 11px;
  height: 11px;
  max-width: 100%;
  max-height: 80%;
}

@media (prefers-reduced-motion: no-preference) {
  .cd-index-card--return .cd-index-cover {
    animation: cd-index-return 1s ease forwards;
  }

  .cd-index-cover {
    transition: box-shadow 160ms ease;
  }
}

@keyframes cd-index-return {
  0%,
  20% {
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.16);
  }

  100% {
    box-shadow: 0 0 0 rgba(0, 0, 0, 0);
  }
}
</style>
