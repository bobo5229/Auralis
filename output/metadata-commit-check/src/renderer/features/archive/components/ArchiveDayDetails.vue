<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DailyTopTrack } from '@shared/types/listeningArchive'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'

const props = defineProps<{
  tracks: DailyTopTrack[]
  loading: boolean
  failed: boolean
}>()
const emit = defineEmits<{ retry: [] }>()
const { t, n } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const maximum = computed(() => Math.max(1, ...props.tracks.map((track) => track.playCount)))
const placeholderCount = ref(5)
watch(
  () => props.tracks.length,
  (length) => {
    if (length) placeholderCount.value = length
  },
  { immediate: true },
)
</script>

<template>
  <div class="archive-day-track-content" :aria-busy="loading">
    <div v-if="loading" role="status">
      <span class="sr-only">{{ t('archive.loading') }}</span>
      <div class="archive-day-tracks archive-day-tracks--placeholder" aria-hidden="true">
        <div v-for="index in placeholderCount" :key="index" class="archive-day-track">
          <span class="archive-track-placeholder archive-track-placeholder--rank"></span>
          <div class="archive-day-track-text">
            <span class="archive-track-placeholder archive-track-placeholder--title"></span>
            <span class="archive-track-placeholder archive-track-placeholder--artist"></span>
          </div>
          <span class="archive-track-placeholder archive-track-placeholder--meter"></span>
          <span class="archive-track-placeholder archive-track-placeholder--count"></span>
        </div>
      </div>
    </div>
    <p v-else-if="failed" class="archive-day-message auralis-type-caption" role="status">
      {{ t('archive.dayLoadError') }}
      <button type="button" class="archive-track-retry" @click="emit('retry')">
        {{ t('archive.retry') }}
      </button>
    </p>
    <ol v-else-if="tracks.length" class="archive-day-tracks">
      <li v-for="(track, index) in tracks" :key="track.trackId" class="archive-day-track">
        <span class="archive-day-rank auralis-type-caption">{{
          String(index + 1).padStart(2, '0')
        }}</span>
        <div class="archive-day-track-text">
          <p
            class="archive-day-track-title auralis-type-body"
            :title="songText(track.title) || t('archive.unknownTrack')"
          >
            {{ songText(track.title) || t('archive.unknownTrack') }}
          </p>
          <p
            class="archive-day-artist auralis-type-caption"
            :title="songValues(track.artist) || t('archive.unknownArtist')"
          >
            {{ songValues(track.artist) || t('archive.unknownArtist') }}
          </p>
        </div>
        <span class="archive-day-frequency" aria-hidden="true">
          <span
            :style="{
              transform: `scaleX(${Math.max(0, Math.min(1, track.playCount / maximum))})`,
            }"
          ></span>
        </span>
        <span class="archive-day-count auralis-type-caption">{{
          t('archive.playCount', { count: n(track.playCount) })
        }}</span>
      </li>
    </ol>
    <p v-else class="archive-day-message archive-day-message--empty auralis-type-caption">
      {{ t('archive.dayEmpty') }}
    </p>
  </div>
</template>

<style scoped>
p {
  margin: 0;
}
.archive-day-track-content {
  min-height: 72px;
  max-width: 960px;
  margin: 0 auto;
  padding: 16px 0;
  container-type: inline-size;
}
.archive-day-tracks {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 72px minmax(56px, max-content);
  column-gap: 20px;
  row-gap: 2px;
  list-style: none;
  padding: 0;
  margin: 0;
  animation: archive-track-reveal 160ms ease-out;
}
.archive-day-track {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: center;
  min-height: 64px;
  padding: 10px 12px;
  border-radius: 6px;
  transition: background-color 140ms ease-out;
}
.archive-day-track:not(:first-child) {
  box-shadow: 0 -1px 0 var(--auralis-border-subtle);
}
@media (hover: hover) {
  .archive-day-tracks:not(.archive-day-tracks--placeholder) .archive-day-track:hover {
    background: var(--auralis-control-hover-bg);
  }
  .archive-day-track:hover .archive-day-rank {
    color: var(--auralis-text);
  }
  .archive-day-track:hover .archive-day-frequency > span {
    background: var(--auralis-text-muted);
  }
}
.archive-day-rank {
  color: var(--auralis-text-faint);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
  transition: color 140ms ease-out;
}
.archive-day-track:first-child .archive-day-rank {
  color: var(--auralis-text-muted);
  font-weight: 600;
}
.archive-day-track-text {
  min-width: 0;
}
.archive-day-track-title,
.archive-day-artist {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.archive-day-track-title {
  color: var(--auralis-text);
  font-weight: 500;
}
.archive-day-track:first-child .archive-day-track-title {
  font-weight: 600;
}
.archive-day-artist {
  margin-top: 2px;
  color: var(--auralis-text-muted);
}
.archive-day-frequency,
.archive-day-frequency > span {
  height: 2px;
  border-radius: 1px;
}
.archive-day-frequency {
  overflow: hidden;
  background: var(--auralis-border-subtle);
}
.archive-day-frequency > span {
  display: block;
  background: color-mix(in srgb, var(--auralis-text-muted) 65%, transparent);
  transform-origin: left;
  transition: background-color 140ms ease-out;
}
.archive-day-count {
  color: var(--auralis-text-muted);
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.archive-day-tracks--placeholder {
  animation: none;
}
.archive-track-placeholder {
  display: block;
  height: 10px;
  max-width: 100%;
  border-radius: 2px;
  background: var(--auralis-border-strong);
}
.archive-track-placeholder--rank {
  width: 16px;
}
.archive-track-placeholder--title {
  width: 42%;
  min-width: min(140px, 100%);
  height: 14px;
  margin-block: 5px 9px;
}
.archive-track-placeholder--artist {
  width: 26%;
  min-width: min(80px, 100%);
  height: 8px;
  margin-bottom: 5px;
}
.archive-track-placeholder--meter {
  height: 2px;
}
.archive-track-placeholder--count {
  width: 28px;
  justify-self: end;
}
.archive-day-message {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  color: var(--auralis-text-muted);
}
.archive-track-retry {
  color: var(--auralis-theme-accent);
  cursor: pointer;
}
.archive-track-retry:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 3px;
}
.archive-day-message--empty {
  justify-content: center;
  text-align: center;
}
@container (max-width: 700px) {
  .archive-day-tracks {
    grid-template-columns: 28px minmax(0, 1fr) 40px minmax(52px, max-content);
    column-gap: 12px;
  }
  .archive-day-track {
    padding-inline: 8px;
  }
}
@keyframes archive-track-reveal {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .archive-day-tracks {
    animation: none;
  }
  .archive-day-track,
  .archive-day-rank,
  .archive-day-frequency > span {
    transition: none;
  }
}
:where([data-reduced-motion='true']) .archive-day-tracks {
  animation: none;
}
:where([data-reduced-motion='true']) .archive-day-track,
:where([data-reduced-motion='true']) .archive-day-rank,
:where([data-reduced-motion='true']) .archive-day-frequency > span {
  transition: none;
}
</style>
