<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { TrackListItem } from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { formatDuration } from '@renderer/features/library/utils/formatDuration'

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
const albumTitle = computed(() => String(route.query.title ?? ''))

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

async function reloadTracks(): Promise<void> {
  tracks.value = await auralis.library.getTracks()
}

function goBack(): void {
  void router.push({ name: 'albums' })
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

function formatArtists(artist: string | null): string {
  if (!artist) return ''
  const parts = artist.split('; ').filter(Boolean)
  if (parts.length <= 1) return artist
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`
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

function playAlbum(): void {
  const firstTrack = albumTracks.value[0]
  if (!firstTrack) return
  void playback.playTrackFromQueue(albumTracks.value, firstTrack.id)
}

function playTrack(trackId: number): void {
  void playback.playTrackFromQueue(albumTracks.value, trackId)
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

onMounted(async () => {
  await reloadTracks()
  await nextTick()
  showSearchResultHighlight()
  unsubscribeChanged = auralis.library.onChanged(reloadTracks)
  document.addEventListener('pointermove', onDocumentPointerMove, { passive: true })
  document.addEventListener('pointerout', onDocumentPointerOut)
  window.addEventListener('blur', resetCoverTracking)
  detailRootRef.value?.addEventListener('scroll', scheduleCoverTracking, { passive: true })
  reducedMotionQuery.addEventListener('change', onReducedMotionChange)
})

onBeforeUnmount(() => {
  resetCoverTracking()
  if (highlightTimeout) clearTimeout(highlightTimeout)
  unsubscribeChanged?.()
  document.removeEventListener('pointermove', onDocumentPointerMove)
  document.removeEventListener('pointerout', onDocumentPointerOut)
  window.removeEventListener('blur', resetCoverTracking)
  detailRootRef.value?.removeEventListener('scroll', scheduleCoverTracking)
  reducedMotionQuery.removeEventListener('change', onReducedMotionChange)
})
</script>

<template>
  <section ref="detailRootRef" class="album-detail h-full overflow-y-auto">
    <button class="album-detail-back" type="button" aria-label="Back to albums" @click="goBack">
      <span class="i-lucide-chevron-left h-5 w-5"></span>
      <span>Albums</span>
    </button>

    <div v-if="albumTracks.length > 0">
      <header class="album-detail-hero">
        <div ref="coverStageRef" class="album-detail-cover-stage">
          <div class="album-detail-cover">
            <img
              v-if="artworkUrl"
              :src="artworkUrl"
              :alt="`${albumTitle} cover`"
              class="h-full w-full object-cover"
            />
            <div
              v-else
              class="flex h-full w-full items-center justify-center bg-[var(--auralis-artwork-placeholder-bg)]"
            >
              <span class="i-lucide-disc-3 h-16 w-16 text-[var(--auralis-text-disabled)]"></span>
            </div>
          </div>
        </div>

        <div class="album-detail-summary">
          <div>
            <h1>{{ albumTitle }}</h1>
            <p class="album-detail-artist">{{ albumArtist }}</p>
            <p class="album-detail-meta">
              <span v-for="(item, index) in albumMetaItems" :key="item">
                <span v-if="index > 0"> · </span>{{ item }}
              </span>
            </p>
          </div>

          <button class="album-detail-play" type="button" @click="playAlbum">
            <span class="i-lucide-play h-5 w-5 fill-current"></span>
            <span>Play</span>
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
              >{{ formatArtists(track.artist) }}</span
            >
          </span>
          <span class="album-detail-track-duration">{{
            formatDuration(track.durationSeconds)
          }}</span>
        </button>
      </div>
      <footer class="album-detail-legal">
        <p>{{ copyright || '版权信息未知' }}</p>
        <p>{{ releaseDate }}</p>
      </footer>
    </div>

    <div v-else class="flex min-h-[60vh] items-center justify-center">
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
  </section>
</template>

<style scoped>
.album-detail {
  padding: 24px 32px calc(var(--auralis-playbar-safe-area) + 40px);
}

.album-detail-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--auralis-text-muted);
  font-size: 13px;
}

.album-detail-back:hover {
  color: var(--auralis-text);
}

.album-detail-hero {
  display: grid;
  grid-template-columns: minmax(190px, 260px) minmax(0, 1fr);
  gap: 36px;
  align-items: stretch;
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
  justify-content: space-between;
  padding: 22px 0 4px;
}

.album-detail-summary h1 {
  max-width: 920px;
  color: var(--auralis-text);
  font-size: clamp(26px, 3.2vw, 46px);
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

.album-detail-play {
  display: inline-flex;
  width: fit-content;
  min-width: 128px;
  height: 44px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 999px;
  background: var(--auralis-control-primary-bg);
  color: var(--auralis-control-primary-text);
  font-size: 15px;
  font-weight: 700;
}

.album-detail-legal {
  padding: 14px 12px 28px;
  color: var(--auralis-text-faint);
  font-size: 12px;
  line-height: 1.6;
  text-align: right;
}

.album-detail-track {
  position: relative;
  display: grid;
  width: 100%;
  min-height: 50px;
  grid-template-columns: 42px minmax(0, 1fr) 58px;
  align-items: center;
  padding: 5px 12px 5px 4px;
  color: var(--auralis-text);
  border-radius: 12px;
}

/* Top separator on every track */
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

/* Hover/active states cover the separator within the card */
.album-detail-track:hover,
.album-detail-track--selected,
.album-detail-track--playing,
.album-detail-track--search-highlight {
  background-color: var(--auralis-control-hover-bg);
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

/* Selected/playing should beat :hover specificity (0,1,1); playing wins when both apply. */
.album-detail-track.album-detail-track--selected {
  background-color: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 12%, transparent);
}

.album-detail-track.album-detail-track--playing {
  background-color: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 22%, transparent);
}

/* Hide hovered/selected track's own top separator */
.album-detail-track--selected::before,
.album-detail-track--playing::before,
.album-detail-track--search-highlight::before {
  display: none;
}

/* Keep active row groups visually clean without changing divider thickness elsewhere. */
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

@media (max-width: 900px) {
  .album-detail-hero {
    grid-template-columns: minmax(170px, 220px) minmax(0, 1fr);
    gap: 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .album-detail-cover,
  .album-detail-cover-stage::before {
    transform: none;
    transition: none;
  }
}
</style>
