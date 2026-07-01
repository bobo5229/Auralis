<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
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
let unsubscribeChanged: (() => void) | null = null

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
const releaseYear = computed(() => releaseDate.value?.slice(0, 4) ?? '')

async function reloadTracks(): Promise<void> {
  tracks.value = await auralis.library.getTracks()
}

function goBack(): void {
  void router.push({ name: 'albums' })
}

function formatArtists(artist: string | null): string {
  if (!artist) return ''
  const parts = artist.split('; ').filter(Boolean)
  if (parts.length <= 1) return artist
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`
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

onMounted(async () => {
  await reloadTracks()
  unsubscribeChanged = auralis.library.onChanged(reloadTracks)
})

onBeforeUnmount(() => {
  unsubscribeChanged?.()
})
</script>

<template>
  <section class="album-detail h-full overflow-y-auto">
    <button class="album-detail-back" type="button" aria-label="Back to albums" @click="goBack">
      <span class="i-lucide-chevron-left h-5 w-5"></span>
      <span>Albums</span>
    </button>

    <div v-if="albumTracks.length > 0">
      <header class="album-detail-hero">
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

        <div class="album-detail-summary">
          <div>
            <h1>{{ albumTitle }}</h1>
            <p class="album-detail-artist">{{ albumArtist }}</p>
            <p class="album-detail-meta">
              Album<span v-if="releaseYear"> · {{ releaseYear }}</span>
              <span> · {{ albumTracks.length }} tracks</span>
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
          }"
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

.album-detail-cover {
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 14px;
  background: var(--auralis-artwork-placeholder-bg);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.16);
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

.album-detail-track-list {
  /* no border — separators are drawn per-track */
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
.album-detail-track::before {
  content: '';
  position: absolute;
  top: 0;
  left: 12px;
  right: 12px;
  height: 1px;
  background: var(--auralis-border-subtle);
  pointer-events: none;
}

/* Bottom separator on last track only */
.album-detail-track:last-child::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 12px;
  right: 12px;
  height: 1px;
  background: var(--auralis-border-subtle);
  pointer-events: none;
}

/* Hover/selected cover the separator within the card */
.album-detail-track:hover,
.album-detail-track--selected,
.album-detail-track--playing {
  background-color: var(--auralis-control-hover-bg);
}

/* Selected/playing should beat :hover specificity (0,1,1) */
.album-detail-track.album-detail-track--selected,
.album-detail-track.album-detail-track--playing {
  background-color: var(--auralis-song-row-now-playing-bg);
}

/* Hide hovered/selected track's own top separator */
.album-detail-track:hover::before,
.album-detail-track--selected::before,
.album-detail-track--playing::before {
  display: none;
}

/* Hide last track's bottom separator when it's hovered/selected */
.album-detail-track:last-child:hover::after,
.album-detail-track:last-child.album-detail-track--selected::after,
.album-detail-track:last-child.album-detail-track--playing::after {
  display: none;
}

/* Hide the next sibling's top separator to avoid double line */
.album-detail-track:hover + .album-detail-track::before,
.album-detail-track--selected + .album-detail-track::before,
.album-detail-track--playing + .album-detail-track::before {
  display: none;
}

.album-detail-track-number,
.album-detail-track-duration {
  color: var(--auralis-text-faint);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
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
</style>
