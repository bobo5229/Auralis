<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { TrackListItem } from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { formatDuration } from '@renderer/features/library/utils/formatDuration'
import { formatArtist } from '@renderer/features/library/utils/formatArtist'

import type { AlbumSummary } from '../types'

const route = useRoute()
const router = useRouter()
const playback = usePlayback()
const tracks = shallowRef<TrackListItem[]>([])
const detailRootRef = ref<HTMLElement | null>(null)
const coverStageRef = ref<HTMLElement | null>(null)
const highlightedTrackId = ref<number | null>(null)
let unsubscribeChanged: (() => void) | null = null
let trackingFrame: number | null = null
let highlightTimeout: ReturnType<typeof setTimeout> | null = null
let pointerPosition: { x: number; y: number } | null = null
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const MAX_COVER_TILT_DEGREES = 12

const albumArtist = computed(() => String(route.query.artist ?? ''))
const displayAlbumArtist = computed(() => formatArtist(albumArtist.value))
const albumTitle = computed(() => String(route.query.title ?? ''))

/** Native scrollbar has no :hover-on-bar; detect pointer in bottom strip instead. */
const MORE_SCROLLBAR_HIT_PX = 14
const isMoreScrollbarActive = ref(false)
let isMoreScrollbarDragging = false

function isPointerInMoreScrollbarZone(scroller: HTMLElement, clientY: number): boolean {
  const rect = scroller.getBoundingClientRect()
  const fromBottom = rect.bottom - clientY
  return fromBottom >= 0 && fromBottom <= MORE_SCROLLBAR_HIT_PX
}

function setMoreScrollbarActive(active: boolean): void {
  if (isMoreScrollbarActive.value === active) return
  isMoreScrollbarActive.value = active
}

function onMoreAlbumsPointerMove(event: PointerEvent): void {
  if (isMoreScrollbarDragging) return
  const scroller = event.currentTarget as HTMLElement
  setMoreScrollbarActive(isPointerInMoreScrollbarZone(scroller, event.clientY))
}

function onMoreAlbumsPointerLeave(): void {
  if (isMoreScrollbarDragging) return
  setMoreScrollbarActive(false)
}

function onMoreScrollbarDragEnd(): void {
  if (!isMoreScrollbarDragging) return
  isMoreScrollbarDragging = false
  window.removeEventListener('pointerup', onMoreScrollbarDragEnd)
  window.removeEventListener('pointercancel', onMoreScrollbarDragEnd)
  setMoreScrollbarActive(false)
}

function onMoreAlbumsPointerDown(event: PointerEvent): void {
  const scroller = event.currentTarget as HTMLElement
  if (!isPointerInMoreScrollbarZone(scroller, event.clientY)) return
  isMoreScrollbarDragging = true
  setMoreScrollbarActive(true)
  window.addEventListener('pointerup', onMoreScrollbarDragEnd)
  window.addEventListener('pointercancel', onMoreScrollbarDragEnd)
}

const albumTracks = computed(() =>
  tracks.value
    .filter((track) => {
      const artist = track.albumArtist || track.artist || 'Unknown Artist'
      const title = track.album || 'Unknown Album'
      return artist === albumArtist.value && title === albumTitle.value
    })
    .sort((left, right) => {
      const discOrder = (left.discNo ?? 1) - (right.discNo ?? 1)
      if (discOrder !== 0) return discOrder

      const trackOrder =
        (left.trackNo ?? Number.MAX_SAFE_INTEGER) - (right.trackNo ?? Number.MAX_SAFE_INTEGER)
      if (trackOrder !== 0) return trackOrder

      return (left.title ?? '').localeCompare(right.title ?? '')
    }),
)

const albumGroups = computed(() => {
  const groupedAlbums = new Map<string, TrackListItem[]>()

  for (const track of tracks.value) {
    const artist = track.albumArtist || track.artist || 'Unknown Artist'
    const title = track.album || 'Unknown Album'
    const key = `${artist}\u0000${title}`
    const existing = groupedAlbums.get(key)

    if (existing) {
      existing.push(track)
    } else {
      groupedAlbums.set(key, [track])
    }
  }

  return [...groupedAlbums.entries()].map(([key, groupTracks]) => ({ key, tracks: groupTracks }))
})

