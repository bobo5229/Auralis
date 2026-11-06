<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import PlayingIndicator from '@renderer/features/appearance/components/PreferredPlayingIndicator.vue'
import { useChineseTextDisplay } from '@renderer/shared/preferences/useChineseTextDisplay'
import { formatDuration } from '@renderer/shared/media/formatDuration'

defineProps<{ tracks: TrackListItem[]; currentTrackId: number | null; isPlaying: boolean }>()
defineEmits<{ play: [track: TrackListItem] }>()
const { t } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const limit = ref(8)
</script>

<template>
  <ul class="journal-tracks">
    <li v-for="(track, index) in tracks.slice(0, limit)" :key="track.id">
      <button
        type="button"
        :class="{ 'is-current': currentTrackId === track.id }"
        :aria-label="
          t('library.journal.playTrack', {
            title: songText(track.title) || t('library.missing.title'),
          })
        "
        @click="$emit('play', track)"
      >
        <span class="journal-track-leading">
          <PlayingIndicator v-if="currentTrackId === track.id" :playing="isPlaying" :size="16" />
          <template v-else>
            <span class="journal-track-index" aria-hidden="true">{{ index + 1 }}</span>
            <span class="i-lucide-play journal-track-play" aria-hidden="true"></span>
          </template>
        </span>
        <span class="journal-track-copy"
          ><span :title="songText(track.title)">{{
            songText(track.title) || t('library.missing.title')
          }}</span
          ><span class="journal-track-artist" :title="songValues(track.artist)">{{
            songValues(track.artist) || t('library.missing.artist')
          }}</span></span
        >
        <span class="journal-track-time">{{ formatDuration(track.durationSeconds) }}</span>
      </button>
    </li>
  </ul>
  <button v-if="tracks.length > limit" type="button" class="journal-more" @click="limit += 20">
    {{ t('library.journal.moreTracks', { count: tracks.length - limit })
    }}<span class="i-lucide-chevron-down" aria-hidden="true"></span>
  </button>
</template>

<style scoped>
.journal-tracks {
  list-style: none;
  margin: 0;
  padding: 0;
}
button {
  color: inherit;
  font: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;
}
.journal-tracks button {
  display: flex;
  align-items: center;
  gap: var(--journal-row-gap, 14px);
  width: 100%;
  min-height: 40px;
  padding: 8px 0;
  text-align: left;
  border-radius: 8px;
}
.journal-tracks button:hover {
  background: var(--auralis-control-hover-bg);
}
.journal-tracks button.is-current {
  color: var(--auralis-theme-accent);
}
.journal-track-leading {
  display: grid;
  place-items: center;
  flex: 0 0 var(--journal-leading-width, 48px);
}
.journal-track-index,
.journal-track-play {
  grid-area: 1 / 1;
}
.journal-track-index {
  color: var(--auralis-text-faint);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  font-variant-numeric: tabular-nums;
}
.journal-track-play {
  visibility: hidden;
  font-size: 16px;
  color: var(--auralis-text-muted);
}
.journal-tracks button:is(:hover, :focus-visible) .journal-track-index {
  visibility: hidden;
}
.journal-tracks button:is(:hover, :focus-visible) .journal-track-play {
  visibility: visible;
}
.journal-track-copy {
  min-width: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.55fr);
  align-items: baseline;
  gap: var(--journal-row-gap, 14px);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}
.journal-track-copy > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.journal-track-artist,
.journal-track-time {
  color: var(--auralis-text-faint);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}
.journal-track-time {
  flex: 0 0 42px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.journal-more {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 0 auto;
  padding: 6px 8px;
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  color: var(--auralis-text-muted);
}
button:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}
</style>
