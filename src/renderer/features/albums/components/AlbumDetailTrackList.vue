<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PlayingIndicator from '@renderer/features/appearance/components/PreferredPlayingIndicator.vue'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { formatDuration } from '@renderer/shared/media/formatDuration'
import { resolveAlbumTrackPresentation } from '../utils/albumTrackPresentation'
import { useChineseTextDisplay } from '@renderer/shared/preferences/useChineseTextDisplay'
import SettingsSelect from '@renderer/shared/components/SettingsSelect.vue'

const props = defineProps<{
  groups: { discNo: number | null; tracks: TrackListItem[] }[]
  albumArtist: string
  selectedTrackId: number | null
  isPlaying: boolean
  currentTrackId: number | null
  highlightedTrackId: number | null
}>()

const emit = defineEmits<{
  play: [trackId: number]
}>()

const { t } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const panel = ref<HTMLElement | null>(null)
const capacity = ref(10)
const groupIndex = ref(0)
const offset = ref(0)
const direction = ref(0)
const group = computed(() => props.groups[groupIndex.value])
const showAllDiscs = computed(
  () =>
    props.groups.length > 1 &&
    props.groups.reduce((total, item) => total + item.tracks.length, 0) * 60 +
      props.groups.length * 36 <=
      availableHeight.value,
)
const availableHeight = ref(600)
const pageIndex = computed(() => Math.floor(offset.value / capacity.value))
const pageCount = computed(() => Math.ceil((group.value?.tracks.length ?? 0) / capacity.value))
const startIndex = computed(() => pageIndex.value * capacity.value)
const presentedGroups = computed(() => {
  const groups = showAllDiscs.value ? props.groups : group.value ? [group.value] : []
  return groups.map((item) => ({
    discNo: item.discNo,
    tracks: (showAllDiscs.value
      ? item.tracks
      : item.tracks.slice(startIndex.value, startIndex.value + capacity.value)
    ).map((track, index) => ({
      track,
      presentation: resolveAlbumTrackPresentation(
        track.id,
        track.trackNo,
        (showAllDiscs.value ? 0 : startIndex.value) + index,
        props.selectedTrackId,
        props.currentTrackId,
        props.highlightedTrackId,
      ),
    })),
  }))
})
const hasPrevious = computed(
  () => !showAllDiscs.value && (groupIndex.value > 0 || pageIndex.value > 0),
)
const hasNext = computed(
  () =>
    !showAllDiscs.value &&
    (groupIndex.value < props.groups.length - 1 || pageIndex.value + 1 < pageCount.value),
)
const currentTrackGroup = computed(() =>
  props.groups.findIndex((item) => item.tracks.some((track) => track.id === props.currentTrackId)),
)
const discOptions = computed(() =>
  props.groups.map((item, index) => ({
    value: String(index),
    label: `${discLabel(item.discNo)}${props.isPlaying && currentTrackGroup.value === index ? ` ${t('albums.detail.discPlaying')}` : ''}`,
  })),
)
const currentTrackVisible = computed(() =>
  presentedGroups.value.some((item) =>
    item.tracks.some(({ track }) => track.id === props.currentTrackId),
  ),
)
const showPlayingJump = computed(
  () => props.isPlaying && currentTrackGroup.value >= 0 && !currentTrackVisible.value,
)
let sizeObserver: ResizeObserver | undefined

function measureCapacity(): void {
  const scroller = panel.value?.closest<HTMLElement>('.album-detail-scroll-wrapper')
  if (!scroller?.clientHeight) return
  // Reserve space for the page controls, shell insets and the largest two-line track row.
  const available = Math.max(0, scroller.clientHeight - 150)
  availableHeight.value = available
  const fit = Math.floor(available / 60)
  const singleCount = props.groups.length === 1 ? props.groups[0].tracks.length : 0
  capacity.value =
    singleCount > 10 && singleCount <= 12 && fit >= singleCount
      ? singleCount
      : Math.max(5, Math.min(10, fit))
}
onMounted(() => {
  const scroller = panel.value?.closest<HTMLElement>('.album-detail-scroll-wrapper')
  measureCapacity()
  if (!scroller || typeof ResizeObserver === 'undefined') return
  sizeObserver = new ResizeObserver(measureCapacity)
  sizeObserver.observe(scroller)
})
onBeforeUnmount(() => sizeObserver?.disconnect())