const artworkUrl = computed(() => {
  const artworkKey =
    albumTracks.value.find((track) => track.artworkCacheKey)?.artworkCacheKey ?? null
  return getArtworkUrl(artworkKey)
})

const releaseDate = computed(
  () => albumTracks.value.find((track) => track.releaseDate)?.releaseDate ?? null,
)
const copyright = computed(
  () => albumTracks.value.find((track) => track.copyright)?.copyright ?? null,
)
const totalDurationSeconds = computed(() =>
  albumTracks.value.reduce((total, track) => total + (track.durationSeconds ?? 0), 0),
)
const dominantGenres = computed(() => {
  const genreCounts = new Map<string, { label: string; count: number; firstSeen: number }>()
  let firstSeen = 0

  for (const track of albumTracks.value) {
    const trackGenres = new Map<string, string>()

    for (const rawGenre of (track.genre ?? '').split(/[,;]/)) {
      const genre = rawGenre.trim()
      if (genre) trackGenres.set(genre.toLocaleLowerCase(), genre)
    }

    for (const [key, genre] of trackGenres) {
      const existing = genreCounts.get(key)

      if (existing) {
        existing.count += 1
      } else {
        genreCounts.set(key, { label: genre, count: 1, firstSeen })
        firstSeen += 1
      }
    }
  }

  return [...genreCounts.values()]
    .sort((left, right) => right.count - left.count || left.firstSeen - right.firstSeen)
    .slice(0, 2)
    .map((genre) => genre.label)
})
const albumMetaItems = computed(() => [
  dominantGenres.value.join(', ') || 'Unknown genre',
  formatTrackCount(albumTracks.value.length),
  formatAlbumDuration(totalDurationSeconds.value),
])

/** Year for sort: missing/invalid → +∞ so unknown years sort after dated albums (ascending). */
function albumYearSortKey(releaseDate: string | null): number {
  if (!releaseDate) return Number.POSITIVE_INFINITY
  const year = Number(releaseDate.slice(0, 4))
  return Number.isFinite(year) ? year : Number.POSITIVE_INFINITY
}

function formatAlbumYearLabel(releaseDate: string | null): string {
  if (!releaseDate) return '未知'
  const year = releaseDate.slice(0, 4)
  return /^\d{4}$/.test(year) ? `${year}年` : '未知'
}

/**
 * Other albums by the same album-artist key as the current detail page.
 * Cards navigate to that album's detail page via openAlbum.
 */
const moreAlbumsByArtist = computed<AlbumSummary[]>(() => {
  const artistKey = albumArtist.value
  if (!artistKey || artistKey === 'Unknown Artist') return []

  const currentKey = `${artistKey}\u0000${albumTitle.value}`
  const grouped = new Map<string, AlbumSummary>()

  for (const track of tracks.value) {
    const albumArtistName = track.albumArtist || track.artist || 'Unknown Artist'
    if (albumArtistName !== artistKey) continue

    const title = track.album || 'Unknown Album'
    const key = `${albumArtistName}\u0000${title}`
    if (key === currentKey) continue

    const existing = grouped.get(key)
    if (existing) {
      existing.releaseDate ??= track.releaseDate
      existing.artworkCacheKey ??= track.artworkCacheKey
      existing.tracks.push(track)
      continue
    }

    grouped.set(key, {
      key,
      title,
      albumArtist: albumArtistName,
      releaseDate: track.releaseDate,
      artworkCacheKey: track.artworkCacheKey,
      tracks: [track],
    })
  }

  return [...grouped.values()].sort((left, right) => {
    const yearOrder = albumYearSortKey(left.releaseDate) - albumYearSortKey(right.releaseDate)
    if (yearOrder !== 0) return yearOrder
    return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
  })
})

const showMoreAlbumsSection = computed(
  () => albumTracks.value.length > 0 && moreAlbumsByArtist.value.length > 0,
)

async function reloadTracks(): Promise<void> {
  tracks.value = await auralis.library.getTracks()
}

function goBack(): void {
  void router.push({ name: 'albums' })
}

