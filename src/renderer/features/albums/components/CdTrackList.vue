<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { CdPlaybackMode } from '../utils/cdPlaybackQueue'
import { formatArtist, splitArtistValues } from '@renderer/features/library/utils/formatArtist'
import { animatePlaybackUnderline } from '@renderer/shared/animation/motion'

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
const panelRef = ref<HTMLElement | null>(null)
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
  [panelRef, () => props.currentTrackId, () => props.isPlaying, rows],
  (_, __, onCleanup) => {
    const marker = panelRef.value?.querySelector<HTMLElement>('.cd-playing-line')
    if (marker) onCleanup(animatePlaybackUnderline(marker, props.isPlaying))
  },
  { flush: 'post', immediate: true },
)
watch(
  () => props.tracks,
  () => {
    if (scrollRef.value) scrollRef.value.scrollTop = 0
  },
)
</script>

<template>
  <div ref="panelRef" class="cd-track-panel">
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
        <h3 v-if="row.disc" class="cd-disc-heading">Disc {{ row.disc }}</h3>
        <button
          type="button"
          class="cd-track"
          :aria-current="row.track.id === currentTrackId ? 'true' : undefined"
          @click="emit('play', row.track.id)"
        >
          <span class="cd-track-number">{{ row.track.trackNo ?? '' }}</span>
          <span class="cd-track-detail">
            <span class="cd-track-title-wrap">
              <span class="cd-track-title" dir="auto">{{ row.title }}</span>
              <span
                v-if="row.track.id === currentTrackId"
                class="cd-playing-line"
                aria-hidden="true"
              ></span>
            </span>
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
  font-size: 13px;
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
  height: 100%;
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
  font:
    400 20px/1.25 Georgia,
    'Auralis Desktop Lyrics SC',
    serif;
}
.cd-track-panel .cd-mode {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  font-size: 11px;
  line-height: 16px;
  padding: 4px 0 4px 8px;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--cd-text-muted, #62625b);
}
.cd-mode-label {
  display: block;
  line-height: 16px;
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
  flex: 1 1 0;
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
  font:
    400 11px Georgia,
    'Auralis Desktop Lyrics SC',
    serif;
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
.cd-track-number {
  color: var(--cd-text-subtle, #77776f);
  font:
    11px/1.7 Georgia,
    'Auralis Desktop Lyrics SC',
    serif;
  font-variant-numeric: tabular-nums;
}
.cd-track-detail {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
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
  font:
    400 14px/1.5 Georgia,
    'Auralis Desktop Lyrics SC',
    serif;
}
.cd-track-title-wrap {
  position: relative;
  width: fit-content;
  max-width: 100%;
  padding-bottom: 3px;
}
.cd-playing-line {
  position: absolute;
  left: 0;
  bottom: 0;
  width: min(18px, 25%);
  height: 1px;
  background: var(--cd-text-muted, #62625b);
  pointer-events: none;
}
.cd-track-artist {
  font:
    11px/1.5 Georgia,
    'Auralis Desktop Lyrics SC',
    serif;
  color: var(--cd-text-subtle, #77776f);
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