function goToTrack(id: number | null): void {
  if (id == null) return
  const nextGroup = props.groups.findIndex((item) => item.tracks.some((track) => track.id === id))
  if (nextGroup < 0) return
  const nextOffset = props.groups[nextGroup].tracks.findIndex((track) => track.id === id)
  direction.value = nextGroup < groupIndex.value ? -1 : 1
  groupIndex.value = nextGroup
  offset.value = nextOffset
}
function changePage(step: number): void {
  direction.value = step
  if (step < 0 && pageIndex.value > 0) offset.value = (pageIndex.value - 1) * capacity.value
  else if (step > 0 && pageIndex.value + 1 < pageCount.value)
    offset.value = (pageIndex.value + 1) * capacity.value
  else {
    const next = groupIndex.value + step
    if (next < 0 || next >= props.groups.length) return
    groupIndex.value = next
    offset.value = step < 0 ? Math.max(0, props.groups[next].tracks.length - 1) : 0
  }
}
function selectDisc(value: string): void {
  const next = Number(value)
  if (!Number.isInteger(next) || next < 0 || next >= props.groups.length) return
  direction.value = next < groupIndex.value ? -1 : 1
  groupIndex.value = next
  offset.value = 0
}
function discLabel(discNo: number | null): string {
  return t('albums.detail.disc', { number: String(discNo ?? 1).padStart(2, '0') })
}
watch(
  () => props.groups,
  () => {
    direction.value = 0
    groupIndex.value = 0
    offset.value = 0
    measureCapacity()
    goToTrack(props.highlightedTrackId)
  },
)
watch(() => props.highlightedTrackId, goToTrack, { immediate: true, flush: 'sync' })

function formatDisplayArtist(artist: string | null | undefined): string {
  if (!artist || artist === 'Unknown Artist') return t('library.missing.artist')
  return songValues(artist)
}
</script>

<template>
  <div ref="panel" class="album-tracklist-panel">
    <div v-if="hasPrevious || hasNext" class="album-track-pagination">
      <div class="album-track-pagination-group">
        <button
          class="album-track-pagination-arrow"
          type="button"
          :disabled="!hasPrevious"
          :aria-label="t('albums.detail.previousTracks')"
          @click="changePage(-1)"
        >
          <span class="i-lucide-chevron-left" aria-hidden="true"></span>
        </button>
        <div class="album-track-pagination-position">
          <span id="album-track-disc-label" class="album-track-visually-hidden">{{
            t('albums.detail.chooseDisc')
          }}</span>
          <div v-if="groups.length > 1" class="album-track-disc-select">
            <SettingsSelect
              id="album-track-disc"
              labelledby="album-track-disc-label"
              :model-value="String(groupIndex)"
              :options="discOptions"
              :show-value-title="false"
              @update:model-value="selectDisc"
            />
          </div>
          <span v-if="pageCount > 1" class="album-track-page-number"
            >{{ pageIndex + 1 }} / {{ pageCount }}</span
          >
        </div>
        <button
          class="album-track-pagination-arrow"
          type="button"
          :disabled="!hasNext"
          :aria-label="t('albums.detail.nextTracks')"
          @click="changePage(1)"
        >
          <span class="i-lucide-chevron-right" aria-hidden="true"></span>
        </button>
      </div>
      <button
        v-if="showPlayingJump"
        class="album-track-playing-jump"
        type="button"
        @click="goToTrack(currentTrackId)"
      >
        <span class="i-lucide-audio-lines" aria-hidden="true"></span
        >{{ t('albums.detail.showPlayingTrack') }}
      </button>
    </div>
    <div
      :key="`${groupIndex}-${pageIndex}`"
      class="album-detail-track-list"
      :class="
        direction < 0 ? 'album-track-enter-previous' : direction > 0 ? 'album-track-enter-next' : ''
      "
    >
      <template
        v-for="(item, groupPosition) in presentedGroups"
        :key="`${item.discNo}-${groupPosition}`"
      >
        <div
          v-if="showAllDiscs && item.discNo != null"
          class="album-detail-disc-header"
          role="presentation"
        >
          {{ discLabel(item.discNo) }}
        </div>
        <button
          v-for="({ track, presentation }, index) in item.tracks"
          :key="track.id"
          class="album-detail-track auralis-track-row-divider"
          :class="{
            'album-detail-track--disc-end': index === item.tracks.length - 1,
            'album-detail-track--selected': presentation.selected,
            'album-detail-track--playing': presentation.playing,
            'album-detail-track--search-highlight': presentation.highlighted,
          }"
          :data-track-id="track.id"
          type="button"
          @dblclick="emit('play', track.id)"
        >
          <span class="album-detail-track-number" aria-hidden="true">
            <span class="album-detail-track-index">
              {{ String(presentation.displayNumber).padStart(2, '0') }}
            </span>
            <span class="album-detail-track-play-icon i-lucide-play"></span>
            <PlayingIndicator
              v-if="track.id === currentTrackId"
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
