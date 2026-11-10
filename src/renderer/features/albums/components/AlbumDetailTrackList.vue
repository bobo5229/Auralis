<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PlayingIndicator from '@renderer/features/appearance/components/PlayingIndicator.vue'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { formatDuration } from '@renderer/shared/media/formatDuration'
import { resolveAlbumTrackPresentation } from '../utils/albumTrackPresentation'
import { useChineseTextDisplay } from '@renderer/shared/preferences/useChineseTextDisplay'

const props = defineProps<{
  groups: { discNo: number | null; tracks: TrackListItem[] }[]
  albumArtist: string
  isPlaying: boolean
  currentTrackId: number | null
  highlightedTrackId: number | null
  maxVisibleTracks: number
}>()
const emit = defineEmits<{ play: [trackId: number] }>()
const { t } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const list = ref<HTMLElement | null>(null)
const maxHeight = ref<string>()
const hasMultipleDiscs = computed(
  () => props.groups.filter((group) => group.tracks.length > 0).length > 1,
)
const presentedTracks = computed(() =>
  props.groups.flatMap((item) =>
    item.tracks.map((track, index) => ({
      track,
      groupStart: index === 0,
      groupEnd: index === item.tracks.length - 1,
      discTitle:
        index === 0 && hasMultipleDiscs.value
          ? t('albums.detail.disc', { number: String(item.discNo ?? 1).padStart(2, '0') })
          : null,
      presentation: resolveAlbumTrackPresentation(
        track.id,
        track.trackNo,
        index,
        props.currentTrackId,
        props.highlightedTrackId,
      ),
    })),
  ),
)
let observer: ResizeObserver | undefined

function measureHeight(): void {
  const viewport = list.value
  if (!viewport) return
  const rows = viewport.querySelectorAll<HTMLElement>('.album-detail-track')
  if (rows.length <= props.maxVisibleTracks) {
    maxHeight.value = undefined
    return
  }
  const style = getComputedStyle(viewport)
  let height = 0
  let count = 0
  for (const child of Array.from(viewport.children)) {
    if (!child.matches('.album-detail-track, .album-detail-disc-header')) continue
    height += child.getBoundingClientRect().height
    if (child.matches('.album-detail-track') && ++count === props.maxVisibleTracks) break
  }
  if (height > 0)
    maxHeight.value = height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 'px'
}
function goToTrack(id: number | null): void {
  if (id == null) return
  const viewport = list.value
  const target = viewport?.querySelector<HTMLElement>('[data-track-id="' + id + '"]')
  if (!viewport || !target) return
  if (viewport.scrollHeight > viewport.clientHeight + 1) {
    const bounds = viewport.getBoundingClientRect()
    const rect = target.getBoundingClientRect()
    viewport.scrollTo({
      top: viewport.scrollTop + rect.top - bounds.top - (bounds.height - rect.height) / 2,
      behavior: 'auto',
    })
    viewport.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
  } else target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
}
onMounted(() => {
  measureHeight()
  goToTrack(props.highlightedTrackId)
  if (typeof ResizeObserver !== 'undefined' && list.value) {
    observer = new ResizeObserver(measureHeight)
    observer.observe(list.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
watch(
  [() => props.groups, () => props.maxVisibleTracks],
  () => {
    measureHeight()
    goToTrack(props.highlightedTrackId)
  },
  { flush: 'post' },
)
watch(() => props.highlightedTrackId, goToTrack, { flush: 'post' })
function formatDisplayArtist(artist: string | null | undefined): string {
  if (!artist || artist === 'Unknown Artist') return t('library.missing.artist')
  return songValues(artist)
}
</script>

<template>
  <div class="album-tracklist-panel">
    <div
      ref="list"
      class="album-detail-track-list"
      :style="{ maxHeight }"
      role="region"
      :aria-label="t('albums.detail.trackList')"
      tabindex="0"
    >
      <template
        v-for="{ track, presentation, discTitle, groupStart, groupEnd } in presentedTracks"
        :key="track.id"
      >
        <h2 v-if="discTitle" class="album-detail-disc-header">{{ discTitle }}</h2>
        <button
          v-tooltip="
            presentation.current
              ? t(isPlaying ? 'albums.detail.currentPlaying' : 'albums.detail.currentPaused')
              : undefined
          "
          class="album-detail-track auralis-track-row-divider"
          :class="{
            'album-detail-track--start': groupStart,
            'album-detail-track--end': groupEnd,
            'album-detail-track--current': presentation.current,
            'album-detail-track--search-highlight': presentation.highlighted,
          }"
          :aria-current="presentation.current ? 'true' : undefined"
          :data-track-id="track.id"
          type="button"
          @dblclick="emit('play', track.id)"
        >
          <span class="album-detail-track-number" aria-hidden="true">
            <span class="album-detail-track-index">
              {{ String(presentation.displayNumber).padStart(2, '0') }}
            </span>
            <PlayingIndicator
              v-if="presentation.current"
              class="album-detail-track-eq"
              :playing="isPlaying"
            />
          </span>
          <span class="min-w-0 text-left">
            <span class="album-detail-track-title">{{
              songText(track.title) || t('albums.detail.unknownTitle')
            }}</span>
            <span
              v-if="track.artist && track.artist !== albumArtist"
              class="album-detail-track-artist"
              >{{ formatDisplayArtist(track.artist) }}</span
            >
          </span>
          <span v-if="presentation.current" class="album-track-visually-hidden">{{
            t(isPlaying ? 'albums.detail.currentPlaying' : 'albums.detail.currentPaused')
          }}</span>
          <span class="album-detail-track-duration">{{
            formatDuration(track.durationSeconds)
          }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped src="../../../shared/styles/trackRowDivider.css"></style>
<style scoped src="../styles/albumDetail.track-list.css"></style>
