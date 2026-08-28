<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { formatArtist } from '@renderer/features/library/utils/formatArtist'
import { formatDuration } from '@renderer/features/library/utils/formatDuration'
import { resolveAlbumTrackPresentation } from '../utils/albumTrackPresentation'

defineProps<{
  groups: { discNo: number | null; tracks: TrackListItem[] }[]
  albumArtist: string
  selectedTrackId: number | null
  currentTrackId: number | null
  highlightedTrackId: number | null
}>()

const emit = defineEmits<{
  select: [trackId: number]
  play: [trackId: number]
}>()

const { t } = useI18n()

function formatDisplayArtist(artist: string | null | undefined): string {
  if (!artist || artist === 'Unknown Artist') return t('library.unknownArtist')
  return formatArtist(artist)
}
</script>

<template>
  <div class="album-tracklist-panel">
    <h2 class="album-tracklist-heading">{{ t('albums.detail.tracks') }}</h2>
    <div class="album-detail-track-list">
      <template v-for="group in groups" :key="group.discNo ?? 'single'">
        <div v-if="group.discNo != null" class="album-detail-disc-header" role="presentation">
          {{ t('albums.detail.disc', { number: group.discNo }) }}
        </div>
        <button
          v-for="(track, index) in group.tracks"
          :key="track.id"
          class="album-detail-track"
          :class="{
            'album-detail-track--selected': resolveAlbumTrackPresentation(
              track.id,
              track.trackNo,
              index,
              selectedTrackId,
              currentTrackId,
              highlightedTrackId,
            ).selected,
            'album-detail-track--playing': resolveAlbumTrackPresentation(
              track.id,
              track.trackNo,
              index,
              selectedTrackId,
              currentTrackId,
              highlightedTrackId,
            ).playing,
            'album-detail-track--search-highlight': resolveAlbumTrackPresentation(
              track.id,
              track.trackNo,
              index,
              selectedTrackId,
              currentTrackId,
              highlightedTrackId,
            ).highlighted,
          }"
          :data-track-id="track.id"
          type="button"
          @click="emit('select', track.id)"
          @dblclick="emit('play', track.id)"
        >
          <span class="album-detail-track-number" aria-hidden="true">
            <span class="album-detail-track-index">
              {{
                resolveAlbumTrackPresentation(
                  track.id,
                  track.trackNo,
                  index,
                  selectedTrackId,
                  currentTrackId,
                  highlightedTrackId,
                ).displayNumber
              }}
            </span>
            <span class="album-detail-track-play-icon i-lucide-play"></span>
            <span class="album-detail-track-eq" aria-hidden="true"><i></i><i></i><i></i></span>
          </span>
          <span class="min-w-0 text-left">
            <span class="album-detail-track-title">{{
              track.title || t('albums.detail.unknownTitle')
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

<style scoped src="../styles/albumDetail.track-list.css"></style>