function openAlbum(album: AlbumSummary): void {
  if (album.albumArtist === albumArtist.value && album.title === albumTitle.value) return

  void router.push({
    name: 'album-detail',
    query: {
      artist: album.albumArtist,
      title: album.title,
    },
  })
}

function showSearchResultHighlight(): void {
  const trackId = Number(route.query.highlight)
  if (!Number.isInteger(trackId) || !albumTracks.value.some((track) => track.id === trackId)) return

  highlightedTrackId.value = trackId
  requestAnimationFrame(() => {
    detailRootRef.value
      ?.querySelector<HTMLElement>(`[data-track-id="${trackId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
  highlightTimeout = setTimeout(() => {
    highlightedTrackId.value = null
    highlightTimeout = null
  }, 1800)
}

function formatTrackCount(count: number): string {
  return `${count} ${count === 1 ? 'Track' : 'Tracks'}`
}

function formatAlbumDuration(seconds: number): string {
  if (seconds <= 0) return '00分00秒'

  if (seconds < 3600) {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, '0')
    const remainingSeconds = String(Math.floor(seconds % 60)).padStart(2, '0')
    return `${minutes} 分 ${remainingSeconds} 秒`
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  const normalizedHours = hours + Math.floor(minutes / 60)
  const normalizedMinutes = minutes % 60

  const hh = String(normalizedHours).padStart(2, '0')

  if (normalizedMinutes === 0) {
    return `${hh} 小时`
  }

  const mm = String(normalizedMinutes).padStart(2, '0')
  return `${hh} 小时 ${mm} 分`
}

function buildAlbumPlaybackQueue(): TrackListItem[] {
  if (playback.state.playbackMode !== 'sequential') {
    return albumTracks.value
  }

  const currentAlbumKey = `${albumArtist.value}\u0000${albumTitle.value}`
  const albumIndex = albumGroups.value.findIndex((album) => album.key === currentAlbumKey)
  if (albumIndex < 0) return albumTracks.value

  const followingAlbumTracks = albumGroups.value
    .slice(albumIndex + 1)
    .flatMap((album) => album.tracks)

  return [...albumTracks.value, ...followingAlbumTracks]
}

function playAlbum(): void {
  const firstTrack = albumTracks.value[0]
  if (!firstTrack) return
  void playback.playTrackFromQueue(buildAlbumPlaybackQueue(), firstTrack.id)
}

function playTrack(trackId: number): void {
  void playback.playTrackFromQueue(buildAlbumPlaybackQueue(), trackId)
}

/** Only when pointer is on the scrollbar strip, map wheel to horizontal scroll. */
function onMoreAlbumsWheel(event: WheelEvent): void {
  const scroller = event.currentTarget as HTMLElement
  if (!isMoreScrollbarActive.value && !isPointerInMoreScrollbarZone(scroller, event.clientY)) {
    return
  }
  if (scroller.scrollWidth <= scroller.clientWidth + 1) return

  // Prefer converting vertical wheel; also honor shift+wheel / trackpad deltaX.
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (delta === 0) return

  const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth
  const nextLeft = Math.min(maxScrollLeft, Math.max(0, scroller.scrollLeft + delta))
  if (nextLeft === scroller.scrollLeft) return

  event.preventDefault()
  scroller.scrollLeft = nextLeft
}

function selectTrack(trackId: number): void {
  playback.selectTrack(trackId)
}

function resetCoverTracking(): void {
  pointerPosition = null
  if (trackingFrame !== null) {
    window.cancelAnimationFrame(trackingFrame)
    trackingFrame = null
  }

  const stage = coverStageRef.value
  if (!stage) return
  stage.style.removeProperty('--detail-cover-rotate-x')
  stage.style.removeProperty('--detail-cover-rotate-y')
  stage.style.removeProperty('--detail-cover-shift-x')
  stage.style.removeProperty('--detail-cover-shift-y')
  stage.style.removeProperty('--detail-cover-shadow-x')
  stage.style.removeProperty('--detail-cover-shadow-y')
}

function renderCoverTracking(): void {
  trackingFrame = null
  const stage = coverStageRef.value
  const pointer = pointerPosition
  if (!stage || !pointer || reducedMotionQuery.matches) return

  const rect = stage.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const horizontalRange = Math.max(centerX, window.innerWidth - centerX, 1)
  const verticalRange = Math.max(centerY, window.innerHeight - centerY, 1)
  const xRatio = Math.min(1, Math.max(-1, (pointer.x - centerX) / horizontalRange))
  const yRatio = Math.min(1, Math.max(-1, (pointer.y - centerY) / verticalRange))

  stage.style.setProperty('--detail-cover-rotate-x', `${-yRatio * MAX_COVER_TILT_DEGREES}deg`)
  stage.style.setProperty('--detail-cover-rotate-y', `${xRatio * MAX_COVER_TILT_DEGREES}deg`)
  stage.style.setProperty('--detail-cover-shift-x', `${xRatio * 5}px`)
  stage.style.setProperty('--detail-cover-shift-y', `${yRatio * 5}px`)
  stage.style.setProperty('--detail-cover-shadow-x', `${-xRatio * 12}px`)
  stage.style.setProperty('--detail-cover-shadow-y', `${18 - yRatio * 10}px`)
}

function scheduleCoverTracking(): void {
  if (trackingFrame === null) {
    trackingFrame = window.requestAnimationFrame(renderCoverTracking)
  }
}

function onDocumentPointerMove(event: PointerEvent): void {
  if (event.pointerType === 'touch' || reducedMotionQuery.matches) return
  pointerPosition = { x: event.clientX, y: event.clientY }
  scheduleCoverTracking()
}

function onDocumentPointerOut(event: PointerEvent): void {
  if (event.relatedTarget === null) {
    resetCoverTracking()
  }
}

function onReducedMotionChange(): void {
  if (reducedMotionQuery.matches) {
    resetCoverTracking()
  }
}

watch(
  () => [albumArtist.value, albumTitle.value] as const,
  async () => {
    await nextTick()
    detailRootRef.value?.scrollTo({ top: 0 })
  },
)

onMounted(async () => {
  await reloadTracks()
  await nextTick()
  showSearchResultHighlight()
  unsubscribeChanged = auralis.library.onChanged((event) => {
    // Play-count ticks must not full-reload album tracks
    if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') return
    void reloadTracks()
  })
  document.addEventListener('pointermove', onDocumentPointerMove, { passive: true })
  document.addEventListener('pointerout', onDocumentPointerOut)
  window.addEventListener('blur', resetCoverTracking)
  detailRootRef.value?.addEventListener('scroll', scheduleCoverTracking, { passive: true })
  reducedMotionQuery.addEventListener('change', onReducedMotionChange)
})

onBeforeUnmount(() => {
  resetCoverTracking()
  if (highlightTimeout) clearTimeout(highlightTimeout)
  onMoreScrollbarDragEnd()
  unsubscribeChanged?.()
  document.removeEventListener('pointermove', onDocumentPointerMove)
  document.removeEventListener('pointerout', onDocumentPointerOut)
  window.removeEventListener('blur', resetCoverTracking)
  detailRootRef.value?.removeEventListener('scroll', scheduleCoverTracking)
  reducedMotionQuery.removeEventListener('change', onReducedMotionChange)
})
</script>

<template>
  <div class="album-detail-container h-full w-full relative overflow-hidden bg-transparent">
    <section
      v-if="albumTracks.length"
      ref="detailRootRef"
      class="album-detail-scroll-wrapper h-full w-full overflow-y-auto relative z-10"
    >
      <button class="album-detail-back" type="button" aria-label="Back to albums" @click="goBack">
        <span class="i-lucide-arrow-left h-4 w-4" />
        <span>返回专辑</span>
      </button>

      <header class="album-detail-hero">
        <div ref="coverStageRef" class="album-detail-cover-stage">
          <div class="album-detail-cover">
            <img
              v-if="artworkUrl"
              :src="artworkUrl"
              :alt="`${albumTitle} cover`"
              class="h-full w-full object-cover"
              draggable="false"
            />
            <div v-else class="flex h-full w-full items-center justify-center" aria-hidden="true">
              <span class="i-lucide-disc-3 h-20 w-20 text-[var(--auralis-text-disabled)]"></span>
            </div>
          </div>
        </div>

        <div class="album-detail-summary">
          <div>
            <h1 class="select-text">{{ albumTitle }}</h1>
            <p class="album-detail-artist select-text">{{ displayAlbumArtist }}</p>
            <p class="album-detail-meta select-text">
              <span v-for="(meta, index) in albumMetaItems" :key="index">
                <span v-if="index > 0" class="mx-1.5 opacity-60">·</span>
                <span>{{ meta }}</span>
              </span>
            </p>
            <!-- 专辑累计播放数据面板被移除 -->
          </div>

          <button class="album-detail-play" type="button" @click="playAlbum">
            <span class="i-lucide-play h-5 w-5 fill-current"></span>
            <span>播放</span>
          </button>
        </div>
      </header>

      <div class="album-detail-track-list">
        <button
          v-for="(track, index) in albumTracks"
          :key="track.id"
          class="album-detail-track"
          :class="{
            'album-detail-track--selected': playback.state.selectedTrackId === track.id,
            'album-detail-track--playing': playback.state.currentTrackId === track.id,
            'album-detail-track--search-highlight': highlightedTrackId === track.id,
          }"
          :data-track-id="track.id"
          type="button"
          @click="selectTrack(track.id)"
          @dblclick="playTrack(track.id)"
        >
          <span class="album-detail-track-number">{{ track.trackNo ?? index + 1 }}</span>
          <span class="min-w-0 text-left">
            <span class="album-detail-track-title">{{ track.title || 'Unknown Title' }}</span>
            <span
              v-if="track.artist && track.artist !== albumArtist"
              class="album-detail-track-artist"
              >{{ formatArtist(track.artist) }}</span
            >
          </span>
          <!-- 单曲播放次数与热度图表被移除 -->
          <span class="album-detail-track-duration">{{
            formatDuration(track.durationSeconds)
          }}</span>
        </button>
      </div>
      <footer class="album-detail-legal">
        <p>{{ copyright || '版权信息未知' }}</p>
        <p>{{ releaseDate }}</p>
      </footer>

      <section
        v-if="showMoreAlbumsSection"
        class="album-detail-more"
        aria-label="More albums by artist"
      >
        <h2 class="album-detail-more-title">{{ displayAlbumArtist }} 的更多作品</h2>
        <div
          class="album-detail-more-scroller"
          :class="{ 'album-detail-more-scroller--bar-active': isMoreScrollbarActive }"
          @pointermove="onMoreAlbumsPointerMove"
          @pointerleave="onMoreAlbumsPointerLeave"
          @pointerdown="onMoreAlbumsPointerDown"
          @wheel="onMoreAlbumsWheel"
        >
          <button
            v-for="album in moreAlbumsByArtist"
            :key="album.key"
            type="button"
            class="album-detail-more-card"
            :aria-label="`打开专辑 ${album.title}`"
            @click="openAlbum(album)"
          >
            <div class="album-detail-more-cover">
              <img
                v-if="getArtworkUrl(album.artworkCacheKey)"
                :src="getArtworkUrl(album.artworkCacheKey)!"
                :alt="`${album.title} cover`"
                class="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                draggable="false"
              />
              <div
                v-else
                class="flex h-full w-full items-center justify-center bg-[var(--auralis-artwork-placeholder-bg)]"
                aria-hidden="true"
              >
                <span class="i-lucide-disc-3 h-10 w-10 text-[var(--auralis-text-disabled)]"></span>
              </div>
            </div>
            <div class="album-detail-more-meta">
              <p class="album-detail-more-album-title">{{ album.title }}</p>
              <p class="album-detail-more-year">{{ formatAlbumYearLabel(album.releaseDate) }}</p>
            </div>
          </button>
        </div>
      </section>
    </section>

    <div v-else class="flex min-h-[60vh] items-center justify-center relative z-10">
      <div class="text-center">
        <p class="text-base font-semibold text-[var(--auralis-text)]">Album not found</p>
        <button
          class="mt-3 text-sm text-[var(--auralis-sidebar-active-text)]"
          type="button"
          @click="goBack"
        >
          Return to Albums
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.album-detail-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.album-detail-scroll-wrapper {
  padding: 24px 32px calc(var(--auralis-playbar-safe-area) + 40px);
}

.album-detail-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--auralis-text-muted);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  background: var(--auralis-btn-back-bg);
  border: 1px solid var(--auralis-btn-back-border);
  border-radius: 999px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transition: all 0.25s ease;
  margin-bottom: 12px;
}

.album-detail-back:hover {
  color: var(--auralis-text);
  background: var(--auralis-btn-back-hover);
  border-color: var(--auralis-btn-back-border);
  transform: translateY(-1px);
}

.album-detail-hero {
  display: grid;
  grid-template-columns: minmax(190px, 260px) minmax(0, 1fr);
  gap: 36px;
  align-items: center;
  margin-top: 22px;
  padding-bottom: 34px;
}

.album-detail-cover-stage {
  --detail-cover-rotate-x: 0deg;
  --detail-cover-rotate-y: 0deg;
  --detail-cover-shift-x: 0px;
  --detail-cover-shift-y: 0px;
  --detail-cover-shadow-x: 0px;
  --detail-cover-shadow-y: 18px;
  position: relative;
  aspect-ratio: 1;
  perspective: 900px;
}

.album-detail-cover-stage::before {
  position: absolute;
  inset: 7%;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.32);
  content: '';
  filter: blur(18px);
  pointer-events: none;
  transform: translate3d(var(--detail-cover-shadow-x), var(--detail-cover-shadow-y), -20px);
  transition: transform 140ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}

/* 3D 霓虹彩色背光投影 */
.album-detail-cover-stage::after {
  position: absolute;
  inset: 8%;
  border-radius: 20px;
  background: v-bind("artworkUrl ? 'url(' + artworkUrl + ')' : 'none'");
  background-size: cover;
  background-position: center;
  content: '';
  filter: blur(28px) saturate(1.8);
  opacity: 0.65;
  pointer-events: none;
  z-index: -1;
  transform: translate3d(
      calc(var(--detail-cover-shadow-x) * 1.2),
      calc(var(--detail-cover-shadow-y) * 1.2),
      -30px
    )
    scale(0.95);
  transition:
    transform 140ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.3s;
  will-change: transform;
}

.album-detail-cover {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 14px;
  background: var(--auralis-artwork-placeholder-bg);
  transform: translate3d(var(--detail-cover-shift-x), var(--detail-cover-shift-y), 0)
    rotateX(var(--detail-cover-rotate-x)) rotateY(var(--detail-cover-rotate-y));
  transform-style: preserve-3d;
  transition: transform 140ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}

.album-detail-summary {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: flex-start;
  padding: 8px 0;
}

.album-detail-summary h1 {
  max-width: 920px;
  color: var(--auralis-text);
  font-size: clamp(25px, 2.75vw, 39px);
  font-weight: 750;
  line-height: 1.08;
  letter-spacing: -0.035em;
}

.album-detail-artist {
  margin-top: 10px;
  color: var(--auralis-sidebar-active-text);
  font-size: clamp(18px, 2vw, 27px);
  font-weight: 600;
}

.album-detail-meta {
  margin-top: 8px;
  color: var(--auralis-text-muted);
  font-size: 13px;
}

/* 专辑统计卡片样式 */
.album-detail-stats-panel {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 18px;
  padding: 10px 16px;
  border-radius: 12px;
  background: var(--auralis-stats-panel-bg);
  border: 1px solid var(--auralis-stats-panel-border);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  width: fit-content;
}

.album-detail-stats-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--auralis-text-muted);
}

.stats-value {
  color: var(--auralis-text);
  font-weight: 650;
}

.stats-icon-plays {
  color: #a78bfa;
}
.stats-icon-time {
  color: #f472b6;
}

.album-detail-stats-divider {
  width: 1px;
  height: 14px;
  background: var(--auralis-stats-divider);
}

.album-detail-play {
  margin-top: 28px;
  display: inline-flex;
  width: fit-content;
  min-width: 128px;
  height: 44px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 999px;
  background: var(
    --auralis-active-album-accent,
    var(--auralis-sidebar-active-indicator)
  ) !important;
  border: 1px solid
    color-mix(
      in srgb,
      var(--auralis-active-album-accent, var(--auralis-sidebar-active-indicator)) 30%,
      transparent
    ) !important;
  box-shadow:
    0 6px 20px
      color-mix(
        in srgb,
        var(--auralis-active-album-accent, var(--auralis-sidebar-active-indicator)) 28%,
        transparent
      ),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  color: white !important;
  font-size: 15px;
  font-weight: 700;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  overflow: hidden;
  position: relative;
}

.album-detail-play::before {
  content: '';
  position: absolute;
  top: 0;
  left: -50%;
  width: 200%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent);
  transform: skewX(-25deg);
  transition: 0.75s;
  pointer-events: none;
}

.album-detail-play:hover {
  transform: translateY(-2px) scale(1.04);
  box-shadow:
    0 10px 28px
      color-mix(
        in srgb,
        var(--auralis-active-album-accent, var(--auralis-sidebar-active-indicator)) 38%,
        transparent
      ),
    0 0 14px 2px rgba(255, 255, 255, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
  background: var(
    --auralis-active-album-accent,
    var(--auralis-sidebar-active-indicator)
  ) !important;
  filter: brightness(1.06);
}

.album-detail-play:hover::before {
  left: 125%;
}

.album-detail-play:active {
  transform: translateY(1px) scale(0.98);
}

.album-detail-legal {
  padding: 14px 12px 28px;
  color: var(--auralis-text-faint);
  font-size: 12px;
  line-height: 1.6;
  text-align: right;
}

.album-detail-more {
  margin-top: 20px;
  margin-right: -32px;
  margin-bottom: -12px;
  margin-left: -32px;
  padding: 32px 32px 36px;
  background: rgba(255, 255, 255, 0.01);
  border-top: 1px solid var(--auralis-border-subtle);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.album-detail-more-title {
  margin: 0 0 16px;
  color: var(--auralis-text);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.album-detail-more-scroller {
  --more-scrollbar-size: 6px;
  --more-scrollbar-thumb: color-mix(in srgb, var(--auralis-text) 28%, transparent);
  --more-scrollbar-thumb-hover: color-mix(in srgb, var(--auralis-text) 42%, transparent);

  display: flex;
  gap: 16px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 10px 4px 10px;
  margin-top: -8px;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.album-detail-more-scroller--bar-active {
  scrollbar-color: var(--more-scrollbar-thumb) transparent;
}

.album-detail-more-scroller::-webkit-scrollbar {
  width: var(--more-scrollbar-size);
  height: var(--more-scrollbar-size);
  background: transparent;
}

.album-detail-more-scroller::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

.album-detail-more-scroller::-webkit-scrollbar-button:single-button,
.album-detail-more-scroller::-webkit-scrollbar-button:double-button,
.album-detail-more-scroller::-webkit-scrollbar-button:start,
.album-detail-more-scroller::-webkit-scrollbar-button:end,
.album-detail-more-scroller::-webkit-scrollbar-button:horizontal:decrement,
.album-detail-more-scroller::-webkit-scrollbar-button:horizontal:increment {
  display: none;
  width: 0;
  height: 0;
}

.album-detail-more-scroller::-webkit-scrollbar-corner {
  background: transparent;
}

.album-detail-more-scroller::-webkit-scrollbar-track {
  background: transparent;
  border: none;
  margin: 0;
}

.album-detail-more-scroller::-webkit-scrollbar-thumb {
  background: transparent;
  border: none;
  border-radius: 999px;
  box-shadow: none;
  min-width: 24px;
}

.album-detail-more-scroller--bar-active::-webkit-scrollbar-thumb {
  background: var(--more-scrollbar-thumb);
}

.album-detail-more-scroller--bar-active::-webkit-scrollbar-thumb:hover {
  background: var(--more-scrollbar-thumb-hover);
}

.album-detail-more-card {
  flex: 0 0 auto;
  width: 148px;
  min-width: 148px;
  scroll-snap-align: start;
  appearance: none;
  cursor: pointer;
  user-select: none;
  background: var(--auralis-more-card-bg);
  border: 1px solid var(--auralis-more-card-border);
  border-radius: 16px;
  padding: 12px;
  color: inherit;
  font: inherit;
  text-align: left;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.album-detail-more-card:hover {
  transform: translateY(-6px);
  background: var(--auralis-more-card-bg);
  filter: brightness(1.03);
  border-color: var(--auralis-btn-back-border);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.12);
}

.album-detail-more-cover {
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 12px;
  background: var(--auralis-artwork-placeholder-bg);
}

.album-detail-more-meta {
  margin-top: 10px;
  min-width: 0;
}

.album-detail-more-album-title {
  overflow: hidden;
  color: var(--auralis-text);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-detail-more-year {
  margin-top: 4px;
  color: var(--auralis-text-faint);
  font-size: 12px;
}

.album-detail-track-list {
  background: var(--auralis-track-list-bg);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--auralis-track-list-border);
  border-radius: 20px;
  padding: 10px;
  box-shadow:
    0 12px 36px 0 rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  margin-top: 22px;
}

.album-detail-track {
  position: relative;
  display: grid;
  width: 100%;
  min-height: 50px;
  grid-template-columns: 42px minmax(0, 1fr) 58px;
  align-items: center;
  padding: 6px 16px 6px 8px;
  color: var(--auralis-text);
  border-radius: 12px;
  transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.album-detail-track:not(:first-child)::before {
  content: '';
  position: absolute;
  top: 0;
  left: 12px;
  right: 12px;
  height: 1px;
  background: var(--auralis-border-subtle);
  pointer-events: none;
}

.album-detail-track:hover,
.album-detail-track--selected,
.album-detail-track--playing,
.album-detail-track--search-highlight {
  background-color: var(--auralis-control-hover-bg);
  transform: translateX(3px);
  box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.15);
}

.album-detail-track--search-highlight {
  animation: album-track-search-highlight 1.8s ease-out;
}

@keyframes album-track-search-highlight {
  0%,
  35% {
    background-color: var(--auralis-song-row-now-playing-bg);
  }
  100% {
    background-color: var(--auralis-control-hover-bg);
  }
}

.album-detail-track.album-detail-track--selected {
  background-color: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 12%, transparent);
  box-shadow:
    inset 2px 0 0 var(--auralis-sidebar-active-indicator),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transform: translateX(3px);
}

.album-detail-track.album-detail-track--playing {
  background-color: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 22%, transparent);
  box-shadow:
    inset 3px 0 0 var(--auralis-sidebar-active-indicator),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transform: translateX(4px);
}

.album-detail-track--selected::before,
.album-detail-track--playing::before,
.album-detail-track--search-highlight::before {
  display: none;
}

.album-detail-track--selected + .album-detail-track::before,
.album-detail-track--playing + .album-detail-track::before,
.album-detail-track--search-highlight + .album-detail-track::before {
  display: none;
}

.album-detail-track-number,
.album-detail-track-duration {
  color: var(--auralis-text-faint);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.album-detail-track-number {
  font-size: 13px;
  font-weight: 650;
}

.album-detail-track-title,
.album-detail-track-artist {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-detail-track-title {
  font-size: 14px;
  font-weight: 650;
}

.album-detail-track-artist {
  margin-top: 3px;
  color: var(--auralis-text-muted);
  font-size: 12px;
}

.album-detail-track-duration {
  text-align: right;
}

.album-detail-track-stats {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding-right: 14px;
}

.album-detail-track-playcount {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  color: var(--auralis-text-muted);
  font-weight: 550;
}

.album-detail-track-playcount-empty {
  font-size: 12px;
  color: var(--auralis-text-faint);
  opacity: 0.4;
}

.album-detail-track-heat-bar-wrap {
  width: 32px;
  height: 4px;
  background: var(--auralis-heat-bar-wrap);
  border-radius: 99px;
  overflow: hidden;
}

.album-detail-track-heat-bar {
  display: block;
  height: 100%;
  background: linear-gradient(to right, #ec4899, #8b5cf6);
  border-radius: 99px;
}

@media (max-width: 900px) {
  .album-detail-hero {
    grid-template-columns: minmax(170px, 220px) minmax(0, 1fr);
    gap: 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .album-detail-cover,
  .album-detail-cover-stage::before,
  .album-detail-cover-stage::after {
    transform: none;
    transition: none;
  }
}
</style>
