<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getArtworkUrl } from '@renderer/shared/media/getArtworkUrl'
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
const failedArtwork = ref(new Set<string>())
function artwork(key: string | null): string | undefined {
  return key && !failedArtwork.value.has(key) ? (getArtworkUrl(key) ?? undefined) : undefined
}
function artworkError(key: string | null) {
  if (key) failedArtwork.value = new Set(failedArtwork.value).add(key)
}
const placeholderCount = ref(3)
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
          <span class="archive-track-placeholder archive-track-placeholder--cover"></span>
          <div class="archive-day-track-text">
            <span class="archive-track-placeholder archive-track-placeholder--title"></span>
            <span class="archive-track-placeholder archive-track-placeholder--artist"></span>
          </div>
          <div class="archive-day-stat">
            <span class="archive-track-placeholder archive-track-placeholder--count"></span
            ><span class="archive-track-placeholder archive-track-placeholder--meter"></span>
          </div>
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
        <div class="archive-day-cover" aria-hidden="true">
          <img
            v-if="artwork(track.artworkCacheKey)"
            :src="artwork(track.artworkCacheKey)"
            alt=""
            loading="lazy"
            decoding="async"
            @error="artworkError(track.artworkCacheKey)"
          />
          <span v-else class="i-lucide-disc-3"></span>
        </div>
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
        <div class="archive-day-stat">
          <span class="archive-day-count auralis-type-caption">{{
            t('archive.playCount', { count: n(track.playCount) })
          }}</span>
          <span class="archive-day-frequency" aria-hidden="true">
            <span
              :style="{
                transform: `scaleX(${Math.max(0, Math.min(1, track.playCount / maximum))})`,
              }"
            ></span>
          </span>
        </div>
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
  padding: 8px 0 16px;
  container-type: inline-size;
}
.archive-day-tracks {
  display: grid;
  grid-template-columns: 24px 48px minmax(0, 1fr) minmax(80px, max-content);
  column-gap: 12px;
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
  box-sizing: border-box;
  min-height: 76px;
  padding: 12px 0;
}
.archive-day-track:not(:first-child) {
  box-shadow: 0 -1px 0 var(--auralis-border-subtle);
}

.archive-day-rank {
  color: var(--auralis-text-faint);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
  transition: color 140ms ease-out;
}
.archive-day-track:first-child .archive-day-rank {
  color: var(--auralis-theme-accent);
  font-weight: 600;
}
.archive-day-cover {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 5px;
  background: var(--auralis-surface-raised);
  color: var(--auralis-text-faint);
  box-shadow: inset 0 0 0 1px var(--auralis-border-subtle);
}
.archive-day-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.archive-day-cover > span {
  width: 22px;
  height: 22px;
}
.archive-day-stat {
  display: grid;
  gap: 6px;
  justify-items: end;
}
.archive-day-stat .archive-day-frequency {
  width: 80px;
}
.archive-day-track:first-child .archive-day-frequency > span {
  background: var(--auralis-theme-accent);
}
.archive-track-placeholder--cover {
  width: 48px;
  height: 48px !important;
  border-radius: 5px;
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
  width: 80px;
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
    grid-template-columns: 24px 48px minmax(0, 1fr) minmax(56px, max-content);
    column-gap: 12px;
  }
  .archive-day-stat .archive-day-frequency,
  .archive-track-placeholder--meter {
    width: 56px;
  }
}
@container (max-width: 420px) {
  .archive-day-tracks {
    column-gap: 8px;
  }
  .archive-day-frequency,
  .archive-track-placeholder--meter {
    display: none;
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
