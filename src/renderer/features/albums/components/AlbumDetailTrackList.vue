<script setup lang="ts">
import { computed } from 'vue'
import PlayingIndicator from '@renderer/features/appearance/components/PreferredPlayingIndicator.vue'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { formatDuration } from '@renderer/shared/media/formatDuration'
import { resolveAlbumTrackPresentation } from '../utils/albumTrackPresentation'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'

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
const presentedGroups = computed(() =>
  props.groups.map((group) => ({
    ...group,
    tracks: group.tracks.map((track, index) => ({
      track,
      presentation: resolveAlbumTrackPresentation(
        track.id,
        track.trackNo,
        index,
        props.selectedTrackId,
        props.currentTrackId,
        props.highlightedTrackId,
      ),
    })),
  })),
)

function formatDisplayArtist(artist: string | null | undefined): string {
  if (!artist || artist === 'Unknown Artist') return t('library.unknownArtist')
  return songValues(artist)
}
</script>

<template>
  <div class="album-tracklist-panel">
    <div class="album-detail-track-list">
      <template v-for="group in presentedGroups" :key="group.discNo ?? 'single'">
        <div v-if="group.discNo != null" class="album-detail-disc-header" role="presentation">
          {{ t('albums.detail.disc', { number: String(group.discNo).padStart(2, '0') }) }}
        </div>
        <button
          v-for="{ track, presentation } in group.tracks"
          :key="track.id"
          class="album-detail-track auralis-track-row-divider"
          :class="{
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
