<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { CdPlaybackMode } from '../utils/cdPlaybackQueue'
import { formatArtist, splitArtistValues } from '@renderer/features/library/utils/formatArtist'
import PlayingIndicator from '@renderer/shared/components/PlayingIndicator.vue'

const props = defineProps<{
  tracks: TrackListItem[]
  albumArtist: string
  mode: CdPlaybackMode
  currentTrackId: number | null
  isPlaying: boolean
}>()
const emit = defineEmits<{ play: [id: number]; mode: [] }>()
const { t } = useI18n()
const scrollRef = ref<HTMLElement | null>(null)
const hasMultipleDiscs = computed(
  () => new Set(props.tracks.map((track) => track.discNo || 1)).size > 1,
)
const normalize = (value: string | null): string =>
  splitArtistValues(value)
    .map((part) => part.trim().toLocaleLowerCase())
    .sort()
    .join('\u0000')
const rows = computed(() =>
  props.tracks.map((track, index) => ({
    track,
    disc:
      hasMultipleDiscs.value &&
      (index === 0 || (track.discNo || 1) !== (props.tracks[index - 1]?.discNo || 1))
        ? track.discNo || 1
        : null,
    title: track.title?.trim() || t('albums.detail.unknownTitle'),
    artist:
      track.artist?.trim() && normalize(track.artist) !== normalize(props.albumArtist)
        ? formatArtist(track.artist)
        : '',
  })),
)
watch(
  () => props.tracks,
  () => {
    if (scrollRef.value) scrollRef.value.scrollTop = 0
  },
)
</script>

<template>
  <div class="cd-track-panel">
    <div class="cd-track-heading">
      <h2>{{ t('albums.cd.tracks') }}</h2>
      <button type="button" class="cd-mode" @click="emit('mode')">
        <span class="cd-mode-label">{{ t(`albums.cd.modes.${mode}`) }}</span>
        <span
          class="cd-mode-icon"
          :class="
            mode === 'catalog-sequential'
              ? 'i-lucide-disc-3'
              : mode === 'shuffle'
                ? 'i-lucide-shuffle'
                : mode === 'sequential'
                  ? 'i-lucide-arrow-right'
                  : 'i-lucide-repeat'
          "
          aria-hidden="true"
        ></span>
      </button>
    </div>
    <div ref="scrollRef" class="cd-track-scroll" tabindex="0" :aria-label="t('albums.cd.tracks')">
      <template v-for="row in rows" :key="row.track.id">
        <h3 v-if="row.disc" class="cd-disc-heading">
          {{ t('albums.detail.disc', { number: String(row.disc).padStart(2, '0') }) }}
        </h3>
        <button
          type="button"
          class="cd-track"
          :aria-current="row.track.id === currentTrackId ? 'true' : undefined"
          @click="emit('play', row.track.id)"
        >
          <span class="cd-track-index">
            <span
              class="cd-track-number"
              :class="{ 'cd-track-number--hidden': row.track.id === currentTrackId }"
              >{{
                row.track.trackNo == null ? '' : String(row.track.trackNo).padStart(2, '0')
              }}</span
            >
            <PlayingIndicator
              v-if="row.track.id === currentTrackId"
              class="cd-playing-bars"
              :playing="isPlaying"
            />
          </span>
          <span class="cd-track-detail">
            <span class="cd-track-title" dir="auto">{{ row.title }}</span>
            <span v-if="row.artist" class="cd-track-artist" dir="auto">{{ row.artist }}</span>
          </span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font: inherit;
  font-size: var(--cd-type-action-size);
  line-height: var(--cd-type-action-line-height);
  color: inherit;
  background: transparent;
  border: 1px solid var(--cd-border, #bdbdb9);
  border-radius: 3px;
  cursor: pointer;
}
button:hover {
  background: var(--cd-hover-bg, #e1e1de);
}
button:focus-visible {
  outline: 2px solid var(--cd-focus-ring, #292929);
  outline-offset: -2px;
}
.cd-track-panel {
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.cd-track-heading {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--cd-border-strong, #8e8e88);
}
h2 {
  margin: 0;
  font: var(--cd-type-weight) var(--cd-type-section-size)/var(--cd-type-section-line-height)
    var(--cd-font-display);
}
.cd-track-panel .cd-mode {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0 4px 8px;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--cd-text-muted, #62625b);
  font: var(--cd-type-weight) var(--cd-type-mode-size)/var(--cd-type-mode-line-height)
    var(--cd-font-text);
}
.cd-mode-label {
  display: block;
  line-height: var(--cd-type-mode-line-height);
}
.cd-mode-icon {
  display: block;
  flex: 0 0 16px;
}
.cd-track-panel .cd-mode:hover {
  background: transparent;
  box-shadow: none;
  color: var(--cd-text, #292929);
}
.cd-track-scroll {
  flex: 0 1 auto;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-width: none;
  color-scheme: inherit;
}
.cd-track-scroll::-webkit-scrollbar {
  display: none;
}
.cd-disc-heading {
  margin: 22px 0 9px;
  color: var(--cd-text-muted, #62625b);
  font: var(--cd-type-weight) var(--cd-type-disc-size)/var(--cd-type-disc-line-height)
    var(--cd-font-text);
  letter-spacing: 0.08em;
}
.cd-track-panel .cd-track {
  width: 100%;
  height: 64px;
  display: grid;
  align-items: center;
  grid-template-columns: 25px minmax(0, 1fr);
  text-align: left;
  gap: 12px;
  border: 0;
  border-top: 1px solid transparent;
  border-radius: 0;
  padding: 0 6px;
}
.cd-track-panel .cd-track + .cd-track {
  border-top-color: var(--cd-border-track, #aaa9a333);
}
.cd-track-index {
  position: relative;
  display: block;
  text-align: center;
}
.cd-track-number {
  display: block;
  color: var(--cd-text-subtle, #64645d);
  font: var(--cd-type-weight)
    var(--cd-type-track-number-size)/var(--cd-type-track-number-line-height) var(--cd-font-number);
  font-variant-numeric: lining-nums tabular-nums;
}
.cd-track-detail {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
}
.cd-track-title,
.cd-track-artist {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cd-track-title {
  font: var(--cd-type-weight) var(--cd-type-track-size)/var(--cd-type-track-line-height)
    var(--cd-font-display);
}
.cd-track-number--hidden {
  visibility: hidden;
}
.cd-playing-bars {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 14px;
  height: 14px;
  color: var(--cd-text-muted, #62625b);
  transform: translate(-50%, -50%);
  pointer-events: none;
  user-select: none;
}
.cd-track-artist {
  font: var(--cd-type-weight)
    var(--cd-type-track-artist-size)/var(--cd-type-track-artist-line-height) var(--cd-font-display);
  color: var(--cd-text-subtle, #64645d);
}
@media (max-width: 800px) {
  .cd-track-heading {
    flex-wrap: wrap;
  }
  .cd-track-panel .cd-track {
    gap: 5px;
    grid-template-columns: 20px minmax(0, 1fr);
  }
}
</style>
